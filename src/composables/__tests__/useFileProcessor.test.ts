import { describe, it, expect, vi, beforeEach } from "vitest"
import { setActivePinia, createPinia } from "pinia"

// Mock localStorage for settings store
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock })

// Only mock external Tauri boundaries - NOT internal composables
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  message: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  writeTextFile: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}))

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(),
  basename: vi.fn(),
  join: vi.fn(),
}))

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

import { useFileProcessor } from "../useFileProcessor"
import { useProcessingStore } from "@/stores/processing"
import { useSettingsStore } from "@/stores/settings"
import { useAuthStore } from "@/stores/auth"
import { open, message } from "@tauri-apps/plugin-dialog"
import { readDir, writeTextFile } from "@tauri-apps/plugin-fs"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { dirname, basename, join } from "@tauri-apps/api/path"

describe("useFileProcessor", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Set up path utilities
    vi.mocked(dirname).mockImplementation(async (path: string) => {
      const parts = path.split("/")
      parts.pop()
      return parts.join("/") || "/"
    })

    vi.mocked(basename).mockImplementation(async (path: string) => {
      return path.split("/").pop() || ""
    })

    vi.mocked(join).mockImplementation(async (...parts: string[]) => {
      return parts.join("/")
    })

    // Default: no progress events
    vi.mocked(listen).mockResolvedValue(() => {})
  })

  /**
   * Helper to set up authenticated state
   */
  function setupAuthenticated() {
    const authStore = useAuthStore()
    authStore.setTokens({
      accessToken: "valid_token",
      refreshToken: "refresh_token",
      expiresAt: Date.now() + 3600000,
    })
  }

  /**
   * Set up invoke to handle the full processing flow
   */
  function setupFullProcessingMocks(
    options: {
      pageCount?: number
      ocrText?: string
    } = {},
  ) {
    const { pageCount = 1, ocrText = "Extracted text" } = options

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "get_pdf_page_count":
          return pageCount
        case "split_pdf":
          return {
            imagePaths: Array.from(
              { length: pageCount },
              (_, i) => `/tmp/page_${i + 1}.png`,
            ),
            tempDir: "/tmp/split",
          }
        case "upload_to_google_drive":
          return { fileId: "file123" }
        case "export_google_doc_as_text":
          return { text: ocrText }
        case "delete_google_drive_file":
          return undefined
        case "cleanup_temp_dir":
          return undefined
        case "write_binary_file":
          return undefined
        case "open_folder":
          return undefined
        default:
          return undefined
      }
    })

    vi.mocked(writeTextFile).mockResolvedValue(undefined)
  }

  describe("collectFiles", () => {
    it("collects only supported file types from folder", async () => {
      vi.mocked(readDir).mockResolvedValue([
        {
          name: "image.png",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
        { name: "doc.pdf", isFile: true, isDirectory: false, isSymlink: false },
        {
          name: "photo.jpg",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
        {
          name: "photo.jpeg",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
        {
          name: "readme.txt",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
        {
          name: "data.json",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
      ])

      const { collectFiles } = useFileProcessor()
      const files = await collectFiles("/folder")

      expect(files).toHaveLength(4) // png, pdf, jpg, jpeg
      expect(files).toContain("/folder/image.png")
      expect(files).toContain("/folder/doc.pdf")
      expect(files).toContain("/folder/photo.jpg")
      expect(files).toContain("/folder/photo.jpeg")
      expect(files).not.toContain("/folder/readme.txt")
    })

    it("recursively scans subdirectories", async () => {
      vi.mocked(readDir).mockImplementation(async (dir: string) => {
        if (dir === "/folder") {
          return [
            { name: "sub", isFile: false, isDirectory: true, isSymlink: false },
            {
              name: "root.pdf",
              isFile: true,
              isDirectory: false,
              isSymlink: false,
            },
          ]
        }
        if (dir === "/folder/sub") {
          return [
            {
              name: "nested.png",
              isFile: true,
              isDirectory: false,
              isSymlink: false,
            },
          ]
        }
        return []
      })

      const { collectFiles } = useFileProcessor()
      const files = await collectFiles("/folder")

      expect(files).toHaveLength(2)
      expect(files).toContain("/folder/root.pdf")
      expect(files).toContain("/folder/sub/nested.png")
    })

    it("returns files sorted alphabetically", async () => {
      vi.mocked(readDir).mockResolvedValue([
        { name: "c.pdf", isFile: true, isDirectory: false, isSymlink: false },
        { name: "a.pdf", isFile: true, isDirectory: false, isSymlink: false },
        { name: "b.pdf", isFile: true, isDirectory: false, isSymlink: false },
      ])

      const { collectFiles } = useFileProcessor()
      const files = await collectFiles("/folder")

      expect(files).toEqual(["/folder/a.pdf", "/folder/b.pdf", "/folder/c.pdf"])
    })

    it("handles case-insensitive extensions", async () => {
      vi.mocked(readDir).mockResolvedValue([
        {
          name: "image.PNG",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
        { name: "doc.PDF", isFile: true, isDirectory: false, isSymlink: false },
        {
          name: "photo.JpG",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
      ])

      const { collectFiles } = useFileProcessor()
      const files = await collectFiles("/folder")

      expect(files).toHaveLength(3)
    })

    it("ignores files without extensions", async () => {
      vi.mocked(readDir).mockResolvedValue([
        { name: "noext", isFile: true, isDirectory: false, isSymlink: false },
        {
          name: "Makefile",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
      ])

      const { collectFiles } = useFileProcessor()
      const files = await collectFiles("/folder")

      expect(files).toHaveLength(0)
    })

    it("handles hidden files correctly", async () => {
      vi.mocked(readDir).mockResolvedValue([
        { name: ".hidden", isFile: true, isDirectory: false, isSymlink: false },
        {
          name: ".hidden.pdf",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
      ])

      const { collectFiles } = useFileProcessor()
      const files = await collectFiles("/folder")

      // .hidden has no real extension, .hidden.pdf has .pdf
      expect(files).toHaveLength(1)
      expect(files[0]).toContain(".hidden.pdf")
    })
  })

  describe("selectFile", () => {
    it("does nothing when dialog cancelled", async () => {
      vi.mocked(open).mockResolvedValue(null)

      const { selectFile } = useFileProcessor()
      await selectFile()

      expect(invoke).not.toHaveBeenCalled()
    })

    it("shows auth error when not authenticated", async () => {
      vi.mocked(open).mockResolvedValue("/path/to/image.png")
      vi.mocked(message).mockResolvedValue(undefined)

      const { selectFile } = useFileProcessor()
      await selectFile()

      expect(message).toHaveBeenCalledWith("messages.authRequired", {
        title: "messages.errorTitle",
        kind: "error",
      })
    })

    it("processes file through full pipeline when authenticated", async () => {
      setupAuthenticated()
      setupFullProcessingMocks({ ocrText: "Hello World" })
      vi.mocked(open).mockResolvedValue("/path/to/image.png")

      const { selectFile } = useFileProcessor()
      await selectFile()

      // Verify OCR was called
      expect(invoke).toHaveBeenCalledWith(
        "upload_to_google_drive",
        expect.any(Object),
      )
      // Verify output was written
      expect(writeTextFile).toHaveBeenCalled()
      // Verify folder was opened
      expect(invoke).toHaveBeenCalledWith("open_folder", expect.any(Object))
    })
  })

  describe("selectFolder", () => {
    it("shows error when no supported files found", async () => {
      vi.mocked(open).mockResolvedValue("/empty/folder")
      vi.mocked(readDir).mockResolvedValue([
        {
          name: "readme.txt",
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        },
      ])
      vi.mocked(message).mockResolvedValue(undefined)

      const { selectFolder } = useFileProcessor()
      await selectFolder()

      expect(message).toHaveBeenCalledWith("messages.noFiles", {
        title: "messages.errorTitle",
        kind: "error",
      })
    })
  })

  describe("processFiles - image processing", () => {
    beforeEach(() => {
      setupAuthenticated()
      setupFullProcessingMocks()
    })

    it("processes single image file directly (no PDF split)", async () => {
      const { processFiles } = useFileProcessor()
      await processFiles(["/path/to/image.png"], "/output")

      // Should NOT call PDF-related commands
      expect(invoke).not.toHaveBeenCalledWith(
        "get_pdf_page_count",
        expect.any(Object),
      )
      expect(invoke).not.toHaveBeenCalledWith("split_pdf", expect.any(Object))

      // Should call OCR
      expect(invoke).toHaveBeenCalledWith(
        "upload_to_google_drive",
        expect.any(Object),
      )
    })

    it("updates processing store state correctly", async () => {
      const store = useProcessingStore()
      const { processFiles } = useFileProcessor()

      await processFiles(["/path/to/image.png"], "/output")

      expect(store.completedFiles).toBe(1)
      expect(store.totalFiles).toBe(1)
      expect(store.isProcessing).toBe(false)
    })

    it("writes output in configured formats", async () => {
      const settings = useSettingsStore()
      settings.formats = ["txt", "json"]

      const { processFiles } = useFileProcessor()
      await processFiles(["/path/to/image.png"], "/output")

      // Should have written txt and json files
      const writeTextFileCalls = vi.mocked(writeTextFile).mock.calls
      const writtenPaths = writeTextFileCalls.map((call) => call[0])

      expect(writtenPaths.some((p) => p.endsWith(".txt"))).toBe(true)
      expect(writtenPaths.some((p) => p.endsWith(".json"))).toBe(true)
    })
  })

  describe("processFiles - PDF processing", () => {
    beforeEach(() => {
      setupAuthenticated()
      setupFullProcessingMocks({ pageCount: 3 })
      // Use only txt format to avoid docx Blob issues in jsdom
      const settings = useSettingsStore()
      settings.formats = ["txt"]
    })

    it("splits PDF into pages before OCR", async () => {
      const { processFiles } = useFileProcessor()
      await processFiles(["/path/to/document.pdf"], "/output")

      expect(invoke).toHaveBeenCalledWith("get_pdf_page_count", {
        pdfPath: "/path/to/document.pdf",
      })
      expect(invoke).toHaveBeenCalledWith(
        "split_pdf",
        expect.objectContaining({
          pdfPath: "/path/to/document.pdf",
          totalPages: 3,
        }),
      )
    })

    it("cleans up temp directory after processing", async () => {
      const { processFiles } = useFileProcessor()
      await processFiles(["/path/to/document.pdf"], "/output")

      expect(invoke).toHaveBeenCalledWith("cleanup_temp_dir", {
        path: "/tmp/split",
      })
    })

    it("processes each page through OCR", async () => {
      const { processFiles } = useFileProcessor()
      await processFiles(["/path/to/document.pdf"], "/output")

      // 3 pages = 3 uploads
      const uploadCalls = vi
        .mocked(invoke)
        .mock.calls.filter((call) => call[0] === "upload_to_google_drive")
      expect(uploadCalls.length).toBe(3)
    })
  })

  describe("processFiles - error handling", () => {
    beforeEach(() => {
      setupAuthenticated()
      // Use only txt format to avoid docx Blob issues in jsdom
      const settings = useSettingsStore()
      settings.formats = ["txt"]
    })

    it("continues processing when individual image OCR fails gracefully", async () => {
      // extractText returns empty strings for failed items, doesn't throw
      let fileIndex = 0
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          fileIndex++
          if (fileIndex === 1) throw new Error("OCR failed for first file")
          return { fileId: "file123" }
        }
        if (cmd === "export_google_doc_as_text") return { text: "Text" }
        if (cmd === "delete_google_drive_file") return undefined
        if (cmd === "open_folder") return undefined
        return undefined
      })
      vi.mocked(writeTextFile).mockResolvedValue(undefined)

      const store = useProcessingStore()
      const { processFiles } = useFileProcessor()
      await processFiles(["/path/file1.png", "/path/file2.png"], "/output")

      // extractText handles failures gracefully - returns empty strings, no errors recorded
      expect(store.errors).toHaveLength(0)
      expect(store.completedFiles).toBe(2) // Both files complete
    })

    it("cleans up temp directory even when OCR fails", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "get_pdf_page_count") return 2
        if (cmd === "split_pdf") {
          return { imagePaths: ["/tmp/p1.png"], tempDir: "/tmp/split" }
        }
        if (cmd === "upload_to_google_drive") {
          throw new Error("OCR failed")
        }
        if (cmd === "cleanup_temp_dir") return undefined
        if (cmd === "open_folder") return undefined
        return undefined
      })

      const { processFiles } = useFileProcessor()
      await processFiles(["/path/to/document.pdf"], "/output")

      expect(invoke).toHaveBeenCalledWith("cleanup_temp_dir", {
        path: "/tmp/split",
      })
    })
  })

  describe("processFiles - cancellation", () => {
    beforeEach(() => {
      setupAuthenticated()
    })

    it("stops processing when cancelled", async () => {
      const store = useProcessingStore()
      let uploadCount = 0

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          uploadCount++
          if (uploadCount === 1) {
            store.cancelProcessing()
            throw new Error("cancelled")
          }
          return { fileId: "file123" }
        }
        return undefined
      })

      const { processFiles } = useFileProcessor()
      await processFiles(["/file1.png", "/file2.png", "/file3.png"], "/output")

      // Should have stopped after cancellation
      expect(store.isCancelled).toBe(true)
      expect(uploadCount).toBe(1)
    })

    it("does not open output folder when cancelled", async () => {
      const store = useProcessingStore()

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "upload_to_google_drive") {
          store.cancelProcessing()
          throw new Error("cancelled")
        }
        return undefined
      })

      const { processFiles } = useFileProcessor()
      await processFiles(["/file.png"], "/output")

      expect(invoke).not.toHaveBeenCalledWith("open_folder", expect.any(Object))
    })
  })

  describe("cancelProcessing", () => {
    it("sets cancelled flag in processing store", () => {
      const store = useProcessingStore()
      store.startProcessing(["/file.png"], "/output")

      const { cancelProcessing } = useFileProcessor()
      cancelProcessing()

      expect(store.isCancelled).toBe(true)
    })
  })

  describe("settings integration", () => {
    beforeEach(() => {
      setupAuthenticated()
      setupFullProcessingMocks()
    })

    it("uses configured DPI for PDF splitting", async () => {
      const settings = useSettingsStore()
      settings.dpi = 300

      const { processFiles } = useFileProcessor()
      await processFiles(["/doc.pdf"], "/output")

      expect(invoke).toHaveBeenCalledWith(
        "split_pdf",
        expect.objectContaining({
          dpi: 300,
        }),
      )
    })

    it("uses custom output directory when configured", async () => {
      const settings = useSettingsStore()
      settings.outputDirectory = "/custom/output"

      vi.mocked(open).mockResolvedValue("/path/to/image.png")

      const { selectFile } = useFileProcessor()
      await selectFile()

      const store = useProcessingStore()
      expect(store.outputFolder).toBe("/custom/output")
    })
  })
})
