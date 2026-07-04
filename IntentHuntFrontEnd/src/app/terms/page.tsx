import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The legal terms that govern your use of LeadPulse.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
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
          <h1 className="text-4xl font-bold mb-3">Terms of Service</h1>
          <p className="text-sm text-text-tertiary">Last updated: June 1, 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-text-secondary leading-relaxed">
          <Section title="1. Acceptance of Terms">
            By creating an account or using LeadPulse (the &ldquo;Service&rdquo;), you agree to these Terms of Service. If you don&apos;t agree, don&apos;t use the Service. These terms form a binding agreement between you and LeadPulse (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          </Section>

          <Section title="2. What LeadPulse Does">
            LeadPulse is a conversation-discovery tool. It uses Google&apos;s public search index to find publicly visible posts on Reddit, LinkedIn, and Twitter that are relevant to your product&apos;s topic area, scores them by intent and relevance, and generates AI-drafted comment reply suggestions.
            <br /><br />
            <strong>You always review and post comments manually.</strong> LeadPulse never sends, posts, DMs, or transmits any message on your behalf. It does not have or request your Reddit, LinkedIn, or Twitter credentials, and it cannot access private messages or content behind authentication.
            <br /><br />
            <strong>What LeadPulse is NOT:</strong> we are not a cold-outreach tool, a CRM, an auto-poster, or a scraping service. We surface publicly visible posts and offer drafted suggestions; what you do with them is your responsibility.
          </Section>

          <Section title="3. Your Account">
            You must be 18+ to use LeadPulse. You&apos;re responsible for the security of your account credentials and for everything that happens under your account. Notify us immediately at <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a> if you suspect unauthorized access.
          </Section>

          <Section title="4. Subscription, Billing &amp; Cancellation">
            <strong>Plans:</strong> We offer Starter (free), Pro, and Agency tiers. Pricing details are at <Link href="/pricing" className="text-accent hover:underline">/pricing</Link>.
            <br /><br />
            <strong>Free trial:</strong> Pro and Agency plans include a 14-day free trial. No credit card required at signup. After 14 days, you&apos;ll be prompted to add payment to continue; otherwise your account auto-downgrades to Starter.
            <br /><br />
            <strong>Billing:</strong> Paid plans bill monthly or annually in advance. All fees are non-refundable except as required by law.
            <br /><br />
            <strong>Cancellation:</strong> You can cancel anytime from your account settings. Cancellation takes effect at the end of your current billing period — you keep access until then.
            <br /><br />
            <strong>Refunds:</strong> We offer a pro-rated refund within 14 days of your first paid charge if you&apos;re not satisfied. After that, all fees are non-refundable. Contact <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a> to request.
          </Section>

          <Section title="5. Acceptable Use">
            You agree NOT to use LeadPulse to:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Send spam, harass, threaten, or harm anyone</li>
              <li>Conduct unsolicited cold-outreach campaigns at scale</li>
              <li>Violate the Terms of Service or community guidelines of Reddit, LinkedIn, Twitter, or any other platform</li>
              <li>Misrepresent your identity, affiliation, or intent in any comments you post</li>
              <li>Post comments that are promotional, deceptive, or that disclose undisclosed material connections</li>
              <li>Scrape or redistribute LeadPulse data without written permission</li>
              <li>Reverse-engineer, decompile, or attempt to extract our source code or AI prompts</li>
              <li>Use the Service for any illegal purpose</li>
            </ul>
            We reserve the right to suspend or terminate accounts that violate these rules. <strong>You are solely responsible for any comment you post and for complying with the rules of the platform you post it on.</strong>
          </Section>

          <Section title="6. Intellectual Property">
            LeadPulse, including all software, AI models, prompts, designs, and content (excluding your own data), is owned by us or our licensors. You retain ownership of the product descriptions and configurations you provide. You grant us a limited license to use them solely to provide the Service.
            <br /><br />
            AI-generated replies are yours to use, but you&apos;re responsible for ensuring they comply with the receiving platform&apos;s rules.
          </Section>

          <Section title="7. Third-Party Services">
            LeadPulse integrates with third-party services to provide its functionality, including:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Google Search (via Serper.dev) — for surfacing public posts</li>
              <li>OpenAI — for AI-generated replies and intent scoring</li>
              <li>Supabase — for database and authentication</li>
              <li>Stripe (or alternative payment processor) — for billing</li>
            </ul>
            Your use of LeadPulse is also subject to these third parties&apos; terms. We&apos;re not responsible for their availability or actions.
          </Section>

          <Section title="8. Disclaimers">
            LeadPulse is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied. We don&apos;t guarantee:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Any specific number of leads, replies, or conversions</li>
              <li>Uninterrupted or error-free service</li>
              <li>The accuracy of AI-generated content or intent scores</li>
              <li>That posts will remain available on third-party platforms</li>
            </ul>
            You use the Service at your own risk and judgment.
          </Section>

          <Section title="9. Limitation of Liability">
            To the maximum extent permitted by law, LeadPulse and its team will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenue, data, or business opportunities.
            <br /><br />
            Our total liability for any claim related to the Service is limited to the amount you paid us in the 12 months before the claim, or $100, whichever is greater.
          </Section>

          <Section title="10. Termination">
            We may suspend or terminate your account if you violate these Terms or if continuing to provide the Service to you would expose us to legal risk. You may terminate your account at any time from settings.
            <br /><br />
            On termination, your access ends immediately. We&apos;ll retain your data for 30 days in case you want to reactivate or export it, then permanently delete it.
          </Section>

          <Section title="11. Changes to These Terms">
            We may update these Terms occasionally. If changes are material, we&apos;ll notify you by email or in-app at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.
          </Section>

          <Section title="12. Governing Law">
            These Terms are governed by the laws of India. Any disputes will be resolved in the courts located in your jurisdiction of registration, except where prohibited by local consumer protection laws.
          </Section>

          <Section title="13. Contact">
            Questions about these Terms? Email <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a>.
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-default py-8 mt-16">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-text-tertiary">&copy; 2026 LeadPulse</p>
          <div className="flex items-center gap-6 text-xs text-text-tertiary">
            <Link href="/pricing" className="hover:text-text-primary transition-colors">Pricing</Link>
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
