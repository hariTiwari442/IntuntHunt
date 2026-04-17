"use client";

import { useMemo } from "react";
import { useAuthStore } from "@/store/auth.store";
import { PLAN_FEATURES, PLAN_ORDER, type Feature, type PlanName, type PlanFeatures } from "@/config/plans";

export function usePlan() {
  const user = useAuthStore((s) => s.user);
  const planName: PlanName = user?.plan ?? "starter";

  return useMemo(() => {
    const features: PlanFeatures = PLAN_FEATURES[planName];
    const planIndex = PLAN_ORDER.indexOf(planName);

    const can = (feature: Feature): boolean => features.features.includes(feature);

    const isAtLeast = (min: PlanName): boolean => {
      return PLAN_ORDER.indexOf(planName) >= PLAN_ORDER.indexOf(min);
    };

    return {
      plan: planName,
      features,
      can,
      isAtLeast,
      isStarter: planName === "starter",
      isPro: planName === "pro",
      isAgency: planName === "agency",
      planIndex,
    };
  }, [planName]);
}
