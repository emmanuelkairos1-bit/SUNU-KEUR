"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <motion.button
      onClick={toggle}
      aria-label="Basculer le thème"
      className={`relative flex h-9 w-[68px] items-center rounded-full border border-or-500/40 bg-nuit-900 px-1 dark:bg-white/10 ${className}`}
      whileTap={{ scale: 0.92 }}
    >
      {/* Knob animé (Soleil / Lune) */}
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-or-500 shadow-gold"
        style={{ marginLeft: isDark ? 0 : 32 }}
      >
        {isDark ? <Moon className="h-4 w-4 text-nuit-900" /> : <Sun className="h-4 w-4 text-white" />}
      </motion.span>
      <Sun className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-white/60" />
      <Moon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-white/60" />
    </motion.button>
  );
}
