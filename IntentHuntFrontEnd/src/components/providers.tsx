"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { ToastProvider } from "@/components/ui/toast";
import api from "@/lib/api";

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setLoading = useAuthStore((s) => s.setLoading);
  const logout = useAuthStore((s) => s.logout);
  // If zustand-persist already rehydrated a refreshToken from localStorage,
  // pass it through in the body. The httpOnly cookie won't reach the backend
  // across Netlify -> Cloud Run because Chrome blocks third-party cookies.
  const persistedRefreshToken = useAuthStore((s) => s.refreshToken);
  const persistedIsAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    async function tryRefresh() {
      // No refresh token AND no prior auth state — user is genuinely logged
      // out, no point in hitting /refresh (it'll just 400 with VALIDATION_ERROR
      // and unset state we never set).
      if (!persistedRefreshToken && !persistedIsAuthenticated) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.post(
          "/auth/refresh",
          persistedRefreshToken ? { refreshToken: persistedRefreshToken } : {},
        );
        const { accessToken, refreshToken: newRt, user } = res.data;
        setAuth(user, accessToken, newRt ?? null);
      } catch {
        logout();
      }
    }
    tryRefresh();
  }, [setAuth, setLoading, logout, persistedRefreshToken, persistedIsAuthenticated]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthInitializer>{children}</AuthInitializer>
      </ToastProvider>
    </QueryClientProvider>
  );
}
