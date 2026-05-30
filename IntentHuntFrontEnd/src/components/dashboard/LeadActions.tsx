"use client";

import { Bookmark, Check, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface LeadActionsProps {
  saved: boolean;
  completed: boolean;
  discarded: boolean;
  onToggleSave: () => void;
  onToggleComplete: () => void;
  onToggleDiscard: () => void;
}

export function LeadActions({
  saved,
  completed,
  discarded,
  onToggleSave,
  onToggleComplete,
  onToggleDiscard,
}: LeadActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <ActionButton
        active={saved}
        onClick={onToggleSave}
        icon={Bookmark}
        label="Save"
        activeColors="bg-yellow-50 text-yellow-700 border-yellow-300"
      />
      <ActionButton
        active={completed}
        onClick={onToggleComplete}
        icon={Check}
        label="Complete"
        activeColors="bg-green-50 text-green-700 border-green-300"
      />
      <ActionButton
        active={discarded}
        onClick={onToggleDiscard}
        icon={Ban}
        label="Discard"
        activeColors="bg-red-50 text-red-700 border-red-300"
      />
    </div>
  );
}

function ActionButton({
  active,
  onClick,
  icon: Icon,
  label,
  activeColors,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  activeColors: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
        active
          ? activeColors
          : "bg-bg-secondary text-text-secondary border-border-default hover:bg-bg-card-hover hover:text-text-primary"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
