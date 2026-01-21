<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "@/stores/settings";

const { t } = useI18n();
const settingsStore = useSettingsStore();
const isExpanded = ref(false);

const outputDirDisplay = computed(() => {
  if (!settingsStore.outputDirectory) {
    return t("settings.useInputDirectory");
  }
  // Show just the last part of the path for brevity
  const parts = settingsStore.outputDirectory.split(/[/\\]/);
  return parts[parts.length - 1] || settingsStore.outputDirectory;
});

async function selectOutputDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (selected) {
    settingsStore.setOutputDirectory(selected);
  }
}

function clearOutputDirectory() {
  settingsStore.setOutputDirectory(null);
}
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

      <!-- Output Directory -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700">
          {{ t("settings.outputDirectory") }}
        </label>
        <div class="flex gap-2">
          <button
            @click="selectOutputDirectory"
            class="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-start truncate"
            :title="settingsStore.outputDirectory || t('settings.useInputDirectory')"
          >
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span class="truncate">{{ outputDirDisplay }}</span>
            </span>
          </button>
          <button
            v-if="settingsStore.outputDirectory"
            @click="clearOutputDirectory"
            class="px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            :title="t('settings.clearOutputDirectory')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p class="text-xs text-gray-500">{{ t("settings.outputDirectoryHint") }}</p>
      </div>
    </div>
  </div>
</template>
