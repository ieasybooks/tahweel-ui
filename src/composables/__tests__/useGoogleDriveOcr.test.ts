import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

// Mock Tauri API and useAuth
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// We need to mock useAuth to control ensureValidToken
const mockEnsureValidToken = vi.fn();
vi.mock("../useAuth", () => ({
  useAuth: () => ({
    ensureValidToken: mockEnsureValidToken,
  }),
}));

import { useGoogleDriveOcr } from "../useGoogleDriveOcr";
import { useProcessingStore } from "@/stores/processing";
import { invoke } from "@tauri-apps/api/core";

describe("useGoogleDriveOcr", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockEnsureValidToken.mockResolvedValue("valid_token");
  });

  describe("uploadFile", () => {
    it("uploads file and returns file ID", async () => {
      vi.mocked(invoke).mockResolvedValue({ fileId: "file123" });

      const { uploadFile } = useGoogleDriveOcr();
      const result = await uploadFile("/path/to/image.png");

      expect(result).toBe("file123");
      expect(invoke).toHaveBeenCalledWith("upload_to_google_drive", {
        filePath: "/path/to/image.png",
        accessToken: "valid_token",
      });
    });

    it("throws error when not authenticated", async () => {
      mockEnsureValidToken.mockResolvedValue(null);

      const { uploadFile } = useGoogleDriveOcr();

      await expect(uploadFile("/path/to/image.png")).rejects.toThrow(
        "Not authenticated"
      );
      expect(invoke).not.toHaveBeenCalled();
    });

    it("propagates upload errors", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Upload failed"));

      const { uploadFile } = useGoogleDriveOcr();

      await expect(uploadFile("/path/to/image.png")).rejects.toThrow(
        "Upload failed"
      );
    });
  });

  describe("exportAsText", () => {
    it("exports file and returns cleaned text", async () => {
      vi.mocked(invoke).mockResolvedValue({
        text: "\uFEFF___Page content___\n\n\n\nMore content",
      });

      const { exportAsText } = useGoogleDriveOcr();
      const result = await exportAsText("file123");

      expect(result).toBe("Page content\n\nMore content");
    });

    it("removes BOM and underscores", async () => {
      vi.mocked(invoke).mockResolvedValue({
        text: "\uFEFF________",
      });

      const { exportAsText } = useGoogleDriveOcr();
      const result = await exportAsText("file123");

      expect(result).toBe("");
    });

    it("collapses multiple blank lines", async () => {
      vi.mocked(invoke).mockResolvedValue({
        text: "Line 1\n\n\n\n\nLine 2",
      });

      const { exportAsText } = useGoogleDriveOcr();
      const result = await exportAsText("file123");

      expect(result).toBe("Line 1\n\nLine 2");
    });

    it("throws error when not authenticated", async () => {
      mockEnsureValidToken.mockResolvedValue(null);

      const { exportAsText } = useGoogleDriveOcr();

      await expect(exportAsText("file123")).rejects.toThrow("Not authenticated");
    });

    it("trims whitespace", async () => {
      vi.mocked(invoke).mockResolvedValue({
        text: "  Content with spaces  ",
      });

      const { exportAsText } = useGoogleDriveOcr();
      const result = await exportAsText("file123");

      expect(result).toBe("Content with spaces");
    });
  });

  describe("deleteFile", () => {
    it("deletes file from Google Drive", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { deleteFile } = useGoogleDriveOcr();
      await deleteFile("file123");

      expect(invoke).toHaveBeenCalledWith("delete_google_drive_file", {
        fileId: "file123",
        accessToken: "valid_token",
      });
    });

    it("throws error when not authenticated", async () => {
      mockEnsureValidToken.mockResolvedValue(null);

      const { deleteFile } = useGoogleDriveOcr();

      await expect(deleteFile("file123")).rejects.toThrow("Not authenticated");
    });
  });

  describe("deleteFiles", () => {
    it("deletes multiple files in parallel", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { deleteFiles } = useGoogleDriveOcr();
      await deleteFiles(["file1", "file2", "file3"]);

      expect(invoke).toHaveBeenCalledTimes(3);
    });

    it("does nothing when not authenticated", async () => {
      mockEnsureValidToken.mockResolvedValue(null);

      const { deleteFiles } = useGoogleDriveOcr();
      await deleteFiles(["file1", "file2"]);

      expect(invoke).not.toHaveBeenCalled();
    });

    it("ignores individual delete errors", async () => {
      vi.mocked(invoke).mockImplementation(async (_cmd, args) => {
        const { fileId } = args as { fileId: string };
        if (fileId === "file2") throw new Error("Delete failed");
        return undefined;
      });

      const { deleteFiles } = useGoogleDriveOcr();
      // Should not throw
      await deleteFiles(["file1", "file2", "file3"]);

      expect(invoke).toHaveBeenCalledTimes(3);
    });
  });

  describe("extractSingleText", () => {
    it("uploads file and returns text with file ID", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") return { fileId: "file123" };
        if (cmd === "export_google_doc_as_text") return { text: "Extracted text" };
        return undefined;
      });

      const { extractSingleText } = useGoogleDriveOcr();
      const result = await extractSingleText("/path/to/image.png");

      expect(result).toEqual({ text: "Extracted text", fileId: "file123" });
    });
  });

  describe("extractText", () => {
    it("extracts text from multiple images with concurrency", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string, args) => {
        if (cmd === "upload_to_google_drive") {
          const { filePath } = args as { filePath: string };
          return { fileId: `id_${filePath}` };
        }
        if (cmd === "export_google_doc_as_text") {
          const { fileId } = args as { fileId: string };
          return { text: `Text from ${fileId}` };
        }
        if (cmd === "delete_google_drive_file") return undefined;
        return undefined;
      });

      const { extractText } = useGoogleDriveOcr();
      const result = await extractText(["/path1.png", "/path2.png"], 2);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("Text from");
      expect(result[1]).toContain("Text from");
    });

    it("reports progress during extraction", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") return { fileId: "file123" };
        if (cmd === "export_google_doc_as_text") return { text: "Text" };
        return undefined;
      });

      const onProgress = vi.fn();
      const { extractText } = useGoogleDriveOcr();
      await extractText(["/path1.png", "/path2.png", "/path3.png"], 1, onProgress);

      expect(onProgress).toHaveBeenCalledWith({
        completed: 1,
        total: 3,
        percentage: 33,
      });
      expect(onProgress).toHaveBeenCalledWith({
        completed: 2,
        total: 3,
        percentage: 67,
      });
      expect(onProgress).toHaveBeenCalledWith({
        completed: 3,
        total: 3,
        percentage: 100,
      });
    });

    it("handles errors and continues processing", async () => {
      let callCount = 0;
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          callCount++;
          if (callCount === 2) throw new Error("Upload failed");
          return { fileId: `file${callCount}` };
        }
        if (cmd === "export_google_doc_as_text") return { text: "Text" };
        return undefined;
      });

      const { extractText } = useGoogleDriveOcr();
      const result = await extractText(["/path1.png", "/path2.png", "/path3.png"], 1);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe("Text");
      expect(result[1]).toBe(""); // Failed
      expect(result[2]).toBe("Text");
    });

    it("stops processing when cancelled", async () => {
      const store = useProcessingStore();

      let uploadCount = 0;
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          uploadCount++;
          if (uploadCount === 2) {
            // Cancel after first upload
            store.cancelProcessing();
          }
          return { fileId: `file${uploadCount}` };
        }
        if (cmd === "export_google_doc_as_text") return { text: "Text" };
        return undefined;
      });

      const { extractText } = useGoogleDriveOcr();

      await expect(
        extractText(["/path1.png", "/path2.png", "/path3.png"], 1)
      ).rejects.toThrow("cancelled");
    });

    it("cleans up uploaded files when cancelled", async () => {
      const store = useProcessingStore();

      const uploadedFiles: string[] = [];
      const deletedFiles: string[] = [];

      vi.mocked(invoke).mockImplementation(async (cmd: string, args) => {
        if (cmd === "upload_to_google_drive") {
          const fileId = `file${uploadedFiles.length + 1}`;
          uploadedFiles.push(fileId);
          if (uploadedFiles.length === 2) {
            store.cancelProcessing();
          }
          return { fileId };
        }
        if (cmd === "export_google_doc_as_text") return { text: "Text" };
        if (cmd === "delete_google_drive_file") {
          const { fileId } = args as { fileId: string };
          deletedFiles.push(fileId);
          return undefined;
        }
        return undefined;
      });

      const { extractText } = useGoogleDriveOcr();

      try {
        await extractText(["/path1.png", "/path2.png", "/path3.png"], 1);
      } catch {
        // Expected to throw
      }

      // Should have attempted to delete uploaded files
      expect(deletedFiles.length).toBeGreaterThan(0);
    });

    it("returns empty strings for null results", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") return { fileId: "file123" };
        if (cmd === "export_google_doc_as_text") return { text: "" };
        return undefined;
      });

      const { extractText } = useGoogleDriveOcr();
      const result = await extractText(["/path1.png"], 1);

      expect(result).toEqual([""]);
    });
  });
});
