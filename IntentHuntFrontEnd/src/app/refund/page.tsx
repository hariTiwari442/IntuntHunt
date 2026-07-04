import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Our refund policy for LeadPulse subscriptions.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative z-10 border-b border-border-default">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-[#22d3ee] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">LeadPulse</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Refund Policy</h1>
          <p className="text-sm text-text-tertiary">Last updated: June 1, 2026</p>
        </div>

        <div className="space-y-8">
          <Section title="1. Free Trial">
            All paid LeadPulse plans (Pro, Agency) include a 14-day free trial. No credit card is required at signup. If you don&apos;t add payment by the end of your trial, your account automatically downgrades to the free Starter plan — you&apos;re never charged unexpectedly.
          </Section>

          <Section title="2. Money-Back Guarantee (First 14 Days)">
            If you&apos;re not satisfied with LeadPulse within <strong>14 days of your first paid charge</strong>, we&apos;ll refund the full amount you paid for that billing period — no questions asked.
            <br /><br />
            To request a refund, email <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a> from the account address you used to sign up, and mention &ldquo;Refund request&rdquo; in the subject line.
          </Section>

          <Section title="3. After the First 14 Days">
            All fees paid after the 14-day money-back window are <strong>non-refundable</strong>. If you cancel an active subscription:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>You keep full access until the end of your current billing period</li>
              <li>You will not be charged for the next period</li>
              <li>No partial refunds are issued for unused time within the current period</li>
            </ul>
          </Section>

          <Section title="4. Annual Plans">
            If you&apos;re on an annual plan and request a refund within the first 14 days of payment, we&apos;ll refund the full amount. After 14 days, annual plans are non-refundable.
            <br /><br />
            You can still cancel an annual plan anytime to prevent renewal — you&apos;ll retain access until the end of the prepaid year.
          </Section>

          <Section title="5. Exceptions">
            We may issue refunds outside the standard policy at our discretion, for example:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Duplicate or accidental charges</li>
              <li>Service outages that materially affected your usage</li>
              <li>Billing errors on our end</li>
            </ul>
            If you believe one of these applies to you, email <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a>.
          </Section>

          <Section title="6. How Refunds Are Issued">
            Approved refunds are returned to your original payment method (card or bank transfer) and typically appear within <strong>5–10 business days</strong>, depending on your bank or card issuer.
            <br /><br />
            We don&apos;t issue refunds as account credit unless you specifically request that.
          </Section>

          <Section title="7. Cancellation vs. Refund">
            These are two different things:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Cancellation</strong> stops future renewals. Do this anytime from your account settings.</li>
              <li><strong>Refund</strong> returns money already charged. Only applies within the 14-day window or under the exceptions above.</li>
            </ul>
          </Section>

          <Section title="8. Contact">
            Questions about a refund or this policy? Email <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a> and we&apos;ll get back to you within 1–2 business days.
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-default py-8 mt-16">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-text-tertiary">&copy; 2026 LeadPulse</p>
          <div className="flex items-center gap-6 text-xs text-text-tertiary">
            <Link href="/pricing" className="hover:text-text-primary transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-text-primary transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-text-primary transition-colors">Privacy</Link>
            <a href="mailto:support@leadpulse.io" className="hover:text-text-primary transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-text-primary mb-3">{title}</h2>
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}
