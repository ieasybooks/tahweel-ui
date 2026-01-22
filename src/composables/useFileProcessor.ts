import { open, message } from "@tauri-apps/plugin-dialog"
import { readDir } from "@tauri-apps/plugin-fs"
import { invoke } from "@tauri-apps/api/core"
import { useI18n } from "vue-i18n"
import { useProcessingStore } from "@/stores/processing"
import { useSettingsStore } from "@/stores/settings"
import { useAuthStore } from "@/stores/auth"
import { useToastStore } from "@/stores/toast"
import { usePdfProcessor, cleanupTempDir } from "./usePdfProcessor"
import { useGoogleDriveOcr } from "./useGoogleDriveOcr"
import { useWriters } from "./useWriters"
import { dirname, basename, join } from "@tauri-apps/api/path"

const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"]

/**
 * Get file extension from filename, handling edge cases
 */
function getFileExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf(".")
  if (lastDot === -1 || lastDot === 0 || lastDot === filename.length - 1) {
    return null // No extension, hidden file, or trailing dot
  }
  return filename.slice(lastDot).toLowerCase()
}

/**
 * Check if a file has a supported extension
 */
function isSupportedFile(filename: string): boolean {
  const ext = getFileExtension(filename)
  return ext !== null && SUPPORTED_EXTENSIONS.includes(ext)
}

export function useFileProcessor() {
  const { t } = useI18n()
  const processingStore = useProcessingStore()
  const settingsStore = useSettingsStore()
  const authStore = useAuthStore()
  const toastStore = useToastStore()
  const { splitPdf } = usePdfProcessor()
  const { extractText } = useGoogleDriveOcr()
  const { writeOutputs } = useWriters()

  async function selectFile() {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Supported Files",
          extensions: ["pdf", "jpg", "jpeg", "png"],
        },
      ],
    })

    if (selected) {
      const inputDir = await dirname(selected)
      const outputDir = settingsStore.outputDirectory ?? inputDir
      await processFiles([selected], outputDir)
    }
  }

  async function selectFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
    })

    if (selected) {
      const files = await collectFiles(selected)
      if (files.length === 0) {
        await message(t("messages.noFiles"), {
          title: t("messages.errorTitle"),
          kind: "error",
        })
        return
      }
      const outputDir = settingsStore.outputDirectory ?? selected
      await processFiles(files, outputDir)
    }
  }

  async function collectFiles(folderPath: string): Promise<string[]> {
    const files: string[] = []

    async function scanDir(dir: string) {
      const entries = await readDir(dir)
      for (const entry of entries) {
        const fullPath = await join(dir, entry.name)
        if (entry.isDirectory) {
          await scanDir(fullPath)
        } else if (entry.isFile && isSupportedFile(entry.name)) {
          files.push(fullPath)
        }
      }
    }

    await scanDir(folderPath)
    return files.sort()
  }

  async function processFiles(filePaths: string[], outputDir: string) {
    if (!authStore.isAuthenticated) {
      await message(t("messages.authRequired"), {
        title: t("messages.errorTitle"),
        kind: "error",
      })
      return
    }

    processingStore.startProcessing(filePaths, outputDir)

    for (const filePath of filePaths) {
      // Check for cancellation before processing each file
      if (processingStore.isCancelled) {
        break
      }

      try {
        await processFile(filePath, outputDir)
        processingStore.completeFile()
      } catch (error) {
        const errorMessage = String(error)
        if (errorMessage.includes("cancelled")) {
          break // Stop processing on cancellation
        }
        processingStore.addError(filePath, errorMessage)
        processingStore.completeFile()
      }
    }

    processingStore.finishProcessing()

    // Auto-open output folder after conversion (only if not cancelled and has output)
    if (
      !processingStore.isCancelled &&
      processingStore.outputFolder &&
      processingStore.completedFiles > 0
    ) {
      try {
        await invoke("open_folder", { path: processingStore.outputFolder })
      } catch (error) {
        console.error("Failed to open folder:", error)
        toastStore.warning("toast.openFolderFailed")
      }
    }
  }

  async function processFile(filePath: string, baseOutputDir: string) {
    const fileName = await basename(filePath)
    const ext = getFileExtension(fileName) || ""
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "")

    // Check for cancellation
    if (processingStore.isCancelled) {
      throw new Error("Processing cancelled")
    }

    // Update progress
    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "preparing",
      currentPage: 0,
      totalPages: 0,
      percentage: 0,
    })

    let imagePaths: string[]
    let tempDir: string | null = null

    if (ext === ".pdf") {
      // Check for cancellation before PDF split
      if (processingStore.isCancelled) {
        throw new Error("Processing cancelled")
      }

      // Split PDF into images
      processingStore.updateFileProgress({
        filePath,
        fileName,
        stage: "splitting",
        currentPage: 0,
        totalPages: 0,
        percentage: 0,
      })

      const result = await splitPdf(filePath, settingsStore.dpi, (progress) => {
        processingStore.updateFileProgress({
          filePath,
          fileName,
          stage: "splitting",
          currentPage: progress.currentPage,
          totalPages: progress.totalPages,
          percentage: progress.percentage,
        })
      })

      imagePaths = result.imagePaths
      tempDir = result.tempDir
    } else {
      // Single image
      imagePaths = [filePath]
    }

    // Check for cancellation before OCR
    if (processingStore.isCancelled) {
      // Clean up temp directory if we created one
      if (tempDir) {
        try {
          await cleanupTempDir(tempDir)
        } catch {
          // Ignore cleanup errors
        }
      }
      throw new Error("Processing cancelled")
    }

    // OCR all images
    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "ocr",
      currentPage: 0,
      totalPages: imagePaths.length,
      percentage: 0,
    })

    let texts: string[]
    try {
      texts = await extractText(
        imagePaths,
        settingsStore.ocrConcurrency,
        (progress) => {
          processingStore.updateFileProgress({
            filePath,
            fileName,
            stage: "ocr",
            currentPage: progress.completed,
            totalPages: progress.total,
            percentage: progress.percentage,
          })
        },
      )
    } catch (error) {
      // Clean up temp directory on error
      if (tempDir) {
        try {
          await cleanupTempDir(tempDir)
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error
    }

    // Check for cancellation before writing
    if (processingStore.isCancelled) {
      if (tempDir) {
        try {
          await cleanupTempDir(tempDir)
        } catch {
          // Ignore cleanup errors
        }
      }
      throw new Error("Processing cancelled")
    }

    // Write outputs
    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "writing",
      currentPage: 0,
      totalPages: 0,
      percentage: 90,
    })

    const outputBasePath = await join(baseOutputDir, nameWithoutExt)
    await writeOutputs(texts, outputBasePath, settingsStore.formats, {
      pageSeparator: settingsStore.pageSeparator,
    })

    // Cleanup temp directory
    if (tempDir) {
      try {
        await cleanupTempDir(tempDir)
      } catch {
        // Ignore cleanup errors
      }
    }

    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "done",
      currentPage: imagePaths.length,
      totalPages: imagePaths.length,
      percentage: 100,
    })
  }

  function cancelProcessing() {
    processingStore.cancelProcessing()
  }

  return {
    selectFile,
    selectFolder,
    processFiles,
    collectFiles,
    cancelProcessing,
  }
}
