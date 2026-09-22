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
  /** How many leads the user can actually see per product. null = all. */
  visibleLeads:     number | null;
  /**
   * Platforms whose leads are SHOWN — not the ones we search.
   *
   * Every plan searches all three. A free user's LinkedIn and X leads are
   * found, scored and stored; they're just withheld, and the UI reports how
   * many are waiting. Hiding real results they can see the count of converts
   * far better than never looking, and it means an upgrade reveals value
   * instantly instead of requiring a fresh scan.
   */
  visibleSources:   readonly ('reddit' | 'linkedin' | 'twitter')[];
  /** Whether AI-drafted replies are generated (a gpt-4o call per lead). */
  suggestedReplies: boolean;
}

/**
 * The single source of truth for what each plan may do.
 *
 * The frontend has its own copy in config/plans.ts for *display*, but nothing
 * there is binding — the API is reachable directly, so every limit that costs
 * money or gates value has to be checked here.
 *
 * Free deliberately allows one search: the trial scan a visitor runs from the
 * homepage before signing up IS that search. Wanting a second one is the
 * upgrade moment.
 */
const PLAN_LIMITS: Record<string, PlanLimit> = {
  starter: {
    productsPerMonth: 1,
    searchesPerMonth: 1,
    visibleLeads:     3,
    visibleSources:   ['reddit'],
    suggestedReplies: false,
  },
  pro: {
    productsPerMonth: 10,
    searchesPerMonth: 30,
    visibleLeads:     null,
    visibleSources:   ['reddit', 'linkedin', 'twitter'],
    suggestedReplies: true,
  },
  agency: {
    productsPerMonth: null,
    searchesPerMonth: null,
    visibleLeads:     null,
    visibleSources:   ['reddit', 'linkedin', 'twitter'],
    suggestedReplies: true,
  },
};

export function limitsForPlan(plan: string): PlanLimit {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter!;
}

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

/**
 * Check whether the user can run another lead search this month.
 *
 * This is the check that protects spend: every search costs Serper queries,
 * ScrapeCreators credits and OpenAI calls. It was defined in the limits table
 * from the start but never actually called anywhere, so a free account could
 * run searches indefinitely.
 */
export async function canRunSearch(userId: string): Promise<PlanCheckResult> {
  const profile = await prisma.profile.findUnique({
    where:  { id: userId },
    select: { plan: true, planStatus: true },
  });

  if (!profile) {
    return { allowed: false, reason: 'Profile not found', limit: 0, current: 0, plan: 'unknown' };
  }

  if (!['active', 'trialing'].includes(profile.planStatus)) {
    return {
      allowed: false,
      reason:  `Your subscription is ${profile.planStatus}. Please update your billing to continue.`,
      limit:   0,
      current: 0,
      plan:    profile.plan,
    };
  }

  const limits = limitsForPlan(profile.plan);
  if (limits.searchesPerMonth === null) return { allowed: true };

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const count = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM search_runs
    WHERE user_id = ${userId}::uuid
      AND started_at >= ${startOfMonth}
  `;
  const used = Number(count[0]?.count ?? 0);

  if (used >= limits.searchesPerMonth) {
    return {
      allowed: false,
      reason:
        `You've used all ${limits.searchesPerMonth} ${limits.searchesPerMonth === 1 ? 'scan' : 'scans'} ` +
        `on your ${profile.plan} plan this month. Upgrade to keep searching.`,
      limit:   limits.searchesPerMonth,
      current: used,
      plan:    profile.plan,
    };
  }

  return { allowed: true };
}

/** Plan-derived view limits, for shaping what the API returns. */
export async function planViewLimits(userId: string): Promise<{
  plan: string;
  visibleLeads: number | null;
  visibleSources: readonly string[];
  suggestedReplies: boolean;
}> {
  const profile = await prisma.profile.findUnique({
    where:  { id: userId },
    select: { plan: true },
  });
  const plan = profile?.plan ?? 'starter';
  const l = limitsForPlan(plan);
  return {
    plan,
    visibleLeads:     l.visibleLeads,
    visibleSources:   l.visibleSources,
    suggestedReplies: l.suggestedReplies,
  };
}
