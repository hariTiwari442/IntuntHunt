/**
 * Dodo Payments webhook event handlers.
 *
 * Each handler updates the matching Profile row based on the event.
 * All handlers are idempotent — safe to re-invoke with the same payload
 * (Dodo retries on any non-200 response).
 *
 * Event names follow Standard Webhooks convention: "subscription.active",
 * "subscription.renewed", "subscription.cancelled", etc.
 */

import { prisma } from '../db/prisma.client.js';
import { logger } from '../utils/logger.js';
import {
  mapDodoStatusToPlanStatus,
  planFromProductId,
  type DodoWebhookEvent,
} from './dodo.client.js';

// ── Payload shape (loosely typed — Dodo's shape, what we read out) ──
interface DodoSubscriptionPayload {
  subscription_id:        string;
  product_id?:            string;
  status?:                string;
  next_billing_date?:     string | null;   // ISO date
  previous_billing_date?: string | null;
  cancelled_at?:          string | null;
  cancel_at_next_billing_date?: boolean;
  trial_period_days?:     number;
  customer: {
    customer_id: string;
    email?:      string;
    name?:       string;
  };
}

// ── Profile lookup ──────────────────────────────────────────────────
async function findProfile(opts: { dodoCustomerId: string; email?: string }) {
  // Try by stored customer ID first
  let profile = await prisma.profile.findFirst({
    where: { dodoCustomerId: opts.dodoCustomerId },
  });
  if (profile) return profile;

  // Fall back to email — first checkout case, before customer ID is cached
  if (opts.email) {
    profile = await prisma.profile.findUnique({ where: { email: opts.email } });
    if (profile) {
      await prisma.profile.update({
        where: { id: profile.id },
        data:  { dodoCustomerId: opts.dodoCustomerId },
      });
      return profile;
    }
  }

  return null;
}

// ── Field extraction ────────────────────────────────────────────────
function extractFields(sub: DodoSubscriptionPayload) {
  const planInfo = sub.product_id ? planFromProductId(sub.product_id) : null;
  const status   = mapDodoStatusToPlanStatus(sub.status ?? 'incomplete');

  return {
    dodoSubscriptionId: sub.subscription_id,
    dodoCustomerId:     sub.customer.customer_id,
    plan:               planInfo?.plan     ?? null,
    billingInterval:    planInfo?.interval ?? null,
    planStatus:         status,
    trialEndsAt:
      status === 'trialing' && sub.next_billing_date
        ? new Date(sub.next_billing_date)
        : null,
    currentPeriodEnd:   sub.next_billing_date ? new Date(sub.next_billing_date) : null,
    cancelAtPeriodEnd:  !!sub.cancel_at_next_billing_date,
  };
}

// ── Event-specific handlers ─────────────────────────────────────────

async function handleSubscriptionActive(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({
    dodoCustomerId: payload.customer.customer_id,
    ...(payload.customer.email ? { email: payload.customer.email } : {}),
  });
  if (!profile) {
    logger.warn(
      { customerId: payload.customer.customer_id, subId: payload.subscription_id },
      '[dodo] subscription.active — no matching profile',
    );
    return;
  }

  const f = extractFields(payload);
  await prisma.profile.update({
    where: { id: profile.id },
    data:  {
      dodoCustomerId:     f.dodoCustomerId,
      dodoSubscriptionId: f.dodoSubscriptionId,
      ...(f.plan            ? { plan: f.plan }                      : {}),
      ...(f.billingInterval ? { billingInterval: f.billingInterval } : {}),
      planStatus:         f.planStatus,
      trialEndsAt:        f.trialEndsAt,
      currentPeriodEnd:   f.currentPeriodEnd,
      cancelAtPeriodEnd:  f.cancelAtPeriodEnd,
    },
  });
  logger.info(
    { userId: profile.id, plan: f.plan, status: f.planStatus },
    '[dodo] subscription.active',
  );
}

async function handleSubscriptionRenewed(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({ dodoCustomerId: payload.customer.customer_id });
  if (!profile) return;

  const f = extractFields(payload);
  await prisma.profile.update({
    where: { id: profile.id },
    data:  {
      planStatus:        'active',
      trialEndsAt:        null,
      currentPeriodEnd:  f.currentPeriodEnd,
      cancelAtPeriodEnd: f.cancelAtPeriodEnd,
    },
  });
  logger.info({ userId: profile.id }, '[dodo] subscription.renewed');
}

async function handleSubscriptionOnHold(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({ dodoCustomerId: payload.customer.customer_id });
  if (!profile) return;
  await prisma.profile.update({
    where: { id: profile.id },
    data:  { planStatus: 'past_due' },
  });
  logger.warn({ userId: profile.id }, '[dodo] subscription.on_hold');
}

async function handleSubscriptionFailed(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({ dodoCustomerId: payload.customer.customer_id });
  if (!profile) return;
  await prisma.profile.update({
    where: { id: profile.id },
    data:  { planStatus: 'past_due' },
  });
  logger.warn({ userId: profile.id }, '[dodo] subscription.failed');
}

async function handleSubscriptionCancelled(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({ dodoCustomerId: payload.customer.customer_id });
  if (!profile) return;

  // Dodo emits `cancelled` both for "scheduled cancellation" and "fully terminated".
  // Distinguish by current status: status === 'cancelled' = fully done.
  const fullyCanceled = (payload.status ?? '').toLowerCase().startsWith('cancel');

  await prisma.profile.update({
    where: { id: profile.id },
    data: fullyCanceled
      ? {
          plan:               'starter',
          planStatus:         'canceled',
          cancelAtPeriodEnd:  false,
          dodoSubscriptionId: null,
          currentPeriodEnd:   null,
          trialEndsAt:        null,
          billingInterval:    null,
        }
      : { cancelAtPeriodEnd: true },
  });
  logger.info({ userId: profile.id, fullyCanceled }, '[dodo] subscription.cancelled');
}

async function handleSubscriptionExpired(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({ dodoCustomerId: payload.customer.customer_id });
  if (!profile) return;
  await prisma.profile.update({
    where: { id: profile.id },
    data:  {
      plan:               'starter',
      planStatus:         'canceled',
      dodoSubscriptionId: null,
      currentPeriodEnd:   null,
      trialEndsAt:        null,
      billingInterval:    null,
    },
  });
  logger.info({ userId: profile.id }, '[dodo] subscription.expired');
}

async function handleSubscriptionPlanChanged(payload: DodoSubscriptionPayload) {
  const profile = await findProfile({ dodoCustomerId: payload.customer.customer_id });
  if (!profile) return;

  const f = extractFields(payload);
  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      ...(f.plan            ? { plan: f.plan }                      : {}),
      ...(f.billingInterval ? { billingInterval: f.billingInterval } : {}),
      planStatus:        f.planStatus,
      currentPeriodEnd:  f.currentPeriodEnd,
      cancelAtPeriodEnd: f.cancelAtPeriodEnd,
    },
  });
  logger.info({ userId: profile.id, plan: f.plan }, '[dodo] subscription.plan_changed');
}

// ── Master dispatcher ───────────────────────────────────────────────

export async function dispatchDodoEvent(event: DodoWebhookEvent): Promise<void> {
  // Subscription events all carry a DodoSubscriptionPayload-shaped `data`.
  const sub = event.data as unknown as DodoSubscriptionPayload;

  switch (event.type) {
    case 'subscription.active':
      return handleSubscriptionActive(sub);
    case 'subscription.renewed':
      return handleSubscriptionRenewed(sub);
    case 'subscription.on_hold':
      return handleSubscriptionOnHold(sub);
    case 'subscription.failed':
      return handleSubscriptionFailed(sub);
    case 'subscription.cancelled':
    case 'subscription.canceled':
      return handleSubscriptionCancelled(sub);
    case 'subscription.expired':
      return handleSubscriptionExpired(sub);
    case 'subscription.plan_changed':
      return handleSubscriptionPlanChanged(sub);
    case 'payment.succeeded':
    case 'payment.failed':
      // Receipt-level events; subscription events carry the state we care about.
      logger.debug({ eventType: event.type }, '[dodo] payment event (no profile mutation)');
      return;
    default:
      logger.debug({ eventType: event.type }, '[dodo] unhandled event type');
  }
}
