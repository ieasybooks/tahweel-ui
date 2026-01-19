<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings";

const { t } = useI18n();
const settingsStore = useSettingsStore();
const isExpanded = ref(false);
</script>

<template>
  <div class="border border-gray-200 rounded-xl overflow-hidden">
    <!-- Header -->
    <button
      @click="isExpanded = !isExpanded"
      class="w-full flex items-center justify-between p-4 text-gray-700 hover:bg-gray-50 transition-colors"
    >
      <span class="font-medium">{{ t("settings.title") }}</span>
      <svg
        class="w-5 h-5 transition-transform"
        :class="{ 'rotate-180': isExpanded }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Content -->
    <div v-show="isExpanded" class="p-4 pt-0 space-y-4 border-t border-gray-200">
      <!-- DPI Setting -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700">
          {{ t("settings.dpi") }}: {{ settingsStore.dpi }}
        </label>
        <input
          v-model.number="settingsStore.dpi"
          type="range"
          min="72"
          max="300"
          step="1"
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
        />
        <div class="flex justify-between text-xs text-gray-500">
          <span>72</span>
          <span>150</span>
          <span>300</span>
        </div>
      </div>

      <!-- Output Formats -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700">
          {{ t("settings.formats") }}
        </label>
        <div class="flex gap-3">
          <label
            v-for="format in ['txt', 'docx', 'json'] as const"
            :key="format"
            class="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="settingsStore.formats.includes(format)"
              @change="settingsStore.toggleFormat(format)"
              class="w-4 h-4 text-green-500 border-gray-300 rounded focus:ring-green-500"
            />
            <span class="text-sm text-gray-600 uppercase">{{ format }}</span>
          </label>
        </div>
      </div>

      <!-- OCR Concurrency -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700">
          {{ t("settings.ocrConcurrency") }}: {{ settingsStore.ocrConcurrency }}
        </label>
        <input
          v-model.number="settingsStore.ocrConcurrency"
          type="range"
          min="1"
          max="20"
          step="1"
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
        />
        <div class="flex justify-between text-xs text-gray-500">
          <span>1</span>
          <span>10</span>
          <span>20</span>
        </div>
      </div>
    </div>
  </div>
</template>
