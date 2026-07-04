"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Post-checkout landing.
 *
 * Webhooks usually arrive within 2-10 seconds, but the redirect can fire
 * immediately. We poll /billing/subscription until we see the new plan,
 * then auto-redirect to the dashboard.
 *
 * Fallback: after 30s, redirect anyway so the user isn't stuck.
 */
export default function CheckoutSuccessPage() {
  const router = useRouter();
  const { data: subscription, refetch } = useSubscription();
  const [secondsWaited, setSecondsWaited] = useState(0);

  // Poll every 2s
  useEffect(() => {
    const t = setInterval(() => {
      refetch();
      setSecondsWaited((s) => s + 2);
    }, 2_000);
    return () => clearInterval(t);
  }, [refetch]);

  // Detect that the subscription is now active/trialing on a paid plan
  const isOnPaidPlan =
    subscription &&
    subscription.plan !== "starter" &&
    ["active", "trialing"].includes(subscription.planStatus);

  // Once we see the subscription update, redirect after a short delay
  useEffect(() => {
    if (isOnPaidPlan) {
      const t = setTimeout(() => router.push("/dashboard"), 2000);
      return () => clearTimeout(t);
    }
  }, [isOnPaidPlan, router]);

  // Fallback: hard timeout at 30s
  useEffect(() => {
    if (secondsWaited >= 30) router.push("/dashboard");
  }, [secondsWaited, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative z-10 border-b border-border-default">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-[#22d3ee] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">LeadPulse</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {isOnPaidPlan ? (
            <>
              <div className="w-20 h-20 rounded-3xl bg-accent-soft border border-accent/30 flex items-center justify-center mx-auto mb-6 shadow-[0_20px_50px_-15px_rgba(22,163,74,0.3)]">
                <CheckCircle2 className="w-10 h-10 text-accent" strokeWidth={2.5} />
              </div>
              <h1 className="text-3xl font-bold mb-3">You&apos;re in!</h1>
              <p className="text-text-secondary mb-8 leading-relaxed">
                Your <strong>{subscription.plan}</strong> subscription is active.
                {subscription.planStatus === "trialing" && " You won't be charged until your trial ends."}
              </p>
              <Link href="/dashboard">
                <Button size="lg" className="w-full">
                  Go to dashboard
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <p className="text-xs text-text-tertiary mt-6">
                Redirecting automatically in a moment. A receipt has been sent to your email.
              </p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-3xl bg-bg-muted border border-border-default flex items-center justify-center mx-auto mb-6">
                <Loader2 className="w-10 h-10 text-text-secondary animate-spin" strokeWidth={2.5} />
              </div>
              <h1 className="text-2xl font-bold mb-3">Activating your account…</h1>
              <p className="text-text-secondary mb-8 leading-relaxed">
                Payment received. We&apos;re activating your subscription — this usually
                takes a few seconds.
              </p>
              {secondsWaited >= 15 && (
                <p className="text-xs text-text-tertiary">
                  Taking longer than usual? Your account will be set up shortly. You can
                  also go to the dashboard now and refresh.
                </p>
              )}
              <Link href="/dashboard" className="inline-block mt-4">
                <Button variant="secondary" size="sm">
                  Go to dashboard anyway
                </Button>
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
