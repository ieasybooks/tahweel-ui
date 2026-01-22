<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";

const { locale, t } = useI18n();
const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const focusedIndex = ref(-1);

const languages = [
  { code: "ar" as const, label: "العربية" },
  { code: "en" as const, label: "English" },
];

const currentLanguage = computed(() => (locale.value === "ar" ? "AR" : "EN"));

function selectLanguage(lang: "ar" | "en") {
  locale.value = lang;
  localStorage.setItem("tahweel-locale", lang);
  isOpen.value = false;
  focusedIndex.value = -1;
}

async function toggleDropdown() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    focusedIndex.value = languages.findIndex((l) => l.code === locale.value);
    await nextTick();
    focusCurrentItem();
  }
}

function closeDropdown() {
  isOpen.value = false;
  focusedIndex.value = -1;
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      toggleDropdown();
    }
    return;
  }

  switch (event.key) {
    case "Escape":
      event.preventDefault();
      closeDropdown();
      break;
    case "ArrowDown":
      event.preventDefault();
      focusedIndex.value = (focusedIndex.value + 1) % languages.length;
      focusCurrentItem();
      break;
    case "ArrowUp":
      event.preventDefault();
      focusedIndex.value = (focusedIndex.value - 1 + languages.length) % languages.length;
      focusCurrentItem();
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      if (focusedIndex.value >= 0) {
        selectLanguage(languages[focusedIndex.value].code);
      }
      break;
    case "Tab":
      closeDropdown();
      break;
  }
}

function focusCurrentItem() {
  const items = menuRef.value?.querySelectorAll('[role="menuitemradio"]');
  if (items && focusedIndex.value >= 0) {
    (items[focusedIndex.value] as HTMLElement)?.focus();
  }
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown();
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
      @keydown="handleKeydown"
      class="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      :aria-label="t('buttons.languageSelector')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Menu -->
    <div
      v-show="isOpen"
      ref="menuRef"
      role="menu"
      :aria-label="t('buttons.languageSelector')"
      class="absolute top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden z-50"
      :class="[$i18n.locale === 'ar' ? 'left-0' : 'right-0']"
    >
      <button
        v-for="(lang, index) in languages"
        :key="lang.code"
        @click="selectLanguage(lang.code)"
        @keydown="handleKeydown"
        role="menuitemradio"
        :aria-checked="locale === lang.code"
        :tabindex="focusedIndex === index ? 0 : -1"
        class="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-start flex items-center gap-2 focus:outline-none focus:bg-gray-100"
        :class="{ 'bg-green-50 text-green-700': locale === lang.code }"
      >
        <span class="w-5 text-center" aria-hidden="true">{{ locale === lang.code ? "✓" : "" }}</span>
        <span>{{ lang.label }}</span>
      </button>
    </div>
  </div>
</template>
