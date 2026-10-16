"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Drawer latéral (fiche locataire, détails) avec animation spring
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: "right" | "left";
  className?: string;
}) {
  const from = side === "right" ? { x: "100%" } : { x: "-100%" };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-nuit-900/50 backdrop-blur-sm"
          />
          <motion.aside
            initial={from}
            animate={{ x: 0 }}
            exit={from}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className={cn(
              "absolute top-0 h-full w-full max-w-md overflow-y-auto border bg-card p-6 shadow-2xl",
              side === "right" ? "right-0" : "left-0",
              className
            )}
          >
            <div className="mb-5 flex items-center justify-between">
              {title && <h3 className="font-serif text-xl font-semibold">{title}</h3>}
              <button
                onClick={onClose}
                className="rounded-full p-1 text-muted-foreground transition hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
