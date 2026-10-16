"use client";

// ÉTATS TRANSVERSES DES PAGES PORTAIL / PAIEMENTS
// (chargement, accès refusé, messages d'alerte)

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EtatMessage = { type: "succes" | "erreur"; texte: string } | null;

export function EcranChargement({ texte = "Chargement de vos données…" }: { texte?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-emeraude-500" />
      <p className="text-sm text-muted-foreground">{texte}</p>
    </div>
  );
}

export function EcranAcces({
  titre,
  message,
  href,
  libelle
}: {
  titre: string;
  message: string;
  href: string;
  libelle: string;
}) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-soft"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-or-500/15">
          <ShieldAlert className="h-7 w-7 text-or-500" />
        </div>
        <h1 className="mt-5 font-serif text-2xl font-bold">{titre}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button className="mt-6 w-full" variant="gold" onClick={() => router.push(href)}>
          {libelle}
        </Button>
      </motion.div>
    </div>
  );
}

export function Alerte({
  etat,
  onFermer
}: {
  etat: Exclude<EtatMessage, null>;
  onFermer: () => void;
}) {
  const succes = etat.type === "succes";
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        succes
          ? "border-emeraude-500/30 bg-emeraude-500/10 text-emeraude-700 dark:text-emeraude-300"
          : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      )}
    >
      {succes ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{etat.texte}</span>
      <button onClick={onFermer} aria-label="Fermer le message" className="shrink-0 opacity-60 transition hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export function dateCourte(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}
