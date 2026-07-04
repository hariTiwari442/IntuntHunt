export type PlanName = "starter" | "pro" | "agency";

export type Feature =
  | "suggested_replies"
  | "linkedin"
  | "twitter"
  | "unlimited_products"
  | "multi_product";

export interface DodoProductIds {
  monthly: string | null;  // Dodo product ID for monthly billing
  annual:  string | null;  // Dodo product ID for annual billing
}

export interface PlanFeatures {
  name: PlanName;
  label: string;
  productsPerMonth: number | null; // null = unlimited; legacy field name was jobsPerMonth
  jobsPerMonth:     number | null; // alias kept for backwards-compat with existing UI
  sources: string[];
  suggestedReplies: boolean;
  features: Feature[];
  price: { monthly: number; annual: number };
  dodo?: DodoProductIds;           // Dodo Payments product IDs (null for free plans / tiers not yet created)
}

export const PLAN_FEATURES: Record<PlanName, PlanFeatures> = {
  starter: {
    name: "starter",
    label: "Starter",
    productsPerMonth: 3,
    jobsPerMonth:     3,
    sources: ["Reddit"],
    suggestedReplies: false,
    features: [],
    price: { monthly: 0, annual: 0 },
  },
  pro: {
    name: "pro",
    label: "Pro",
    productsPerMonth: 20,
    jobsPerMonth:     20,
    sources: ["Reddit", "LinkedIn", "Twitter"],
    suggestedReplies: true,
    features: ["suggested_replies", "linkedin", "twitter"],
    // Actual Dodo prices: $9/mo, $99/year (~$8.25/mo when billed annually)
    price: { monthly: 9, annual: 8.25 },
    dodo: {
      // TODO: paste your two Dodo product IDs (look like `pdt_xxxxxxxx`).
      // Keep these in sync with the PRODUCT_ID_TO_PLAN map in
      // main-backend/src/services/dodo.client.ts.
      monthly: process.env.NEXT_PUBLIC_DODO_PRO_MONTHLY_ID ?? null,
      annual:  process.env.NEXT_PUBLIC_DODO_PRO_ANNUAL_ID  ?? null,
    },
  },
  agency: {
    name: "agency",
    label: "Agency",
    productsPerMonth: null,
    jobsPerMonth:     null,
    sources: ["Reddit", "LinkedIn", "Twitter"],
    suggestedReplies: true,
    features: ["suggested_replies", "linkedin", "twitter", "unlimited_products", "multi_product"],
    price: { monthly: 79, annual: 66 },  // placeholder — no Dodo product IDs yet
    dodo: {
      monthly: null,  // TODO: add Dodo product ID when Agency tier is created
      annual:  null,
    },
  },
};

export const PLAN_ORDER: PlanName[] = ["starter", "pro", "agency"];
