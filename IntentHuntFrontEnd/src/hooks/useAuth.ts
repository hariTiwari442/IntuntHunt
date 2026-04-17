"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore, type User } from "@/store/auth.store";

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
      const { accessToken: token, user: u } = res.data;
      setAuth(u, token);
      router.push("/dashboard");
      return res.data;
    },
    [setAuth, router]
  );

  const verifyEmail = useCallback(
    async (data: { email: string; token: string }) => {
      const res = await api.post("/auth/verify-email", data);
      return res.data;
    },
    []
  );

  const resendOtp = useCallback(async (email: string) => {
    const res = await api.post("/auth/resend-otp", { email });
    return res.data;
  }, []);

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
      const res = await api.post("/auth/refresh");
      const { accessToken: token, user: u } = res.data;
      setAuth(u, token);
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
    verifyEmail,
    resendOtp,
    forgotPassword,
    resetPassword,
    refreshSession,
    logout,
    fetchProfile,
  };
}
