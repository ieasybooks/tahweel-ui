<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { open } from "@tauri-apps/plugin-shell";

const { locale, t } = useI18n();
const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const currentLanguage = computed(() => (locale.value === "ar" ? "AR" : "EN"));

function selectLanguage(lang: "ar" | "en") {
  locale.value = lang;
  isOpen.value = false;
}

async function openIEasyBooks() {
  await open("https://ieasybooks.com");
  isOpen.value = false;
}

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => document.addEventListener("click", handleClickOutside));
onUnmounted(() => document.removeEventListener("click", handleClickOutside));
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Globe Button -->
    <button
      @click="toggleDropdown"
      class="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 shadow-sm transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
      <span>{{ currentLanguage }}</span>
      <svg
        class="w-3 h-3 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Menu -->
    <div
      v-show="isOpen"
      class="absolute top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden z-50"
      :class="[$i18n.locale === 'ar' ? 'left-0' : 'right-0']"
    >
      <button
        @click="selectLanguage('en')"
        class="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-start flex items-center gap-2"
        :class="{ 'bg-green-50 text-green-700': locale === 'en' }"
      >
        <span class="w-5 text-center">{{ locale === "en" ? "✓" : "" }}</span>
        <span>English</span>
      </button>
      <button
        @click="selectLanguage('ar')"
        class="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-start flex items-center gap-2"
        :class="{ 'bg-green-50 text-green-700': locale === 'ar' }"
      >
        <span class="w-5 text-center">{{ locale === "ar" ? "✓" : "" }}</span>
        <span>العربية</span>
      </button>
      <div class="border-t border-gray-200"></div>
      <button
        @click="openIEasyBooks"
        class="w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 text-start flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        <span>iEasyBooks</span>
      </button>
    </div>
  </div>
</template>
