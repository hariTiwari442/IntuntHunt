import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-4 py-3 rounded-xl bg-white/5 border border-border-default text-white text-sm outline-none transition-all duration-200",
          "placeholder:text-text-tertiary",
          "focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(180,247,77,0.1)]",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
