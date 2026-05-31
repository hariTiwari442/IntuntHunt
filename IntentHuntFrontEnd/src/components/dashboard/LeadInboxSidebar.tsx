"use client";

import { cn } from "@/lib/utils";

export type StatusFilter = "all" | "unread" | "saved" | "completed" | "discarded";
export type PlatformFilter = "all" | "reddit" | "linkedin" | "twitter";
export type TimeFilter = "all" | "24h";

interface LeadInboxSidebarProps {
  statusCounts:    Record<StatusFilter, number>;
  platformCounts:  Record<PlatformFilter, number>;
  timeCounts:      Record<TimeFilter, number>;
  status:          StatusFilter;
  platform:        PlatformFilter;
  time:            TimeFilter;
  minRelevancy:    number;
  onStatusChange:    (s: StatusFilter) => void;
  onPlatformChange:  (p: PlatformFilter) => void;
  onTimeChange:      (t: TimeFilter) => void;
  onRelevancyChange: (n: number) => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "unread",     label: "Unread" },
  { value: "saved",      label: "Saved" },
  { value: "completed",  label: "Completed" },
  { value: "discarded",  label: "Discarded" },
];

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "reddit",   label: "Reddit" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter",  label: "Twitter" },
];

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
];

export function LeadInboxSidebar({
  statusCounts,
  platformCounts,
  timeCounts,
  status,
  platform,
  time,
  minRelevancy,
  onStatusChange,
  onPlatformChange,
  onTimeChange,
  onRelevancyChange,
}: LeadInboxSidebarProps) {
  return (
    <aside className="w-56 shrink-0 border-r border-border-default overflow-y-auto p-4 space-y-6">
      <FilterSection title="Status">
        {STATUS_OPTIONS.map((opt) => (
          <FilterRow
            key={opt.value}
            label={opt.label}
            count={statusCounts[opt.value]}
            active={status === opt.value}
            onClick={() => onStatusChange(opt.value)}
          />
        ))}
      </FilterSection>

      <FilterSection title="Time">
        {TIME_OPTIONS.map((opt) => (
          <FilterRow
            key={opt.value}
            label={opt.label}
            count={timeCounts[opt.value]}
            active={time === opt.value}
            onClick={() => onTimeChange(opt.value)}
          />
        ))}
      </FilterSection>

      <FilterSection title="Platform">
        {PLATFORM_OPTIONS.map((opt) => (
          <FilterRow
            key={opt.value}
            label={opt.label}
            count={platformCounts[opt.value]}
            active={platform === opt.value}
            onClick={() => onPlatformChange(opt.value)}
          />
        ))}
      </FilterSection>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            Relevancy
          </span>
          <span className="text-[11px] font-medium text-accent tabular-nums">
            {minRelevancy}%+
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={minRelevancy}
          onChange={(e) => onRelevancyChange(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
    </aside>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors",
        active
          ? "bg-accent-soft text-accent font-medium"
          : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
      )}
    >
      <span>{label}</span>
      <span className="text-[11px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}
