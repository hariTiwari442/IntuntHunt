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
          "bg-white/5 text-white/60": variant === "default",
          "bg-accent/15 text-accent": variant === "accent",
          "bg-red-500/20 text-red-400": variant === "hot",
          "bg-green-500/20 text-green-400": variant === "good",
          "bg-amber-500/20 text-amber-400": variant === "watch",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
