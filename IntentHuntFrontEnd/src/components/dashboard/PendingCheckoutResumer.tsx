"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { openCheckout } from "@/lib/dodo";
import { PLAN_FEATURES, type PlanName } from "@/config/plans";

/**
 * Resumes a pending checkout intent after signup → verify → login.
 *
 * Flow:
 *   1. User on /pricing clicks "Start free trial" while logged out
 *   2. They're sent to /auth/signup?plan=pro&billing=annual
 *   3. Signup page stores { plan, billing } in sessionStorage
 *   4. User verifies email + logs in
 *   5. They land in the dashboard — this component reads sessionStorage
 *      and redirects them to the Dodo hosted-checkout page
 *
 * Renders nothing visually.
 */
export function PendingCheckoutResumer() {
  const { isAuthenticated } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    if (!isAuthenticated) return;
    if (typeof window === "undefined") return;

    const raw = sessionStorage.getItem("pendingCheckout");
    if (!raw) return;

    let intent: { plan?: string; billing?: string };
    try {
      intent = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem("pendingCheckout");
      return;
    }

    sessionStorage.removeItem("pendingCheckout");
    handledRef.current = true;

    const planName = intent.plan as PlanName | undefined;
    const billing  = intent.billing === "annual" ? "annual" : "monthly";

    if (!planName || !["pro", "agency"].includes(planName)) return;

    const dodoConfig = PLAN_FEATURES[planName].dodo;
    const productId  = billing === "annual" ? dodoConfig?.annual : dodoConfig?.monthly;
    if (!productId) return;

    // Slight delay so the dashboard mounts first, then we redirect off.
    setTimeout(() => {
      openCheckout({ productId }).catch((err) => {
        console.error("[checkout-resume] failed to start Dodo checkout", err);
      });
    }, 600);
  }, [isAuthenticated]);

  return null;
}
