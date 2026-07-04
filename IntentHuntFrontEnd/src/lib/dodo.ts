"use client";

/**
 * Dodo Payments checkout helper.
 *
 * Flow:
 *   1. Caller invokes openCheckout({ productId })
 *   2. We POST to our backend /api/v1/billing/checkout — it creates a Dodo
 *      subscription session and returns a hosted-checkout URL
 *   3. We redirect the current window to that URL
 *   4. After payment, Dodo redirects back to the `return_url` configured
 *      on the backend (currently `/dashboard?upgraded=1`)
 *
 * No browser-side SDK / token needed — all card collection happens on
 * Dodo's hosted checkout page.
 */

import api from "@/lib/api";

export async function openCheckout(opts: {
  productId: string;
}): Promise<void> {
  const res = await api.post("/billing/checkout", { productId: opts.productId });
  const url = res?.data?.url;
  if (typeof url !== "string" || !url) {
    throw new Error("Backend did not return a checkout URL");
  }
  window.location.href = url;
}
