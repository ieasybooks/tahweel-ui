import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "@/stores/auth";
import { useAuth } from "./useAuth";
import pLimit from "p-limit";

export interface OcrProgress {
  completed: number;
  total: number;
  percentage: number;
}

interface UploadResult {
  fileId: string;
}

interface ExportResult {
  text: string;
}

export function useGoogleDriveOcr() {
  const authStore = useAuthStore();
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

    // Clean up the text (remove Google's page separator)
    return result.text.replace(/﻿________________/g, "").trim();
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
   * Extract text from a single image using Google Drive OCR
   */
  async function extractSingleText(imagePath: string): Promise<string> {
    const fileId = await uploadFile(imagePath);
    try {
      return await exportAsText(fileId);
    } finally {
      try {
        await deleteFile(fileId);
      } catch {
        // Ignore delete errors
      }
    }
  }

  /**
   * Extract text from multiple images with controlled concurrency
   */
  async function extractText(
    imagePaths: string[],
    concurrency: number,
    onProgress?: (progress: OcrProgress) => void
  ): Promise<string[]> {
    const limit = pLimit(concurrency);
    const results: string[] = new Array(imagePaths.length);
    let completed = 0;

    const tasks = imagePaths.map((path, index) =>
      limit(async () => {
        const text = await extractSingleText(path);
        results[index] = text;
        completed++;

        if (onProgress) {
          onProgress({
            completed,
            total: imagePaths.length,
            percentage: Math.round((completed / imagePaths.length) * 100),
          });
        }

        return text;
      })
    );

    await Promise.all(tasks);
    return results;
  }

  return {
    uploadFile,
    exportAsText,
    deleteFile,
    extractSingleText,
    extractText,
  };
}
