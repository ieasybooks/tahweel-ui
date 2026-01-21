<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFileProcessor } from "@/composables/useFileProcessor";

defineProps<{
  disabled: boolean;
}>();

const { t } = useI18n();
const { selectFile, selectFolder } = useFileProcessor();

const isSelectingFile = ref(false);
const isSelectingFolder = ref(false);

async function handleSelectFile() {
  isSelectingFile.value = true;
  try {
    await selectFile();
  } finally {
    isSelectingFile.value = false;
  }
}

async function handleSelectFolder() {
  isSelectingFolder.value = true;
  try {
    await selectFolder();
  } finally {
    isSelectingFolder.value = false;
  }
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4">
    <button
      @click="handleSelectFile"
      :disabled="disabled || isSelectingFile || isSelectingFolder"
      class="flex flex-col items-center justify-center gap-2 p-6 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
    >
      <!-- Loading spinner -->
      <svg
        v-if="isSelectingFile"
        class="w-8 h-8 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <!-- File icon -->
      <svg v-else class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <span class="font-medium text-sm">{{ t("buttons.convertFile") }}</span>
    </button>

    <button
      @click="handleSelectFolder"
      :disabled="disabled || isSelectingFile || isSelectingFolder"
      class="flex flex-col items-center justify-center gap-2 p-6 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
    >
      <!-- Loading spinner -->
      <svg
        v-if="isSelectingFolder"
        class="w-8 h-8 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <!-- Folder icon -->
      <svg v-else class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <span class="font-medium text-sm">{{ t("buttons.convertFolder") }}</span>
    </button>
  </div>
</template>
