import { describe, it, expect, vi, beforeEach } from "vitest"
import { setActivePinia, createPinia } from "pinia"

// Only mock the Tauri boundary - not internal modules
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

import { useGoogleDriveOcr } from "../useGoogleDriveOcr"
import { useProcessingStore } from "@/stores/processing"
import { useAuthStore } from "@/stores/auth"
import { invoke } from "@tauri-apps/api/core"

describe("useGoogleDriveOcr", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /**
   * Helper to set up authenticated state
   */
  function setupAuthenticated() {
    const authStore = useAuthStore()
    authStore.setTokens({
      accessToken: "valid_token",
      refreshToken: "refresh_token",
      expiresAt: Date.now() + 3600000, // 1 hour from now
    })
  }

  describe("uploadFile", () => {
    it("uploads file and returns file ID when authenticated", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue({ fileId: "file123" })

      const { uploadFile } = useGoogleDriveOcr()
      const result = await uploadFile("/path/to/image.png")

      expect(result).toBe("file123")
      expect(invoke).toHaveBeenCalledWith("upload_to_google_drive", {
        filePath: "/path/to/image.png",
        accessToken: "valid_token",
      })
    })

    it("throws error when not authenticated", async () => {
      // Don't set up auth - store starts unauthenticated
      const { uploadFile } = useGoogleDriveOcr()

      await expect(uploadFile("/path/to/image.png")).rejects.toThrow(
        "Not authenticated",
      )
      expect(invoke).not.toHaveBeenCalled()
    })

    it("refreshes token if expired and refresh token exists", async () => {
      const authStore = useAuthStore()
      // Set expired token with refresh token
      authStore.setTokens({
        accessToken: "expired_token",
        refreshToken: "refresh_token",
        expiresAt: Date.now() - 1000, // Expired
      })

      // Mock refresh and upload
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "refresh_access_token") {
          return {
            access_token: "new_token",
            refresh_token: "new_refresh",
            expires_in: 3600,
          }
        }
        if (cmd === "upload_to_google_drive") {
          return { fileId: "file123" }
        }
        return undefined
      })

      const { uploadFile } = useGoogleDriveOcr()
      const result = await uploadFile("/path/to/image.png")

      expect(result).toBe("file123")
      expect(invoke).toHaveBeenCalledWith("refresh_access_token", {
        refreshToken: "refresh_token",
      })
    })

    it("propagates upload errors", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockRejectedValue(new Error("Upload failed"))

      const { uploadFile } = useGoogleDriveOcr()

      await expect(uploadFile("/path/to/image.png")).rejects.toThrow(
        "Upload failed",
      )
    })
  })

  describe("exportAsText", () => {
    it("exports file and cleans OCR artifacts from text", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue({
        text: "\uFEFF___Page content___\n\n\n\nMore content",
      })

      const { exportAsText } = useGoogleDriveOcr()
      const result = await exportAsText("file123")

      // Verifies actual text cleanup behavior
      expect(result).toBe("Page content\n\nMore content")
    })

    it("removes BOM followed by underscores", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue({
        text: "\uFEFF________",
      })

      const { exportAsText } = useGoogleDriveOcr()
      const result = await exportAsText("file123")

      expect(result).toBe("")
    })

    it("collapses 3+ consecutive newlines to 2", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue({
        text: "Line 1\n\n\n\n\nLine 2",
      })

      const { exportAsText } = useGoogleDriveOcr()
      const result = await exportAsText("file123")

      expect(result).toBe("Line 1\n\nLine 2")
    })

    it("trims leading and trailing whitespace", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue({
        text: "  Content with spaces  ",
      })

      const { exportAsText } = useGoogleDriveOcr()
      const result = await exportAsText("file123")

      expect(result).toBe("Content with spaces")
    })

    it("handles Arabic text correctly", async () => {
      setupAuthenticated()
      const arabicText = "مرحبا بالعالم"
      vi.mocked(invoke).mockResolvedValue({ text: arabicText })

      const { exportAsText } = useGoogleDriveOcr()
      const result = await exportAsText("file123")

      expect(result).toBe(arabicText)
    })

    it("throws error when not authenticated", async () => {
      const { exportAsText } = useGoogleDriveOcr()

      await expect(exportAsText("file123")).rejects.toThrow("Not authenticated")
    })
  })

  describe("deleteFile", () => {
    it("deletes file from Google Drive", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue(undefined)

      const { deleteFile } = useGoogleDriveOcr()
      await deleteFile("file123")

      expect(invoke).toHaveBeenCalledWith("delete_google_drive_file", {
        fileId: "file123",
        accessToken: "valid_token",
      })
    })

    it("throws error when not authenticated", async () => {
      const { deleteFile } = useGoogleDriveOcr()

      await expect(deleteFile("file123")).rejects.toThrow("Not authenticated")
    })
  })

  describe("deleteFiles", () => {
    it("deletes multiple files in parallel", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockResolvedValue(undefined)

      const { deleteFiles } = useGoogleDriveOcr()
      await deleteFiles(["file1", "file2", "file3"])

      expect(invoke).toHaveBeenCalledTimes(3)
    })

    it("silently skips when not authenticated", async () => {
      const { deleteFiles } = useGoogleDriveOcr()
      await deleteFiles(["file1", "file2"])

      expect(invoke).not.toHaveBeenCalled()
    })

    it("continues deleting even if some fail", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockImplementation(async (_cmd, args) => {
        const { fileId } = args as { fileId: string }
        if (fileId === "file2") throw new Error("Delete failed")
        return undefined
      })

      const { deleteFiles } = useGoogleDriveOcr()
      // Should not throw - uses Promise.allSettled
      await deleteFiles(["file1", "file2", "file3"])

      expect(invoke).toHaveBeenCalledTimes(3)
    })
  })

  describe("extractSingleText", () => {
    it("uploads, exports text, and returns both", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") return { fileId: "file123" }
        if (cmd === "export_google_doc_as_text")
          return { text: "Extracted text" }
        return undefined
      })

      const { extractSingleText } = useGoogleDriveOcr()
      const result = await extractSingleText("/path/to/image.png")

      expect(result).toEqual({ text: "Extracted text", fileId: "file123" })
    })
  })

  describe("extractText", () => {
    it("processes multiple images and returns texts in order", async () => {
      setupAuthenticated()
      let uploadIndex = 0
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          uploadIndex++
          return { fileId: `file${uploadIndex}` }
        }
        if (cmd === "export_google_doc_as_text") {
          return { text: `Text ${uploadIndex}` }
        }
        if (cmd === "delete_google_drive_file") return undefined
        return undefined
      })

      const { extractText } = useGoogleDriveOcr()
      const result = await extractText(["/path1.png", "/path2.png"], 2)

      expect(result).toHaveLength(2)
      // Results should be in order
      expect(result[0]).toContain("Text")
      expect(result[1]).toContain("Text")
    })

    it("reports progress with correct percentages", async () => {
      setupAuthenticated()
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") return { fileId: "file123" }
        if (cmd === "export_google_doc_as_text") return { text: "Text" }
        return undefined
      })

      const progressCalls: Array<{
        completed: number
        total: number
        percentage: number
      }> = []
      const { extractText } = useGoogleDriveOcr()
      await extractText(["/p1.png", "/p2.png", "/p3.png"], 1, (p) =>
        progressCalls.push(p),
      )

      expect(progressCalls).toContainEqual({
        completed: 1,
        total: 3,
        percentage: 33,
      })
      expect(progressCalls).toContainEqual({
        completed: 2,
        total: 3,
        percentage: 67,
      })
      expect(progressCalls).toContainEqual({
        completed: 3,
        total: 3,
        percentage: 100,
      })
    })

    it("continues processing after individual errors, returns empty string for failed", async () => {
      setupAuthenticated()
      let callCount = 0
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          callCount++
          if (callCount === 2) throw new Error("Upload failed")
          return { fileId: `file${callCount}` }
        }
        if (cmd === "export_google_doc_as_text") return { text: "Success" }
        return undefined
      })

      const { extractText } = useGoogleDriveOcr()
      const result = await extractText(["/p1.png", "/p2.png", "/p3.png"], 1)

      expect(result).toHaveLength(3)
      expect(result[0]).toBe("Success")
      expect(result[1]).toBe("") // Failed - empty string placeholder
      expect(result[2]).toBe("Success")
    })

    it("stops and throws when processing is cancelled", async () => {
      setupAuthenticated()
      const store = useProcessingStore()

      let uploadCount = 0
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          uploadCount++
          if (uploadCount === 2) {
            store.cancelProcessing()
          }
          return { fileId: `file${uploadCount}` }
        }
        if (cmd === "export_google_doc_as_text") return { text: "Text" }
        return undefined
      })

      const { extractText } = useGoogleDriveOcr()

      await expect(
        extractText(["/p1.png", "/p2.png", "/p3.png"], 1),
      ).rejects.toThrow("cancelled")
    })

    it("cleans up uploaded files when cancelled", async () => {
      setupAuthenticated()
      const store = useProcessingStore()

      const deletedFiles: string[] = []
      let uploadCount = 0

      vi.mocked(invoke).mockImplementation(async (cmd: string, args) => {
        if (cmd === "upload_to_google_drive") {
          uploadCount++
          if (uploadCount === 2) store.cancelProcessing()
          return { fileId: `file${uploadCount}` }
        }
        if (cmd === "export_google_doc_as_text") return { text: "Text" }
        if (cmd === "delete_google_drive_file") {
          const { fileId } = args as { fileId: string }
          deletedFiles.push(fileId)
          return undefined
        }
        return undefined
      })

      const { extractText } = useGoogleDriveOcr()

      try {
        await extractText(["/p1.png", "/p2.png", "/p3.png"], 1)
      } catch {
        // Expected
      }

      // Should have cleaned up uploaded files
      expect(deletedFiles.length).toBeGreaterThan(0)
    })

    it("deletes files from Drive after successful extraction", async () => {
      setupAuthenticated()
      const deleteCalls: string[] = []

      vi.mocked(invoke).mockImplementation(async (cmd: string, args) => {
        if (cmd === "upload_to_google_drive") return { fileId: "file123" }
        if (cmd === "export_google_doc_as_text") return { text: "Text" }
        if (cmd === "delete_google_drive_file") {
          const { fileId } = args as { fileId: string }
          deleteCalls.push(fileId)
          return undefined
        }
        return undefined
      })

      const { extractText } = useGoogleDriveOcr()
      await extractText(["/path.png"], 1)

      expect(deleteCalls).toContain("file123")
    })
  })
})
