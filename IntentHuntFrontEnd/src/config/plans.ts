export type PlanName = "starter" | "pro" | "agency";

export type Feature =
  | "suggested_replies"
  | "linkedin"
  | "twitter"
  | "unlimited_products"
  | "multi_product";

export interface PlanFeatures {
  name: PlanName;
  label: string;
  productsPerMonth: number | null; // null = unlimited; legacy field name was jobsPerMonth
  jobsPerMonth:     number | null; // alias kept for backwards-compat with existing UI
  sources: string[];
  suggestedReplies: boolean;
  features: Feature[];
  price: { monthly: number; annual: number };
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
    price: { monthly: 29, annual: 24 },
  },
  agency: {
    name: "agency",
    label: "Agency",
    productsPerMonth: null,
    jobsPerMonth:     null,
    sources: ["Reddit", "LinkedIn", "Twitter"],
    suggestedReplies: true,
    features: ["suggested_replies", "linkedin", "twitter", "unlimited_products", "multi_product"],
    price: { monthly: 79, annual: 66 },
  },
};

export const PLAN_ORDER: PlanName[] = ["starter", "pro", "agency"];
