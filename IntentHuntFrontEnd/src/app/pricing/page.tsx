"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft, Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: 0,
    annual: 0,
    features: ["1 product", "3 crawls/month", "Reddit only", "50 posts stored", "No AI replies"],
    popular: false,
  },
  {
    name: "Pro",
    price: 29,
    annual: 24,
    features: ["5 products", "20 crawls/month", "Reddit + LinkedIn + Twitter", "1,000 posts stored", "Unlimited AI replies"],
    popular: true,
  },
  {
    name: "Agency",
    price: 79,
    annual: 66,
    features: ["Unlimited products", "Unlimited crawls", "All sources", "10,000 posts stored", "Unlimited AI replies"],
    popular: false,
  },
];

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(true);

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
          <Link href="/auth/signup">
            <Button size="sm">Get started</Button>
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
              Annual <span className="text-accent text-xs ml-1">Save 17%</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
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
              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-bold">
                  ${isAnnual ? plan.annual : plan.price}
                </span>
                {plan.price > 0 && <span className="text-text-secondary">/mo</span>}
              </div>
              <Link href="/auth/signup">
                <Button
                  className="w-full mb-6"
                  variant={plan.popular ? "primary" : "secondary"}
                >
                  {plan.price === 0 ? "Get started" : "Start free trial"}
                </Button>
              </Link>
              <ul className="space-y-3 text-sm">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check size={16} className="text-accent shrink-0" />
                    <span className="text-text-secondary">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
