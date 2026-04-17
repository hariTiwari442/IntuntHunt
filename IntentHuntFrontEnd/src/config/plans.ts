export type PlanName = "starter" | "pro" | "agency";

export type Feature =
  | "suggested_replies"
  | "hackernews"
  | "unlimited_jobs"
  | "multi_product";

export interface PlanFeatures {
  name: PlanName;
  label: string;
  jobsPerMonth: number | null; // null = unlimited
  sources: string[];
  suggestedReplies: boolean;
  features: Feature[];
  price: { monthly: number; annual: number };
}

export const PLAN_FEATURES: Record<PlanName, PlanFeatures> = {
  starter: {
    name: "starter",
    label: "Starter",
    jobsPerMonth: 3,
    sources: ["reddit"],
    suggestedReplies: false,
    features: [],
    price: { monthly: 0, annual: 0 },
  },
  pro: {
    name: "pro",
    label: "Pro",
    jobsPerMonth: 20,
    sources: ["reddit", "hackernews"],
    suggestedReplies: true,
    features: ["suggested_replies", "hackernews"],
    price: { monthly: 29, annual: 24 },
  },
  agency: {
    name: "agency",
    label: "Agency",
    jobsPerMonth: null,
    sources: ["reddit", "hackernews"],
    suggestedReplies: true,
    features: ["suggested_replies", "hackernews", "unlimited_jobs", "multi_product"],
    price: { monthly: 79, annual: 66 },
  },
};

export const PLAN_ORDER: PlanName[] = ["starter", "pro", "agency"];
