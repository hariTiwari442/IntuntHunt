"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * What the user sees when Find Leads doesn't start.
 *
 * Two different situations that must not look the same:
 *
 *  - Plan limit (402). Not a failure — the product worked exactly as sold,
 *    and the user has a decision to make. It gets the quota, the plan name
 *    and an upgrade path, with no alarm styling.
 *  - Anything else. A genuine fault: say so plainly, and don't invite them
 *    to pay money to fix something that isn't about money.
 *
 * Before this existed, handleFindLeads called mutateAsync with no catch, so
 * a 402 surfaced as an unhandled rejection and the user just saw the button
 * do nothing.
 */

export interface ScanBlockedInfo {
  status:  number;
  message: string;
  limit?:  number;
  current?: number;
  plan?:   string;
}

export function ScanBlockedNotice({
  info,
  onDismiss,
}: {
  info: ScanBlockedInfo;
  onDismiss: () => void;
}) {
  const isLimit = info.status === 402;

  return (
    <div
      role="alert"
      className={`shrink-0 border-b px-6 py-4 ${
        isLimit
          ? "border-accent/25 bg-accent-soft/50"
          : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            isLimit ? "bg-bg-secondary text-accent" : "bg-white/70 text-red-600 dark:bg-red-500/20 dark:text-red-300"
          }`}
        >
          {isLimit ? <Lock size={15} /> : <AlertTriangle size={15} />}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              isLimit ? "text-text-primary" : "text-red-800 dark:text-red-200"
            }`}
          >
            {isLimit
              ? `You've used this month's ${info.limit === 1 ? "scan" : "scans"}`
              : "That scan didn't start"}
          </p>

          <p
            className={`mt-0.5 text-xs leading-relaxed ${
              isLimit ? "text-text-secondary" : "text-red-700 dark:text-red-300"
            }`}
          >
            {info.message}
          </p>

          {/* The backend's message already names the quota and the plan, so
              repeating "1 of 1 used on the starter plan" underneath it just
              said the same thing twice. Only the reassurance is new. */}
          {isLimit && (
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Your existing leads stay available — this only affects running a new scan.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isLimit ? (
              <Link href="/pricing">
                <Button size="sm">
                  See plans
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Button size="sm" variant="secondary" onClick={onDismiss}>
                Try again
              </Button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 rounded-lg p-1 transition-colors ${
            isLimit
              ? "text-text-tertiary hover:text-text-primary"
              : "text-red-500 hover:text-red-800 dark:hover:text-red-200"
          }`}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
