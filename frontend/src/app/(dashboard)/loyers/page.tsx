// =====================================================================
// GESTION LOYERS — TABLEAU MATRICIEL RÉEL 12 MOIS
// Lignes = appartements du gérant · Colonnes = mois de l'année
// Cellule cliquable → modal d'encaissement réelle (loyers + paiements)
// =====================================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, MessageCircle, RefreshCw, Wallet } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Appartement, Immeuble, Locataire, Loyer, MethodePaiement, StatutLoyer } from "@/lib/types";
import { MOIS_COURTS, MOIS_LONGS, cn, fcfa, fcfaCompact, lienWhatsApp, nomMois } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ProgressBar } from "@/components/ui/progress";

// ---------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------
interface Ligne {
  appartement: Appartement;
  immeuble: Immeuble;
  locataire: Locataire | null;
}

type EtatCellule = "paye" | "partiel" | "impaye" | "vacant" | "avenir";

interface Cible {
  ligne: Ligne;
  indexMois: number;
  moisISO: string;
  loyer: Loyer | null;
}

// ---------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------
const METHODES: { valeur: MethodePaiement; label: string }[] = [
  { valeur: "wave", label: "Wave" },
  { valeur: "orange_money", label: "Orange Money" },
  { valeur: "free_money", label: "Free Money" },
  { valeur: "especes", label: "Espèces" },
  { valeur: "virement", label: "Virement bancaire" },
  { valeur: "cheque", label: "Chèque" }
];

const LIBELLE_STATUT: Record<StatutLoyer, string> = {
  paye: "Payé",
  partiel: "Partiel",
  impaye: "Impayé"
};

const STYLE_CELLULE: Record<EtatCellule, string> = {
  paye: "bg-emeraude-500 text-white border-emeraude-600 hover:bg-emeraude-600",
  partiel:
    "bg-orange-100 text-orange-700 border-orange-400/60 hover:bg-orange-400/25 dark:bg-orange-500/25 dark:text-orange-300 dark:border-orange-500/50 dark:hover:bg-orange-500/35",
  impaye: "bg-red-500 text-white border-red-600 hover:bg-red-600",
  vacant: "bg-muted/70 text-muted-foreground border-border",
  avenir: "bg-muted/30 text-muted-foreground/70 border-border border-dashed"
};

const LEGENDE: { label: string; classe: string }[] = [
  { label: "Payé", classe: "bg-emeraude-500" },
  { label: "Partiel", classe: "bg-orange-100 dark:bg-orange-500/40 border border-orange-400/60" },
  { label: "Impayé", classe: "bg-red-500" },
  { label: "Vacant", classe: "bg-muted border border-border" },
  { label: "À venir", classe: "bg-muted/40 border border-dashed border-border" }
];

function keyMois(annee: number, index: number) {
  return `${annee}-${String(index + 1).padStart(2, "0")}`;
}
function isoMois(annee: number, index: number) {
  return `${keyMois(annee, index)}-01`;
}

// ---------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------
export default function PageLoyers() {
  const { user, role, loading: chargementAuth } = useAuth();

  const [chargement, setChargement] = useState(true);
  const [annee, setAnnee] = useState(() => new Date().getFullYear());
  const [immeubles, setImmeubles] = useState<Immeuble[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loyers, setLoyers] = useState<Loyer[]>([]);
  const [filtreImmeuble, setFiltreImmeuble] = useState("tous");
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);

  // Modal d'encaissement
  const [cible, setCible] = useState<Cible | null>(null);
  const [montantRecu, setMontantRecu] = useState("");
  const [methode, setMethode] = useState<MethodePaiement>("wave");
  const [reference, setReference] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<StatutLoyer | null>(null);

  const maintenant = useMemo(() => new Date(), []);
  const anneeCourante = maintenant.getFullYear();
  const indexMoisCourant = maintenant.getMonth();

  // -------------------------------------------------------------------
  // Chargement des données
  // -------------------------------------------------------------------
  const charger = useCallback(async () => {
    if (!user?.id) return;
    setChargement(true);
    setErreurGlobale(null);
    try {
      const supabase = getSupabaseBrowser();

      let requeteImmeubles = supabase.from("immeubles").select("*");
      if (role === "proprietaire") requeteImmeubles = requeteImmeubles.eq("proprietaire_id", user.id);
      else if (role !== "super_admin") requeteImmeubles = requeteImmeubles.eq("gerant_id", user.id);
      const { data: listeImmeubles, error: errImmeubles } = await requeteImmeubles.order("nom");
      if (errImmeubles) throw new Error(errImmeubles.message);

      const immeubleIds = ((listeImmeubles ?? []) as Immeuble[]).map((i) => i.id);
      setImmeubles((listeImmeubles ?? []) as Immeuble[]);

      if (!immeubleIds.length) {
        setLignes([]);
        setLoyers([]);
        return;
      }

      const { data: listeAppartements, error: errAppartements } = await supabase
        .from("appartements")
        .select("*, immeubles(*)")
        .in("immeuble_id", immeubleIds)
        .order("numero");
      if (errAppartements) throw new Error(errAppartements.message);

      const appartementIds = ((listeAppartements ?? []) as Appartement[]).map((a) => a.id);
      if (!appartementIds.length) {
        setLignes([]);
        setLoyers([]);
        return;
      }

      const [resultatLocataires, resultatLoyers] = await Promise.all([
        supabase.from("locataires").select("*").in("appartement_id", appartementIds),
        supabase
          .from("loyers")
          .select("*")
          .in("appartement_id", appartementIds)
          .gte("mois", isoMois(annee, 0))
          .lte("mois", isoMois(annee, 11))
      ]);
      if (resultatLocataires.error) throw new Error(resultatLocataires.error.message);
      if (resultatLoyers.error) throw new Error(resultatLoyers.error.message);

      const listeLocataires = (resultatLocataires.data ?? []) as Locataire[];
      const lignesChargees: Ligne[] = ((listeAppartements ?? []) as Appartement[]).map((appartement) => {
        const immeuble = ((listeImmeubles ?? []) as Immeuble[]).find((i) => i.id === appartement.immeuble_id);
        const locataire =
          listeLocataires.find((l) => l.appartement_id === appartement.id && l.statut === "actif") ?? null;
        return {
          appartement: appartement as Appartement,
          immeuble: (immeuble ?? (appartement as Appartement).immeubles) as Immeuble,
          locataire
        };
      });

      setLignes(lignesChargees);
      setLoyers((resultatLoyers.data ?? []) as Loyer[]);
    } catch (e) {
      setErreurGlobale(e instanceof Error ? e.message : "Impossible de charger les loyers.");
      setLignes([]);
      setLoyers([]);
    } finally {
      setChargement(false);
    }
  }, [user?.id, role, annee]);

  useEffect(() => {
    if (user?.id) charger();
  }, [user?.id, charger]);

  // -------------------------------------------------------------------
  // Dérivés
  // -------------------------------------------------------------------
  const loyerParCle = useMemo(() => {
    const carte = new Map<string, Loyer>();
    for (const loyer of loyers) carte.set(`${loyer.appartement_id}|${loyer.mois.slice(0, 7)}`, loyer);
    return carte;
  }, [loyers]);

  const lignesAffichees = useMemo(
    () => lignes.filter((l) => filtreImmeuble === "tous" || l.appartement.immeuble_id === filtreImmeuble),
    [lignes, filtreImmeuble]
  );

  const moisLimite = isoMois(anneeCourante, indexMoisCourant);

  const etatCellule = useCallback(
    (ligne: Ligne, index: number): EtatCellule => {
      if (!ligne.locataire) return "vacant";
      const loyer = loyerParCle.get(`${ligne.appartement.id}|${keyMois(annee, index)}`);
      if (loyer) return loyer.statut === "paye" ? "paye" : loyer.statut === "partiel" ? "partiel" : "impaye";
      return isoMois(annee, index) > moisLimite ? "avenir" : "impaye";
    },
    [loyerParCle, annee, moisLimite]
  );

  const stats = useMemo(() => {
    const encaisse = new Array<number>(12).fill(0);
    const attendu = new Array<number>(12).fill(0);
    for (const ligne of lignesAffichees) {
      const attenduLigne = ligne.locataire ? Number(ligne.appartement.loyer_mensuel) : 0;
      for (let i = 0; i < 12; i++) {
        const loyer = loyerParCle.get(`${ligne.appartement.id}|${keyMois(annee, i)}`);
        encaisse[i] += Number(loyer?.montant_paye ?? 0);
        attendu[i] += attenduLigne;
      }
    }
    return { encaisse, attendu };
  }, [lignesAffichees, loyerParCle, annee]);

  const totalEncaisse = stats.encaisse.reduce((somme, v) => somme + v, 0);
  const totalAttendu = stats.attendu.reduce((somme, v) => somme + v, 0);

  const anneeActive = annee === anneeCourante;
  const indexFocus = anneeActive ? indexMoisCourant : -1;
  const encaisseFocus = indexFocus >= 0 ? stats.encaisse[indexFocus] : totalEncaisse;
  const attenduFocus = indexFocus >= 0 ? stats.attendu[indexFocus] : totalAttendu;
  const tauxFocus = attenduFocus > 0 ? (encaisseFocus / attenduFocus) * 100 : 0;
  const titreBandeau = indexFocus >= 0 ? `${MOIS_LONGS[indexFocus]} ${anneeCourante}` : `Année ${annee}`;
  const moisRelance = !anneeActive ? (annee < anneeCourante ? 11 : 0) : indexMoisCourant;

  // -------------------------------------------------------------------
  // Ouverture / soumission de la modal d'encaissement
  // -------------------------------------------------------------------
  const ouvrirCellule = (ligne: Ligne, index: number) => {
    if (!ligne.locataire) return;
    const loyer = loyerParCle.get(`${ligne.appartement.id}|${keyMois(annee, index)}`);
    const montantDu = Number(loyer?.montant ?? ligne.appartement.loyer_mensuel);
    const dejaPaye = Number(loyer?.montant_paye ?? 0);
    const solde = montantDu - dejaPaye;
    setCible({ ligne, indexMois: index, moisISO: isoMois(annee, index), loyer: loyer ?? null });
    setMontantRecu(String(solde > 0 ? solde : montantDu));
    setMethode("wave");
    setReference("");
    setErreur(null);
    setSucces(null);
  };

  const fermerModal = () => {
    setCible(null);
    setErreur(null);
    setSucces(null);
  };

  useEffect(() => {
    if (!succes) return;
    const minuteur = window.setTimeout(fermerModal, 1900);
    return () => window.clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succes]);

  const encaisser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cible || !user) return;

    const montant = Number(montantRecu);
    if (!Number.isFinite(montant) || montant <= 0) {
      setErreur("Saisissez un montant supérieur à 0 F.");
      return;
    }

    // On bloque un éventuel surpaiement : le montant ne peut dépasser le
    // solde restant (évite un recouvrement > 100 % et des KPIs faux).
    const montantDu0 = Number(cible.loyer?.montant ?? cible.ligne.appartement.loyer_mensuel);
    const dejaPaye0 = Number(cible.loyer?.montant_paye ?? 0);
    const soldeRestant = montantDu0 - dejaPaye0;
    if (soldeRestant > 0 && montant > soldeRestant) {
      setErreur(`Le montant dépasse le solde restant (${fcfa(soldeRestant)}).`);
      return;
    }

    setEnCours(true);
    setErreur(null);
    try {
      const supabase = getSupabaseBrowser();
      const { ligne, moisISO, loyer } = cible;
      const locataire = ligne.locataire;
      if (!locataire) throw new Error("Aucun locataire pour cet appartement.");

      const montantDu = Number(loyer?.montant ?? ligne.appartement.loyer_mensuel);
      const dejaPaye = Number(loyer?.montant_paye ?? 0);
      const payeApres = dejaPaye + montant;
      const statut: StatutLoyer =
        payeApres >= montantDu && montantDu > 0 ? "paye" : payeApres > 0 ? "partiel" : "impaye";

      // 1) Upsert du loyer du mois
      let loyerId: string;
      if (loyer) {
        const { data, error } = await supabase
          .from("loyers")
          .update({ montant_paye: payeApres, statut, locataire_id: loyer.locataire_id ?? locataire.id })
          .eq("id", loyer.id)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        loyerId = data.id as string;
      } else {
        const { data, error } = await supabase
          .from("loyers")
          .insert({
            appartement_id: ligne.appartement.id,
            locataire_id: locataire.id,
            mois: moisISO,
            montant: montantDu,
            montant_paye: payeApres,
            statut,
            date_echeance: moisISO
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        loyerId = data.id as string;
      }

      // 2) Insertion du paiement
      const { error: errPaiement } = await supabase.from("paiements").insert({
        loyer_id: loyerId,
        locataire_id: locataire.id,
        montant,
        methode,
        reference: reference.trim() ? reference.trim() : null,
        statut: "confirme"
      });
      if (errPaiement) throw new Error(errPaiement.message);

      // 3) Journal d'activité (best-effort : un échec d'écriture du journal
      //    ne doit pas faire échouer l'encaissement déjà enregistré).
      await supabase.from("activites").insert({
        user_id: user.id,
        immeuble_id: ligne.appartement.immeuble_id,
        type: "encaissement",
        message: `Encaissement de ${fcfa(montant)} — ${locataire.nom}, app. ${ligne.appartement.numero} (${nomMois(
          moisISO
        )})`
      });

      setSucces(statut);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Encaissement impossible. Réessayez.");
    } finally {
      setEnCours(false);
    }
  };

  // -------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------
  const montantDuCible = cible
    ? Number(cible.loyer?.montant ?? cible.ligne.appartement.loyer_mensuel)
    : 0;
  const dejaPayeCible = cible ? Number(cible.loyer?.montant_paye ?? 0) : 0;
  const soldeCible = Math.max(0, montantDuCible - dejaPayeCible);

  // Pas de session résolue → on n'affiche pas un skeleton infini.
  if (!chargementAuth && !user) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-10 text-center shadow-soft">
        <h1 className="font-serif text-2xl font-bold">Connexion requise</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connectez-vous pour gérer vos loyers et encaisser les paiements.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-nuit-900 px-5 text-sm font-medium text-white transition hover:bg-nuit-800 dark:bg-emeraude-500 dark:hover:bg-emeraude-600"
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---------------- En-tête ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Gestion des loyers</h1>
          <p className="text-sm text-muted-foreground">
            Tableau de suivi 12 mois — cliquez sur une cellule pour encaisser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filtrer par immeuble"
            value={filtreImmeuble}
            onChange={(e) => setFiltreImmeuble(e.target.value)}
            className="w-52"
          >
            <option value="tous">Tous les immeubles</option>
            {immeubles.map((immeuble) => (
              <option key={immeuble.id} value={immeuble.id}>
                {immeuble.nom}
              </option>
            ))}
          </Select>

          <div className="flex items-center gap-1 rounded-lg border bg-card px-1.5 py-1.5 shadow-soft">
            <button
              type="button"
              onClick={() => setAnnee((a) => a - 1)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Année précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[4.5rem] text-center font-serif text-sm font-semibold tabular-nums">{annee}</span>
            <button
              type="button"
              onClick={() => setAnnee((a) => a + 1)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Année suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={charger} loading={chargement}>
            <RefreshCw className="h-4 w-4" /> Actualiser
          </Button>
        </div>
      </div>

      {/* ---------------- Bandeau du mois en cours ---------------- */}
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-[190px]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {indexFocus >= 0 ? "Mois en cours" : "Bilan annuel"}
            </p>
            <p className="font-serif text-2xl font-bold">{titreBandeau}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[150px] rounded-xl bg-muted/60 px-4 py-3 transition-colors hover:bg-muted">
              <p className="text-xs text-muted-foreground">Encaissé</p>
              <p className="font-serif text-xl font-bold text-emeraude-500">
                <CountUp key={`enc-${annee}-${indexFocus}`} to={encaisseFocus} currency />
              </p>
            </div>
            <div className="min-w-[150px] rounded-xl bg-muted/60 px-4 py-3 transition-colors hover:bg-muted">
              <p className="text-xs text-muted-foreground">Attendu</p>
              <p className="font-serif text-xl font-bold">
                <CountUp key={`att-${annee}-${indexFocus}`} to={attenduFocus} currency />
              </p>
            </div>
            <div className="min-w-[150px] rounded-xl bg-muted/60 px-4 py-3 transition-colors hover:bg-muted">
              <p className="text-xs text-muted-foreground">Reste à recouvrer</p>
              <p className="font-serif text-xl font-bold text-orange-500">
                <CountUp key={`res-${annee}-${indexFocus}`} to={Math.max(0, attenduFocus - encaisseFocus)} currency />
              </p>
            </div>
          </div>

          <div className="w-full max-w-xs">
            <ProgressBar
              value={tauxFocus}
              label="Taux de recouvrement"
              color={tauxFocus >= 80 ? "bg-emeraude-500" : tauxFocus >= 50 ? "bg-or-500" : "bg-orange-500"}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {lignesAffichees.filter((l) => l.locataire).length} locataire(s) ·{" "}
              {lignesAffichees.filter((l) => !l.locataire).length} appartement(s) vacant(s)
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- Erreur globale ---------------- */}
      {erreurGlobale && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {erreurGlobale}
        </div>
      )}

      {/* ---------------- Tableau ---------------- */}
      {chargement ? (
        <div className="overflow-hidden rounded-2xl border bg-card p-4 shadow-soft">
          <div className="mb-4 h-6 w-56 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/70" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        </div>
      ) : lignesAffichees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center shadow-soft">
          <div className="rounded-full bg-muted p-4">
            <Wallet className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-serif text-lg font-semibold">Aucun appartement à suivre</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Ajoutez un immeuble et ses appartements pour composer votre tableau de loyers sur 12 mois.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="font-serif text-lg font-semibold">
              Tableau matriciel {annee}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {LEGENDE.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("h-3 w-3 rounded-sm", item.classe)} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 w-60 border-b border-r border-border bg-muted/60 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Appartement
                  </th>
                  {MOIS_COURTS.map((mois, i) => {
                    const courant = anneeActive && i === indexMoisCourant;
                    return (
                      <th
                        key={mois}
                        className={cn(
                          "border-b border-r border-border px-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wide",
                          courant
                            ? "bg-or-500 text-nuit-900"
                            : "bg-muted/60 text-muted-foreground"
                        )}
                      >
                        {mois}
                      </th>
                    );
                  })}
                  <th className="border-b border-border bg-muted/60 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Année
                  </th>
                </tr>
              </thead>

              <tbody>
                {lignesAffichees.map((ligne, rang) => {
                  const { appartement, immeuble, locataire } = ligne;
                  let encaisseLigne = 0;
                  for (let i = 0; i < 12; i++) {
                    encaisseLigne += Number(
                      loyerParCle.get(`${appartement.id}|${keyMois(annee, i)}`)?.montant_paye ?? 0
                    );
                  }
                  const attenduLigne = locataire ? Number(appartement.loyer_mensuel) * 12 : 0;

                  return (
                    <motion.tr
                      key={appartement.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(rang * 0.04, 0.4), type: "spring", stiffness: 260, damping: 24 }}
                    >
                      {/* Colonne identité */}
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-normal"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">App. {appartement.numero}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {immeuble?.nom ?? "—"} · {fcfa(Number(appartement.loyer_mensuel))}/mois
                            </p>
                            {locataire ? (
                              <p className="flex items-center gap-1.5 truncate text-xs">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emeraude-500" />
                                {locataire.nom}
                              </p>
                            ) : (
                              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                                Vacant
                              </p>
                            )}
                          </div>

                          {locataire?.telephone && (
                            <a
                              href={lienWhatsApp(
                                locataire.telephone,
                                `Salam ${locataire.nom}, ton loyer de ${
                                  MOIS_LONGS[moisRelance]
                                } ${annee} est en attente. Merci de procéder au règlement (Wave, Orange Money, Free Money ou espèces). Sunu Keur.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Relancer ${locataire.nom} via WhatsApp`}
                              className="shrink-0 rounded-full border bg-muted/50 p-2 text-muted-foreground transition hover:bg-emeraude-500 hover:text-white"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </th>

                      {/* 12 cellules */}
                      {MOIS_COURTS.map((moisLabel, i) => {
                        const cle = keyMois(annee, i);
                        const iso = isoMois(annee, i);
                        const loyer = loyerParCle.get(`${appartement.id}|${cle}`);
                        const etat = etatCellule(ligne, i);
                        const courant = anneeActive && i === indexMoisCourant;

                        const paye = Number(loyer?.montant_paye ?? 0);
                        const du = Number(loyer?.montant ?? appartement.loyer_mensuel);
                        let contenu = "—";
                        if (etat === "paye") contenu = fcfaCompact(paye);
                        else if (etat === "partiel") contenu = `${fcfaCompact(paye)}/${fcfaCompact(du)}`;
                        else if (etat === "impaye") contenu = `0/${fcfaCompact(du)}`;

                        const titre = locataire
                          ? `${locataire.nom} · ${nomMois(iso)} · ${
                              etat === "paye" || etat === "partiel" || etat === "impaye"
                                ? LIBELLE_STATUT[etat as StatutLoyer]
                                : "À venir"
                            } · ${fcfa(paye)} / ${fcfa(du)}`
                          : `Appartement ${appartement.numero} vacant`;

                        return (
                          <td
                            key={cle}
                            className={cn(
                              "border-b border-r border-border p-1",
                              courant && "border-x-or-500/60"
                            )}
                          >
                            {etat === "vacant" ? (
                              <div
                                title={titre}
                                className={cn(
                                  "flex h-11 w-full items-center justify-center rounded-md border text-xs font-medium",
                                  STYLE_CELLULE.vacant
                                )}
                              >
                                —
                              </div>
                            ) : (
                              <motion.button
                                type="button"
                                onClick={() => ouvrirCellule(ligne, i)}
                                whileHover={{ scale: 1.06 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                title={titre}
                                aria-label={titre}
                                className={cn(
                                  "flex h-11 w-full items-center justify-center rounded-md border text-xs font-semibold tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-or-500",
                                  STYLE_CELLULE[etat]
                                )}
                              >
                                {contenu}
                              </motion.button>
                            )}
                          </td>
                        );
                      })}

                      {/* Total de la ligne */}
                      <td className="border-b border-border bg-muted/30 px-2 py-2 text-center">
                        <p className="text-xs font-semibold tabular-nums text-emeraude-500">
                          {fcfaCompact(encaisseLigne)} F
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {fcfaCompact(attenduLigne)} F
                        </p>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th className="sticky left-0 z-10 border-r border-t border-border bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-emeraude-500">
                    Encaissé
                  </th>
                  {stats.encaisse.map((valeur, i) => (
                    <td
                      key={`enc-${i}`}
                      className={cn(
                        "border-r border-t border-border px-1 py-2 text-center text-xs font-semibold tabular-nums text-emeraude-500",
                        anneeActive && i === indexMoisCourant && "bg-or-500/10"
                      )}
                    >
                      {fcfaCompact(valeur)}
                    </td>
                  ))}
                  <td className="border-t border-border bg-muted/30 px-2 py-2 text-center text-xs font-bold tabular-nums text-emeraude-500">
                    {fcfaCompact(totalEncaisse)}
                  </td>
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 border-r border-t border-border bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Attendu
                  </th>
                  {stats.attendu.map((valeur, i) => (
                    <td
                      key={`att-${i}`}
                      className={cn(
                        "border-r border-t border-border px-1 py-2 text-center text-xs tabular-nums text-muted-foreground",
                        anneeActive && i === indexMoisCourant && "bg-or-500/10"
                      )}
                    >
                      {fcfaCompact(valeur)}
                    </td>
                  ))}
                  <td className="border-t border-border bg-muted/30 px-2 py-2 text-center text-xs font-bold tabular-nums">
                    {fcfaCompact(totalAttendu)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Modal d'encaissement ---------------- */}
      <Modal
        open={!!cible}
        onClose={fermerModal}
        title={cible ? `Encaissement — ${nomMois(cible.moisISO)}` : "Encaissement"}
      >
        <AnimatePresence mode="wait">
          {succes ? (
            <motion.div
              key="succes"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.1 }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-emeraude-500 shadow-glow"
              >
                <Check className="h-9 w-9 text-white" strokeWidth={3} />
              </motion.div>
              <p className="font-serif text-lg font-semibold">Encaissement enregistré</p>
              <motion.span
                initial={{ backgroundColor: "#F97316", scale: 0.85 }}
                animate={{ backgroundColor: "#10B981", scale: 1 }}
                transition={{ duration: 0.7, delay: 0.25 }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
              >
                <Check className="h-4 w-4" />
                {LIBELLE_STATUT[succes]}
              </motion.span>
              <p className="text-sm text-muted-foreground">
                {fcfa(Number(montantRecu) || 0)} · {METHODES.find((m) => m.valeur === methode)?.label}
                {cible ? ` · ${cible.ligne.locataire?.nom ?? ""}` : ""}
              </p>
            </motion.div>
          ) : cible ? (
            <motion.form
              key="formulaire"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              onSubmit={encaisser}
            >
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Appartement</p>
                  <p className="font-semibold">
                    App. {cible.ligne.appartement.numero} · {cible.ligne.immeuble?.nom ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Locataire</p>
                  <p className="truncate font-semibold">{cible.ligne.locataire?.nom ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mois</p>
                  <p className="font-semibold">{nomMois(cible.moisISO)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Montant dû</p>
                  <p className="font-semibold">{fcfa(montantDuCible)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Déjà payé</p>
                  <p className="font-semibold text-emeraude-500">{fcfa(dejaPayeCible)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Solde restant</p>
                  <p className="font-semibold text-orange-500">{fcfa(soldeCible)}</p>
                </div>
              </div>

              <Field label="Montant reçu (FCFA)">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={500}
                    inputMode="numeric"
                    value={montantRecu}
                    onChange={(e) => setMontantRecu(e.target.value)}
                    placeholder="Ex. 50000"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    onClick={() => setMontantRecu(String(soldeCible > 0 ? soldeCible : montantDuCible))}
                  >
                    Solde
                  </Button>
                </div>
              </Field>

              <Field label="Méthode de paiement">
                <Select value={methode} onChange={(e) => setMethode(e.target.value as MethodePaiement)}>
                  {METHODES.map((m) => (
                    <option key={m.valeur} value={m.valeur}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Référence (facultatif)" hint="N° de transaction Wave / OM, numéro de reçu…">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ex. TXN-48291"
                />
              </Field>

              {erreur && (
                <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {erreur}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={fermerModal}>
                  Annuler
                </Button>
                <Button type="submit" variant="success" loading={enCours}>
                  Valider l&apos;encaissement
                </Button>
              </div>
            </motion.form>
          ) : null}
        </AnimatePresence>
      </Modal>
    </div>
  );
}
