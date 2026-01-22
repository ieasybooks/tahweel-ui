import { describe, it, expect, vi, beforeEach } from "vitest"
import { setActivePinia, createPinia } from "pinia"

// Mock Tauri API before importing useAuth
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

import { useAuth } from "../useAuth"
import { useAuthStore } from "@/stores/auth"
import { invoke } from "@tauri-apps/api/core"

describe("useAuth", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe("signIn", () => {
    it("starts OAuth flow and sets tokens on success", async () => {
      const mockTokens = {
        access_token: "test_access",
        refresh_token: "test_refresh",
        expires_in: 3600,
      }

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "start_oauth_flow") return mockTokens
        if (cmd === "get_user_info") return { email: "test@example.com" }
        return null
      })

      const { signIn } = useAuth()
      const store = useAuthStore()

      await signIn()

      expect(invoke).toHaveBeenCalledWith("start_oauth_flow")
      expect(store.accessToken).toBe("test_access")
      expect(store.refreshToken).toBe("test_refresh")
      expect(store.userEmail).toBe("test@example.com")
    })

    it("does not start OAuth if already authenticating", async () => {
      const store = useAuthStore()
      store.setAuthenticating(true)

      const { signIn } = useAuth()
      await signIn()

      expect(invoke).not.toHaveBeenCalled()
    })

    it("sets authenticating flag during OAuth flow", async () => {
      const mockTokens = {
        access_token: "test",
        refresh_token: "test",
        expires_in: 3600,
      }

      let authenticatingDuringFlow = false
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "start_oauth_flow") {
          const store = useAuthStore()
          authenticatingDuringFlow = store.isAuthenticating
          return mockTokens
        }
        return { email: null }
      })

      const { signIn } = useAuth()
      await signIn()

      expect(authenticatingDuringFlow).toBe(true)
      expect(useAuthStore().isAuthenticating).toBe(false)
    })

    it("throws error and resets authenticating flag on OAuth failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("OAuth failed"))

      const { signIn } = useAuth()
      const store = useAuthStore()

      await expect(signIn()).rejects.toThrow("OAuth failed")
      expect(store.isAuthenticating).toBe(false)
    })

    it("continues even if getUserInfo fails", async () => {
      const mockTokens = {
        access_token: "test",
        refresh_token: "test",
        expires_in: 3600,
      }

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "start_oauth_flow") return mockTokens
        if (cmd === "get_user_info") throw new Error("User info failed")
        return null
      })

      const { signIn } = useAuth()
      const store = useAuthStore()

      await signIn()

      expect(store.accessToken).toBe("test")
      expect(store.userEmail).toBeNull()
    })
  })

  describe("signOut", () => {
    it("clears tokens via invoke and store", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      const store = useAuthStore()
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      })

      const { signOut } = useAuth()
      await signOut()

      expect(invoke).toHaveBeenCalledWith("clear_auth_tokens")
      expect(store.accessToken).toBeNull()
    })

    it("clears store even if invoke fails", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Clear failed"))

      const store = useAuthStore()
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      })

      const { signOut } = useAuth()
      await signOut()

      expect(store.accessToken).toBeNull()
    })
  })

  describe("refreshTokens", () => {
    it("returns false when no refresh token", async () => {
      const { refreshTokens } = useAuth()
      const result = await refreshTokens()

      expect(result).toBe(false)
      expect(invoke).not.toHaveBeenCalled()
    })

    it("refreshes tokens successfully", async () => {
      const store = useAuthStore()
      store.setTokens({
        accessToken: "old_access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 1000,
      })

      const mockNewTokens = {
        access_token: "new_access",
        refresh_token: "new_refresh",
        expires_in: 3600,
      }

      vi.mocked(invoke).mockResolvedValue(mockNewTokens)

      const { refreshTokens } = useAuth()
      const result = await refreshTokens()

      expect(result).toBe(true)
      expect(invoke).toHaveBeenCalledWith("refresh_access_token", {
        refreshToken: "refresh",
      })
      expect(store.accessToken).toBe("new_access")
      expect(store.refreshToken).toBe("new_refresh")
    })

    it("keeps old refresh token if new one not provided", async () => {
      const store = useAuthStore()
      store.setTokens({
        accessToken: "old_access",
        refreshToken: "original_refresh",
        expiresAt: Date.now() + 1000,
      })

      const mockNewTokens = {
        access_token: "new_access",
        refresh_token: null,
        expires_in: 3600,
      }

      vi.mocked(invoke).mockResolvedValue(mockNewTokens)

      const { refreshTokens } = useAuth()
      await refreshTokens()

      expect(store.refreshToken).toBe("original_refresh")
    })

    it("clears auth and returns false on refresh failure", async () => {
      const store = useAuthStore()
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 1000,
      })

      vi.mocked(invoke).mockRejectedValue(new Error("Refresh failed"))

      const { refreshTokens } = useAuth()
      const result = await refreshTokens()

      expect(result).toBe(false)
      expect(store.accessToken).toBeNull()
    })
  })

  describe("ensureValidToken", () => {
    it("returns null when not authenticated and no refresh token", async () => {
      const { ensureValidToken } = useAuth()
      const result = await ensureValidToken()

      expect(result).toBeNull()
    })

    it("returns access token when authenticated and not needs refresh", async () => {
      const store = useAuthStore()
      store.setTokens({
        accessToken: "valid_token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000, // 1 hour
      })

      const { ensureValidToken } = useAuth()
      const result = await ensureValidToken()

      expect(result).toBe("valid_token")
      expect(invoke).not.toHaveBeenCalled()
    })

    it("refreshes token when needs refresh", async () => {
      const store = useAuthStore()
      store.setTokens({
        accessToken: "old_token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes (needs refresh)
      })

      vi.mocked(invoke).mockResolvedValue({
        access_token: "new_token",
        refresh_token: "new_refresh",
        expires_in: 3600,
      })

      const { ensureValidToken } = useAuth()
      const result = await ensureValidToken()

      expect(result).toBe("new_token")
    })

    it("returns null when refresh fails", async () => {
      const store = useAuthStore()
      store.setTokens({
        accessToken: "old_token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 2 * 60 * 1000, // needs refresh
      })

      vi.mocked(invoke).mockRejectedValue(new Error("Refresh failed"))

      const { ensureValidToken } = useAuth()
      const result = await ensureValidToken()

      expect(result).toBeNull()
    })
  })

  describe("loadStoredTokens", () => {
    it("does nothing when no stored tokens", async () => {
      vi.mocked(invoke).mockResolvedValue(null)

      const { loadStoredTokens } = useAuth()
      await loadStoredTokens()

      const store = useAuthStore()
      expect(store.accessToken).toBeNull()
    })

    it("loads stored tokens and gets user info", async () => {
      const mockTokens = {
        access_token: "stored_access",
        refresh_token: "stored_refresh",
        expires_in: 3600,
      }

      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "load_stored_tokens") return mockTokens
        if (cmd === "get_user_info") return { email: "stored@example.com" }
        return null
      })

      const { loadStoredTokens } = useAuth()
      await loadStoredTokens()

      const store = useAuthStore()
      expect(store.accessToken).toBe("stored_access")
      expect(store.userEmail).toBe("stored@example.com")
    })

    it("attempts refresh when getUserInfo fails", async () => {
      const mockTokens = {
        access_token: "stored_access",
        refresh_token: "stored_refresh",
        expires_in: 3600,
      }

      const refreshedTokens = {
        access_token: "refreshed_access",
        refresh_token: "refreshed_refresh",
        expires_in: 3600,
      }

      let refreshCalled = false
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "load_stored_tokens") return mockTokens
        if (cmd === "get_user_info") throw new Error("Token expired")
        if (cmd === "refresh_access_token") {
          refreshCalled = true
          return refreshedTokens
        }
        return null
      })

      const { loadStoredTokens } = useAuth()
      await loadStoredTokens()

      expect(refreshCalled).toBe(true)
    })

    it("handles load_stored_tokens error gracefully", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("No stored tokens"))

      const { loadStoredTokens } = useAuth()
      await loadStoredTokens()

      const store = useAuthStore()
      expect(store.accessToken).toBeNull()
    })
  })
})
