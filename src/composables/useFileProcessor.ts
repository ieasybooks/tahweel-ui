import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { useI18n } from "vue-i18n";
import { useProcessingStore } from "@/stores/processing";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { usePdfProcessor, cleanupTempDir } from "./usePdfProcessor";
import { useGoogleDriveOcr } from "./useGoogleDriveOcr";
import { useWriters } from "./useWriters";
import { dirname, basename, join } from "@tauri-apps/api/path";

const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

export function useFileProcessor() {
  const { t } = useI18n();
  const processingStore = useProcessingStore();
  const settingsStore = useSettingsStore();
  const authStore = useAuthStore();
  const { splitPdf } = usePdfProcessor();
  const { extractText } = useGoogleDriveOcr();
  const { writeOutputs } = useWriters();

  async function selectFile() {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Supported Files",
          extensions: ["pdf", "jpg", "jpeg", "png"],
        },
      ],
    });

    if (selected) {
      const outputDir = await dirname(selected);
      await processFiles([selected], outputDir);
    }
  }

  async function selectFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected) {
      const files = await collectFiles(selected);
      if (files.length === 0) {
        // TODO: Show error dialog
        console.error("No supported files found");
        return;
      }
      await processFiles(files, selected);
    }
  }

  async function collectFiles(folderPath: string): Promise<string[]> {
    const files: string[] = [];

    async function scanDir(dir: string) {
      const entries = await readDir(dir);
      for (const entry of entries) {
        const fullPath = await join(dir, entry.name);
        if (entry.isDirectory) {
          await scanDir(fullPath);
        } else if (entry.isFile) {
          const ext = entry.name.toLowerCase().match(/\.[^.]+$/)?.[0];
          if (ext && SUPPORTED_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await scanDir(folderPath);
    return files.sort();
  }

  async function processFiles(filePaths: string[], outputDir: string) {
    if (!authStore.isAuthenticated) {
      console.error("Not authenticated");
      return;
    }

    processingStore.startProcessing(filePaths, outputDir);

    for (const filePath of filePaths) {
      try {
        await processFile(filePath, outputDir);
        processingStore.completeFile();
      } catch (error) {
        processingStore.addError(filePath, String(error));
        processingStore.completeFile();
      }
    }

    processingStore.finishProcessing();
  }

  async function processFile(filePath: string, baseOutputDir: string) {
    const fileName = await basename(filePath);
    const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");

    // Update progress
    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "preparing",
      currentPage: 0,
      totalPages: 0,
      percentage: 0,
    });

    let imagePaths: string[];
    let tempDir: string | null = null;

    if (ext === ".pdf") {
      // Split PDF into images
      processingStore.updateFileProgress({
        filePath,
        fileName,
        stage: "splitting",
        currentPage: 0,
        totalPages: 0,
        percentage: 0,
      });

      const result = await splitPdf(filePath, settingsStore.dpi, (progress) => {
        processingStore.updateFileProgress({
          filePath,
          fileName,
          stage: "splitting",
          currentPage: progress.currentPage,
          totalPages: progress.totalPages,
          percentage: progress.percentage,
        });
      });

      imagePaths = result.imagePaths;
      tempDir = result.tempDir;
    } else {
      // Single image
      imagePaths = [filePath];
    }

    // OCR all images
    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "ocr",
      currentPage: 0,
      totalPages: imagePaths.length,
      percentage: 0,
    });

    const texts = await extractText(imagePaths, settingsStore.ocrConcurrency, (progress) => {
      processingStore.updateFileProgress({
        filePath,
        fileName,
        stage: "ocr",
        currentPage: progress.completed,
        totalPages: progress.total,
        percentage: progress.percentage,
      });
    });

    // Write outputs
    processingStore.updateFileProgress({
      filePath,
      fileName,
      stage: "writing",
      currentPage: 0,
      totalPages: 0,
      percentage: 90,
    });

    const outputBasePath = await join(baseOutputDir, nameWithoutExt);
    await writeOutputs(texts, outputBasePath, settingsStore.formats, {
      pageSeparator: settingsStore.pageSeparator,
    });

    // Cleanup temp directory
    if (tempDir) {
      try {
        await cleanupTempDir(tempDir);
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
    });
  }

  return {
    selectFile,
    selectFolder,
    processFiles,
    collectFiles,
  };
}
