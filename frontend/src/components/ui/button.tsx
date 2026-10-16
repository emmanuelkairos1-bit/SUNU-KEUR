"use client";

import { forwardRef, useRef, type ButtonHTMLAttributes } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "success" | "accent" | "gold" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-nuit-900 text-white dark:bg-white dark:text-nuit-900 hover:opacity-90 shadow-soft",
  success: "bg-emeraude-500 text-white hover:bg-emeraude-600 shadow-glow",
  accent: "bg-orange-500 text-white hover:bg-orange-600 shadow-soft",
  gold: "bg-or-500 text-nuit-900 hover:bg-or-400 shadow-gold",
  outline: "border border-border bg-transparent hover:bg-muted",
  ghost: "bg-transparent hover:bg-muted",
  destructive: "bg-red-500 text-white hover:bg-red-600"
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ripple?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, ripple = true, children, disabled, onClick, ...props }, ref) => {
    const btnRef = useRef<HTMLButtonElement | null>(null);

    const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ripple) {
        onClick?.(e);
        return;
      }
      const btn = btnRef.current;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const span = document.createElement("span");
        const d = Math.max(rect.width, rect.height);
        span.className = "ripple-ink";
        span.style.width = span.style.height = `${d}px`;
        span.style.left = `${e.clientX - rect.left - d / 2}px`;
        span.style.top = `${e.clientY - rect.top - d / 2}px`;
        btn.appendChild(span);
        setTimeout(() => span.remove(), 600);
      }
      onClick?.(e);
    };

    return (
      <motion.button
        ref={(n) => {
          btnRef.current = n;
          if (typeof ref === "function") ref(n);
          else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = n as HTMLButtonElement | null;
        }}
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        disabled={disabled || loading}
        onClick={handleRipple}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 rounded-lg font-medium overflow-hidden whitespace-nowrap transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...(props as HTMLMotionProps<"button">)}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </motion.button>
    );
  }
);
Button.displayName = "Button";
