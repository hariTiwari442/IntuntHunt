"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_FEATURES, type PlanName } from "@/config/plans";

interface UpgradeBannerProps {
  requiredPlan: PlanName;
  message?: string;
}

export function UpgradeBanner({ requiredPlan, message }: UpgradeBannerProps) {
  const plan = PLAN_FEATURES[requiredPlan];

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent-soft p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white border border-accent/20 flex items-center justify-center mx-auto mb-4">
        <Zap className="w-6 h-6 text-accent" />
      </div>
      <h3 className="text-lg font-semibold mb-2">
        Upgrade to {plan.label}
      </h3>
      <p className="text-sm text-text-secondary mb-4 max-w-md mx-auto">
        {message || `This feature requires the ${plan.label} plan. Upgrade to unlock it and more.`}
      </p>
      <Link href="/pricing">
        <Button size="sm">
          Upgrade to {plan.label} — ${plan.price.monthly}/mo
        </Button>
      </Link>
    </div>
  );
}
