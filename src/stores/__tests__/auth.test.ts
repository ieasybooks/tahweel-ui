import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "../auth";

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("initial state", () => {
    it("starts with null tokens", () => {
      const store = useAuthStore();
      expect(store.accessToken).toBeNull();
      expect(store.refreshToken).toBeNull();
      expect(store.expiresAt).toBeNull();
      expect(store.userEmail).toBeNull();
    });

    it("starts not authenticating", () => {
      const store = useAuthStore();
      expect(store.isAuthenticating).toBe(false);
    });

    it("starts not authenticated", () => {
      const store = useAuthStore();
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe("setTokens", () => {
    it("sets all token fields", () => {
      const store = useAuthStore();
      const tokens = {
        accessToken: "access123",
        refreshToken: "refresh456",
        expiresAt: Date.now() + 3600000,
      };

      store.setTokens(tokens);

      expect(store.accessToken).toBe("access123");
      expect(store.refreshToken).toBe("refresh456");
      expect(store.expiresAt).toBe(tokens.expiresAt);
    });
  });

  describe("isAuthenticated", () => {
    it("returns false when no access token", () => {
      const store = useAuthStore();
      expect(store.isAuthenticated).toBe(false);
    });

    it("returns true with valid token and future expiry", () => {
      const store = useAuthStore();
      store.setTokens({
        accessToken: "valid",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000, // 1 hour from now
      });
      expect(store.isAuthenticated).toBe(true);
    });

    it("returns false when token is expired", () => {
      const store = useAuthStore();
      store.setTokens({
        accessToken: "expired",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000, // 1 second ago
      });
      expect(store.isAuthenticated).toBe(false);
    });

    it("returns false when expiresAt is null even if token exists", () => {
      const store = useAuthStore();
      store.accessToken = "token";
      store.expiresAt = null;
      // Must have valid expiresAt to be considered authenticated
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe("needsRefresh", () => {
    it("returns false when no refresh token", () => {
      const store = useAuthStore();
      expect(store.needsRefresh).toBe(false);
    });

    it("returns false when no expiresAt", () => {
      const store = useAuthStore();
      store.refreshToken = "refresh";
      expect(store.needsRefresh).toBe(false);
    });

    it("returns false when token expires in more than 5 minutes", () => {
      const store = useAuthStore();
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      });
      expect(store.needsRefresh).toBe(false);
    });

    it("returns true when token expires in less than 5 minutes", () => {
      const store = useAuthStore();
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3 * 60 * 1000, // 3 minutes
      });
      expect(store.needsRefresh).toBe(true);
    });

    it("returns true when token is already expired", () => {
      const store = useAuthStore();
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000,
      });
      expect(store.needsRefresh).toBe(true);
    });
  });

  describe("setUserEmail", () => {
    it("sets user email", () => {
      const store = useAuthStore();
      store.setUserEmail("test@example.com");
      expect(store.userEmail).toBe("test@example.com");
    });
  });

  describe("clearAuth", () => {
    it("clears all auth state", () => {
      const store = useAuthStore();
      store.setTokens({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      });
      store.setUserEmail("test@example.com");

      store.clearAuth();

      expect(store.accessToken).toBeNull();
      expect(store.refreshToken).toBeNull();
      expect(store.expiresAt).toBeNull();
      expect(store.userEmail).toBeNull();
    });
  });

  describe("setAuthenticating", () => {
    it("sets authenticating flag to true", () => {
      const store = useAuthStore();
      store.setAuthenticating(true);
      expect(store.isAuthenticating).toBe(true);
    });

    it("sets authenticating flag to false", () => {
      const store = useAuthStore();
      store.setAuthenticating(true);
      store.setAuthenticating(false);
      expect(store.isAuthenticating).toBe(false);
    });
  });
});
