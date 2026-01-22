import { defineStore } from "pinia"
import { ref, computed } from "vue"

export interface TokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export const useAuthStore = defineStore("auth", () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const expiresAt = ref<number | null>(null)
  const userEmail = ref<string | null>(null)
  const isAuthenticating = ref(false)

  const isAuthenticated = computed(() => {
    if (!accessToken.value || !expiresAt.value) return false
    return Date.now() < expiresAt.value
  })

  const needsRefresh = computed(() => {
    if (!refreshToken.value) return false
    if (!expiresAt.value) return false
    // Refresh if token expires in less than 5 minutes
    return Date.now() >= expiresAt.value - 5 * 60 * 1000
  })

  function setTokens(tokens: TokenData) {
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    expiresAt.value = tokens.expiresAt
  }

  function setUserEmail(email: string) {
    userEmail.value = email
  }

  function clearAuth() {
    accessToken.value = null
    refreshToken.value = null
    expiresAt.value = null
    userEmail.value = null
  }

  function setAuthenticating(value: boolean) {
    isAuthenticating.value = value
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    userEmail,
    isAuthenticating,
    isAuthenticated,
    needsRefresh,
    setTokens,
    setUserEmail,
    clearAuth,
    setAuthenticating,
  }
})
