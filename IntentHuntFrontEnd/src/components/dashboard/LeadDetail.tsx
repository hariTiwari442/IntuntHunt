"use client";

import { useEffect, useRef, useState } from "react";
import type { Lead } from "@/hooks/useJobs";
import { useUpdateLead } from "@/hooks/useJobs";
import { LeadActions } from "./LeadActions";
import { Button } from "@/components/ui/button";
import { ExternalLink, Sparkles, Copy, Inbox } from "lucide-react";

interface LeadDetailProps {
  lead: Lead | null;
}

export function LeadDetail({ lead }: LeadDetailProps) {
  const update = useUpdateLead();
  const viewedRef = useRef<string | null>(null);

  // Local note state (debounced save on blur / delay)
  const [note, setNote] = useState(lead?.userNote ?? "");
  useEffect(() => {
    setNote(lead?.userNote ?? "");
  }, [lead?.id, lead?.userNote]);

  // Mark viewed when a new lead is selected
  useEffect(() => {
    if (!lead) return;
    if (lead.viewedAt) return;
    if (viewedRef.current === lead.id) return;
    viewedRef.current = lead.id;
    update.mutate({ leadId: lead.id, viewed: true });
  }, [lead, update]);

  if (!lead) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <Inbox size={36} className="text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Select a lead to view details</p>
        </div>
      </div>
    );
  }

  const tags = lead.tags ?? [];
  const saved     = tags.includes("saved");
  const completed = tags.includes("replied");
  const discarded = tags.includes("not_a_fit");

  const score = Math.min(100, lead.intentScore + 10);

  function toggleTag(tag: string) {
    if (!lead) return;
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    update.mutate({ leadId: lead.id, tags: next });
  }

  function saveNote() {
    if (!lead) return;
    if ((lead.userNote ?? "") === note) return;
    update.mutate({ leadId: lead.id, userNote: note.trim() || null });
  }

  const platformLabel =
    lead.platform === "reddit" && lead.subreddit
      ? `r/${lead.subreddit}`
      : lead.platform === "linkedin"
      ? "LinkedIn"
      : lead.platform === "twitter"
      ? "Twitter"
      : "Reddit";

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-bg-secondary">
        <div className="flex items-center gap-3">
          <ScoreBadge score={score} />
          <span className="text-sm text-text-secondary">{platformLabel}</span>
          {lead.isCompetitorThread && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              Competitor thread
            </span>
          )}
        </div>
        <LeadActions
          saved={saved}
          completed={completed}
          discarded={discarded}
          onToggleSave={() => toggleTag("saved")}
          onToggleComplete={() => toggleTag("replied")}
          onToggleDiscard={() => toggleTag("not_a_fit")}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Post card */}
        <section className="bg-bg-secondary border border-border-default rounded-xl p-5">
          <h1 className="text-lg font-semibold text-text-primary mb-2">{lead.title}</h1>
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-4">
            {lead.author && <span>by {lead.author}</span>}
            {lead.postedAt && <span>· {new Date(lead.postedAt).toLocaleDateString()}</span>}
            {lead.postScore > 0 && <span>· {lead.postScore} upvotes</span>}
            {lead.commentCount > 0 && <span>· {lead.commentCount} comments</span>}
          </div>
          <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {lead.content || lead.googleSnippet}
          </p>
          <div className="mt-4">
            <a
              href={lead.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Open post <ExternalLink size={12} />
            </a>
          </div>
        </section>

        {/* Why it's a lead */}
        {lead.reasoning && (
          <section className="bg-accent-soft border border-accent/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Why this is a lead
              </span>
            </div>
            <p className="text-sm text-text-primary leading-relaxed">{lead.reasoning}</p>
            {lead.suggestedAngle && (
              <p className="text-sm text-text-secondary mt-3">
                <span className="text-text-tertiary">Angle:</span> {lead.suggestedAngle}
              </p>
            )}
          </section>
        )}

        {/* Suggested reply */}
        {lead.suggestedReply ? (
          <section className="bg-bg-secondary border border-border-default rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Suggested Reply
              </span>
              <CopyButton text={lead.suggestedReply} />
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
              {lead.suggestedReply}
            </p>
            {lead.replyConfidenceNote && (
              <p className="text-[11px] text-text-tertiary mt-3 italic">
                {lead.replyConfidenceNote}
              </p>
            )}
          </section>
        ) : (
          <section className="bg-bg-secondary border border-border-default rounded-xl p-5 text-center">
            <p className="text-sm text-text-tertiary">
              Reply suggestion will appear once scoring finishes.
            </p>
          </section>
        )}

        {/* Notes */}
        <section className="bg-bg-secondary border border-border-default rounded-xl p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Notes
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={3}
            placeholder="Add a note about this lead…"
            className="w-full px-3 py-2 rounded-lg text-sm bg-bg-primary text-text-primary border border-border-default focus:border-accent/50 outline-none resize-y"
          />
        </section>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-700 border-green-300"
      : score >= 60
      ? "bg-amber-100 text-amber-700 border-amber-300"
      : "bg-bg-muted text-text-tertiary border-border-default";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {score}% relevant
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-bg-card-hover transition-colors"
    >
      <Copy size={12} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
