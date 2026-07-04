"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";

export type PlanName    = "starter" | "pro" | "agency";
export type PlanStatus  = "active" | "trialing" | "past_due" | "canceled" | "paused" | "incomplete";
export type BillingInterval = "month" | "year" | null;

export interface Subscription {
  plan:               PlanName;
  planStatus:         PlanStatus;
  billingInterval:    BillingInterval;
  trialEndsAt:        string | null;
  currentPeriodEnd:   string | null;
  cancelAtPeriodEnd:  boolean;
  dodoSubscriptionId: string | null;
}

/**
 * Current user's subscription state.
 * Polls every 15s while a trial is active (to catch trial-end transitions),
 * otherwise refetches on window focus only.
 */
export function useSubscription() {
  return useQuery<Subscription>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await api.get("/billing/subscription");
      return res.data.subscription as Subscription;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.planStatus;
      // Poll faster when we expect state to change soon
      if (status === "trialing" || status === "incomplete" || status === "past_due") {
        return 15_000;
      }
      return false;
    },
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/**
 * Open the Dodo Customer Portal in a new tab.
 * Used in Profile page to let users manage / cancel their subscription.
 */
export function useOpenPortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post("/billing/portal-session");
      return res.data.url as string;
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
    },
  });
}

// ── Derived helpers (use inside components) ────────────────────────

export function daysUntilTrialEnd(sub: Subscription | undefined): number | null {
  if (!sub?.trialEndsAt) return null;
  const ms = new Date(sub.trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isOnPaidPlan(sub: Subscription | undefined): boolean {
  if (!sub) return false;
  return sub.plan !== "starter" && ["active", "trialing"].includes(sub.planStatus);
}
