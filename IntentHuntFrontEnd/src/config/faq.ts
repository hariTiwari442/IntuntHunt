/**
 * Landing-page FAQ content. Single source of truth so the visible <details>
 * accordion and the FAQPage JSON-LD structured data never drift apart.
 */

export interface FaqItem {
  q: string;
  a: string;
}

export const faqItems: FaqItem[] = [
  {
    q: "Does LeadPulse send messages automatically?",
    a: "No — and we never will. LeadPulse only finds relevant conversations and drafts a suggested comment reply for you. You always review, edit if needed, and post the comment yourself through the original platform. We do not have your Reddit, LinkedIn, or Twitter credentials, and we never send anything on your behalf.",
  },
  {
    q: "How long until I see my first conversation?",
    a: "Usually under 5 minutes after clicking Find Leads on a new product. The inbox is live — relevant posts start landing within seconds, and AI-drafted comment suggestions generate inside the first minute. You can review your first opportunity in under 10 minutes.",
  },
  {
    q: "Will the AI replies sound like AI?",
    a: "No. LeadPulse reads the actual post — the person's words, their context, what they're asking about — and drafts a comment that references their specific situation. Not just a name slotted into a template. Scroll up to the before/after to see what we mean. You always review and edit before posting yourself.",
  },
  {
    q: "What if my product isn't B2B SaaS?",
    a: "It works for anything people talk about online — design services, indie games, productivity tools, ecommerce brands, physical products. As long as people ask questions about your space on Reddit, LinkedIn, or Twitter (and they do), LeadPulse will surface them. Just describe your product in plain English.",
  },
  {
    q: "Can I cancel anytime? What happens to my data?",
    a: "Yes — cancel from Settings, no contract, no phone call. Your 14-day trial never auto-converts without your explicit confirmation. If you cancel, your saved conversations remain accessible for 30 days so you can export anything you want to keep.",
  },
];
