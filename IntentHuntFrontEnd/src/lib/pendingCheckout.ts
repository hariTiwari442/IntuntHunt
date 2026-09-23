/**
 * Remembers which plan someone picked, across the signup journey.
 *
 * Same problem as pendingScan: signup isn't one page transition. It goes
 * through "check your email" and a magic link the user clicks from their mail
 * client — which opens a NEW TAB. sessionStorage is scoped per tab, so an
 * intent stored before the email is gone by the time they come back, and the
 * user lands on the dashboard wondering why they were never asked to pay.
 * localStorage survives that; hence this mirrors pendingScan deliberately.
 *
 * Unlike a pending scan, a stale intent here has teeth: resuming it redirects
 * the browser to a payment page. Someone who signed up last week and never
 * paid should not be thrown at Dodo the next time they log in. So the intent
 * carries a timestamp and expires.
 *
 * Every accessor is guarded — storage throws in private mode and on blocked
 * site data, and losing a checkout intent must never break signup itself.
 */

const KEY = "pendingCheckout";

/** Long enough to read an email and click the link; short enough to not surprise. */
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface PendingCheckout {
  plan:    string;
  billing: string;
}

export function setPendingCheckout(intent: PendingCheckout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...intent, at: Date.now() }));
  } catch {
    // Not fatal — they just pick the plan again from /pricing.
  }
}

export function getPendingCheckout(): PendingCheckout | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingCheckout> & { at?: number };
    if (!parsed.plan || !parsed.billing) return null;
    // No timestamp means it was written by the old sessionStorage version;
    // treat it as expired rather than guessing how old it is.
    if (typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return { plan: parsed.plan, billing: parsed.billing };
  } catch {
    return null;
  }
}

export function clearPendingCheckout(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
