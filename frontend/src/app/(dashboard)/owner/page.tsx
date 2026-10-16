"use client";

// =====================================================================
// PORTAIL PROPRIÉTAIRE (DIASPORA) — LECTURE SEULE
// Immeubles, taux d'occupation, NET À REVERSER, graphique, rapports
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Home,
  Landmark,
  Send,
  TrendingDown,
  TrendingUp,
  Users
} from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { donneesRapport } from "@/lib/documents";
import { useAuth } from "@/components/providers/auth-provider";
import type { Appartement, FactureCommune, Immeuble, Loyer, Travaux } from "@/lib/types";
import { MOIS_COURTS, fcfa, fcfaCompact } from "@/lib/utils";
import { ERREUR_BACKEND, diriger, genererDocument, nouvelleFenetre } from "@/lib/paiements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { Modal } from "@/components/ui/modal";
import { ProgressBar } from "@/components/ui/progress";
import { Stagger, staggerItem } from "@/components/ui/motion";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Alerte, EcranAcces, EcranChargement } from "../_components/ecrans";
import type { EtatMessage } from "../_components/ecrans";

// Aucun pourcentage n'est prélevé sur les loyers (abonnement forfaitaire) :
// le net à reverser au propriétaire est donc simplement encaissé − dépenses,
// ce qui correspond aussi au calcul du rapport backend (kpis.net).

const PERIODES = [
  { valeur: 1, libelle: "Mois en cours" },
  { valeur: 3, libelle: "3 derniers mois" },
  { valeur: 6, libelle: "6 derniers mois" },
  { valeur: 12, libelle: "12 derniers mois" }
];

function cleDe(date?: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface LigneGraphique {
  mois: string;
  encaissements: number;
  depenses: number;
}

interface ResumeImmeuble {
  immeuble: Immeuble;
  total: number;
  occupes: number;
  encaisse: number;
}

export default function PageProprietaire() {
  const { user, role, loading: chargementAuth } = useAuth();
  const supabase = getSupabaseBrowser();

  const [immeubles, setImmeubles] = useState<Immeuble[]>([]);
  const [appartements, setAppartements] = useState<Appartement[]>([]);
  const [loyers, setLoyers] = useState<Loyer[]>([]);
  const [facturesCommunes, setFacturesCommunes] = useState<FactureCommune[]>([]);
  const [travaux, setTravaux] = useState<Travaux[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<EtatMessage>(null);

  const [periodeMois, setPeriodeMois] = useState(6);
  const [immeubleChoisi, setImmeubleChoisi] = useState("tous");
  const [rapportEnCours, setRapportEnCours] = useState<string | null>(null);

  const [virementOuvert, setVirementOuvert] = useState(false);
  const [virementMontant, setVirementMontant] = useState("");
  const [virementCoordonnees, setVirementCoordonnees] = useState("");
  const [virementEnCours, setVirementEnCours] = useState(false);
  const [virementEnvoye, setVirementEnvoye] = useState(false);
  const [virementErreur, setVirementErreur] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // CHARGEMENT — immeubles du propriétaire + données liées
  // -----------------------------------------------------------------
  const charger = useCallback(async () => {
    if (!user) return;
    setChargement(true);
    setErreur(null);

    try {
      const { data: immeublesData, error: errImmeubles } = await supabase
        .from("immeubles")
        .select("*")
        .eq("proprietaire_id", user.id)
        .order("nom");
      if (errImmeubles) throw new Error(`Immeubles : ${errImmeubles.message}`);

      const listeImmeubles = (immeublesData ?? []) as Immeuble[];
      const idsImmeubles = listeImmeubles.map((i) => i.id);

      let listeAppartements: Appartement[] = [];
      let listeLoyers: Loyer[] = [];
      let listeFactures: FactureCommune[] = [];
      let listeTravaux: Travaux[] = [];

      if (idsImmeubles.length) {
        const { data: appartementsData, error: errAppartements } = await supabase
          .from("appartements")
          .select("*, immeubles(id, nom)")
          .in("immeuble_id", idsImmeubles);
        if (errAppartements) throw new Error(`Appartements : ${errAppartements.message}`);
        listeAppartements = (appartementsData ?? []) as Appartement[];

        const idsAppartements = listeAppartements.map((a) => a.id);

        const [loyersRes, facturesRes, travauxRes] = await Promise.all([
          idsAppartements.length
            ? supabase.from("loyers").select("*").in("appartement_id", idsAppartements).order("mois", { ascending: false }).limit(1200)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("factures_communes").select("*").in("immeuble_id", idsImmeubles).limit(600),
          supabase.from("travaux").select("*").in("immeuble_id", idsImmeubles).limit(600)
        ]);

        if (loyersRes.error) throw new Error(`Loyers : ${loyersRes.error.message}`);
        if (facturesRes.error) throw new Error(`Factures communes : ${facturesRes.error.message}`);
        if (travauxRes.error) throw new Error(`Travaux : ${travauxRes.error.message}`);

        listeLoyers = (loyersRes.data ?? []) as Loyer[];
        listeFactures = (facturesRes.data ?? []) as FactureCommune[];
        listeTravaux = (travauxRes.data ?? []) as Travaux[];
      }

      setImmeubles(listeImmeubles);
      setAppartements(listeAppartements);
      setLoyers(listeLoyers);
      setFacturesCommunes(listeFactures);
      setTravaux(listeTravaux);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue lors du chargement.");
    } finally {
      setChargement(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    charger();
  }, [charger]);

  // -----------------------------------------------------------------
  // CALCULS (net à reverser = encaissé − dépenses — aucun pourcentage prélevé)
  // -----------------------------------------------------------------
  const idsFiltres = useMemo(() => {
    if (immeubleChoisi === "tous") return new Set(immeubles.map((i) => i.id));
    return new Set([immeubleChoisi]);
  }, [immeubles, immeubleChoisi]);

  const { debutPeriode, finPeriode, cles } = useMemo(() => {
    const maintenant = new Date();
    const fin = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 0));
    const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - (periodeMois - 1), 1));
    const liste: string[] = [];
    for (let i = 0; i < periodeMois; i++) {
      const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + i, 1));
      liste.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return { debutPeriode: debut, finPeriode: fin, cles: liste };
  }, [periodeMois]);

  const dansPeriode = useCallback(
    (date?: string | null) => {
      if (!date) return false;
      const temps = new Date(date).getTime();
      if (Number.isNaN(temps)) return false;
      return temps >= debutPeriode.getTime() && temps <= finPeriode.getTime() + 86_400_000;
    },
    [debutPeriode, finPeriode]
  );

  const resume = useMemo(() => {
    const immeubleParAppartement = new Map(appartements.map((a) => [a.id, a.immeuble_id] as const));

    const loyersPeriode = loyers.filter(
      (l) => idsFiltres.has(immeubleParAppartement.get(l.appartement_id) ?? "") && dansPeriode(l.mois)
    );
    const encaisse = loyersPeriode.reduce((s, l) => s + Number(l.montant_paye || 0), 0);

    const facturesPeriode = facturesCommunes.filter((f) => idsFiltres.has(f.immeuble_id) && dansPeriode(f.date));
    const travauxPeriode = travaux.filter((t) =>
      idsFiltres.has(t.immeuble_id) && dansPeriode(t.date_debut ?? t.created_at)
    );
    const depensesFactures = facturesPeriode.reduce((s, f) => s + Number(f.montant_total || 0), 0);
    const depensesTravaux = travauxPeriode.reduce((s, t) => s + Number(t.cout || 0), 0);
    const depenses = depensesFactures + depensesTravaux;

    const net = encaisse - depenses;

    const serie: LigneGraphique[] = cles.map((cle) => ({
      mois: MOIS_COURTS[Number(cle.slice(5, 7)) - 1],
      encaissements: loyersPeriode
        .filter((l) => cleDe(l.mois) === cle)
        .reduce((s, l) => s + Number(l.montant_paye || 0), 0),
      depenses:
        facturesPeriode
          .filter((f) => cleDe(f.date) === cle)
          .reduce((s, f) => s + Number(f.montant_total || 0), 0) +
        travauxPeriode
          .filter((t) => cleDe(t.date_debut ?? t.created_at) === cle)
          .reduce((s, t) => s + Number(t.cout || 0), 0)
    }));

    const parImmeuble: ResumeImmeuble[] = immeubles
      .filter((i) => idsFiltres.has(i.id))
      .map((immeuble) => {
        const apps = appartements.filter((a) => a.immeuble_id === immeuble.id);
        return {
          immeuble,
          total: apps.length,
          occupes: apps.filter((a) => a.statut === "occupe").length,
          encaisse: loyers.filter(
            (l) => immeubleParAppartement.get(l.appartement_id) === immeuble.id && dansPeriode(l.mois)
          ).reduce((s, l) => s + Number(l.montant_paye || 0), 0)
        };
      });

    return {
      encaisse,
      depenses,
      depensesFactures,
      depensesTravaux,
      net,
      serie,
      parImmeuble
    };
  }, [loyers, facturesCommunes, travaux, appartements, immeubles, idsFiltres, dansPeriode, cles]);

  const occupation = useMemo(() => {
    const apps = appartements.filter((a) => idsFiltres.has(a.immeuble_id));
    const occupes = apps.filter((a) => a.statut === "occupe").length;
    return { total: apps.length, occupes, taux: apps.length ? (occupes / apps.length) * 100 : 0 };
  }, [appartements, idsFiltres]);

  const partRepartition = useMemo(() => {
    if (resume.encaisse <= 0) return null;
    const partDepenses = Math.min(100, (Math.max(0, resume.depenses) / resume.encaisse) * 100);
    const partNet = Math.max(0, Math.min(100, (resume.net / resume.encaisse) * 100));
    return { partDepenses, partNet };
  }, [resume]);

  const idRapport = useMemo(
    () =>
      immeubleChoisi !== "tous"
        ? immeubleChoisi
        : immeubles.length === 1
          ? immeubles[0].id
          : null,
    [immeubleChoisi, immeubles]
  );

  // -----------------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------------
  const telechargerRapport = async (cle: "pdf" | "word" | "excel") => {
    if (!idRapport) {
      setMessage({ type: "erreur", texte: "Sélectionne un immeuble précis pour générer un rapport." });
      return;
    }
    setRapportEnCours(cle);
    try {
      const candidats =
        cle === "pdf" ? ["report-pdf"] : cle === "word" ? ["report-docx"] : ["report-excel", "excel"];
      const debut = debutPeriode.toISOString().slice(0, 10);
      const fin = finPeriode.toISOString().slice(0, 10);
      const url = await genererDocument(candidats, {
        immeuble_id: idRapport,
        debut,
        fin,
        donnees: await donneesRapport(idRapport, debut, fin)
      });
      diriger(nouvelleFenetre(), url);
      setMessage({ type: "succes", texte: `Rapport ${cle.toUpperCase()} généré et ouvert dans un nouvel onglet.` });
    } catch (e) {
      const texte = e instanceof Error ? e.message : "Erreur inattendue.";
      setMessage({
        type: "erreur",
        texte: texte.includes(ERREUR_BACKEND) ? texte : `Rapport ${cle.toUpperCase()} : ${texte}`
      });
    } finally {
      setRapportEnCours(null);
    }
  };

  const ouvrirVirement = () => {
    if (!idRapport) {
      setMessage({
        type: "erreur",
        texte: "Choisis d'abord un immeuble précis (au lieu de « Tous mes immeubles ») pour faire une demande de virement."
      });
      return;
    }
    setVirementMontant(String(Math.max(0, Math.round(resume.net))));
    setVirementCoordonnees("");
    setVirementErreur(null);
    setVirementEnvoye(false);
    setVirementOuvert(true);
  };

  const demanderVirement = async () => {
    const montant = Number(virementMontant);
    if (!montant || montant <= 0) {
      setVirementErreur("Indiquez un montant supérieur à zéro.");
      return;
    }
    if (!virementCoordonnees.trim()) {
      setVirementErreur("Renseignez vos coordonnées bancaires ou Mobile Money.");
      return;
    }

    setVirementEnCours(true);
    setVirementErreur(null);
    try {
      // Un virement se rattache à un immeuble précis : sans immeuble_id,
      // la demande serait invisible du tableau de bord du gérant (il lit
      // les activités par immeuble_id). On exige donc la même sélection
      // que pour les rapports.
      if (!idRapport) {
        throw new Error("Sélectionne d'abord un immeuble précis pour faire une demande de virement.");
      }
      const { error } = await supabase.from("activites").insert([
        {
          user_id: user?.id ?? null,
          immeuble_id: idRapport,
          type: "demande_virement",
          message: `Demande de virement de ${fcfa(montant)} vers : ${virementCoordonnees.trim()}`
        }
      ]);
      if (error) throw new Error(error.message);
      setVirementEnvoye(true);
    } catch (e) {
      setVirementErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setVirementEnCours(false);
    }
  };

  // -----------------------------------------------------------------
  // GUARDS
  // -----------------------------------------------------------------
  if (chargementAuth) return <EcranChargement texte="Vérification de votre session…" />;
  if (!user)
    return (
      <EcranAcces
        titre="Connexion requise"
        message="Connectez-vous pour consulter votre portail propriétaire."
        href="/"
        libelle="Se connecter"
      />
    );
  if (role !== "proprietaire")
    return (
      <EcranAcces
        titre="Portail propriétaire"
        message="Ce portail est réservé aux propriétaires. Vos immeubles vous y attendent une fois votre compte activé."
        href={role === "gerant" || role === "super_admin" ? "/dashboard" : "/"}
        libelle="Retour au tableau de bord"
      />
    );

  const periodeLibelle = PERIODES.find((p) => p.valeur === periodeMois)?.libelle ?? "";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* En-tête premium */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-nuit-900 via-nuit-800 to-nuit-900 p-8 text-white shadow-gold">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-or-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-emeraude-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-or-400">
              Portail propriétaire · Diaspora
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold">Vos immeubles, en toute transparence</h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              Encaissements, dépenses et net à reverser, consolidés par votre gérant. Cette vue est en lecture seule.
            </p>
          </div>
          <Button variant="gold" onClick={ouvrirVirement} disabled={immeubles.length === 0}>
            <Landmark className="h-4 w-4" /> Demander un virement
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {message && <Alerte etat={message} onFermer={() => setMessage(null)} />}
      </AnimatePresence>

      {erreur && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p>{erreur}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => charger()}>
            Réessayer
          </Button>
        </div>
      )}

      {chargement ? (
        <EcranChargement texte="Consolidation de vos immeubles…" />
      ) : immeubles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-or-500/15">
              <Home className="h-7 w-7 text-or-500" />
            </div>
            <p className="font-serif text-lg font-semibold">Aucun immeuble rattaché</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Votre compte propriétaire n&apos;est encore lié à aucun immeuble. Votre gérant peut vous rattacher à
              vos immeubles depuis son tableau de bord.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filtres */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="immeuble-filtre">Immeuble</Label>
              <select
                id="immeuble-filtre"
                value={immeubleChoisi}
                onChange={(e) => setImmeubleChoisi(e.target.value)}
                className="flex h-10 w-56 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="tous">Tous mes immeubles</option>
                {immeubles.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="periode-filtre">Période analysée</Label>
              <select
                id="periode-filtre"
                value={periodeMois}
                onChange={(e) => setPeriodeMois(Number(e.target.value))}
                className="flex h-10 w-48 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PERIODES.map((p) => (
                  <option key={p.valeur} value={p.valeur}>
                    {p.libelle}
                  </option>
                ))}
              </select>
            </div>
            <p className="ml-auto text-xs text-muted-foreground">
              Mise à jour : {debutPeriode.toLocaleDateString("fr-FR")} — {finPeriode.toLocaleDateString("fr-FR")}
            </p>
          </div>

          {/* NET À REVERSER */}
          <Card className="border-or-500/40 bg-gradient-to-br from-or-50 to-creme dark:from-nuit-900 dark:to-nuit-800">
            <CardContent className="p-8">
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-or-600">
                    Net à reverser · {periodeLibelle}
                  </p>
                  <p className="mt-3 font-serif text-4xl font-bold text-nuit-900 dark:text-white">
                    <CountUp to={Math.max(0, resume.net)} currency />
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Encaissé {fcfa(resume.encaisse)} − dépenses {fcfa(resume.depenses)} · aucun pourcentage
                    prélevé
                  </p>

                  {partRepartition && (
                    <div className="mt-6 space-y-3">
                      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${partRepartition.partNet}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full bg-emeraude-500"
                        />
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${partRepartition.partDepenses}%` }}
                          transition={{ duration: 1, delay: 0.15, ease: "easeOut" }}
                          className="h-full bg-orange-500"
                        />
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-emeraude-500" /> Net à reverser
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Dépenses
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-card p-5">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                      <TrendingUp className="h-4 w-4 text-emeraude-500" /> Encaissé
                    </p>
                    <p className="mt-2 font-serif text-xl font-bold text-emeraude-500">
                      <CountUp to={resume.encaisse} currency />
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                      <TrendingDown className="h-4 w-4 text-orange-500" /> Dépenses
                    </p>
                    <p className="mt-2 font-serif text-xl font-bold text-orange-500">
                      <CountUp to={resume.depenses} currency />
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fcfa(resume.depensesFactures)} charges · {fcfa(resume.depensesTravaux)} travaux
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-5">
                    <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                      <Users className="h-4 w-4 text-nuit-900 dark:text-white" /> Occupation
                    </p>
                    <p className="mt-2 font-serif text-xl font-bold">
                      {occupation.occupes} / {occupation.total}
                    </p>
                    <ProgressBar
                      className="mt-2"
                      value={occupation.taux}
                      color="bg-emeraude-500"
                      label="Taux d'occupation"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Graphique */}
          <Card>
            <CardHeader>
              <CardTitle>Encaissements vs dépenses</CardTitle>
              <p className="text-sm text-muted-foreground">Répartition mois par mois sur la période sélectionnée.</p>
            </CardHeader>
            <CardContent>
              {resume.serie.every((l) => l.encaissements === 0 && l.depenses === 0) ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <TrendingUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium">Aucune activité sur cette période</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Élargissez la période ou vérifiez que vos immeubles sont bien rattachés à votre compte.
                  </p>
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resume.serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="mois" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        tickFormatter={(v) => fcfaCompact(Number(v))}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
                        contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                        formatter={(v) => fcfa(Number(v))}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="encaissements" name="Encaissements" fill="#10B981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="depenses" name="Dépenses" fill="#F97316" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Détail par immeuble */}
          <div>
            <h2 className="mb-4 font-serif text-xl font-bold">Vos immeubles</h2>
            <Stagger className="grid gap-4 md:grid-cols-2">
              {resume.parImmeuble.map((r) => (
                <motion.div key={r.immeuble.id} variants={staggerItem}>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-or-500/15">
                            <Building2 className="h-5 w-5 text-or-500" />
                          </div>
                          <div>
                            <p className="font-serif text-lg font-semibold">{r.immeuble.nom}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.immeuble.adresse} · {r.immeuble.ville}
                            </p>
                          </div>
                        </div>
                        <Badge tone={r.occupes === r.total ? "success" : r.occupes === 0 ? "danger" : "warning"}>
                          {r.occupes === r.total ? "Complet" : r.occupes === 0 ? "Vide" : "Partiel"}
                        </Badge>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">Appartements</p>
                          <p className="font-serif text-lg font-bold">{r.total}</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">Occupés</p>
                          <p className="font-serif text-lg font-bold text-emeraude-500">{r.occupes}</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">Encaissé</p>
                          <p className="font-serif text-lg font-bold">{fcfaCompact(r.encaisse)}</p>
                        </div>
                      </div>

                      <ProgressBar
                        className="mt-4"
                        value={r.total ? (r.occupes / r.total) * 100 : 0}
                        color="bg-or-500"
                        label="Taux d'occupation"
                      />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </Stagger>
          </div>

          {/* Rapports */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-or-500" /> Rapports à télécharger
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Documents officiels générés par Sunu Keur sur la période {periodeLibelle.toLowerCase()}.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  loading={rapportEnCours === "pdf"}
                  disabled={!idRapport}
                  onClick={() => telechargerRapport("pdf")}
                >
                  <FileText className="h-4 w-4 text-red-500" /> Rapport PDF
                </Button>
                <Button
                  variant="outline"
                  loading={rapportEnCours === "word"}
                  disabled={!idRapport}
                  onClick={() => telechargerRapport("word")}
                >
                  <FileText className="h-4 w-4 text-sky-500" /> Rapport Word
                </Button>
                <Button
                  variant="outline"
                  loading={rapportEnCours === "excel"}
                  disabled={!idRapport}
                  onClick={() => telechargerRapport("excel")}
                >
                  <FileSpreadsheet className="h-4 w-4 text-emeraude-500" /> Tableur Excel
                </Button>
              </div>
              {!idRapport && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-or-500" />
                  Sélectionne un immeuble précis pour générer un rapport.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* MODAL VIREMENT */}
      <Modal
        open={virementOuvert}
        onClose={() => {
          setVirementOuvert(false);
          if (virementEnvoye) charger();
        }}
        title="Demander un virement"
      >
        {virementEnvoye ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="py-4 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.1 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emeraude-500/15"
            >
              <CheckCircle2 className="h-9 w-9 text-emeraude-500" />
            </motion.div>
            <h3 className="mt-4 font-serif text-xl font-bold">Demande envoyée</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Votre demande de virement de{" "}
              <span className="font-semibold text-foreground">{fcfa(Number(virementMontant) || 0)}</span> a été
              transmise à votre gérant.
            </p>
            <Button className="mt-6 w-full" variant="gold" onClick={() => setVirementOuvert(false)}>
              Fermer
            </Button>
          </motion.div>
        ) : (
          <div>
            <div className="mb-4 rounded-xl border bg-muted/50 p-4 text-sm">
              <p className="text-muted-foreground">Disponible pour un virement</p>
              <p className="mt-1 font-serif text-2xl font-bold text-emeraude-500">{fcfa(Math.max(0, resume.net))}</p>
            </div>

            <Field label="Montant à reverser (F CFA)">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={virementMontant}
                onChange={(e) => setVirementMontant(e.target.value)}
                placeholder="Ex : 250000"
              />
            </Field>

            <Field label="Coordonnées bancaires ou Mobile Money" hint="IBAN, compte Wave/Orange Money ou RIB au nom du propriétaire.">
              <Textarea
                value={virementCoordonnees}
                onChange={(e) => setVirementCoordonnees(e.target.value)}
                placeholder="Ex : Wave 77 123 45 67 au nom de Mamadou Ndiaye"
              />
            </Field>

            {virementErreur && (
              <p className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {virementErreur}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setVirementOuvert(false)}>
                Annuler
              </Button>
              <Button variant="gold" className="flex-1" loading={virementEnCours} onClick={demanderVirement}>
                <Send className="h-4 w-4" /> Envoyer la demande
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
