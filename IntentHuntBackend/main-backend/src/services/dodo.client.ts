/**
 * Dodo Payments client.
 *
 * Dodo exposes a standard REST API; we use `fetch` directly rather than
 * an SDK so we stay version-locked to the actual HTTP contract.
 *
 * Webhooks are signed via the Standard Webhooks spec (Svix-compatible),
 * verified with the `standardwebhooks` package.
 *
 * Configured via env: DODO_API_KEY + DODO_WEBHOOK_SECRET + DODO_MODE.
 */

import { Webhook } from "standardwebhooks";
import { env } from "../config/env.js";

// Base URLs for Dodo's test vs live environments.
const DODO_BASE_URL =
  env.DODO_MODE === "live"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";

const wh = new Webhook(env.DODO_WEBHOOK_SECRET);

// ── Webhook verification ─────────────────────────────────────────
/**
 * Verify a Dodo webhook (Standard Webhooks / Svix format).
 * Throws if signature is invalid. Returns the parsed JSON event.
 *
 * Required headers (from request.headers):
 *   - webhook-id
 *   - webhook-timestamp
 *   - webhook-signature
 *
 * `rawBody` MUST be the exact raw bytes Dodo sent — not JSON.parse'd.
 */
export function verifyWebhook(
  rawBody: string,
  headers: {
    "webhook-id": string;
    "webhook-timestamp": string;
    "webhook-signature": string;
  },
): DodoWebhookEvent {
  // standardwebhooks verifies the signature and throws on mismatch.
  wh.verify(rawBody, headers);
  return JSON.parse(rawBody) as DodoWebhookEvent;
}

// ── Minimal Dodo API surface ─────────────────────────────────────
// We only call a small set of endpoints. Defining typed wrappers
// rather than scattering fetch calls through routes.

async function dodoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DODO_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.DODO_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dodo API ${res.status} on ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Create a subscription checkout. Returns a hosted-checkout `payment_link`
 * that we redirect the user to.
 *
 * `returnUrl` is where Dodo bounces the browser after payment completes.
 */
export async function createSubscriptionCheckout(opts: {
  productId: string;
  customerEmail: string;
  customerName?: string | undefined;
  returnUrl: string;
}): Promise<{ subscriptionId: string; paymentLink: string }> {
  const res = await dodoFetch<{
    subscription_id: string;
    payment_link: string;
  }>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      product_id: opts.productId,
      quantity: 1,
      payment_link: true, // ask Dodo for a hosted-checkout URL
      return_url: opts.returnUrl,
      customer: {
        // Dodo's CustomerRequest variant for a new customer requires BOTH
        // email and name. If the profile has no display name yet, fall back
        // to the email's local part so the request still validates.
        email: opts.customerEmail,
        name:  opts.customerName?.trim() || opts.customerEmail.split("@")[0] || "Customer",
      },
      // Dodo requires a billing address shell even for digital products;
      // it'll be collected/edited on the hosted checkout page.
      billing: {
        city: "",
        country: "US",
        state: "",
        street: "",
        zipcode: "",
      },
    }),
  });

  return { subscriptionId: res.subscription_id, paymentLink: res.payment_link };
}

/**
 * Generate a Dodo Customer Portal session URL. Used by /portal-session
 * so users can update payment method or cancel.
 */
export async function createCustomerPortalSession(
  customerId: string,
): Promise<string> {
  const res = await dodoFetch<{ link: string }>(
    `/customers/${customerId}/customer-portal/sessions`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.link;
}

// ── Type helpers ─────────────────────────────────────────────────

export interface DodoWebhookEvent {
  business_id: string;
  type: string; // e.g. "subscription.active"
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Resolve a Dodo product ID to our internal plan name.
 * Mirrors the product IDs in IntentHuntFrontEnd/src/config/plans.ts.
 *
 * Update both maps when adding plans (e.g. Agency).
 */
const PRODUCT_ID_TO_PLAN: Record<
  string,
  { plan: string; interval: "month" | "year" }
> = {
  pdt_0NgLzVbxB6s3dU7WyEDiX: { plan: "pro", interval: "month" },
  pdt_0NgLzf7chRWeIND4W7wlC: { plan: "pro", interval: "year" },
};

export function planFromProductId(
  productId: string,
): { plan: string; interval: "month" | "year" } | null {
  return PRODUCT_ID_TO_PLAN[productId] ?? null;
}

/**
 * Map Dodo subscription status string → our internal planStatus.
 * Dodo: "active" | "on_hold" | "cancelled" | "failed" | "expired" | "trialing" | "paused"
 */
export function mapDodoStatusToPlanStatus(dodoStatus: string): string {
  switch (dodoStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "on_hold":
      return "past_due";
    case "cancelled":
      return "canceled";
    case "canceled":
      return "canceled";
    case "paused":
      return "paused";
    case "failed":
      return "past_due";
    case "expired":
      return "canceled";
    default:
      return "incomplete";
  }
}
