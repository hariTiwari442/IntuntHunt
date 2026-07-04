"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft, Check } from "lucide-react";
import { PLAN_FEATURES, type PlanName } from "@/config/plans";
import { useAuth } from "@/hooks/useAuth";
import { openCheckout } from "@/lib/dodo";

interface DisplayPlan {
  name:     PlanName;
  label:    string;
  monthly:  number;
  annual:   number;
  features: string[];
  popular:  boolean;
}

const DISPLAY_PLANS: DisplayPlan[] = [
  {
    name: "starter",
    label: "Starter",
    monthly: 0,
    annual: 0,
    features: ["1 product", "3 searches/month", "Reddit only", "50 conversations stored", "No AI replies"],
    popular: false,
  },
  {
    name: "pro",
    label: "Pro",
    monthly: 9,
    annual: 8.25,
    features: ["5 products", "20 searches/month", "Reddit + LinkedIn + Twitter", "1,000 conversations stored", "Unlimited AI-drafted replies"],
    popular: true,
  },
  {
    name: "agency",
    label: "Agency",
    monthly: 79,
    annual: 66,
    features: ["Unlimited products", "Unlimited searches", "All sources", "10,000 conversations stored", "Priority support"],
    popular: false,
  },
];

export default function PricingPage() {
  const [isAnnual, setIsAnnual]   = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<PlanName | null>(null);
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const handleSelectPlan = async (planName: PlanName) => {
    // Free Starter plan — just send to signup
    if (planName === "starter") {
      router.push("/auth/signup");
      return;
    }

    // Paid plan — must be logged in so the subscription attaches to their account
    if (!isAuthenticated) {
      router.push(`/auth/signup?plan=${planName}&billing=${isAnnual ? "annual" : "monthly"}`);
      return;
    }

    const dodoConfig = PLAN_FEATURES[planName].dodo;
    const productId  = isAnnual ? dodoConfig?.annual : dodoConfig?.monthly;

    if (!productId) {
      // Plan not yet configured in Dodo (e.g. Agency tier still being set up)
      alert(
        `${PLAN_FEATURES[planName].label} plan isn't ready yet. ` +
        `Please reach out and we'll set it up for you.`,
      );
      return;
    }

    try {
      setLoadingPlan(planName);
      // openCheckout will redirect the browser to Dodo's hosted checkout page.
      // We don't reach the finally block in the success case.
      await openCheckout({ productId });
    } catch (err) {
      console.error("[pricing] failed to open checkout", err);
      alert("Couldn't open checkout. Please try again or contact support.");
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border-default">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={20} />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-[#22d3ee] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold">LeadPulse</span>
          </div>
          <Link href={isAuthenticated ? "/dashboard" : "/auth/signup"}>
            <Button size="sm">{isAuthenticated ? "Dashboard" : "Get started"}</Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            Simple, transparent <span className="gradient-text">pricing</span>
          </h1>
          <p className="text-text-secondary">Start free, upgrade when you&apos;re ready.</p>

          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm ${!isAnnual ? "text-text-primary font-medium" : "text-text-secondary"}`}>Monthly</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative w-12 h-6 rounded-full transition-colors ${isAnnual ? "bg-accent" : "bg-bg-muted border border-border-default"}`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isAnnual ? "translate-x-7" : "translate-x-1"}`}
              />
            </button>
            <span className={`text-sm ${isAnnual ? "text-text-primary font-medium" : "text-text-secondary"}`}>
              Annual <span className="text-accent text-xs ml-1">Save ~8%</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {DISPLAY_PLANS.map((plan) => {
            const isLoading = loadingPlan === plan.name;
            const isFree    = plan.monthly === 0;

            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 ${
                  plan.popular
                    ? "bg-accent-soft border-2 border-accent md:-mt-4 md:pb-10 shadow-lg"
                    : "card"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-white text-xs font-bold">
                    POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.label}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold">
                    ${isAnnual ? plan.annual : plan.monthly}
                  </span>
                  {!isFree && <span className="text-text-secondary">/mo</span>}
                </div>

                <Button
                  className="w-full mb-6"
                  variant={plan.popular ? "primary" : "secondary"}
                  onClick={() => handleSelectPlan(plan.name)}
                  disabled={isLoading}
                >
                  {isLoading
                    ? "Opening checkout…"
                    : isFree
                      ? "Get started"
                      : "Start free trial"}
                </Button>

                <ul className="space-y-3 text-sm">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check size={16} className="text-accent shrink-0" />
                      <span className="text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-text-tertiary mt-10 max-w-md mx-auto">
          All paid plans include a 14-day free trial. No credit card required to start. Cancel anytime from your account settings.
        </p>
      </main>
    </div>
  );
}
