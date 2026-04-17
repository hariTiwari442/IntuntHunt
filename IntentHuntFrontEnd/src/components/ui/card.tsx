import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-default bg-bg-card p-6 transition-all duration-200",
        "hover:bg-bg-card-hover hover:border-border-hover",
        className
      )}
      {...props}
    />
  );
}
