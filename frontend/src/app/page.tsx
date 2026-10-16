// =====================================================================
// LANDING PAGE — SUNU KEUR (page publique, hors groupe (dashboard))
// Navbar glass au scroll, hero lettre par lettre, mockup flottant,
// fonctionnalités, tarifs (toggle annuel), témoignages, FAQ, footer.
// =====================================================================
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Menu,
  MessageCircle,
  Quote,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X
} from "lucide-react";
import { SunuKeurLogo, SunuKeurMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { staggerItem } from "@/components/ui/motion";
import { cn, fcfa, lienWhatsApp } from "@/lib/utils";

// Contact WhatsApp affiché sur la landing (canal de vente Sunu Keur)
const CONTACT_WHATSAPP = "+221 78 157 09 24";
const LIEN_WHATSAPP = lienWhatsApp(
  CONTACT_WHATSAPP,
  "Bonjour Sunu Keur ! Je souhaite des infos sur la gestion locative (fini le cahier)."
);

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#temoignages", label: "Témoignages" },
  { href: "#faq", label: "FAQ" }
];

// ---------------------------------------------------------------------
// Grille animée au scroll (stagger déclenché quand la section est visible)
// ---------------------------------------------------------------------
function RevealGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Texte animé — par ligne entière (jamais lettre par lettre).
// La découpe en lettres inline-block cassait les mots au rendu
// (« coup » → « co / up ») et chaque lettre promue en calque GPU
// perdait le dégradé du parent (texte transparent jusqu'au repaint).
// Animation CSS pur compositeur : le texte finit toujours visible.
// ---------------------------------------------------------------------
function AnimatedText({
  text,
  className,
  delay = 0
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  return (
    <span
      className={cn("titre-anime inline-block", className)}
      style={{ animationDelay: `${delay}s` }}
    >
      {text}
    </span>
  );
}

// =====================================================================
// NAVBAR — fixe, blur qui s'intensifie au scroll
// =====================================================================
function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 16));

  return (
    <motion.header
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "border-b border-white/15 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-nuit-900/75"
          : "border-b border-transparent bg-transparent backdrop-blur-none"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Le logo porte du texte blanc : poser sur pastille nuit pour rester lisible en mode clair */}
        <Link
          href="/"
          aria-label="Sunu Keur — accueil"
          className="flex items-center rounded-2xl bg-nuit-900 px-3 py-1.5 shadow-soft"
        >
          <SunuKeurLogo size={scrolled ? 32 : 36} />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-nuit-700 transition-colors hover:text-emeraude-600 dark:text-nuit-100 dark:hover:text-emeraude-300"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Connexion
            </Button>
          </Link>
          <Link href="/onboarding">
            <Button variant="success" size="sm">
              Commencer
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="overflow-hidden border-t border-white/15 bg-white/90 backdrop-blur-xl dark:bg-nuit-900/95 md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-nuit-700 hover:bg-muted dark:text-nuit-100"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-3 flex gap-2">
                <Link href="/login" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Connexion
                  </Button>
                </Link>
                <Link href="/onboarding" className="flex-1">
                  <Button variant="success" className="w-full">
                    Commencer
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

// =====================================================================
// MOCKUP DASHBOARD — carte flottante du hero
// =====================================================================
const MOCK_KPIS = [
  { label: "Loyers encaissés", valeur: 1850000, currency: true, suffix: "", couleur: "text-emeraude-500" },
  { label: "Appartements suivis", valeur: 42, currency: false, suffix: "", couleur: "text-or-500" },
  { label: "Taux de recouvrement", valeur: 92, currency: false, suffix: " %", couleur: "text-orange-500" }
];

const MOCK_SERIE = [
  { mois: "Jan", encaisse: 68 },
  { mois: "Fév", encaisse: 74 },
  { mois: "Mar", encaisse: 71 },
  { mois: "Avr", encaisse: 83 },
  { mois: "Mai", encaisse: 88 },
  { mois: "Juin", encaisse: 94 }
];

function MockupDashboard() {
  return (
    <div className="relative">
      {/* Halo derrière la carte */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-emeraude-500/25 via-or-500/15 to-orange-500/20 blur-2xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 40, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 180, damping: 22 }}
        className="relative animate-float"
      >
        <div className="rounded-2xl border border-white/20 bg-white/95 p-5 shadow-glow backdrop-blur dark:bg-nuit-900/95">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SunuKeurMark size={26} />
              <span className="font-serif text-sm font-semibold text-nuit-900 dark:text-white">
                Tableau de bord
              </span>
            </div>
            <Badge tone="success">
              <Sparkles className="h-3 w-3" /> Aperçu
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {MOCK_KPIS.map((k) => (
              <div
                key={k.label}
                className="rounded-xl border bg-creme p-3 dark:bg-nuit-950/60"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                <p className={cn("mt-1 font-serif text-lg font-bold", k.couleur)}>
                  <CountUp to={k.valeur} currency={k.currency} suffix={k.suffix} duration={2} />
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 h-36 rounded-xl border bg-creme p-2 dark:bg-nuit-950/60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_SERIE} margin={{ top: 6, right: 4, bottom: 0, left: -26 }}>
                <defs>
                  <linearGradient id="gradLoyers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="mois"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ stroke: "#10B981", strokeDasharray: "4 4" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    fontSize: 12
                  }}
                  formatter={(v) => [`${v} %`, "Recouvrement"]}
                />
                <Area
                  type="monotone"
                  dataKey="encaisse"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fill="url(#gradLoyers)"
                  animationDuration={1800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>3 relances WhatsApp programmées</span>
            <span className="font-medium text-emeraude-500">+12 % vs mois dernier</span>
          </div>
        </div>
      </motion.div>

      {/* Pastille flottante "reçu" */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 260, damping: 18 }}
        className="absolute -left-4 -top-5 hidden animate-float rounded-xl border bg-white px-3 py-2 shadow-gold dark:bg-nuit-900 sm:block"
        style={{ animationDelay: "1.2s" }}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reçu quittance</p>
        <p className="font-serif text-sm font-bold text-or-500">{fcfa(145000)}</p>
      </motion.div>
    </div>
  );
}

// =====================================================================
// HERO
// =====================================================================
function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      {/* Décor de fond */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(245,158,11,0.12),transparent_55%)]"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <Badge tone="gold">
              <ShieldCheck className="h-3 w-3" /> Gestion locative pensée pour le Sénégal
            </Badge>
          </motion.div>

          <h1 className="font-serif text-4xl font-bold leading-[1.08] tracking-tight text-nuit-900 sm:text-5xl lg:text-6xl dark:text-white">
            <AnimatedText text="Fini le cahier." delay={0.25} />
            <br />
            <AnimatedText
              text="Tes loyers en un coup d'œil."
              className="text-gradient"
              delay={0.55}
            />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15 }}
            className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Sunu Keur suit tes appartements, encaisse les loyers par Wave ou Orange Money, relance les
            locataires sur WhatsApp et envoie des rapports clairs aux propriétaires de la diaspora.
            Sans tableur, sans oubli, sans mauvaise surprise.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link href="/onboarding">
              <Button variant="success" size="lg">
                Commencer gratuitement <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#tarifs">
              <Button variant="outline" size="lg">
                Voir les tarifs
              </Button>
            </Link>
            <a href={LIEN_WHATSAPP} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="lg">
                <MessageCircle className="h-4 w-4" /> Parler sur WhatsApp
              </Button>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.45 }}
            className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Check className="h-4 w-4 text-emeraude-500" /> Sans engagement
            <span aria-hidden="true">•</span>
            <Check className="h-4 w-4 text-emeraude-500" /> Prise en main en 10 minutes
          </motion.p>
        </div>

        <MockupDashboard />
      </div>
    </section>
  );
}

// =====================================================================
// BANDEAU DE CONFIANCE
// =====================================================================
function TrustBar() {
  const canaux = ["Wave", "Orange Money", "Free Money", "Virement", "WhatsApp", "PDF"];
  return (
    <section className="border-y border-border bg-creme py-5 dark:bg-nuit-900/40">
      <RevealGrid className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4">
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Encaisse et communique via
        </span>
        {canaux.map((c) => (
          <motion.span key={c} variants={staggerItem} className="text-sm font-semibold text-nuit-700 dark:text-nuit-100">
            {c}
          </motion.span>
        ))}
      </RevealGrid>
    </section>
  );
}

// =====================================================================
// FONCTIONNALITÉS
// =====================================================================
const FONCTIONNALITES = [
  {
    icone: Wallet,
    titre: "Encaissement des loyers",
    texte: "Enregistre chaque paiement, en une fois ou partiellement, et vois instantanément ce qui est réglé, en attente ou en retard.",
    accent: "text-emeraude-500 bg-emeraude-500/10"
  },
  {
    icone: MessageCircle,
    titre: "Relance WhatsApp",
    texte: "Des messages de relance polis et personnalisés partent avant l'échéance. Tes locataires règlent, tu ne cours plus après.",
    accent: "text-orange-500 bg-orange-500/10"
  },
  {
    icone: Globe,
    titre: "Rapports diaspora",
    texte: "Un rapport mensuel net : loyers encaissés, impayés, charges, travaux. Le propriétaire à Paris voit exactement la même chose que toi.",
    accent: "text-or-500 bg-or-500/10"
  },
  {
    icone: FileText,
    titre: "Facturation PDF",
    texte: "Quittances, factures et relevés générés en un clic, avec le logo de l'agence et un numéro unique.",
    accent: "text-sky-500 bg-sky-500/10"
  },
  {
    icone: Smartphone,
    titre: "Paiement Wave & Orange Money",
    texte: "Les références de paiement sont rapprochées automatiquement, sans ressaisie ni cahier de banque.",
    accent: "text-orange-500 bg-orange-500/10"
  },
  {
    icone: Users,
    titre: "Portail propriétaire",
    texte: "Chaque propriétaire accède à ses immeubles, ses quittances et ses dépenses. Fini les appels à minuit pour savoir où en est le loyer.",
    accent: "text-emeraude-500 bg-emeraude-500/10"
  }
];

function Fonctionnalites() {
  return (
    <section id="fonctionnalites" className="scroll-mt-24 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <RevealGrid className="mb-12 max-w-2xl">
          <motion.div variants={staggerItem}>
            <Badge tone="success">Fonctionnalités</Badge>
          </motion.div>
          <motion.h2
            variants={staggerItem}
            className="mt-4 font-serif text-3xl font-bold text-nuit-900 sm:text-4xl dark:text-white"
          >
            Tout ce que faisait le cahier, <span className="text-gradient">en mieux</span>
          </motion.h2>
          <motion.p variants={staggerItem} className="mt-4 text-muted-foreground">
            Six outils simples, pensés pour les gérants qui gèrent des immeubles à Dakar, Thiès, Saint-Louis
            ou partout ailleurs au Sénégal.
          </motion.p>
        </RevealGrid>

        <RevealGrid className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FONCTIONNALITES.map((f) => (
            <motion.article
              key={f.titre}
              variants={staggerItem}
              whileHover={{ y: -6 }}
              className="group rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-glow"
            >
              <div className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-xl", f.accent)}>
                <f.icone className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-semibold text-nuit-900 dark:text-white">{f.titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.texte}</p>
            </motion.article>
          ))}
        </RevealGrid>
      </div>
    </section>
  );
}

// =====================================================================
// TARIFS — 10.000 F/mois/immeuble, toggle annuel -20%
// =====================================================================
const PRIX_MENSUEL = 10000;
const PRIX_ANNUEL = 96000; // 12 mois − 20 %

const INCLUS = [
  "Appartements et locataires illimités",
  "Encaissements Wave, Orange Money, espèces",
  "Relances WhatsApp automatiques",
  "Quittances et factures PDF",
  "Portail propriétaire avec rapports",
  "Support par WhatsApp"
];

function Tarifs() {
  const [annuel, setAnnuel] = useState(false);

  return (
    <section id="tarifs" className="scroll-mt-24 border-y border-border bg-creme py-24 dark:bg-nuit-950/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <RevealGrid className="mx-auto mb-10 max-w-2xl text-center">
          <motion.div variants={staggerItem}>
            <Badge tone="gold">Tarifs</Badge>
          </motion.div>
          <motion.h2
            variants={staggerItem}
            className="mt-4 font-serif text-3xl font-bold text-nuit-900 sm:text-4xl dark:text-white"
          >
            Un prix clair, par immeuble
          </motion.h2>
          <motion.p variants={staggerItem} className="mt-4 text-muted-foreground">
            Pas de pourcentage sur les loyers. Pas de frais cachés. Tu sais ce que tu paies chaque mois.
          </motion.p>
        </RevealGrid>

        {/* Toggle mensuel / annuel */}
        <RevealGrid className="mb-10 flex justify-center">
          <motion.div
            variants={staggerItem}
            className="relative flex items-center rounded-full border bg-card p-1 shadow-soft"
            role="tablist"
            aria-label="Période de facturation"
          >
            <motion.span
              layout
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={cn(
                "absolute h-9 rounded-full bg-nuit-900 dark:bg-white",
                annuel ? "left-[calc(50%+2px)] w-[calc(50%-4px)]" : "left-1 w-[calc(50%-4px)]"
              )}
              aria-hidden="true"
            />
            <button
              type="button"
              role="tab"
              aria-selected={!annuel}
              onClick={() => setAnnuel(false)}
              className={cn(
                "relative z-10 h-9 w-40 rounded-full text-sm font-medium transition-colors",
                annuel ? "text-muted-foreground" : "text-white dark:text-nuit-900"
              )}
            >
              Mensuel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={annuel}
              onClick={() => setAnnuel(true)}
              className={cn(
                "relative z-10 h-9 w-40 rounded-full text-sm font-medium transition-colors",
                annuel ? "text-nuit-900" : "text-muted-foreground"
              )}
            >
              Annuel <span className="text-emeraude-500">−20 %</span>
            </button>
          </motion.div>
        </RevealGrid>

        <RevealGrid className="grid gap-6 lg:grid-cols-3">
          {/* Offre principale */}
          <motion.div
            variants={staggerItem}
            className="relative overflow-hidden rounded-3xl border-2 border-or-500/60 bg-card p-8 shadow-gold lg:col-span-2"
          >
            <div className="absolute right-0 top-0 rounded-bl-2xl bg-or-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-nuit-900">
              {annuel ? "2 mois offerts" : "Le plus choisi"}
            </div>

            <Badge tone="gold">Formule unique</Badge>
            <p className="mt-5 font-serif text-5xl font-bold text-nuit-900 dark:text-white">
              <CountUp to={annuel ? PRIX_ANNUEL : PRIX_MENSUEL} currency duration={1.1} />
              <span className="ml-2 text-lg font-medium text-muted-foreground">
                / {annuel ? "an" : "mois"}
              </span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {annuel ? (
                <>
                  Soit {fcfa(PRIX_ANNUEL / 12)} par mois, facturé une fois en {fcfa(PRIX_ANNUEL)} pour
                  l&apos;année complète.
                </>
              ) : (
                <>Par immeuble, par mois. Change de formule quand tu veux.</>
              )}
            </p>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {INCLUS.map((i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emeraude-500" />
                  {i}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/onboarding">
                <Button variant="success" size="lg">
                  Démarrer maintenant <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href={LIEN_WHATSAPP} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg">
                  <MessageCircle className="h-4 w-4" /> Poser une question
                </Button>
              </a>
            </div>
          </motion.div>

          {/* Comparaison "le cahier" */}
          <motion.div
            variants={staggerItem}
            className="rounded-3xl border bg-card p-8 shadow-soft"
          >
            <h3 className="font-serif text-xl font-bold text-nuit-900 dark:text-white">
              Le cahier coûte plus cher
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ce que coûte vraiment la gestion papier, chaque mois :
            </p>
            <ul className="mt-6 space-y-4 text-sm">
              {[
                { texte: "Des heures perdues à ressaisir les paiements", ton: "text-orange-500" },
                { texte: "Des relances oubliées et des impayés qui s'accumulent", ton: "text-orange-500" },
                { texte: "Des propriétaires qui réclament des chiffres fiables", ton: "text-orange-500" },
                { texte: "Un cahier qui peut se perdre ou s'abîmer", ton: "text-orange-500" }
              ].map((x) => (
                <li key={x.texte} className="flex items-start gap-2">
                  <X className={cn("mt-0.5 h-4 w-4 shrink-0", x.ton)} />
                  <span className="text-muted-foreground">{x.texte}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl bg-emeraude-500/10 p-4 text-sm font-medium text-emeraude-600 dark:text-emeraude-300">
              {fcfa(PRIX_MENSUEL)} par mois : un loyer réglé, et toute ta gestion est faite.
            </p>
          </motion.div>
        </RevealGrid>
      </div>
    </section>
  );
}

// =====================================================================
// TÉMOIGNAGES — carrousel automatique
// =====================================================================
const TEMOIGNAGES = [
  {
    nom: "Aïssatou Ndiaye",
    role: "Gérante d'immeubles — Dakar",
    texte:
      "Avant, je passais mes dimanches sur le cahier et mes lundis au téléphone. Là, je vois en un écran qui a payé, qui ne l'a pas fait, et les relances partent toutes seules.",
    initiales: "AN"
  },
  {
    nom: "Mamadou Ba",
    role: "Propriétaire — diaspora, Paris",
    texte:
      "Je possède trois immeubles à Pikine et je vis en France. Chaque mois je reçois mon rapport : loyers encaissés, charges, travaux. Je n'ai plus à appeler mon gérant pour savoir où en est l'argent.",
    initiales: "MB"
  },
  {
    nom: "Fatou Sow",
    role: "Gérante — Thiès",
    texte:
      "Les quittances PDF, mes locataires adorent. Et le portail propriétaire a calmé tout le monde : chacun voit ses comptes sans me réclamer des photocopies du cahier.",
    initiales: "FS"
  }
];

function Temoignages() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const aller = (delta: number) => {
    setDirection(delta);
    setIndex((i) => (i + delta + TEMOIGNAGES.length) % TEMOIGNAGES.length);
  };

  useEffect(() => {
    const id = window.setInterval(() => aller(1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const t = TEMOIGNAGES[index];

  return (
    <section id="temoignages" className="scroll-mt-24 py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <RevealGrid className="mb-10 text-center">
          <motion.div variants={staggerItem}>
            <Badge tone="info">Témoignages</Badge>
          </motion.div>
          <motion.h2
            variants={staggerItem}
            className="mt-4 font-serif text-3xl font-bold text-nuit-900 sm:text-4xl dark:text-white"
          >
            Ils ont fermé le cahier
          </motion.h2>
        </RevealGrid>

        <div className="relative">
          <div className="relative min-h-[280px] sm:min-h-[240px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.figure
                key={index}
                custom={direction}
                initial={{ opacity: 0, x: direction * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -60 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="rounded-3xl border bg-card p-8 shadow-soft sm:p-10"
              >
                <Quote className="h-8 w-8 text-or-500" />
                <blockquote className="mt-4 font-serif text-lg leading-relaxed text-nuit-900 sm:text-xl dark:text-white">
                  « {t.texte} »
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-nuit-900 font-serif text-sm font-bold text-or-500 dark:bg-or-500 dark:text-nuit-900">
                    {t.initiales}
                  </span>
                  <span>
                    <span className="block font-semibold text-nuit-900 dark:text-white">{t.nom}</span>
                    <span className="block text-sm text-muted-foreground">{t.role}</span>
                  </span>
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          </div>

          {/* Flèches */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" aria-label="Témoignage précédent" onClick={() => aller(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2">
              {TEMOIGNAGES.map((item, i) => (
                <button
                  key={item.nom}
                  type="button"
                  aria-label={`Voir le témoignage de ${item.nom}`}
                  aria-current={i === index}
                  onClick={() => {
                    setDirection(i > index ? 1 : -1);
                    setIndex(i);
                  }}
                  className={cn(
                    "h-2.5 rounded-full transition-all duration-300",
                    i === index ? "w-7 bg-emeraude-500" : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  )}
                />
              ))}
            </div>

            <Button variant="outline" size="icon" aria-label="Témoignage suivant" onClick={() => aller(1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// FAQ — accordéon (une seule question ouverte)
// =====================================================================
const FAQ = [
  {
    q: "Combien coûte Sunu Keur ?",
    r: "10 000 F CFA par mois et par immeuble, ou 96 000 F CFA par an (2 mois offerts). Tout est inclus : locataires illimités, encaissements, relances WhatsApp, quittances PDF et portail propriétaire. Aucun pourcentage prélevé sur tes loyers."
  },
  {
    q: "Mes locataires doivent-ils installer une application ?",
    r: "Non. Les locataires reçoivent leurs relances et quittances par WhatsApp, comme d'habitude. Ils n'ont rien à installer et rien à créer."
  },
  {
    q: "Comment sont encaissés les paiements ?",
    r: "Tu enregistres les règlements en espèces, Wave, Orange Money, Free Money ou virement. Chaque paiement est rattaché au loyer du mois concerné, avec un historique complet et des quittances générées automatiquement."
  },
  {
    q: "Et les propriétaires qui vivent à l'étranger ?",
    r: "Chaque propriétaire dispose d'un accès à son portail : loyers encaissés, impayés, charges et travaux, mois par mois. Il voit exactement les mêmes chiffres que toi, à chaque instant."
  },
  {
    q: "Je gère encore sur cahier, comment je reprends mes données ?",
    r: "Pendant l'onboarding, tu ajoutes tes immeubles, tes appartements et tes locataires en quelques minutes. Notre équipe t'accompagne par WhatsApp si tu préfères ne pas le faire seul."
  },
  {
    q: "Puis-je arrêter quand je veux ?",
    r: "Oui, l'abonnement est sans engagement. Tu peux cesser à la fin de la période en cours et récupérer tes données (locataires, loyers, historiques) à tout moment."
  }
];

function Faq() {
  const [ouvert, setOuvert] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 border-t border-border bg-creme py-24 dark:bg-nuit-950/60">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <RevealGrid className="mb-10 text-center">
          <motion.div variants={staggerItem}>
            <Badge tone="neutral">FAQ</Badge>
          </motion.div>
          <motion.h2
            variants={staggerItem}
            className="mt-4 font-serif text-3xl font-bold text-nuit-900 sm:text-4xl dark:text-white"
          >
            Questions fréquentes
          </motion.h2>
        </RevealGrid>

        <RevealGrid className="space-y-3">
          {FAQ.map((item, i) => {
            const open = ouvert === i;
            return (
              <motion.div key={item.q} variants={staggerItem} className="overflow-hidden rounded-2xl border bg-card shadow-soft">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOuvert(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-serif font-semibold text-nuit-900 dark:text-white">{item.q}</span>
                  <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className={cn("h-5 w-5", open ? "text-emeraude-500" : "text-muted-foreground")} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.r}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </RevealGrid>
      </div>
    </section>
  );
}

// =====================================================================
// CTA WHATSAPP + FOOTER
// =====================================================================
function CtaFinal() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className="relative overflow-hidden rounded-3xl bg-nuit-900 p-10 text-center shadow-glow sm:p-14"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.22),transparent_60%)]"
          />
          <Building2 className="mx-auto h-10 w-10 text-or-500" />
          <h2 className="mt-5 font-serif text-3xl font-bold text-white sm:text-4xl">
            Prêt à fermer le cahier ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-nuit-200">
            Crée ton espace en quelques minutes, ajoute ton premier immeuble et suis ton premier loyer
            encaissé aujourd&apos;hui.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding">
              <Button variant="gold" size="lg">
                Créer mon espace <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href={LIEN_WHATSAPP} target="_blank" rel="noopener noreferrer">
              <Button variant="success" size="lg">
                <MessageCircle className="h-4 w-4" /> Parler sur WhatsApp
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-nuit-900 py-14 text-nuit-200">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <SunuKeurLogo size={44} />
          <p className="mt-4 max-w-sm text-sm text-nuit-300">
            La gestion locative sénégalaise, sans cahier : encaissements, relances, rapports et portail
            propriétaire dans un seul outil.
          </p>
          <p className="mt-4 font-serif text-sm text-or-500">Sunu Keur — Fini le cahier.</p>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white">Produit</p>
          <ul className="space-y-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="transition-colors hover:text-emeraude-300">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white">Compte</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/login" className="transition-colors hover:text-emeraude-300">
                Connexion
              </Link>
            </li>
            <li>
              <Link href="/signup" className="transition-colors hover:text-emeraude-300">
                Créer un compte
              </Link>
            </li>
            <li>
              <Link href="/onboarding" className="transition-colors hover:text-emeraude-300">
                Je suis gérant
              </Link>
            </li>
            <li>
              <a href={LIEN_WHATSAPP} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-emeraude-300">
                Support WhatsApp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-6xl border-t border-white/10 px-4 pt-6 text-xs text-nuit-400 sm:px-6">
        © {new Date().getFullYear()} Sunu Keur — Tous droits réservés.
      </div>
    </footer>
  );
}

// =====================================================================
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-creme dark:bg-nuit-950">
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <Fonctionnalites />
        <Tarifs />
        <Temoignages />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}
