"use client";

import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "warning" | "gold" | "neutral" | "info";

const tones: Record<Tone, string> = {
  success: "bg-emeraude-500/15 text-emeraude-600 dark:text-emeraude-300 border-emeraude-500/30",
  danger: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  warning: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  gold: "bg-or-500/15 text-or-600 dark:text-or-400 border-or-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30"
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
