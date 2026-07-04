"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { useSubscription, useOpenPortal, daysUntilTrialEnd } from "@/hooks/useSubscription";
import api from "@/lib/api";
import { User, Crown, Mail, Shield, ExternalLink, Loader2 } from "lucide-react";

export default function ProfilePage() {
  const { user, fetchProfile } = useAuth();
  const { features } = usePlan();
  const { data: subscription } = useSubscription();
  const openPortal = useOpenPortal();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/profile/me", { name: name.trim() || null });
      await fetchProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DashboardHeader title="Profile" subtitle="Manage your account settings" />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 max-w-6xl">
        {/* Main column — settings */}
        <div className="space-y-6 min-w-0">
          {/* Personal Info */}
          <Card className="!p-6">
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <User size={18} className="text-text-secondary" />
              Personal Info
            </h3>
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Mail size={14} className="text-text-secondary" />
                  Email
                </label>
                <Input value={user?.email || ""} disabled className="!opacity-50" />
                <p className="text-xs text-text-tertiary mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>

          {/* Security */}
          <Card className="!p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Shield size={18} className="text-text-secondary" />
              Security
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              Manage your password and account security.
            </p>
            <Button variant="secondary" size="sm">
              Change Password
            </Button>
          </Card>
        </div>

        {/* Sidebar column — plan + extras */}
        <div className="space-y-6 min-w-0">
          {/* Plan card — driven by live subscription state */}
          <Card className="!p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-accent-soft border border-accent/20 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2 truncate">
                  {features.label} Plan
                  <Badge variant="accent">{features.name}</Badge>
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {features.jobsPerMonth === null
                    ? "Unlimited products"
                    : `${features.jobsPerMonth} products/month`}
                </p>
              </div>
            </div>

            {/* Live status row */}
            {subscription && (
              <div className="mb-4 p-3 rounded-lg bg-bg-muted border border-border-default">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                    Status
                  </span>
                  <StatusPill status={subscription.planStatus} />
                </div>
                {subscription.planStatus === "trialing" && (
                  <p className="text-xs text-text-secondary">
                    {(() => {
                      const days = daysUntilTrialEnd(subscription);
                      if (days === null) return "Trial active";
                      if (days === 0)    return "Trial ends today";
                      return `${days} day${days === 1 ? "" : "s"} left in trial`;
                    })()}
                  </p>
                )}
                {subscription.planStatus === "active" && subscription.currentPeriodEnd && (
                  <p className="text-xs text-text-secondary">
                    {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
                {subscription.billingInterval && (
                  <p className="text-[11px] text-text-tertiary mt-1">
                    Billed {subscription.billingInterval === "year" ? "annually" : "monthly"}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 mb-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                Sources
              </div>
              <div className="flex flex-wrap gap-1.5">
                {features.sources.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-accent-soft text-accent"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA depends on whether they have an active subscription */}
            {subscription?.dodoSubscriptionId ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => openPortal.mutate()}
                disabled={openPortal.isPending}
              >
                {openPortal.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Opening portal…
                  </>
                ) : (
                  <>
                    Manage subscription
                    <ExternalLink size={13} />
                  </>
                )}
              </Button>
            ) : (
              <a href="/pricing" className="block">
                <Button variant="secondary" size="sm" className="w-full">
                  {features.name === "agency" ? "Manage Plan" : "Upgrade Plan"}
                </Button>
              </a>
            )}
          </Card>

          {/* Help / contact card */}
          <Card className="!p-6">
            <h3 className="font-semibold mb-2 text-sm">Need help?</h3>
            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              Questions about your plan, billing, or how LeadPulse works? Reach out — we usually reply within a few hours.
            </p>
            <a href="mailto:support@leadpulse.io">
              <Button variant="secondary" size="sm" className="w-full">
                Contact support
              </Button>
            </a>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:    "bg-green-100 text-green-700",
    trialing:  "bg-accent-soft text-accent",
    past_due:  "bg-red-100 text-red-700",
    canceled:  "bg-bg-muted text-text-tertiary",
    paused:    "bg-amber-100 text-amber-700",
    incomplete:"bg-bg-muted text-text-tertiary",
  };
  const label = status.replace("_", " ");
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${styles[status] ?? "bg-bg-muted text-text-tertiary"}`}>
      {label}
    </span>
  );
}
