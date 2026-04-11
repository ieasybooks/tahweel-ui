import { open, message } from "@tauri-apps/plugin-dialog"
import { readDir } from "@tauri-apps/plugin-fs"
import { invoke } from "@tauri-apps/api/core"
import { useI18n } from "vue-i18n"
import { useProcessingStore } from "@/stores/processing"
import { useSettingsStore } from "@/stores/settings"
import { useAuthStore } from "@/stores/auth"
import { useToastStore } from "@/stores/toast"
import { usePdfProcessor } from "./usePdfProcessor"
import { useGoogleDriveOcr } from "./useGoogleDriveOcr"
import { useWriters } from "./useWriters"
import { dirname, basename, join } from "@tauri-apps/api/path"

export const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"]

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
export function isSupportedFile(filename: string): boolean {
  const ext = getFileExtension(filename)
  return ext !== null && SUPPORTED_EXTENSIONS.includes(ext)
}

export function useFileProcessor() {
  const { t } = useI18n()
  const processingStore = useProcessingStore()
  const settingsStore = useSettingsStore()
  const authStore = useAuthStore()
  const toastStore = useToastStore()
  const { splitPdf, cleanupTempDir } = usePdfProcessor()
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
      await openOutputFolder()
    }
  }

  async function processFile(filePath: string, baseOutputDir: string) {
    const fileName = await basename(filePath)
    const ext = getFileExtension(fileName) || ""
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "")

    function reportStage(
      stage: import("@/stores/processing").ProcessingStage,
      currentPage = 0,
      totalPages = 0,
      percentage = 0,
    ) {
      processingStore.updateFileProgress({
        filePath,
        fileName,
        stage,
        currentPage,
        totalPages,
        percentage,
      })
    }

    function checkCancelled() {
      if (processingStore.isCancelled) {
        throw new Error("Processing cancelled")
      }
    }

    checkCancelled()
    reportStage("preparing")

    let imagePaths: string[]
    let tempDir: string | null = null

    try {
      if (ext === ".pdf") {
        checkCancelled()
        reportStage("splitting")

        const result = await splitPdf(
          filePath,
          settingsStore.dpi,
          (progress) => {
            reportStage(
              "splitting",
              progress.currentPage,
              progress.totalPages,
              progress.percentage,
            )
          },
        )

        imagePaths = result.imagePaths
        tempDir = result.tempDir
      } else {
        imagePaths = [filePath]
      }

      checkCancelled()
      reportStage("ocr", 0, imagePaths.length)

      const texts = await extractText(
        imagePaths,
        settingsStore.ocrConcurrency,
        (progress) => {
          reportStage(
            "ocr",
            progress.completed,
            progress.total,
            progress.percentage,
          )
        },
        () => processingStore.isCancelled,
      )

      checkCancelled()
      reportStage("writing", 0, 0, 90)

      const outputBasePath = await join(baseOutputDir, nameWithoutExt)
      await writeOutputs(texts, outputBasePath, settingsStore.formats, {
        pageSeparator: settingsStore.pageSeparator,
      })

      reportStage("done", imagePaths.length, imagePaths.length, 100)
    } finally {
      if (tempDir) {
        try {
          await cleanupTempDir(tempDir)
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  async function openOutputFolder() {
    if (!processingStore.outputFolder) return
    try {
      await invoke("open_folder", { path: processingStore.outputFolder })
    } catch (error) {
      console.error("Failed to open folder:", error)
      toastStore.warning("toast.openFolderFailed")
    }
  }

  return {
    selectFile,
    selectFolder,
    processFiles,
    collectFiles,
    openOutputFolder,
  }
}
