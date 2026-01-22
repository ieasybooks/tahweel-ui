<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useProcessingStore } from "@/stores/processing";
import { useFileProcessor } from "@/composables/useFileProcessor";
import { invoke } from "@tauri-apps/api/core";

const { t } = useI18n();
const processingStore = useProcessingStore();
const { cancelProcessing } = useFileProcessor();

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

const completionMessage = computed(() => {
  const count = processingStore.completedFiles;
  if (count === 1) return t("messages.conversionCompleteOne");
  if (count === 2) return t("messages.conversionCompleteTwo");
  return t("messages.conversionComplete", { count });
});

async function openOutputFolder() {
  if (processingStore.outputFolder) {
    await invoke("open_folder", { path: processingStore.outputFolder });
  }
}

function startNewConversion() {
  processingStore.reset();
}
</script>

<template>
  <div class="bg-gray-50 rounded-xl p-6 space-y-4" role="region" :aria-label="t('progress.progressRegion')">
    <!-- Global Progress -->
    <div class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-600" id="global-progress-label">
          {{ t("progress.global") }} ({{ processingStore.completedFiles }}/{{ processingStore.totalFiles }})
        </span>
        <span class="font-medium text-gray-800" aria-live="polite">{{ processingStore.globalProgress }}%</span>
      </div>
      <div
        class="h-3 bg-gray-200 rounded-full overflow-hidden"
        role="progressbar"
        :aria-valuenow="processingStore.globalProgress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-labelledby="global-progress-label"
      >
        <div
          class="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-300"
          :style="{ width: `${processingStore.globalProgress}%` }"
        ></div>
      </div>
    </div>

    <!-- File Progress -->
    <div v-if="processingStore.currentFile" class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-600 truncate max-w-[60%]" id="file-progress-label">
          {{ t("progress.file") }} {{ currentFileName }}
        </span>
        <span class="font-medium text-gray-800" aria-live="polite">{{ stageText }}</span>
      </div>
      <div
        class="h-2 bg-gray-200 rounded-full overflow-hidden"
        role="progressbar"
        :aria-valuenow="processingStore.fileProgress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-labelledby="file-progress-label"
      >
        <div
          class="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all duration-300"
          :style="{ width: `${processingStore.fileProgress}%` }"
        ></div>
      </div>
      <div v-if="processingStore.currentFile.totalPages > 0" class="text-xs text-gray-500 text-center" aria-live="polite">
        {{ processingStore.currentFile.currentPage }} / {{ processingStore.currentFile.totalPages }}
      </div>
    </div>

    <!-- Cancel Button -->
    <div v-if="processingStore.isProcessing && !processingStore.isCancelled" class="text-center">
      <button
        @click="cancelProcessing"
        class="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        :aria-label="t('buttons.cancel')"
      >
        {{ t("buttons.cancel") }}
      </button>
    </div>

    <!-- Cancelled State -->
    <div v-if="processingStore.isCancelled && processingStore.isProcessing" class="text-center" role="status" aria-live="polite">
      <span class="text-sm text-orange-600 font-medium">{{ t("progress.cancelling") || "Cancelling..." }}</span>
    </div>

    <!-- Completed State -->
    <div v-if="processingStore.lastCompleted && !processingStore.isProcessing" class="text-center space-y-4" role="status" aria-live="polite">
      <!-- Success Icon -->
      <div class="flex justify-center">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center" aria-hidden="true">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <!-- Success Message -->
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-gray-800">{{ t("messages.successTitle") }}</h3>
        <p class="text-sm text-gray-600">{{ completionMessage }}</p>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-center gap-3 pt-2" role="group" :aria-label="t('buttons.completionActions')">
        <button
          v-if="processingStore.outputFolder"
          @click="openOutputFolder"
          class="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          :aria-label="t('buttons.openFolder')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          {{ t("buttons.openFolder") }}
        </button>
        <button
          @click="startNewConversion"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          :aria-label="t('buttons.newConversion')"
        >
          {{ t("buttons.newConversion") }}
        </button>
      </div>
    </div>

    <!-- Errors -->
    <div v-if="processingStore.errors.length > 0" class="mt-4 space-y-2" role="alert" aria-live="assertive">
      <p class="text-sm font-medium text-red-600">{{ t("messages.errorTitle") }}:</p>
      <ul class="text-sm text-red-500 space-y-1" :aria-label="t('messages.errorList')">
        <li v-for="(error, index) in processingStore.errors" :key="index" class="truncate">
          {{ error.file }}: {{ error.error }}
        </li>
      </ul>
    </div>
  </div>
</template>
