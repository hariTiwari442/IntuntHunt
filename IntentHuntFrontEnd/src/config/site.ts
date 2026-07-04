/**
 * Central site/SEO configuration.
 *
 * Everything SEO-related (canonical URLs, sitemap, OpenGraph, JSON-LD) reads
 * from here so there is a single source of truth. When the production domain
 * is ready, set NEXT_PUBLIC_SITE_URL in your environment (e.g. Netlify) — no
 * code changes needed. The fallback is only used for local dev / previews.
 */

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://leadpulse.io";

export const siteConfig = {
  name: "LeadPulse",
  // Used as the default <title> for the homepage and the "%s · LeadPulse" template.
  title: "LeadPulse — Find buyers across Reddit, LinkedIn & Twitter",
  description:
    "LeadPulse scans Reddit, LinkedIn, and Twitter for posts with buying intent, scores them by purchase signal, and drafts a thoughtful comment reply — so you can join the conversation before it goes stale.",
  url: rawSiteUrl,
  ogImage: `${rawSiteUrl}/opengraph-image`,
  // Pulled into JSON-LD and link tags. Update handles when socials are live.
  twitterHandle: "@leadpulse",
  email: "support@leadpulse.io",
  keywords: [
    "lead generation",
    "buyer intent",
    "Reddit lead generation",
    "social selling",
    "intent data",
    "Reddit monitoring",
    "LinkedIn lead generation",
    "Twitter lead generation",
    "AI sales replies",
    "social listening for sales",
    "B2B SaaS leads",
    "find customers on Reddit",
  ],
} as const;

export type SiteConfig = typeof siteConfig;
