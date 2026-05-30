import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "accent" | "hot" | "good" | "watch";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold",
        {
          "bg-bg-muted text-text-secondary": variant === "default",
          "bg-accent-soft text-accent": variant === "accent",
          "bg-red-100 text-red-700": variant === "hot",
          "bg-green-100 text-green-700": variant === "good",
          "bg-amber-100 text-amber-700": variant === "watch",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
