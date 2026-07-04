"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore, type User } from "@/store/auth.store";
// Re-import for getState() inside refresh — useAuthStore() hook can't be
// called inside useCallback; getState() gives us the snapshot we need.

export function useAuth() {
  const router = useRouter();
  const { user, accessToken, isLoading, isAuthenticated, setAuth, setUser, setLoading, logout: storeLogout } = useAuthStore();

  const signup = useCallback(
    async (data: { email: string; password: string; name?: string }) => {
      const res = await api.post("/auth/signup", data);
      return res.data;
    },
    []
  );

  const login = useCallback(
    async (data: { email: string; password: string }) => {
      const res = await api.post("/auth/login", data);
      const { accessToken: token, refreshToken: rt, user: u } = res.data;
      setAuth(u, token, rt ?? null);
      router.push("/dashboard");
      return res.data;
    },
    [setAuth, router]
  );

  // Magic-link callback: the /auth/callback page picks up tokens out of
  // the URL hash that Supabase set, then hands them to the backend to
  // exchange for a real session. Persists to the auth store on success.
  const verifyMagicLink = useCallback(
    async (data: { accessToken: string; refreshToken: string }) => {
      const res = await api.post("/auth/magic-callback", data);
      const { accessToken, refreshToken, user } = res.data;
      setAuth(user, accessToken, refreshToken ?? null);
      return res.data;
    },
    [setAuth],
  );

  const resendVerification = useCallback(async (email: string) => {
    const res = await api.post("/auth/resend-verification", { email });
    return res.data;
  }, []);

  // Start a Google OAuth sign-in. Backend hands back the Supabase OAuth URL
  // we need to send the browser to; once Google + Supabase finish, the user
  // lands on /auth/callback?code=... which exchanges the code via
  // exchangeOAuthCode (below).
  const signInWithGoogle = useCallback(async () => {
    if (typeof window === "undefined") return;
    const redirectTo = `${window.location.origin}/auth/callback`;
    const res = await api.post("/auth/oauth", {
      provider: "google",
      redirectTo,
    });
    if (typeof res.data?.url === "string") {
      window.location.href = res.data.url;
    } else {
      throw new Error("OAuth URL missing from backend response");
    }
  }, []);

  // Called by /auth/callback when the URL contains an OAuth `code` query
  // parameter (Supabase PKCE flow). Returns the same shape /login returns.
  const exchangeOAuthCode = useCallback(
    async (code: string) => {
      const res = await api.post("/auth/oauth/callback", { code });
      const { accessToken, refreshToken, user } = res.data;
      setAuth(user, accessToken, refreshToken ?? null);
      return res.data;
    },
    [setAuth],
  );

  const forgotPassword = useCallback(async (email: string) => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data;
  }, []);

  const resetPassword = useCallback(
    async (data: { accessToken: string; newPassword: string }) => {
      const res = await api.post("/auth/reset-password", data);
      return res.data;
    },
    []
  );

  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      // Pass the persisted refresh token in body — the httpOnly cookie is
      // blocked by Chrome's third-party cookie policy for cross-site setups.
      const storedRt = useAuthStore.getState().refreshToken;
      const res = await api.post(
        "/auth/refresh",
        storedRt ? { refreshToken: storedRt } : {},
      );
      const { accessToken: token, refreshToken: rt, user: u } = res.data;
      setAuth(u, token, rt ?? null);
      return true;
    } catch {
      storeLogout();
      return false;
    }
  }, [setAuth, setLoading, storeLogout]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    storeLogout();
    router.push("/auth/login");
  }, [storeLogout, router]);

  const fetchProfile = useCallback(async () => {
    const res = await api.get("/profile/me");
    setUser(res.data as User);
    return res.data;
  }, [setUser]);

  return {
    user,
    accessToken,
    isLoading,
    isAuthenticated,
    signup,
    login,
    verifyMagicLink,
    resendVerification,
    signInWithGoogle,
    exchangeOAuthCode,
    forgotPassword,
    resetPassword,
    refreshSession,
    logout,
    fetchProfile,
  };
}
