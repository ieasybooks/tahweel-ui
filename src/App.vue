<script setup lang="ts">
import { computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "./stores/settings";
import { useAuthStore } from "./stores/auth";
import { useProcessingStore } from "./stores/processing";
import { useAuth } from "./composables/useAuth";

import HeaderSection from "./components/HeaderSection.vue";
import ConvertButtons from "./components/ConvertButtons.vue";
import ProgressSection from "./components/ProgressSection.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import AuthStatus from "./components/AuthStatus.vue";
import LanguageDropdown from "./components/LanguageDropdown.vue";
import DropZone from "./components/DropZone.vue";
import ToastContainer from "./components/ToastContainer.vue";
import { useFileProcessor } from "./composables/useFileProcessor";
import { dirname } from "@tauri-apps/api/path";

const { locale, t } = useI18n();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const processingStore = useProcessingStore();
const { loadStoredTokens } = useAuth();
const { processFiles } = useFileProcessor();

async function handleFilesDropped(paths: string[]) {
  if (paths.length === 0) return;
  // Use the first file's directory as output dir, or the custom output directory
  const firstFileDir = await dirname(paths[0]);
  const outputDir = settingsStore.outputDirectory ?? firstFileDir;
  await processFiles(paths, outputDir);
}

// Load stored tokens on app start and set initial window title
onMounted(async () => {
  try {
    await loadStoredTokens();
  } catch {
    // No stored tokens or invalid tokens, user will need to sign in
  }

  // Set initial window title after Tauri is ready
  document.documentElement.lang = locale.value;
  document.documentElement.dir = locale.value === "ar" ? "rtl" : "ltr";
  await getCurrentWindow().setTitle(t("app.windowTitle"));
});

const isRtl = computed(() => locale.value === "ar");

// Update document direction and window title when locale changes
watch(locale, async (newLocale) => {
  document.documentElement.lang = newLocale;
  document.documentElement.dir = newLocale === "ar" ? "rtl" : "ltr";
  // Update window title based on locale
  await getCurrentWindow().setTitle(t("app.windowTitle"));
});
</script>

<template>
  <div
    class="h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-3 relative"
    :class="{ 'font-arabic': isRtl, 'font-english': !isRtl }"
  >
    <!-- Toast Notifications -->
    <ToastContainer />

    <!-- Drop Zone Overlay -->
    <DropZone @files-dropped="handleFilesDropped" />

    <!-- Main Card -->
    <div class="h-full bg-white rounded-2xl shadow-xl p-6 space-y-5 relative overflow-auto">
      <!-- Language Dropdown - inside card, top corner -->
      <div class="absolute top-3 z-10" :class="[isRtl ? 'left-3' : 'right-3']">
        <LanguageDropdown />
      </div>

      <!-- Header with top margin to avoid overlap with dropdown -->
      <HeaderSection class="mt-4" />

      <!-- Auth Status -->
      <AuthStatus />

      <!-- Convert Buttons -->
      <ConvertButtons :disabled="processingStore.isProcessing || !authStore.isAuthenticated" />

      <!-- Progress Section -->
      <ProgressSection v-if="processingStore.isProcessing || processingStore.lastCompleted" />

      <!-- Settings Panel -->
      <SettingsPanel />
    </div>
  </div>
</template>
