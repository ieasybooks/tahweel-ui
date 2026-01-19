<script setup lang="ts">
import { computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "./stores/settings";
import { useAuthStore } from "./stores/auth";
import { useProcessingStore } from "./stores/processing";
import { useAuth } from "./composables/useAuth";

import HeaderSection from "./components/HeaderSection.vue";
import ConvertButtons from "./components/ConvertButtons.vue";
import ProgressSection from "./components/ProgressSection.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import AuthStatus from "./components/AuthStatus.vue";

const { locale } = useI18n();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const processingStore = useProcessingStore();
const { loadStoredTokens } = useAuth();

// Load stored tokens on app start
onMounted(async () => {
  try {
    await loadStoredTokens();
  } catch {
    // No stored tokens or invalid tokens, user will need to sign in
  }
});

const isRtl = computed(() => locale.value === "ar");

// Update document direction when locale changes
watch(
  locale,
  (newLocale) => {
    document.documentElement.lang = newLocale;
    document.documentElement.dir = newLocale === "ar" ? "rtl" : "ltr";
  },
  { immediate: true }
);

function toggleLanguage() {
  locale.value = locale.value === "ar" ? "en" : "ar";
}
</script>

<template>
  <div
    class="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6"
    :class="{ 'font-arabic': isRtl, 'font-english': !isRtl }"
  >
    <div class="max-w-2xl mx-auto">
      <!-- Main Card -->
      <div class="bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <!-- Header -->
        <HeaderSection />

        <!-- Auth Status -->
        <AuthStatus />

        <!-- Convert Buttons -->
        <ConvertButtons :disabled="processingStore.isProcessing || !authStore.isAuthenticated" />

        <!-- Progress Section -->
        <ProgressSection v-if="processingStore.isProcessing || processingStore.lastCompleted" />

        <!-- Settings Panel -->
        <SettingsPanel />

        <!-- Language Toggle -->
        <div class="pt-4 border-t border-gray-200">
          <button
            @click="toggleLanguage"
            class="w-full py-2 px-4 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {{ $t("buttons.language") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
