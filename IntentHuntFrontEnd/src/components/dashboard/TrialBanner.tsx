"use client";

import Link from "next/link";
import { Sparkles, AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useSubscription, daysUntilTrialEnd } from "@/hooks/useSubscription";

/**
 * Top-of-dashboard banner that adapts to subscription state.
 *
 * Shows:
 *   - Trialing → "X days left in your trial · Add payment to keep going"
 *   - Past due → "Payment failed — update billing to keep your account active"
 *   - Canceled (but still in current period) → "Subscription canceled · Access ends [date]"
 *   - Active/Starter → nothing
 *
 * Dismissible per browser session via sessionStorage.
 */
export function TrialBanner() {
  const { data: sub } = useSubscription();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("trial-banner-dismissed") === "1";
  });

  if (!sub || dismissed) return null;

  // ── Trialing ───────────────────────────────────────────
  if (sub.planStatus === "trialing") {
    const days = daysUntilTrialEnd(sub);
    const urgent = days !== null && days <= 3;
    return (
      <Banner
        icon={Sparkles}
        tone={urgent ? "warn" : "accent"}
        message={
          days === 0
            ? "Your trial ends today. Add payment to keep your account active."
            : days === 1
              ? "1 day left in your trial. Add payment to keep going."
              : `${days} days left in your trial.`
        }
        action={{ href: "/pricing", label: urgent ? "Add payment" : "Manage plan" }}
        onDismiss={() => {
          sessionStorage.setItem("trial-banner-dismissed", "1");
          setDismissed(true);
        }}
      />
    );
  }

  // ── Past due ──────────────────────────────────────────
  if (sub.planStatus === "past_due") {
    return (
      <Banner
        icon={AlertTriangle}
        tone="error"
        message="Your last payment failed. Update billing info to keep your account active."
        action={{ href: "/dashboard/profile", label: "Update billing" }}
        onDismiss={() => {
          sessionStorage.setItem("trial-banner-dismissed", "1");
          setDismissed(true);
        }}
      />
    );
  }

  // ── Canceled but still in period ──────────────────────
  if (sub.planStatus === "canceled" && sub.currentPeriodEnd) {
    const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString();
    return (
      <Banner
        icon={AlertTriangle}
        tone="warn"
        message={`Subscription canceled. You'll keep access until ${endDate}.`}
        action={{ href: "/pricing", label: "Resubscribe" }}
        onDismiss={() => {
          sessionStorage.setItem("trial-banner-dismissed", "1");
          setDismissed(true);
        }}
      />
    );
  }

  // ── Scheduled to cancel at period end ─────────────────
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString();
    return (
      <Banner
        icon={AlertTriangle}
        tone="warn"
        message={`Your subscription is scheduled to cancel on ${endDate}.`}
        action={{ href: "/dashboard/profile", label: "Reactivate" }}
        onDismiss={() => {
          sessionStorage.setItem("trial-banner-dismissed", "1");
          setDismissed(true);
        }}
      />
    );
  }

  return null;
}

interface BannerProps {
  icon:    React.ComponentType<{ size?: number; className?: string }>;
  tone:    "accent" | "warn" | "error";
  message: string;
  action:  { href: string; label: string };
  onDismiss: () => void;
}

function Banner({ icon: Icon, tone, message, action, onDismiss }: BannerProps) {
  const styles = {
    accent: "bg-accent-soft border-accent/30 text-accent",
    warn:   "bg-amber-50 border-amber-200 text-amber-800",
    error:  "bg-red-50 border-red-200 text-red-800",
  }[tone];

  return (
    <div className={`mb-6 p-4 rounded-2xl border ${styles} flex items-center justify-between gap-4`}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon size={18} className="shrink-0" />
        <p className="text-sm font-medium truncate">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={action.href}
          className="text-sm font-semibold underline-offset-4 hover:underline"
        >
          {action.label} →
        </Link>
        <button
          onClick={onDismiss}
          className="p-1 hover:opacity-70 transition-opacity"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
