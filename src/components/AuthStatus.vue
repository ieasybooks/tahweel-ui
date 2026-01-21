<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import { useAuth } from "@/composables/useAuth";

const { t } = useI18n();
const authStore = useAuthStore();
const { signIn, signOut } = useAuth();
</script>

<template>
  <div class="bg-gray-50 rounded-xl p-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-3 h-3 rounded-full"
          :class="authStore.isAuthenticated ? 'bg-green-500' : 'bg-gray-400'"
        ></div>
        <span class="text-sm text-gray-700">
          <template v-if="authStore.isAuthenticated">
            {{ t("auth.signedIn") }}
          </template>
          <template v-else>
            {{ t("auth.notSignedIn") }}
          </template>
        </span>
      </div>
      <button
        v-if="authStore.isAuthenticated"
        @click="signOut"
        class="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
      >
        {{ t("buttons.signOut") }}
      </button>
      <button
        v-else
        @click="signIn"
        :disabled="authStore.isAuthenticating"
        class="text-sm text-green-600 hover:text-green-700 font-medium transition-colors disabled:opacity-50"
      >
        <span v-if="authStore.isAuthenticating">...</span>
        <span v-else>{{ t("buttons.signIn") }}</span>
      </button>
    </div>
  </div>
</template>
