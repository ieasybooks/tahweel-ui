import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "@/stores/auth";

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function useAuth() {
  const authStore = useAuthStore();

  async function signIn() {
    if (authStore.isAuthenticating) return;

    authStore.setAuthenticating(true);
    try {
      // Start the OAuth flow via Rust backend
      const tokens = await invoke<AuthTokens>("start_oauth_flow");

      authStore.setTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });

      // Try to get user info
      try {
        const userInfo = await getUserInfo(tokens.access_token);
        if (userInfo.email) {
          authStore.setUserEmail(userInfo.email);
        }
      } catch {
        // User info is optional
      }
    } catch (error) {
      console.error("OAuth flow failed:", error);
      throw error;
    } finally {
      authStore.setAuthenticating(false);
    }
  }

  async function signOut() {
    try {
      await invoke("clear_auth_tokens");
    } catch {
      // Ignore errors
    }
    authStore.clearAuth();
  }

  async function refreshTokens(): Promise<boolean> {
    if (!authStore.refreshToken) return false;

    try {
      const tokens = await invoke<AuthTokens>("refresh_access_token", {
        refreshToken: authStore.refreshToken,
      });

      authStore.setTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || authStore.refreshToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });

      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      authStore.clearAuth();
      return false;
    }
  }

  async function ensureValidToken(): Promise<string | null> {
    if (!authStore.isAuthenticated && !authStore.refreshToken) {
      return null;
    }

    if (authStore.needsRefresh) {
      const success = await refreshTokens();
      if (!success) return null;
    }

    return authStore.accessToken;
  }

  async function loadStoredTokens() {
    try {
      const tokens = await invoke<AuthTokens | null>("load_stored_tokens");
      if (tokens) {
        authStore.setTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        });

        // Try to get user info
        try {
          const userInfo = await getUserInfo(tokens.access_token);
          if (userInfo.email) {
            authStore.setUserEmail(userInfo.email);
          }
        } catch {
          // Token might be expired, try to refresh
          await refreshTokens();
        }
      }
    } catch {
      // No stored tokens
    }
  }

  async function getUserInfo(accessToken: string): Promise<{ email?: string }> {
    const response = await invoke<{ email?: string }>("get_user_info", {
      accessToken,
    });
    return response;
  }

  return {
    signIn,
    signOut,
    refreshTokens,
    ensureValidToken,
    loadStoredTokens,
  };
}
