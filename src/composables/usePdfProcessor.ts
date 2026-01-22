import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export interface SplitProgress {
  currentPage: number
  totalPages: number
  percentage: number
}

export interface SplitResult {
  imagePaths: string[]
  tempDir: string
}

/**
 * Cleanup a temporary directory
 */
export async function cleanupTempDir(path: string): Promise<void> {
  await invoke("cleanup_temp_dir", { path })
}

export function usePdfProcessor() {
  /**
   * Get the total number of pages in a PDF file
   */
  async function getPageCount(pdfPath: string): Promise<number> {
    return await invoke<number>("get_pdf_page_count", { pdfPath })
  }

  /**
   * Split a PDF into individual page images
   */
  async function splitPdf(
    pdfPath: string,
    dpi: number,
    onProgress?: (progress: SplitProgress) => void,
  ): Promise<SplitResult> {
    // Get total pages first
    const totalPages = await getPageCount(pdfPath)

    // Set up event listener for progress updates
    let unlisten: UnlistenFn | null = null
    if (onProgress) {
      unlisten = await listen<SplitProgress>("split-progress", (event) => {
        onProgress(event.payload)
      })
    }

    try {
      // Create temp directory and start splitting
      const result = await invoke<SplitResult>("split_pdf", {
        pdfPath,
        dpi,
        totalPages,
      })

      return result
    } finally {
      // Clean up the event listener
      if (unlisten) {
        unlisten()
      }
    }
  }

  /**
   * Extract a single page from a PDF as an image
   */
  async function extractPage(
    pdfPath: string,
    pageNumber: number,
    dpi: number,
    outputPath: string,
  ): Promise<string> {
    return await invoke<string>("extract_pdf_page", {
      pdfPath,
      pageNumber,
      dpi,
      outputPath,
    })
  }

  return {
    getPageCount,
    splitPdf,
    extractPage,
  }
}
