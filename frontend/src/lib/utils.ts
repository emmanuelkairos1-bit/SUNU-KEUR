import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format monétaire FCFA (XOF)
export function fcfa(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(n || 0) + " F";
}

export function fcfaCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + " M";
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + " K";
  return String(n || 0);
}

export const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
export const MOIS_LONGS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function nomMois(dateISO: string): string {
  const d = new Date(dateISO);
  return `${MOIS_LONGS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function initiales(nom: string): string {
  return (nom || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
}

export function lienWhatsApp(telephone: string, message: string): string {
  const tel = (telephone || "").replace(/[^\d]/g, "");
  const international = tel.startsWith("221") ? tel : `221${tel}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export function formatTel(tel?: string | null): string {
  const t = (tel || "").replace(/\D/g, "");
  if (t.length === 9) return `${t.slice(0, 2)} ${t.slice(2, 5)} ${t.slice(5, 7)} ${t.slice(7, 9)}`;
  return tel || "—";
}
