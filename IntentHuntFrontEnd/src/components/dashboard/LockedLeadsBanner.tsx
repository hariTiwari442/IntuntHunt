"use client";

import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LeadGating } from "@/hooks/useJobs";

const PLATFORM_LABEL: Record<string, string> = {
  reddit:   "Reddit",
  linkedin: "LinkedIn",
  twitter:  "X",
};

/**
 * Tells a free user exactly what their plan is withholding.
 *
 * The specifics matter: every plan searches all three platforms, so these
 * leads genuinely exist, already scored. Naming them is both more honest and
 * more persuasive than a generic "upgrade for more", because upgrading
 * reveals them immediately rather than requiring another scan.
 *
 * Two separate things are withheld, and the copy has to account for both or
 * the arithmetic visibly fails:
 *
 *   - platforms the plan can't see  -> itemised in `lockedSources`
 *   - leads past the plan's cap     -> NOT in lockedSources, only in the total
 *
 * `lockedCount` is the sum of the two. Listing only the first while showing
 * the second's total produced "4 more leads found — 1 on X, 2 on LinkedIn",
 * which reads as a bug to anyone who adds up, and is worse than saying less:
 * it also claimed "your plan shows Reddit only" while a Reddit lead was being
 * held back by the cap.
 *
 * Kept visually lighter than ScanBlockedNotice on purpose. When a scan limit
 * is also in force both render together, and two full-width accent blocks
 * stacked push the inbox itself below the fold.
 */
export function LockedLeadsBanner({ gating }: { gating?: LeadGating }) {
  if (!gating || gating.lockedCount <= 0) return null;

  const named  = gating.lockedSources.reduce((n, s) => n + s.count, 0);
  const capped = Math.max(0, gating.lockedCount - named);

  const sources = gating.lockedSources
    .map((s) => `${s.count} on ${PLATFORM_LABEL[s.platform] ?? s.platform}`)
    .join(", ");

  let detail: string;
  if (named > 0 && capped > 0) {
    detail =
      `We searched every platform and found ${sources}, ` +
      `plus ${capped} more your plan doesn't show at once.`;
  } else if (named > 0) {
    detail = `We searched every platform and found ${sources} — your plan shows Reddit only.`;
  } else {
    detail =
      `Your plan shows ${gating.visibleLeads ?? "a limited number of"} at a time. ` +
      `The rest are scored and waiting.`;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent/20 bg-accent-soft/25 px-3.5 py-2.5">
      <Lock size={14} className="shrink-0 text-accent" />

      <p className="min-w-0 flex-1 text-xs leading-relaxed text-text-secondary">
        <span className="font-semibold text-text-primary">
          {gating.lockedCount} more {gating.lockedCount === 1 ? "lead" : "leads"} found
        </span>
        {" — "}
        {detail}
      </p>

      <Link href="/pricing" className="shrink-0">
        <Button size="sm" variant="secondary">
          Unlock
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </Link>
    </div>
  );
}
