/**
 * Plan enforcement — checks whether a user is allowed to perform
 * a billable action (e.g. create a product, run a search).
 *
 * Keep this server-side, NOT just in the UI — UI gating is bypassable.
 */

import { prisma } from '../db/prisma.client.js';

export interface PlanLimit {
  productsPerMonth: number | null;  // null = unlimited
  searchesPerMonth: number | null;
}

const PLAN_LIMITS: Record<string, PlanLimit> = {
  starter: { productsPerMonth: 1,  searchesPerMonth: 3   },
  pro:     { productsPerMonth: 20, searchesPerMonth: 100 },
  agency:  { productsPerMonth: null, searchesPerMonth: null },
};

export type PlanCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; limit: number; current: number; plan: string };

/**
 * Check whether the user can create another product this billing cycle.
 *
 * Treats `planStatus` as gating: only "active" and "trialing" can create
 * new products. "past_due" / "canceled" / "paused" can't.
 */
export async function canCreateProduct(userId: string): Promise<PlanCheckResult> {
  const profile = await prisma.profile.findUnique({
    where:  { id: userId },
    select: { plan: true, planStatus: true },
  });

  if (!profile) {
    return { allowed: false, reason: 'Profile not found', limit: 0, current: 0, plan: 'unknown' };
  }

  // Status gate: only active / trialing can create new products
  if (!['active', 'trialing'].includes(profile.planStatus)) {
    return {
      allowed: false,
      reason:  `Your subscription is ${profile.planStatus}. Please update your billing to continue.`,
      limit:   0,
      current: 0,
      plan:    profile.plan,
    };
  }

  const limits = PLAN_LIMITS[profile.plan] ?? PLAN_LIMITS.starter!;

  // Unlimited plan
  if (limits.productsPerMonth === null) return { allowed: true };

  // Count products created in the current calendar month (simple — could swap to
  // billing-period-based counting later)
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const count = await prisma.product.count({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
  });

  if (count >= limits.productsPerMonth) {
    return {
      allowed: false,
      reason:
        `You've hit your ${profile.plan} plan limit (${limits.productsPerMonth} products/month). ` +
        `Upgrade to add more.`,
      limit:   limits.productsPerMonth,
      current: count,
      plan:    profile.plan,
    };
  }

  return { allowed: true };
}
