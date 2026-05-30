"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/hooks/useJobs";

/**
 * Subscribe to live updates on the `leads` table for a given searchRunId.
 *
 * Behavior:
 *   - On INSERT (orchestrator just pre-scored a lead) → adds to list
 *   - On UPDATE (process-lead or reply-gen wrote new fields) → patches existing
 *
 * @param searchRunId  filter to this run (null = no subscription)
 * @param initial      seed list from useLeads's initial fetch — Realtime
 *                     overlays on top of this
 */
export function useLeadsRealtime(searchRunId: string | null, initial: Lead[] = []) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  // Track if we've initialized from `initial` so re-renders don't wipe live state
  const seededRef = useRef(false);

  useEffect(() => {
    if (!seededRef.current && initial.length > 0) {
      setLeads(initial);
      seededRef.current = true;
    }
  }, [initial]);

  useEffect(() => {
    if (!searchRunId) return;

    const channel = supabase
      .channel(`leads:${searchRunId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "leads",
          filter: `search_run_id=eq.${searchRunId}`,
        },
        (payload) => {
          const next = snakeToCamelLead(payload.new as Record<string, unknown>);
          setLeads((prev) => {
            if (prev.some((l) => l.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "leads",
          filter: `search_run_id=eq.${searchRunId}`,
        },
        (payload) => {
          const next = snakeToCamelLead(payload.new as Record<string, unknown>);
          setLeads((prev) =>
            prev.map((l) => (l.id === next.id ? { ...l, ...next } : l)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchRunId]);

  return leads;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Realtime payloads come in raw DB column shape (snake_case).
 * Map to the camelCase Lead shape our hooks/types use.
 */
function snakeToCamelLead(row: Record<string, unknown>): Lead {
  return {
    id:                  row.id as string,
    productId:           row.product_id as string,
    searchRunId:         row.search_run_id as string,
    url:                 row.url as string,
    platform:            row.platform as Lead["platform"],
    subreddit:           (row.subreddit as string | null) ?? null,
    title:               row.title as string,
    content:             (row.content as string | null) ?? null,
    author:              (row.author as string | null) ?? null,
    authorProfileUrl:    (row.author_profile_url as string | null) ?? null,
    postScore:           (row.post_score as number) ?? 0,
    commentCount:        (row.comment_count as number) ?? 0,
    postedAt:            row.posted_at ? String(row.posted_at) : null,
    preScore:            (row.pre_score as number) ?? 0,
    googleSnippet:       (row.google_snippet as string) ?? "",
    querySource:         (row.query_source as string) ?? "",
    intentScore:         (row.intent_score as number) ?? 0,
    leadType:            (row.lead_type as Lead["leadType"]) ?? "not_a_lead",
    reasoning:           (row.reasoning as string | null) ?? null,
    replyOpportunity:    (row.reply_opportunity as Lead["replyOpportunity"]) ?? "none",
    suggestedAngle:      (row.suggested_angle as string | null) ?? null,
    isCompetitorThread:  (row.is_competitor_thread as boolean) ?? false,
    suggestedReply:      (row.suggested_reply as string | null) ?? null,
    replyConfidenceNote: (row.reply_confidence_note as string | null) ?? null,
    status:              (row.status as Lead["status"]) ?? "new",
    userReplied:         (row.user_replied as boolean) ?? false,
    repliedAt:           row.replied_at ? String(row.replied_at) : null,
    tags:                Array.isArray(row.tags) ? (row.tags as string[]) : [],
    viewedAt:            row.viewed_at ? String(row.viewed_at) : null,
    userNote:            (row.user_note as string | null) ?? null,
    preScoredAt:         String(row.pre_scored_at),
    contentFetchedAt:    row.content_fetched_at ? String(row.content_fetched_at) : null,
    deepScoredAt:        row.deep_scored_at ? String(row.deep_scored_at) : null,
    replyGeneratedAt:    row.reply_generated_at ? String(row.reply_generated_at) : null,
    createdAt:           String(row.created_at),
  };
}
