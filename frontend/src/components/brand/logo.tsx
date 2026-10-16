// =====================================================================
// LOGO SUNU KEUR — SVG pur (aucune image externe)
// S or (toit gauche) + K blanc (toit droit) entrelacés = MAISON
// Deux fenêtres carrées lumineuses or au centre. Fond bleu nuit.
// =====================================================================
"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function SunuKeurMark({
  className,
  size = 48,
  animate = true
}: {
  className?: string;
  size?: number;
  animate?: boolean;
}) {
  const M = animate ? motion.svg : "svg";
  const P = animate ? motion.path : "path";
  const R = animate ? motion.rect : "rect";

  return (
    <M
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      initial={animate ? { opacity: 0, scale: 0.8 } : false}
      animate={animate ? { opacity: 1, scale: 1 } : undefined}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      role="img"
      aria-label="Logo Sunu Keur"
    >
      {/* Fond bleu nuit arrondi = la maison */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#0F172A" />

      {/* S en OR — courbe supérieure formant le toit gauche */}
      <P
        d="M40 18 C40 12, 30 10, 24 13 C17 16, 17 24, 24 27 L34 31 C41 34, 41 42, 34 45 C28 48, 18 46, 18 40"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* K en BLANC — angle droit formant le toit droit */}
      <P
        d="M44 16 L44 48 M44 32 L54 18 M44 32 L54 46"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Deux fenêtres carrées lumineuses au centre */}
      <R x="27" y="34" width="5" height="5" rx="1" fill="#F59E0B" />
      <R x="34" y="34" width="5" height="5" rx="1" fill="#F59E0B" />
    </M>
  );
}

export function SunuKeurLogo({
  className,
  size = 48,
  showText = true,
  animate = true
}: {
  className?: string;
  size?: number;
  showText?: boolean;
  animate?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <SunuKeurMark size={size} animate={animate} />
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="font-serif font-bold text-white tracking-tight" style={{ fontSize: size * 0.42 }}>
            Sunu Keur
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-emeraude-300/90 mt-1">
            Gestion locative
          </span>
        </span>
      )}
    </span>
  );
}

// Version "mark only" pour favicon / loading
export default function Logo({ size = 40 }: { size?: number }) {
  return <SunuKeurMark size={size} />;
}
