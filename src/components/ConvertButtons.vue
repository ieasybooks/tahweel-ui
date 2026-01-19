<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useFileProcessor } from "@/composables/useFileProcessor";

defineProps<{
  disabled: boolean;
}>();

const { t } = useI18n();
const { selectFile, selectFolder } = useFileProcessor();
</script>

<template>
  <div class="grid grid-cols-2 gap-4">
    <button
      @click="selectFile"
      :disabled="disabled"
      class="flex flex-col items-center justify-center gap-2 p-6 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
    >
      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <span class="font-medium text-sm">{{ t("buttons.convertFile") }}</span>
    </button>

    <button
      @click="selectFolder"
      :disabled="disabled"
      class="flex flex-col items-center justify-center gap-2 p-6 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
    >
      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <span class="font-medium text-sm">{{ t("buttons.convertFolder") }}</span>
    </button>
  </div>
</template>
