import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Tauri APIs before importing
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}))

import { usePdfProcessor, cleanupTempDir } from "../usePdfProcessor"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

describe("usePdfProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("cleanupTempDir", () => {
    it("invokes cleanup_temp_dir with path", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await cleanupTempDir("/tmp/test-dir")

      expect(invoke).toHaveBeenCalledWith("cleanup_temp_dir", {
        path: "/tmp/test-dir",
      })
    })

    it("propagates errors from invoke", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Cleanup failed"))

      await expect(cleanupTempDir("/tmp/test")).rejects.toThrow(
        "Cleanup failed",
      )
    })
  })

  describe("getPageCount", () => {
    it("returns page count from invoke", async () => {
      vi.mocked(invoke).mockResolvedValue(10)

      const { getPageCount } = usePdfProcessor()
      const count = await getPageCount("/path/to/file.pdf")

      expect(count).toBe(10)
      expect(invoke).toHaveBeenCalledWith("get_pdf_page_count", {
        pdfPath: "/path/to/file.pdf",
      })
    })

    it("handles single page PDF", async () => {
      vi.mocked(invoke).mockResolvedValue(1)

      const { getPageCount } = usePdfProcessor()
      const count = await getPageCount("/path/to/single.pdf")

      expect(count).toBe(1)
    })

    it("propagates errors", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Invalid PDF"))

      const { getPageCount } = usePdfProcessor()

      await expect(getPageCount("/invalid.pdf")).rejects.toThrow("Invalid PDF")
    })
  })

  describe("splitPdf", () => {
    it("splits PDF and returns result", async () => {
      const mockResult = {
        imagePaths: ["/tmp/page_001.png", "/tmp/page_002.png"],
        tempDir: "/tmp/split-abc123",
      }

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "get_pdf_page_count") return 2
        if (cmd === "split_pdf") return mockResult
        return null
      })

      vi.mocked(listen).mockResolvedValue(() => {})

      const { splitPdf } = usePdfProcessor()
      const result = await splitPdf("/path/to/file.pdf", 150)

      expect(result).toEqual(mockResult)
      expect(invoke).toHaveBeenCalledWith("get_pdf_page_count", {
        pdfPath: "/path/to/file.pdf",
      })
      expect(invoke).toHaveBeenCalledWith("split_pdf", {
        pdfPath: "/path/to/file.pdf",
        dpi: 150,
        totalPages: 2,
      })
    })

    it("sets up progress listener when callback provided", async () => {
      const mockUnlisten = vi.fn()
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "get_pdf_page_count") return 3
        if (cmd === "split_pdf") {
          return { imagePaths: [], tempDir: "/tmp" }
        }
        return null
      })

      vi.mocked(listen).mockResolvedValue(mockUnlisten)

      const onProgress = vi.fn()
      const { splitPdf } = usePdfProcessor()
      await splitPdf("/path/to/file.pdf", 150, onProgress)

      expect(listen).toHaveBeenCalledWith(
        "split-progress",
        expect.any(Function),
      )
      expect(mockUnlisten).toHaveBeenCalled()
    })

    it("calls progress callback with event payload", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let progressCallback: (event: any) => void = () => {}

      vi.mocked(listen).mockImplementation(async (_event, callback) => {
        progressCallback = callback as typeof progressCallback
        return () => {}
      })

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "get_pdf_page_count") return 3
        if (cmd === "split_pdf") {
          // Simulate progress events
          progressCallback({
            payload: { currentPage: 1, totalPages: 3, percentage: 33 },
          })
          progressCallback({
            payload: { currentPage: 2, totalPages: 3, percentage: 66 },
          })
          return { imagePaths: [], tempDir: "/tmp" }
        }
        return null
      })

      const onProgress = vi.fn()
      const { splitPdf } = usePdfProcessor()
      await splitPdf("/path/to/file.pdf", 150, onProgress)

      expect(onProgress).toHaveBeenCalledWith({
        currentPage: 1,
        totalPages: 3,
        percentage: 33,
      })
      expect(onProgress).toHaveBeenCalledWith({
        currentPage: 2,
        totalPages: 3,
        percentage: 66,
      })
    })

    it("does not set up listener when no callback provided", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "get_pdf_page_count") return 1
        if (cmd === "split_pdf") return { imagePaths: [], tempDir: "/tmp" }
        return null
      })

      const { splitPdf } = usePdfProcessor()
      await splitPdf("/path/to/file.pdf", 150)

      expect(listen).not.toHaveBeenCalled()
    })

    it("cleans up listener even on error", async () => {
      const mockUnlisten = vi.fn()
      vi.mocked(listen).mockResolvedValue(mockUnlisten)

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "get_pdf_page_count") return 2
        if (cmd === "split_pdf") throw new Error("Split failed")
        return null
      })

      const { splitPdf } = usePdfProcessor()

      await expect(
        splitPdf("/path/to/file.pdf", 150, () => {}),
      ).rejects.toThrow("Split failed")

      expect(mockUnlisten).toHaveBeenCalled()
    })
  })

  describe("extractPage", () => {
    it("extracts single page from PDF", async () => {
      vi.mocked(invoke).mockResolvedValue("/output/page.png")

      const { extractPage } = usePdfProcessor()
      const result = await extractPage(
        "/path/to/file.pdf",
        1,
        150,
        "/output/page.png",
      )

      expect(result).toBe("/output/page.png")
      expect(invoke).toHaveBeenCalledWith("extract_pdf_page", {
        pdfPath: "/path/to/file.pdf",
        pageNumber: 1,
        dpi: 150,
        outputPath: "/output/page.png",
      })
    })

    it("handles different DPI values", async () => {
      vi.mocked(invoke).mockResolvedValue("/output/page.png")

      const { extractPage } = usePdfProcessor()
      await extractPage("/path/to/file.pdf", 5, 300, "/output/page.png")

      expect(invoke).toHaveBeenCalledWith("extract_pdf_page", {
        pdfPath: "/path/to/file.pdf",
        pageNumber: 5,
        dpi: 300,
        outputPath: "/output/page.png",
      })
    })

    it("propagates errors", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Page not found"))

      const { extractPage } = usePdfProcessor()

      await expect(
        extractPage("/path/to/file.pdf", 99, 150, "/output/page.png"),
      ).rejects.toThrow("Page not found")
    })
  })
})
