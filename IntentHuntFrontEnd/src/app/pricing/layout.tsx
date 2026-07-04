import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for LeadPulse. Start free, then scale to Pro from $9/mo for Reddit, LinkedIn & Twitter coverage with AI-drafted replies. Cancel anytime.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing · LeadPulse",
    description:
      "Start free, then scale to Pro from $9/mo. Reddit, LinkedIn & Twitter coverage with AI-drafted replies. Cancel anytime.",
    url: "/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
