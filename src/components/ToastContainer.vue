<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useToastStore, type Toast } from "@/stores/toast";

const { t } = useI18n();
const toastStore = useToastStore();

function getToastMessage(toast: Toast): string {
  // Translate the message key, passing any params
  return t(toast.messageKey, toast.messageParams || {});
}

const typeStyles = {
  error: "bg-red-50 border-red-200 text-red-800",
  success: "bg-green-50 border-green-200 text-green-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const iconPaths = {
  error: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  warning: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

const iconColors = {
  error: "text-red-500",
  success: "text-green-500",
  warning: "text-yellow-500",
  info: "text-blue-500",
};
</script>

<template>
  <div
    class="fixed bottom-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4"
    :class="[$i18n.locale === 'ar' ? 'left-4' : 'right-4']"
    role="region"
    aria-live="polite"
    :aria-label="t('toast.notifications') || 'Notifications'"
  >
    <TransitionGroup
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="flex items-start gap-3 p-4 rounded-lg border shadow-lg"
        :class="typeStyles[toast.type]"
        role="alert"
      >
        <svg
          class="w-5 h-5 flex-shrink-0 mt-0.5"
          :class="iconColors[toast.type]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="iconPaths[toast.type]"
          />
        </svg>
        <p class="flex-1 text-sm font-medium">{{ getToastMessage(toast) }}</p>
        <button
          @click="toastStore.removeToast(toast.id)"
          class="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-current"
          :aria-label="t('toast.close')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
