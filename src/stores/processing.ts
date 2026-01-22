import { defineStore } from "pinia"
import { ref, computed } from "vue"

export type ProcessingStage = "preparing" | "splitting" | "ocr" | "writing" | "done"

export interface FileProgress {
  filePath: string
  fileName: string
  stage: ProcessingStage
  currentPage: number
  totalPages: number
  percentage: number
}

export interface ProcessingState {
  files: string[]
  currentFileIndex: number
  currentFile: FileProgress | null
  completedFiles: number
  totalFiles: number
  errors: { file: string; error: string }[]
}

export const useProcessingStore = defineStore("processing", () => {
  const isProcessing = ref(false)
  const isCancelled = ref(false)
  const files = ref<string[]>([])
  const currentFileIndex = ref(0)
  const currentFile = ref<FileProgress | null>(null)
  const completedFiles = ref(0)
  const totalFiles = ref(0)
  const errors = ref<{ file: string; error: string }[]>([])
  const lastCompleted = ref(false)
  const outputFolder = ref<string | null>(null)

  const globalProgress = computed(() => {
    if (totalFiles.value === 0) return 0
    return Math.round((completedFiles.value / totalFiles.value) * 100)
  })

  const fileProgress = computed(() => {
    return currentFile.value?.percentage ?? 0
  })

  function startProcessing(filePaths: string[], outputDir: string) {
    isProcessing.value = true
    isCancelled.value = false
    files.value = filePaths
    totalFiles.value = filePaths.length
    currentFileIndex.value = 0
    completedFiles.value = 0
    currentFile.value = null
    errors.value = []
    lastCompleted.value = false
    outputFolder.value = outputDir
  }

  function cancelProcessing() {
    isCancelled.value = true
  }

  function updateFileProgress(progress: FileProgress) {
    currentFile.value = progress
  }

  function completeFile() {
    completedFiles.value++
    currentFileIndex.value++
  }

  function addError(file: string, error: string) {
    errors.value.push({ file, error })
  }

  function finishProcessing() {
    isProcessing.value = false
    currentFile.value = null
    lastCompleted.value = true
  }

  function reset() {
    isProcessing.value = false
    isCancelled.value = false
    files.value = []
    currentFileIndex.value = 0
    currentFile.value = null
    completedFiles.value = 0
    totalFiles.value = 0
    errors.value = []
    lastCompleted.value = false
    outputFolder.value = null
  }

  return {
    isProcessing,
    isCancelled,
    files,
    currentFileIndex,
    currentFile,
    completedFiles,
    totalFiles,
    errors,
    lastCompleted,
    outputFolder,
    globalProgress,
    fileProgress,
    startProcessing,
    cancelProcessing,
    updateFileProgress,
    completeFile,
    addError,
    finishProcessing,
    reset,
  }
})
