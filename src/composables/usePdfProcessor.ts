import { invoke } from "@tauri-apps/api/core";

export interface SplitProgress {
  currentPage: number;
  totalPages: number;
  percentage: number;
}

export interface SplitResult {
  imagePaths: string[];
  tempDir: string;
}

/**
 * Cleanup a temporary directory
 */
export async function cleanupTempDir(path: string): Promise<void> {
  await invoke("cleanup_temp_dir", { path });
}

export function usePdfProcessor() {
  /**
   * Get the total number of pages in a PDF file
   */
  async function getPageCount(pdfPath: string): Promise<number> {
    return await invoke<number>("get_pdf_page_count", { pdfPath });
  }

  /**
   * Split a PDF into individual page images
   */
  async function splitPdf(
    pdfPath: string,
    dpi: number,
    onProgress?: (progress: SplitProgress) => void
  ): Promise<SplitResult> {
    // Get total pages first
    const totalPages = await getPageCount(pdfPath);

    // Create temp directory and start splitting
    const result = await invoke<SplitResult>("split_pdf", {
      pdfPath,
      dpi,
      totalPages,
    });

    // For now, we report progress as completed since the Rust side handles it
    // In a more complete implementation, we'd use Tauri events for real-time progress
    if (onProgress) {
      onProgress({
        currentPage: totalPages,
        totalPages,
        percentage: 100,
      });
    }

    return result;
  }

  /**
   * Extract a single page from a PDF as an image
   */
  async function extractPage(
    pdfPath: string,
    pageNumber: number,
    dpi: number,
    outputPath: string
  ): Promise<string> {
    return await invoke<string>("extract_pdf_page", {
      pdfPath,
      pageNumber,
      dpi,
      outputPath,
    });
  }

  return {
    getPageCount,
    splitPdf,
    extractPage,
  };
}
