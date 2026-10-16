// =====================================================================
// TABLEAU DE BORD GÉRANT — KPIs, graphe 12 mois, donut, activité
// Données 100 % Supabase (aucune valeur figée en dur)
// =====================================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  RefreshCw,
  Wallet,
  Wrench
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { Stagger, staggerItem } from "@/components/ui/motion";
import { MOIS_COURTS, cn, fcfa, fcfaCompact, nomMois } from "@/lib/utils";

// ---------------------------------------------------------------------
// TYPES LIGNES (miroir du schéma PostgreSQL)
// ---------------------------------------------------------------------
type StatutLoyer = "paye" | "impaye" | "partiel";

interface ImmeubleRow {
  id: string;
  nom: string;
  adresse: string;
  ville: string;
  nombre_appartements: number;
}

interface AppartementRow {
  id: string;
  numero: string;
  statut: "occupe" | "vacant";
  loyer_mensuel: number;
}

interface LoyerRow {
  id: string;
  appartement_id: string;
  mois: string;
  montant: number;
  montant_paye: number;
  statut: StatutLoyer;
  date_echeance: string | null;
  created_at: string;
  updated_at: string;
}

interface ChargeRow {
  id: string;
  libelle: string;
  montant_total: number;
  date: string;
}

interface TravauxRow {
  id: string;
  titre: string;
  cout: number;
  created_at: string;
}

interface ActiviteRow {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

interface PaiementRow {
  id: string;
  montant: number;
  methode: string;
  statut: string;
  created_at: string;
}

interface Evenement {
  id: string;
  date: string;
  titre: string;
  message: string;
}

// ---------------------------------------------------------------------
// HELPERS DATES / NOMBRES
// ---------------------------------------------------------------------
const METHODES: Record<string, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  free_money: "Free Money",
  especes: "Espèces",
  virement: "Virement",
  cheque: "Chèque"
};

const LIBELLES_STATUT: Record<StatutLoyer, string> = {
  paye: "Payé",
  partiel: "Partiel",
  impaye: "Impayé"
};

const COULEURS_STATUT: Record<StatutLoyer, string> = {
  paye: "#10B981",
  partiel: "#F59E0B",
  impaye: "#F97316"
};

function nombre(valeur: unknown): number {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function premierJourMois(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function ajouterMois(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function isoJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoMois(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function variation(actuel: number, precedent: number): number | null {
  if (!precedent) return null;
  return ((actuel - precedent) / precedent) * 100;
}

function estEchue(loyer: LoyerRow, dujour: string): boolean {
  if (loyer.date_echeance) return loyer.date_echeance.slice(0, 10) <= dujour;
  const d = new Date(loyer.mois);
  const dernierJour = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return isoJour(dernierJour) <= dujour;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ---------------------------------------------------------------------
// COMPOSANTS AIDE
// ---------------------------------------------------------------------
function Squelette({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-muted/70", className)}>
      <motion.span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10"
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function PuceVariation({ valeur, bonSens }: { valeur: number | null; bonSens: "hausse" | "baisse" }) {
  if (valeur === null) return <Badge tone="neutral">Premier mois</Badge>;
  const haussier = valeur >= 0;
  const favorable = bonSens === "hausse" ? haussier : !haussier;
  const Icone = haussier ? ArrowUpRight : ArrowDownRight;
  return (
    <Badge tone={favorable ? "success" : "danger"}>
      <Icone className="h-3 w-3" />
      {haussier ? "+" : ""}
      {Math.round(valeur)} %
    </Badge>
  );
}

function LienBouton({
  href,
  children,
  variante = "succes",
  className
}: {
  href: string;
  children: React.ReactNode;
  variante?: "succes" | "outline";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variante === "succes"
          ? "bg-emeraude-500 text-white shadow-glow hover:bg-emeraude-600"
          : "border border-border text-foreground hover:bg-muted",
        className
      )}
    >
      {children}
    </Link>
  );
}

function CarteKpi({
  label,
  valeur,
  note,
  icone: Icone,
  fondIcone,
  traitIcone,
  indicateur,
  pourcent = false
}: {
  label: string;
  valeur: number;
  note: string;
  icone: React.ComponentType<{ className?: string }>;
  fondIcone: string;
  traitIcone: string;
  indicateur: React.ReactNode;
  pourcent?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", fondIcone)}>
          <Icone className={cn("h-5 w-5", traitIcone)} />
        </span>
        {indicateur}
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-3xl font-bold tracking-tight">
        <CountUp to={valeur} currency={!pourcent} suffix={pourcent ? "%" : ""} />
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  fontSize: 12,
  boxShadow: "0 10px 30px -12px rgba(15,23,42,0.35)"
};

// ---------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------
export default function DashboardPage() {
  const { user, role, loading: chargementAuth } = useAuth();

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [immeubles, setImmeubles] = useState<ImmeubleRow[]>([]);
  const [appartements, setAppartements] = useState<AppartementRow[]>([]);
  const [loyers, setLoyers] = useState<LoyerRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [travaux, setTravaux] = useState<TravauxRow[]>([]);
  const [activites, setActivites] = useState<ActiviteRow[]>([]);
  const [paiements, setPaiements] = useState<PaiementRow[]>([]);

  const charger = useCallback(async (uid: string) => {
    setChargement(true);
    setErreur(null);
    const supabase = getSupabaseBrowser();

    let requeteImmeubles = supabase
      .from("immeubles")
      .select("id, nom, adresse, ville, nombre_appartements");
    if (role === "proprietaire") requeteImmeubles = requeteImmeubles.eq("proprietaire_id", uid);
    else if (role !== "super_admin") requeteImmeubles = requeteImmeubles.eq("gerant_id", uid);
    const { data: lignesImmeubles, error: errImmeuble } = await requeteImmeubles.order("created_at", {
      ascending: true
    });

    if (errImmeuble) {
      setImmeubles([]);
      setErreur("Impossible de charger vos immeubles. Réessayez dans un instant.");
      setChargement(false);
      return;
    }

    const listeImmeubles = (lignesImmeubles ?? []) as ImmeubleRow[];
    const ids = listeImmeubles.map((immeuble) => immeuble.id);
    setImmeubles(listeImmeubles);

    if (!ids.length) {
      setAppartements([]);
      setLoyers([]);
      setCharges([]);
      setTravaux([]);
      setActivites([]);
      setPaiements([]);
      setChargement(false);
      return;
    }

    const ref = premierJourMois(new Date());
    const debutPrecedent = ajouterMois(ref, -1);
    const debutSuivant = ajouterMois(ref, 1);

    const [resAppartements, resLoyers, resCharges, resTravaux, resActivites, resPaiements] =
      await Promise.all([
        supabase
          .from("appartements")
          .select("id, numero, statut, loyer_mensuel")
          .in("immeuble_id", ids)
          .order("numero", { ascending: true }),
        supabase
          .from("loyers")
          .select(
            "id, appartement_id, mois, montant, montant_paye, statut, date_echeance, created_at, updated_at, appartements!inner(immeuble_id)"
          )
          .in("appartements.immeuble_id", ids)
          .order("mois", { ascending: true }),
        supabase
          .from("factures_communes")
          .select("id, libelle, montant_total, date")
          .in("immeuble_id", ids)
          .gte("date", isoJour(debutPrecedent))
          .lt("date", isoJour(debutSuivant)),
        supabase
          .from("travaux")
          .select("id, titre, cout, created_at")
          .in("immeuble_id", ids)
          .gte("created_at", debutPrecedent.toISOString())
          .lt("created_at", debutSuivant.toISOString()),
        supabase
          .from("activites")
          .select("id, type, message, created_at")
          .in("immeuble_id", ids)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("paiements")
          .select(
            "id, montant, methode, statut, created_at, loyers!inner(appartement_id, appartements!inner(immeuble_id))"
          )
          .in("loyers.appartements.immeuble_id", ids)
          .order("created_at", { ascending: false })
          .limit(8)
      ]);

    const echecMajeur =
      resAppartements.error || resLoyers.error || resCharges.error || resTravaux.error;
    if (echecMajeur) setErreur("Certaines données n'ont pas pu être chargées.");

    setAppartements((resAppartements.data ?? []) as AppartementRow[]);
    setLoyers((resLoyers.data ?? []) as LoyerRow[]);
    setCharges((resCharges.data ?? []) as ChargeRow[]);
    setTravaux((resTravaux.data ?? []) as TravauxRow[]);
    setActivites((resActivites.data ?? []) as ActiviteRow[]);
    setPaiements((resPaiements.data ?? []) as PaiementRow[]);
    setChargement(false);
  }, [role]);

  useEffect(() => {
    if (user) {
      charger(user.id);
    } else if (!chargementAuth) {
      setChargement(false);
      setImmeubles([]);
    }
  }, [user, chargementAuth, charger]);

  // ---------------- DÉRIVÉS ----------------
  const { moisCourant, moisPrecedent, aujourdhui } = useMemo(() => {
    const now = new Date();
    const courant = premierJourMois(now);
    return {
      moisCourant: courant,
      moisPrecedent: ajouterMois(courant, -1),
      aujourdhui: now.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    };
  }, []);

  const kpis = useMemo(() => {
    const cleCourant = isoMois(moisCourant);
    const clePrecedent = isoMois(moisPrecedent);
    const duMois = loyers.filter((l) => l.mois.slice(0, 7) === cleCourant);
    const duMoisPrecedent = loyers.filter((l) => l.mois.slice(0, 7) === clePrecedent);

    const encaisse = duMois.reduce((s, l) => s + nombre(l.montant_paye), 0);
    const encaissePrecedent = duMoisPrecedent.reduce((s, l) => s + nombre(l.montant_paye), 0);
    const attendu = duMois.reduce((s, l) => s + nombre(l.montant), 0);

    const dujour = isoJour(new Date());
    const retards = loyers.filter((l) => l.statut === "impaye" && estEchue(l, dujour));
    const montantRetard = retards.reduce(
      (s, l) => s + Math.max(0, nombre(l.montant) - nombre(l.montant_paye)),
      0
    );

    const total = appartements.length;
    const occupes = appartements.filter((a) => a.statut === "occupe").length;

    const chargesCourantes = charges
      .filter((c) => c.date.slice(0, 7) === cleCourant)
      .reduce((s, c) => s + nombre(c.montant_total), 0);
    const chargesPrecedentes = charges
      .filter((c) => c.date.slice(0, 7) === clePrecedent)
      .reduce((s, c) => s + nombre(c.montant_total), 0);
    const travauxCourants = travaux
      .filter((t) => t.created_at.slice(0, 7) === cleCourant)
      .reduce((s, t) => s + nombre(t.cout), 0);
    const travauxPrecedents = travaux
      .filter((t) => t.created_at.slice(0, 7) === clePrecedent)
      .reduce((s, t) => s + nombre(t.cout), 0);

    return {
      encaisse,
      variationEncaisse: variation(encaisse, encaissePrecedent),
      attendu,
      recouvrement: attendu ? Math.round((encaisse / attendu) * 100) : 0,
      retard: montantRetard,
      nbRetards: retards.length,
      taux: total ? Math.round((occupes / total) * 100) : 0,
      occupes,
      vacants: total - occupes,
      total,
      depenses: chargesCourantes + travauxCourants,
      variationDepenses: variation(chargesCourantes + travauxCourants, chargesPrecedentes + travauxPrecedents)
    };
  }, [loyers, appartements, charges, travaux, moisCourant, moisPrecedent]);

  const serie12 = useMemo(() => {
    const points: { label: string; encaisse: number; attendu: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = ajouterMois(moisCourant, -i);
      const cle = isoMois(d);
      let encaisse = 0;
      let attendu = 0;
      for (const l of loyers) {
        if (l.mois.slice(0, 7) !== cle) continue;
        encaisse += nombre(l.montant_paye);
        attendu += nombre(l.montant);
      }
      points.push({
        label: `${MOIS_COURTS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        encaisse,
        attendu
      });
    }
    return points;
  }, [loyers, moisCourant]);

  const donut = useMemo(() => {
    const compte: Record<StatutLoyer, number> = { paye: 0, impaye: 0, partiel: 0 };
    for (const l of loyers) compte[l.statut] += 1;
    return (["paye", "partiel", "impaye"] as StatutLoyer[])
      .filter((cle) => compte[cle] > 0)
      .map((cle) => ({
        name: LIBELLES_STATUT[cle],
        value: compte[cle],
        couleur: COULEURS_STATUT[cle]
      }));
  }, [loyers]);

  const timeline = useMemo<Evenement[]>(() => {
    if (activites.length > 0) {
      return activites
        .slice(0, 8)
        .map((a) => ({ id: a.id, date: a.created_at, titre: a.type, message: a.message }));
    }

    // Repli : journal déduit des derniers paiements / loyers / factures
    const items: Evenement[] = [];
    for (const p of paiements) {
      items.push({
        id: `paiement-${p.id}`,
        date: p.created_at,
        titre: p.statut === "confirme" ? "Paiement confirmé" : "Paiement enregistré",
        message: `${fcfa(nombre(p.montant))} — ${METHODES[p.methode] ?? p.methode}`
      });
    }
    for (const l of loyers) {
      if (nombre(l.montant_paye) <= 0) continue;
      items.push({
        id: `loyer-${l.id}`,
        date: l.updated_at || l.created_at,
        titre: "Loyer encaissé",
        message: `${nomMois(l.mois)} — ${fcfa(nombre(l.montant_paye))}`
      });
    }
    for (const c of charges) {
      items.push({
        id: `charge-${c.id}`,
        date: c.date,
        titre: "Facture commune",
        message: `${c.libelle} — ${fcfa(nombre(c.montant_total))}`
      });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [activites, paiements, loyers, charges]);

  const prenom = (user?.nom || "").split(" ")[0] || "à vous";

  // ---------------- CHARGEMENT ----------------
  if (chargement || chargementAuth) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Squelette className="h-4 w-40" />
          <Squelette className="h-9 w-72" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Squelette key={i} className="h-44" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-5">
          <Squelette className="h-[340px] lg:col-span-3" />
          <Squelette className="h-[340px] lg:col-span-2" />
        </div>
        <Squelette className="h-64" />
      </div>
    );
  }

  // ---------------- NON AUTHENTIFIÉ ----------------
  if (!user) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-10 text-center shadow-soft">
        <h1 className="font-serif text-2xl font-bold">Connexion requise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connectez-vous pour consulter vos indicateurs de gestion.
        </p>
        <div className="mt-6 flex justify-center">
          <LienBouton href="/">Retour à l'accueil</LienBouton>
        </div>
      </div>
    );
  }

  // ---------------- ERREUR DE CHARGEMENT ----------------
  if (erreur && immeubles.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-10 text-center shadow-soft">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/15">
          <AlertTriangle className="h-7 w-7 text-orange-500" />
        </span>
        <h1 className="mt-4 font-serif text-2xl font-bold">Oups, un souci réseau</h1>
        <p className="mt-2 text-sm text-muted-foreground">{erreur}</p>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => charger(user.id)}>
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // ---------------- AUCUN IMMEUBLE ----------------
  if (!immeubles.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 24 }}
        className="mx-auto mt-14 max-w-2xl rounded-2xl border bg-card p-10 text-center shadow-soft"
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emeraude-500/15">
          <Building2 className="h-8 w-8 text-emeraude-500" />
        </span>
        <h1 className="mt-5 font-serif text-3xl font-bold">Commencez par votre premier immeuble</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Renseignez votre agence, déclarez votre immeuble et invitez vos propriétaires : vos loyers,
          vos encaissements et vos indicateurs s'afficheront ici automatiquement.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <LienBouton href="/onboarding">Lancer la configuration</LienBouton>
          <LienBouton href="/loyers" variante="outline">
            Voir mes loyers
          </LienBouton>
        </div>
      </motion.div>
    );
  }

  const sansLoyers = loyers.length === 0;
  const villes = Array.from(new Set(immeubles.map((immeuble) => immeuble.ville).filter(Boolean)));
  const porteeImmeubles =
    immeubles.length === 1
      ? `${immeubles[0].nom} · ${immeubles[0].adresse}, ${immeubles[0].ville}`
      : villes.length
        ? `${immeubles.length} immeubles · ${villes.join(", ")}`
        : `${immeubles.length} immeubles`;

  return (
    <div className="space-y-6">
      {/* ---------- EN-TÊTE ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emeraude-600 dark:text-emeraude-300">
            {aujourdhui}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">Bonjour, {prenom}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {porteeImmeubles}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {erreur && (
            <Badge tone="warning">
              <AlertTriangle className="h-3 w-3" /> Données partielles
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => charger(user.id)}>
            <RefreshCw className="h-4 w-4" /> Actualiser
          </Button>
          <LienBouton href="/loyers" variante="outline">
            Mes loyers
          </LienBouton>
        </div>
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CarteKpi
          label="Encaissé du mois"
          valeur={kpis.encaisse}
          note={`Attendu : ${fcfa(kpis.attendu)} — recouvrement ${kpis.recouvrement} %`}
          icone={Wallet}
          fondIcone="bg-emeraude-500/15"
          traitIcone="text-emeraude-500"
          indicateur={<PuceVariation valeur={kpis.variationEncaisse} bonSens="hausse" />}
        />
        <CarteKpi
          label="En retard"
          valeur={kpis.retard}
          note={
            kpis.nbRetards > 0
              ? `${kpis.nbRetards} loyer(s) échu(s) en attente de règlement`
              : "Aucun loyer échu impayé"
          }
          icone={AlertTriangle}
          fondIcone="bg-orange-500/15"
          traitIcone="text-orange-500"
          indicateur={<Badge tone={kpis.nbRetards > 0 ? "danger" : "success"}>{kpis.nbRetards} loyer(s)</Badge>}
        />
        <CarteKpi
          label="Taux d'occupation"
          valeur={kpis.taux}
          pourcent
          note={`${kpis.occupes} occupé(s) · ${kpis.vacants} vacant(s) sur ${kpis.total} appartement(s)`}
          icone={Building2}
          fondIcone="bg-or-500/15"
          traitIcone="text-or-500"
          indicateur={
            <Badge tone={kpis.taux >= 80 ? "success" : kpis.taux >= 50 ? "gold" : "warning"}>
              {kpis.total} appart.
            </Badge>
          }
        />
        <CarteKpi
          label="Dépenses du mois"
          valeur={kpis.depenses}
          note="Factures communes + travaux du mois en cours"
          icone={Wrench}
          fondIcone="bg-nuit-900/10 dark:bg-white/10"
          traitIcone="text-nuit-900 dark:text-white"
          indicateur={<PuceVariation valeur={kpis.variationDepenses} bonSens="baisse" />}
        />
      </div>

      {/* ---------- GRAPHIQUES ---------- */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle>Encaissé vs attendu — 12 derniers mois</CardTitle>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emeraude-500" /> Encaissé
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-or-500" /> Attendu
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {sansLoyers ? (
              <div className="flex h-[280px] flex-col items-center justify-center text-center">
                <Activity className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                  Aucun loyer enregistré pour l'instant : ajoutez votre premier loyer pour voir
                  l'évolution sur douze mois.
                </p>
                <div className="mt-4">
                  <LienBouton href="/loyers" variante="outline">
                    Ajouter un loyer
                  </LienBouton>
                </div>
              </div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie12} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradEncaisse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradAttendu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => fcfaCompact(Number(v))}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "4 4" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v) => fcfa(Number(v))}
                    />
                    <Area
                      type="monotone"
                      dataKey="attendu"
                      name="Attendu"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      fill="url(#gradAttendu)"
                    />
                    <Area
                      type="monotone"
                      dataKey="encaisse"
                      name="Encaissé"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fill="url(#gradEncaisse)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Statuts des loyers</CardTitle>
            <p className="text-sm text-muted-foreground">Répartition sur tous les loyers de vos immeubles</p>
          </CardHeader>
          <CardContent>
            {donut.length === 0 ? (
              <div className="flex h-[240px] flex-col items-center justify-center text-center">
                <Wallet className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 max-w-[220px] text-sm text-muted-foreground">
                  Aucun loyer à répartir pour le moment.
                </p>
                <div className="mt-4">
                  <LienBouton href="/loyers" variante="outline">
                    Créer mes loyers
                  </LienBouton>
                </div>
              </div>
            ) : (
              <>
                <div className="relative h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donut}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="none"
                        isAnimationActive
                      >
                        {donut.map((entry) => (
                          <Cell key={entry.name} fill={entry.couleur} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v} loyer(s)`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-serif text-2xl font-bold">{loyers.length}</span>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      loyers
                    </span>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {donut.map((entry) => (
                    <li key={entry.name} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: entry.couleur }}
                      />
                      <span className="flex-1 text-muted-foreground">{entry.name}</span>
                      <span className="font-medium tabular-nums">{entry.value}</span>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {Math.round((entry.value / loyers.length) * 100)} %
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- ACTIVITÉ ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Activité récente</CardTitle>
          <p className="text-sm text-muted-foreground">
            Les dernières opérations enregistrées sur vos immeubles
          </p>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune activité pour le moment — tout se mettra à jour dès le premier paiement.
            </p>
          ) : (
            <Stagger className="space-y-1">
              {timeline.map((evt) => (
                <motion.div key={evt.id} variants={staggerItem} className="relative flex gap-4 pb-5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraude-500/50" />
                      <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-emeraude-500 bg-card" />
                    </span>
                    <span className="mt-1 w-px flex-1 bg-border" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <p className="truncate text-sm font-semibold">{evt.titre}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{dateCourte(evt.date)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-sm text-muted-foreground">{evt.message}</p>
                  </div>
                </motion.div>
              ))}
            </Stagger>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
