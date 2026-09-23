"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { openCheckout } from "@/lib/dodo";
import { PLAN_FEATURES, type PlanName } from "@/config/plans";
import { getPendingCheckout, clearPendingCheckout } from "@/lib/pendingCheckout";

/**
 * Resumes a pending checkout intent after signup → verify → login.
 *
 * Flow:
 *   1. User on /pricing clicks Upgrade while logged out
 *   2. They're sent to /auth/signup?plan=pro&billing=annual
 *   3. Signup page stores { plan, billing } via lib/pendingCheckout
 *   4. User verifies email + logs in
 *   5. /auth/callback lands them here — this component reads the intent
 *      back and redirects them to the Dodo hosted-checkout page
 *
 * Step 3 uses localStorage, NOT sessionStorage. The verification link is
 * clicked from a mail client, which opens a new tab; sessionStorage is
 * per-tab, so the intent was always gone by step 5 and the user silently
 * landed on the dashboard never having been asked to pay.
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

    const intent = getPendingCheckout();
    if (!intent) return;

    clearPendingCheckout();
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
