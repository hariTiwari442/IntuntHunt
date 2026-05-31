"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import api from "@/lib/api";
import { User, Crown, Mail, Shield } from "lucide-react";

export default function ProfilePage() {
  const { user, fetchProfile } = useAuth();
  const { features } = usePlan();
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
          {/* Plan card */}
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

            <a href="/pricing" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                {features.name === "agency" ? "Manage Plan" : "Upgrade Plan"}
              </Button>
            </a>
          </Card>

          {/* Help / contact card */}
          <Card className="!p-6">
            <h3 className="font-semibold mb-2 text-sm">Need help?</h3>
            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              Questions about your plan, billing, or how LeadPulse works? Reach out — we usually reply within a few hours.
            </p>
            <a href="mailto:hi@leadpulse.io">
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
