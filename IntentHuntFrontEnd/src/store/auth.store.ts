import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: "starter" | "pro" | "agency";
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  // Refresh token fallback for browsers that block third-party cookies
  // (Chrome blocks them by default — our cross-origin Netlify → Cloud Run
  // refresh cookie never reaches the backend, so we persist the token).
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken?: string | null) => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      // Start optimistic — `persist` rehydrates synchronously on the client;
      // a logged-in user shouldn't see a spinner on every page reload.
      isLoading: false,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set((s) => ({
          user,
          accessToken,
          // Only overwrite refreshToken when the caller explicitly provides one;
          // otherwise keep the existing one (e.g. when re-fetching profile).
          refreshToken: refreshToken !== undefined ? refreshToken : s.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        })),
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: "leadpulse-auth",
      storage: createJSONStorage(() => localStorage),
      // Only persist the bits we need to survive reload. Don't write
      // isLoading — it should always start false after rehydration.
      partialize: (state) => ({
        user:            state.user,
        accessToken:     state.accessToken,
        refreshToken:    state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
