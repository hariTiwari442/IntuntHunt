"use client";

import Link from "next/link";
import { Zap, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutCanceledPage() {
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
          <div className="w-20 h-20 rounded-3xl bg-bg-muted border border-border-default flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-text-tertiary" strokeWidth={2.5} />
          </div>

          <h1 className="text-3xl font-bold mb-3">Checkout canceled</h1>
          <p className="text-text-secondary mb-8 leading-relaxed">
            No worries — no charges were made. You can pick up where you left off any time.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/pricing" className="flex-1">
              <Button size="lg" className="w-full">
                Back to pricing
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/" className="flex-1">
              <Button size="lg" variant="secondary" className="w-full">
                Back to home
              </Button>
            </Link>
          </div>

          <p className="text-xs text-text-tertiary mt-6">
            Something not working? Contact support and we&apos;ll help you out.
          </p>
        </div>
      </main>
    </div>
  );
}
