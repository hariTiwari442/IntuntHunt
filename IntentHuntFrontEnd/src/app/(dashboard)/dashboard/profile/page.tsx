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

      <div className="max-w-2xl space-y-6">
        {/* Plan Card */}
        <Card className="!p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Crown className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  {features.label} Plan
                  <Badge variant="accent">{features.name}</Badge>
                </h3>
                <p className="text-sm text-white/40 mt-0.5">
                  {features.jobsPerMonth === null
                    ? "Unlimited jobs"
                    : `${features.jobsPerMonth} jobs/month`}{" "}
                  &middot; {features.sources.join(", ")}
                </p>
              </div>
            </div>
            <a href="/pricing">
              <Button variant="secondary" size="sm">
                {features.name === "agency" ? "Manage" : "Upgrade"}
              </Button>
            </a>
          </div>
        </Card>

        {/* Profile Form */}
        <Card className="!p-6">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <User size={18} className="text-white/40" />
            Personal Info
          </h3>
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Mail size={14} className="text-white/40" />
                Email
              </label>
              <Input value={user?.email || ""} disabled className="!opacity-50" />
              <p className="text-xs text-white/30 mt-1">Email cannot be changed</p>
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
            <Shield size={18} className="text-white/40" />
            Security
          </h3>
          <p className="text-sm text-white/50 mb-4">
            Manage your password and account security.
          </p>
          <Button variant="secondary" size="sm">
            Change Password
          </Button>
        </Card>
      </div>
    </>
  );
}
