<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useProcessingStore } from "@/stores/processing";
import { invoke } from "@tauri-apps/api/core";

const { t } = useI18n();
const processingStore = useProcessingStore();

const stageText = computed(() => {
  if (!processingStore.currentFile) return "";
  const stage = processingStore.currentFile.stage;
  switch (stage) {
    case "preparing":
      return t("progress.preparing");
    case "splitting":
      return t("progress.splitting");
    case "ocr":
      return t("progress.ocr");
    case "writing":
      return t("progress.writing");
    case "done":
      return t("progress.done");
    default:
      return "";
  }
});

const currentFileName = computed(() => {
  if (!processingStore.currentFile) return "";
  return processingStore.currentFile.fileName;
});

async function openOutputFolder() {
  if (processingStore.outputFolder) {
    await invoke("open_folder", { path: processingStore.outputFolder });
  }
}
</script>

<template>
  <div class="bg-gray-50 rounded-xl p-6 space-y-4">
    <!-- Global Progress -->
    <div class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-600">
          {{ t("progress.global") }} ({{ processingStore.completedFiles }}/{{ processingStore.totalFiles }})
        </span>
        <span class="font-medium text-gray-800">{{ processingStore.globalProgress }}%</span>
      </div>
      <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-300"
          :style="{ width: `${processingStore.globalProgress}%` }"
        ></div>
      </div>
    </div>

    <!-- File Progress -->
    <div v-if="processingStore.currentFile" class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-600 truncate max-w-[60%]">
          {{ t("progress.file") }} {{ currentFileName }}
        </span>
        <span class="font-medium text-gray-800">{{ stageText }}</span>
      </div>
      <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all duration-300"
          :style="{ width: `${processingStore.fileProgress}%` }"
        ></div>
      </div>
      <div v-if="processingStore.currentFile.totalPages > 0" class="text-xs text-gray-500 text-center">
        {{ processingStore.currentFile.currentPage }} / {{ processingStore.currentFile.totalPages }}
      </div>
    </div>

    <!-- Completed State -->
    <div v-if="processingStore.lastCompleted && !processingStore.isProcessing" class="text-center space-y-3">
      <div class="flex items-center justify-center gap-2 text-green-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span class="font-medium">{{ t("progress.done") }}</span>
      </div>
      <button
        v-if="processingStore.outputFolder"
        @click="openOutputFolder"
        class="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
      >
        {{ t("buttons.openFolder") }}
      </button>
    </div>

    <!-- Errors -->
    <div v-if="processingStore.errors.length > 0" class="mt-4 space-y-2">
      <p class="text-sm font-medium text-red-600">{{ t("messages.errorTitle") }}:</p>
      <ul class="text-sm text-red-500 space-y-1">
        <li v-for="(error, index) in processingStore.errors" :key="index" class="truncate">
          {{ error.file }}: {{ error.error }}
        </li>
      </ul>
    </div>
  </div>
</template>
