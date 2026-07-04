"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

/**
 * Hero "live" ticker — cycles through realistic example posts surfaced
 * by LeadPulse, formatted like real feed items.
 *
 * Source pill (platform-colored) · relative timestamp · the post text
 * typed character-by-character. Mimics the actual product output.
 */

interface FeedItem {
  platform: "reddit" | "linkedin" | "twitter";
  source:   string;   // e.g. "r/sales", "LinkedIn", "Twitter"
  time:     string;   // e.g. "just now", "2m ago"
  text:     string;   // the post / question
}

const FEED: FeedItem[] = [
  { platform: "reddit",   source: "r/sales",         time: "just now", text: "Apollo alternatives that actually work?" },
  { platform: "reddit",   source: "r/Entrepreneur",  time: "2m ago",   text: "Lead-gen tools under $50/mo — recs?" },
  { platform: "twitter",  source: "Twitter",         time: "5m ago",   text: "Best AI outbound tool in 2026?" },
  { platform: "reddit",   source: "r/SaaS",          time: "8m ago",   text: "Clay vs Apollo for solo founders" },
  { platform: "linkedin", source: "LinkedIn",        time: "12m ago",  text: "Switched from Hunter.io — what next?" },
  { platform: "reddit",   source: "r/sales",         time: "15m ago",  text: "Cold outreach is dead — what's working?" },
  { platform: "twitter",  source: "Twitter",         time: "22m ago",  text: "Lemlist or Smartlead in 2026?" },
  { platform: "reddit",   source: "r/Entrepreneur",  time: "30m ago",  text: "Free CRM that doesn't suck — for solo?" },
  { platform: "reddit",   source: "r/startups",      time: "45m ago",  text: "Tired of LinkedIn cold DMs. Alternatives?" },
  { platform: "linkedin", source: "LinkedIn",        time: "1h ago",   text: "How are you finding decision makers?" },
  { platform: "reddit",   source: "r/sales",         time: "1h ago",   text: "Sales Nav is way too expensive for us" },
  { platform: "twitter",  source: "Twitter",         time: "2h ago",   text: "Who actually replies to Twitter DMs?" },
  { platform: "reddit",   source: "r/SaaS",          time: "2h ago",   text: "Best way to find buying signals on Reddit?" },
  { platform: "reddit",   source: "r/Entrepreneur",  time: "3h ago",   text: "Apollo's new pricing is insane" },
  { platform: "twitter",  source: "Twitter",         time: "3h ago",   text: "Replacing Outreach — what worked for you?" },
];

const TYPE_SPEED   = 38;   // ms per char while typing
const DELETE_SPEED = 18;   // ms per char while deleting
const HOLD_MS      = 1400; // pause once a phrase is fully typed

const PLATFORM_DOT = {
  reddit:   "bg-orange-500",
  linkedin: "bg-blue-600",
  twitter:  "bg-sky-500",
} as const;

export function BuyersAskingTicker() {
  const [itemIdx,   setItemIdx]   = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [deleting,  setDeleting]  = useState(false);

  const item = FEED[itemIdx]!;

  useEffect(() => {
    if (!deleting && charCount === item.text.length) {
      const t = setTimeout(() => setDeleting(true), HOLD_MS);
      return () => clearTimeout(t);
    }
    if (deleting && charCount === 0) {
      setDeleting(false);
      setItemIdx((i) => (i + 1) % FEED.length);
      return;
    }

    const t = setTimeout(
      () => setCharCount((c) => c + (deleting ? -1 : 1)),
      deleting ? DELETE_SPEED : TYPE_SPEED,
    );
    return () => clearTimeout(t);
  }, [itemIdx, charCount, deleting, item.text]);

  const visible = item.text.slice(0, charCount);

  return (
    <div
      className="flex items-center justify-center gap-2.5 mb-8 animate-fade-in"
      style={{ animationDelay: "0.3s" }}
      aria-live="polite"
    >
      <MessageCircle size={13} className="text-accent shrink-0" strokeWidth={2.5} />

      {/* Source pill */}
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-bg-secondary border border-border-default text-text-primary shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${PLATFORM_DOT[item.platform]}`} />
        {item.source}
      </span>

      {/* Time */}
      <span className="text-[11px] text-text-tertiary shrink-0">{item.time}</span>

      <span className="text-text-tertiary shrink-0">·</span>

      {/* The typed text */}
      <span className="text-sm text-text-primary font-medium min-w-0">
        {visible}
        <span
          className="inline-block w-[2px] h-4 align-middle bg-accent ml-0.5 animate-pulse"
          aria-hidden
        />
      </span>
    </div>
  );
}
