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

  useEffect(() => {
    async function tryRefresh() {
      try {
        const res = await api.post("/auth/refresh");
        const { accessToken, user } = res.data;
        setAuth(user, accessToken);
      } catch {
        logout();
      }
    }
    tryRefresh();
  }, [setAuth, setLoading, logout]);

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
