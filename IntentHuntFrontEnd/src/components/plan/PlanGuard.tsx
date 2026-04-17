"use client";

import { type ReactNode } from "react";
import { usePlan } from "@/hooks/usePlan";
import { type PlanName } from "@/config/plans";
import { UpgradeBanner } from "./UpgradeBanner";

interface PlanGuardProps {
  minimumPlan: PlanName;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PlanGuard({ minimumPlan, children, fallback }: PlanGuardProps) {
  const { isAtLeast } = usePlan();

  if (!isAtLeast(minimumPlan)) {
    return fallback ?? <UpgradeBanner requiredPlan={minimumPlan} />;
  }

  return <>{children}</>;
}
