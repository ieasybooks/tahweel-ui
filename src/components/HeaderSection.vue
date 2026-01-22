<script setup lang="ts">
import { useI18n } from "vue-i18n";
import logoImage from "@/assets/logo.png";

const { t } = useI18n();
</script>

<template>
  <header class="text-center space-y-2">
    <div class="flex justify-center mb-4">
      <img :src="logoImage" :alt="t('app.logoAlt')" class="w-16 h-16 rounded-2xl shadow-lg" />
    </div>
    <h1 class="text-2xl font-bold text-gray-800">{{ t("app.title") }}</h1>
    <p class="text-gray-600">{{ t("app.subtitle") }}</p>
    <p class="text-sm text-gray-500">{{ t("app.note") }}</p>
  </header>
</template>
