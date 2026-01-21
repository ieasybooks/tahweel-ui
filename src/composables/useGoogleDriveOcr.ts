import { invoke } from "@tauri-apps/api/core";
import { useProcessingStore } from "@/stores/processing";
import { useAuth } from "./useAuth";
import pLimit from "p-limit";

export interface OcrProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface OcrResult {
  texts: string[];
  errors: { index: number; error: string }[];
}

interface UploadResult {
  fileId: string;
}

interface ExportResult {
  text: string;
}

export function useGoogleDriveOcr() {
  const processingStore = useProcessingStore();
  const { ensureValidToken } = useAuth();

  /**
   * Upload a file to Google Drive as a Google Document (triggers OCR)
   */
  async function uploadFile(filePath: string): Promise<string> {
    const accessToken = await ensureValidToken();
    if (!accessToken) {
      throw new Error("Not authenticated");
    }

    const result = await invoke<UploadResult>("upload_to_google_drive", {
      filePath,
      accessToken,
    });

    return result.fileId;
  }

  /**
   * Export a Google Document as plain text
   */
  async function exportAsText(fileId: string): Promise<string> {
    const accessToken = await ensureValidToken();
    if (!accessToken) {
      throw new Error("Not authenticated");
    }

    const result = await invoke<ExportResult>("export_google_doc_as_text", {
      fileId,
      accessToken,
    });

    // Clean up the text (remove Google's OCR artifacts)
    // Google Drive adds BOM + underscores as page separators/artifacts
    return result.text
      .replace(/\uFEFF?_+/g, "") // BOM (optional) followed by one or more underscores
      .replace(/\n{3,}/g, "\n\n") // Collapse multiple blank lines
      .trim();
  }

  /**
   * Delete a file from Google Drive
   */
  async function deleteFile(fileId: string): Promise<void> {
    const accessToken = await ensureValidToken();
    if (!accessToken) {
      throw new Error("Not authenticated");
    }

    await invoke("delete_google_drive_file", {
      fileId,
      accessToken,
    });
  }

  /**
   * Delete multiple files from Google Drive (for cleanup on cancellation)
   */
  async function deleteFiles(fileIds: string[]): Promise<void> {
    const accessToken = await ensureValidToken();
    if (!accessToken) return;

    // Delete files in parallel, ignoring errors
    await Promise.allSettled(
      fileIds.map((fileId) =>
        invoke("delete_google_drive_file", { fileId, accessToken })
      )
    );
  }

  /**
   * Extract text from a single image using Google Drive OCR
   * Returns the fileId along with text so it can be cleaned up if needed
   */
  async function extractSingleText(
    imagePath: string
  ): Promise<{ text: string; fileId: string }> {
    const fileId = await uploadFile(imagePath);
    const text = await exportAsText(fileId);
    return { text, fileId };
  }

  /**
   * Extract text from multiple images with controlled concurrency.
   * Supports cancellation and returns partial results with errors.
   */
  async function extractText(
    imagePaths: string[],
    concurrency: number,
    onProgress?: (progress: OcrProgress) => void
  ): Promise<string[]> {
    const limit = pLimit(concurrency);
    const results: (string | null)[] = new Array(imagePaths.length).fill(null);
    const uploadedFileIds: string[] = [];
    const errors: { index: number; error: string }[] = [];
    let completed = 0;

    const tasks = imagePaths.map((path, index) =>
      limit(async () => {
        // Check for cancellation before starting
        if (processingStore.isCancelled) {
          throw new Error("Processing cancelled");
        }

        let fileId: string | null = null;

        try {
          // Upload and track the file ID
          fileId = await uploadFile(path);
          uploadedFileIds.push(fileId);

          // Check for cancellation after upload
          if (processingStore.isCancelled) {
            throw new Error("Processing cancelled");
          }

          // Export text
          const text = await exportAsText(fileId);
          results[index] = text;

          // Delete the file from Drive
          try {
            await deleteFile(fileId);
            // Remove from tracking since it's deleted
            const idx = uploadedFileIds.indexOf(fileId);
            if (idx > -1) uploadedFileIds.splice(idx, 1);
          } catch {
            // Ignore delete errors, file will be orphaned but that's ok
          }
        } catch (error) {
          const errorMessage = String(error);
          if (!errorMessage.includes("cancelled")) {
            errors.push({ index, error: errorMessage });
            // Set empty string for failed pages to maintain order
            results[index] = "";
          } else {
            throw error; // Re-throw cancellation
          }
        }

        completed++;
        if (onProgress) {
          onProgress({
            completed,
            total: imagePaths.length,
            percentage: Math.round((completed / imagePaths.length) * 100),
          });
        }
      })
    );

    try {
      await Promise.all(tasks);
    } catch (error) {
      // If cancelled, clean up all uploaded files
      if (processingStore.isCancelled && uploadedFileIds.length > 0) {
        await deleteFiles(uploadedFileIds);
      }
      throw error;
    }

    // If we have errors but not cancelled, log them but return what we have
    if (errors.length > 0 && !processingStore.isCancelled) {
      console.warn(`OCR completed with ${errors.length} errors:`, errors);
    }

    // Return results, using empty string for any null values
    return results.map((r) => r ?? "");
  }

  return {
    uploadFile,
    exportAsText,
    deleteFile,
    deleteFiles,
    extractSingleText,
    extractText,
  };
}
