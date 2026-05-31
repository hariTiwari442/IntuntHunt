"use client";

import type { Lead } from "@/hooks/useJobs";
import { cn } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";

interface LeadListProps {
  leads:           Lead[];
  selectedLeadId:  string | null;
  isRunning:       boolean;
  onSelect:        (id: string) => void;
}

export function LeadList({
  leads,
  selectedLeadId,
  isRunning,
  onSelect,
}: LeadListProps) {
  return (
    <div className="w-96 shrink-0 border-r border-border-default flex flex-col bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-border-default">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">Inbox</h2>
          <span className="text-xs text-text-tertiary">({leads.length})</span>
          {isRunning && <Loader2 size={12} className="animate-spin text-accent" />}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {leads.length === 0 ? (
          <div className="p-10 text-center">
            <Search size={28} className="mx-auto text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary">
              {isRunning ? "Scanning…" : "No leads match this filter."}
            </p>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              isSelected={lead.id === selectedLeadId}
              onClick={() => onSelect(lead.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LeadRow({
  lead,
  isSelected,
  onClick,
}: {
  lead: Lead;
  isSelected: boolean;
  onClick: () => void;
}) {
  const score = Math.min(100, lead.intentScore + 10);
  const isUnread = !lead.viewedAt;
  const platformLabel =
    lead.platform === "reddit" && lead.subreddit
      ? `r/${lead.subreddit}`
      : lead.platform === "linkedin"
      ? "LinkedIn"
      : lead.platform === "twitter"
      ? "Twitter"
      : "Reddit";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border-default transition-colors block",
        isSelected
          ? "bg-accent-soft"
          : "hover:bg-bg-card-hover"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <RelevancyBadge score={score} />
          {isWithin24h(lead.createdAt) && (
            <span
              title="Found within the last 24 hours"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent-soft text-accent cursor-help"
            >
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
              NEW
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-tertiary shrink-0">
          {formatTimeAgo(lead.createdAt)}
        </span>
      </div>
      <div className="text-[11px] text-text-tertiary mb-1 truncate">{platformLabel}</div>
      <div
        className={cn(
          "text-sm leading-snug line-clamp-2",
          isUnread ? "font-medium text-text-primary" : "text-text-secondary"
        )}
      >
        {lead.title}
      </div>
    </button>
  );
}

function RelevancyBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-700"
      : score >= 60
      ? "bg-amber-100 text-amber-700"
      : "bg-bg-muted text-text-tertiary";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold",
        color
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {score}%
    </span>
  );
}

function formatTimeAgo(iso: string): string {
  const now  = Date.now();
  const then = new Date(iso).getTime();
  const sec  = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60)         return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)         return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24)          return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30)           return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function isWithin24h(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}
