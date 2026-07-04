import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How LeadPulse collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-bold mb-3">Privacy Policy</h1>
          <p className="text-sm text-text-tertiary">Last updated: June 1, 2026</p>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-10">
          We respect your privacy. This Policy explains what we collect, how we use it, who we share it with, and the rights you have. If anything here is unclear, email <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a> and we&apos;ll explain in plain English.
        </p>

        <div className="space-y-8">
          <Section title="1. Information We Collect">
            <strong>Account info:</strong> name, email, password (hashed), profile data you choose to provide.
            <br /><br />
            <strong>Billing info:</strong> handled entirely by our payment processor (Stripe or equivalent). We store only the customer ID, subscription tier, and billing status — never your card number, CVV, or bank details.
            <br /><br />
            <strong>Product configuration:</strong> the product descriptions, search queries, and reply preferences you enter.
            <br /><br />
            <strong>Lead data:</strong> public posts surfaced by LeadPulse from Reddit, LinkedIn, and Twitter. This data is already publicly visible on those platforms — we just index and rank it for you.
            <br /><br />
            <strong>Usage data:</strong> how you interact with the app (pages visited, features used, click events). Used to improve the Service.
            <br /><br />
            <strong>Cookies:</strong> we use essential cookies for authentication and a small set of analytics cookies. No third-party advertising cookies.
          </Section>

          <Section title="2. How We Use Your Information">
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>To provide the Service (run searches, score leads, generate replies)</li>
              <li>To bill you and manage your subscription</li>
              <li>To send transactional emails (account confirmation, password reset, billing)</li>
              <li>To send product updates and tips (you can opt out anytime)</li>
              <li>To improve the Service (analytics, debugging, feature decisions)</li>
              <li>To comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="3. Who We Share Data With">
            We don&apos;t sell your data. We share it only with the following third parties strictly to run the Service:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Supabase</strong> — database hosting and authentication</li>
              <li><strong>Stripe (or equivalent)</strong> — payment processing</li>
              <li><strong>OpenAI</strong> — AI processing for intent scoring and reply generation (data sent is your product description and the public post being scored; no PII)</li>
              <li><strong>Serper.dev / Google</strong> — public search queries</li>
              <li><strong>Email provider</strong> (e.g., Resend, Postmark) — transactional and product emails</li>
              <li><strong>Analytics</strong> (e.g., Plausible, PostHog) — anonymized usage data</li>
            </ul>
            All third parties operate under their own privacy policies. We pick vendors with strong privacy track records.
          </Section>

          <Section title="4. Data Retention">
            <strong>Account data:</strong> kept while your account is active.
            <br /><br />
            <strong>After cancellation:</strong> we keep your data for 30 days in case you want to reactivate or export. Then we permanently delete it (except where law requires longer retention).
            <br /><br />
            <strong>Billing records:</strong> retained for 7 years to comply with tax law.
            <br /><br />
            <strong>Logs:</strong> server access logs are retained for 30 days, then auto-deleted.
          </Section>

          <Section title="5. Your Rights (GDPR / CCPA)">
            Regardless of where you live, you have the right to:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Access</strong> the data we hold about you</li>
              <li><strong>Correct</strong> inaccurate or incomplete data</li>
              <li><strong>Delete</strong> your data (&ldquo;right to be forgotten&rdquo;)</li>
              <li><strong>Export</strong> your data in a portable format</li>
              <li><strong>Object</strong> to certain processing (e.g., marketing emails)</li>
              <li><strong>Withdraw consent</strong> at any time</li>
            </ul>
            To exercise any of these, email <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a>. We respond within 30 days.
          </Section>

          <Section title="6. Security">
            We follow industry standards to protect your data:
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>TLS encryption for all data in transit</li>
              <li>Encrypted at rest (database, backups)</li>
              <li>Passwords stored using bcrypt</li>
              <li>Principle of least privilege for internal access</li>
              <li>Regular dependency audits and security patches</li>
            </ul>
            No system is 100% secure. If a breach affects your data, we&apos;ll notify you within 72 hours.
          </Section>

          <Section title="7. Children's Privacy">
            LeadPulse is not intended for anyone under 18. We don&apos;t knowingly collect data from minors. If we discover we have, we&apos;ll delete it immediately.
          </Section>

          <Section title="8. International Data Transfers">
            Our servers may be located outside your country of residence. By using LeadPulse, you consent to your data being transferred and processed in those locations, subject to safeguards required by applicable data protection law.
          </Section>

          <Section title="9. Changes to This Policy">
            We may update this Policy occasionally. If changes are material, we&apos;ll notify you by email or in-app at least 14 days before they take effect. The &ldquo;Last updated&rdquo; date above always reflects the current version.
          </Section>

          <Section title="10. Contact">
            Questions or concerns about your privacy?
            <br /><br />
            Email: <a href="mailto:support@leadpulse.io" className="text-accent hover:underline">support@leadpulse.io</a>
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
