"use client";

// =====================================================================
// PAIEMENTS — espace d'encaissement du gérant
// Wave / Orange Money / Free Money + relance WhatsApp + historique
// =====================================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  MessageCircle,
  QrCode,
  RefreshCw,
  Wallet
} from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { Appartement, Loyer, Paiement, StatutLoyer } from "@/lib/types";
import { fcfa, formatTel, lienWhatsApp, nomMois } from "@/lib/utils";
import {
  ERREUR_BACKEND,
  METHODES_MOBILE,
  MOBILE_MONEY,
  confirmeSelonBackend,
  confirmerPaiementLocalement,
  diriger,
  echecSelonBackend,
  fermerFenetre,
  initierPaiement,
  interrogerStatut,
  nouvelleFenetre,
  sourceQr,
  type MobileMoney
} from "@/lib/paiements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { Modal } from "@/components/ui/modal";
import { Stagger, staggerItem } from "@/components/ui/motion";
import { Alerte, EcranAcces, EcranChargement, dateCourte } from "../_components/ecrans";
import type { EtatMessage } from "../_components/ecrans";

interface PaiementAvecDetails extends Paiement {
  locataires?: { nom: string } | null;
  loyers?: { mois: string } | null;
}

interface QrOuvert {
  methode: MobileMoney;
  montant: number;
  loyer: Loyer;
  url: string | null;
  data: string;
}

const TON_STATUT_LOYER: Record<StatutLoyer, "success" | "warning" | "danger"> = {
  paye: "success",
  partiel: "warning",
  impaye: "danger"
};

const LIBELLE_STATUT_LOYER: Record<StatutLoyer, string> = {
  paye: "Payé",
  partiel: "Partiel",
  impaye: "Impayé"
};

const TON_STATUT_PAIEMENT = {
  confirme: "success",
  en_attente: "warning",
  echec: "danger"
} as const;

const LIBELLE_STATUT_PAIEMENT = {
  confirme: "Confirmé",
  en_attente: "En attente",
  echec: "Échec"
} as const;

function resteALoyer(loyer: Loyer): number {
  return Math.max(0, Number(loyer.montant || 0) - Number(loyer.montant_paye || 0));
}

const PAGE_HISTORIQUE = 20;
/** Nombre maximal de vérifications automatiques (~3 minutes) : évite un polling infini. */
const NB_TOURS_VERIFICATIONS = 36;

export default function PagePaiements() {
  // useSearchParams doit être rendu sous un <Suspense> (prerender Next 14).
  return (
    <Suspense fallback={<EcranChargement />}>
      <EspacePaiements />
    </Suspense>
  );
}

function EspacePaiements() {
  const { user, role, loading: chargementAuth } = useAuth();
  const supabase = getSupabaseBrowser();

  const params = useSearchParams();
  const retourLoyer = params.get("loyer");
  const retourStatut = params.get("status");
  const modeDemo = params.get("demo") === "1";

  const [loyers, setLoyers] = useState<Loyer[]>([]);
  const [historique, setHistorique] = useState<PaiementAvecDetails[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<EtatMessage>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [verification, setVerification] = useState(false);
  const [qr, setQr] = useState<QrOuvert | null>(null);
  const [qrImage, setQrImage] = useState(true);
  const [heureMaj, setHeureMaj] = useState("");
  const [kpi, setKpi] = useState({ encaisse: 0, enAttente: 0, enAttenteCount: 0 });
  const [pageHistorique, setPageHistorique] = useState(PAGE_HISTORIQUE);
  const [toursVerifications, setToursVerifications] = useState(0);

  // -----------------------------------------------------------------
  // CHARGEMENT — immeubles du gérant > appartements > loyers impayés
  // -----------------------------------------------------------------
  const charger = useCallback(
    async (silencieux = false) => {
      if (!user || !role) return;
      if (!silencieux) setChargement(true);
      setErreur(null);

      try {
        let requeteImmeubles = supabase.from("immeubles").select("id, nom, ville");
        if (role === "gerant") requeteImmeubles = requeteImmeubles.eq("gerant_id", user.id);
        const { data: immeubles, error: errImmeubles } = await requeteImmeubles;
        if (errImmeubles) throw new Error(`Immeubles : ${errImmeubles.message}`);

        const idsImmeubles = ((immeubles ?? []) as { id: string }[]).map((i) => i.id);
        let loyersImpayes: Loyer[] = [];
        let idsLoyersPerimetre: string[] = [];

        if (idsImmeubles.length) {
          const { data: appartements, error: errAppartements } = await supabase
            .from("appartements")
            .select("id, numero, immeuble_id, immeubles(id, nom, ville)")
            .in("immeuble_id", idsImmeubles);
          if (errAppartements) throw new Error(`Appartements : ${errAppartements.message}`);

          const idsAppartements = ((appartements ?? []) as Appartement[]).map((a) => a.id);
          if (idsAppartements.length) {
            const { data: loyers, error: errLoyers } = await supabase
              .from("loyers")
              .select(
                "*, appartements(id, numero, immeuble_id, immeubles(id, nom, ville)), locataires(id, nom, telephone)"
              )
              .in("appartement_id", idsAppartements)
              .neq("statut", "paye")
              .order("mois", { ascending: false })
              .limit(60);
            if (errLoyers) throw new Error(`Loyers : ${errLoyers.message}`);
            loyersImpayes = (loyers ?? []) as Loyer[];

            // Périmètre complet des loyers (payés inclus) : sert à filtrer
            // l'historique et les KPI par les immeubles de l'utilisateur.
            const { data: loyersPerimetre, error: errPerimetre } = await supabase
              .from("loyers")
              .select("id")
              .in("appartement_id", idsAppartements)
              .order("mois", { ascending: false })
              .limit(2000);
            if (errPerimetre) throw new Error(`Loyers : ${errPerimetre.message}`);
            idsLoyersPerimetre = ((loyersPerimetre ?? []) as { id: string }[]).map((l) => l.id);
          }
        }

        // Historique filtré + KPI agrégés sur des requêtes dédiées (pas sur
        // les N dernières lignes, qui faussaient « Encaissé ce mois »).
        const maintenant = new Date();
        const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
        const moisSuivant = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 1));

        let historiqueFiltre: PaiementAvecDetails[] = [];
        let encaisseMois = 0;
        let enAttenteTotal = 0;
        let enAttenteNombre = 0;

        if (idsLoyersPerimetre.length) {
          const [histRes, confirmeRes, attenteRes] = await Promise.all([
            supabase
              .from("paiements")
              .select("*, locataires(nom), loyers(mois)")
              .in("loyer_id", idsLoyersPerimetre)
              .order("created_at", { ascending: false })
              .limit(pageHistorique),
            supabase
              .from("paiements")
              .select("montant")
              .eq("statut", "confirme")
              .in("loyer_id", idsLoyersPerimetre)
              .gte("created_at", debutMois.toISOString())
              .lt("created_at", moisSuivant.toISOString())
              .limit(5000),
            supabase
              .from("paiements")
              .select("montant")
              .eq("statut", "en_attente")
              .in("loyer_id", idsLoyersPerimetre)
              .limit(5000)
          ]);
          if (histRes.error) throw new Error(`Paiements : ${histRes.error.message}`);
          if (confirmeRes.error) throw new Error(`Paiements : ${confirmeRes.error.message}`);
          if (attenteRes.error) throw new Error(`Paiements : ${attenteRes.error.message}`);

          historiqueFiltre = (histRes.data ?? []) as PaiementAvecDetails[];
          encaisseMois = ((confirmeRes.data ?? []) as { montant: number }[]).reduce(
            (s, p) => s + Number(p.montant || 0),
            0
          );
          const enAttenteLignes = (attenteRes.data ?? []) as { montant: number }[];
          enAttenteNombre = enAttenteLignes.length;
          enAttenteTotal = enAttenteLignes.reduce((s, p) => s + Number(p.montant || 0), 0);
        }

        setLoyers(loyersImpayes);
        setHistorique(historiqueFiltre);
        setKpi({ encaisse: encaisseMois, enAttente: enAttenteTotal, enAttenteCount: enAttenteNombre });
        setHeureMaj(new Date().toLocaleTimeString("fr-FR"));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue lors du chargement.");
      } finally {
        setChargement(false);
      }
    },
    [supabase, user, role, pageHistorique]
  );

  useEffect(() => {
    charger();
  }, [charger]);

  const enAttenteCount = kpi.enAttenteCount;
  const verificationEpuisee = enAttenteCount > 0 && toursVerifications >= NB_TOURS_VERIFICATIONS;

  const stats = useMemo(
    () => ({
      encaisse: kpi.encaisse,
      enAttente: kpi.enAttente,
      impaye: loyers.reduce((s, l) => s + resteALoyer(l), 0)
    }),
    [kpi, loyers]
  );

  // -----------------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------------
  /**
   * Interroge le backend (GET /api/pay/status/{reference}) puis applique
   * localement les confirmations reçues, comme le ferait le webhook.
   */
  const verifier = useCallback(
    async (silencieux = false) => {
      if (!silencieux) setVerification(true);
      let confirmes = 0;
      let derniereErreur: string | null = null;
      let avertissement: string | null = null;

      try {
        for (const paiement of historique) {
          if (paiement.statut !== "en_attente" || !paiement.reference) continue;
          try {
            const statut = await interrogerStatut(paiement.reference);
            if (!confirmeSelonBackend(statut?.statut)) continue;
            const resultat = await confirmerPaiementLocalement(supabase, paiement.id);
            if (resultat.confirme && !resultat.dejaConfirme) {
              confirmes++;
              if (resultat.avertissement) avertissement = resultat.avertissement;
            } else if (resultat.erreur) derniereErreur = resultat.erreur;
          } catch (e) {
            derniereErreur = e instanceof Error ? e.message : "Interrogation du backend impossible.";
          }
        }

        await charger(true);
      } finally {
        if (!silencieux) setVerification(false);
      }

      if (silencieux) return;

      if (confirmes > 0) {
        setMessage({
          type: "succes",
          texte: `${confirmes} paiement${confirmes > 1 ? "s" : ""} confirmé${confirmes > 1 ? "s" : ""} par le backend — les loyers concernés sont à jour.${avertissement ? ` (${avertissement})` : ""}`
        });
      } else if (derniereErreur) {
        setMessage({ type: "erreur", texte: `Vérification incomplète : ${derniereErreur}` });
      } else {
        setMessage({ type: "succes", texte: "Paiements rechargés — aucune confirmation nouvelle côté backend." });
      }
    },
    [charger, historique, supabase]
  );

  const refVerifier = useRef(verifier);
  useEffect(() => {
    refVerifier.current = verifier;
  });

  // Rechargement arrière-plan borné tant qu'un paiement est en attente
  useEffect(() => {
    if (enAttenteCount === 0 || verificationEpuisee) return;
    const minuteur = setInterval(() => {
      setToursVerifications((t) => t + 1);
      refVerifier.current(true);
    }, 5000);
    return () => clearInterval(minuteur);
  }, [enAttenteCount, verificationEpuisee]);

  const nettoyerUrlRetour = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  /**
   * Confirme localement les paiements en attente (d'un loyer donné, ou les
   * plus récents) après interrogation du backend — miroir du webhook.
   */
  const confirmerEnAttente = useCallback(
    async (loyerId: string | null, validationExplicite: boolean): Promise<number> => {
      let candidats: Paiement[];

      if (loyerId) {
        const { data, error } = await supabase
          .from("paiements")
          .select("*")
          .eq("loyer_id", loyerId)
          .eq("statut", "en_attente")
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw new Error(`Paiements : ${error.message}`);
        candidats = (data ?? []) as Paiement[];
      } else {
        candidats = historique.filter((p) => p.statut === "en_attente").slice(0, 5);
      }

      // Un seul suivi par loyer : deux suivis du même versement ne cumulent pas.
      const vus = new Set<string>();
      const selection = candidats.filter((p) => {
        const cle = p.loyer_id ?? p.id;
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
      });

      let confirmes = 0;
      for (const paiement of selection) {
        let statutBackend: string | null = null;
        if (paiement.reference) {
          try {
            statutBackend = (await interrogerStatut(paiement.reference))?.statut ?? null;
          } catch {
            statutBackend = null; // backend injoignable : on s'appuie sur la validation demandée
          }
        }
        if (echecSelonBackend(statutBackend)) continue;
        if (!confirmeSelonBackend(statutBackend) && !validationExplicite) continue;

        const resultat = await confirmerPaiementLocalement(supabase, paiement.id);
        if (resultat.confirme && !resultat.dejaConfirme) confirmes++;
        else if (resultat.erreur) throw new Error(resultat.erreur);
      }
      return confirmes;
    },
    [historique, supabase]
  );

  /** Classe en échec les suivis en attente d'un loyer (retour failed/cancelled). */
  const marquerEchec = useCallback(
    async (loyerId: string | null): Promise<number> => {
      const requete = supabase
        .from("paiements")
        .update({ statut: "echec", updated_at: new Date().toISOString() })
        .eq("statut", "en_attente");
      if (loyerId) requete.eq("loyer_id", loyerId);
      const { data, error } = await requete.select("id");
      if (error) throw new Error(`Paiements : ${error.message}`);
      return ((data ?? []) as { id: string }[]).length;
    },
    [supabase]
  );

  /** Validation manuelle d'un paiement de démonstration (aucun débit réel). */
  const validerDemo = async () => {
    setEnCours("demo");
    try {
      const confirmes = await confirmerEnAttente(retourLoyer, true);
      setToursVerifications(0);
      nettoyerUrlRetour();
      await charger(true);
      setMessage(
        confirmes > 0
          ? {
              type: "succes",
              texte: `${confirmes} paiement${confirmes > 1 ? "s" : ""} de démo confirmé${confirmes > 1 ? "s" : ""} — le suivi passe en « Confirmé » et le loyer est à jour.`
            }
          : { type: "succes", texte: "Aucun paiement en attente à valider : le suivi est déjà à jour." }
      );
    } catch (e) {
      setMessage({
        type: "erreur",
        texte: e instanceof Error ? e.message : "Validation du paiement de démo impossible."
      });
    } finally {
      setEnCours(null);
    }
  };

  // Retour d'un opérateur via l'URL (?status=success|failed|cancelled).
  // Le mode démo (?demo=1) ne valide pas tout seul : un bouton dédié est proposé.
  const retourTraite = useRef(false);
  useEffect(() => {
    if (retourTraite.current || chargement) return;
    if (retourStatut !== "success" && retourStatut !== "failed" && retourStatut !== "cancelled") return;
    retourTraite.current = true;
    nettoyerUrlRetour();

    (async () => {
      try {
        if (retourStatut === "failed" || retourStatut === "cancelled") {
          const nombre = await marquerEchec(retourLoyer);
          setToursVerifications(0);
          await charger(true);
          setMessage({
            type: "erreur",
            texte: `Le paiement ${retourStatut === "cancelled" ? "a été annulé" : "a échoué"} : aucun montant n'a été encaissé${nombre ? ` (${nombre} suivi${nombre > 1 ? "s" : ""} local${nombre > 1 ? "aux" : ""} classé${nombre > 1 ? "s" : ""} en échec)` : ""}.`
          });
          return;
        }

        const confirmes = await confirmerEnAttente(retourLoyer, true);
        setToursVerifications(0);
        await charger(true);
        setMessage(
          confirmes > 0
            ? { type: "succes", texte: "Paiement confirmé — le suivi du paiement et le loyer sont à jour." }
            : { type: "succes", texte: "Paiement déjà enregistré : aucune confirmation supplémentaire à appliquer." }
        );
      } catch (e) {
        setMessage({
          type: "erreur",
          texte: e instanceof Error ? e.message : "Traitement du retour de paiement impossible."
        });
      }
    })();
  }, [retourStatut, retourLoyer, chargement, confirmerEnAttente, marquerEchec, nettoyerUrlRetour, charger]);

  const payer = async (loyer: Loyer, methode: MobileMoney) => {
    const telephone = loyer.locataires?.telephone;
    const montant = resteALoyer(loyer);
    const libelle = MOBILE_MONEY[methode].label;

    if (!telephone) {
      setMessage({
        type: "erreur",
        texte: `Le locataire de l'appartement ${loyer.appartements?.numero ?? ""} n'a pas de téléphone enregistré.`
      });
      return;
    }
    if (montant <= 0) {
      setMessage({ type: "succes", texte: `Le loyer de ${nomMois(loyer.mois)} est déjà réglé.` });
      return;
    }

    setEnCours(`${loyer.id}-${methode}`);
    const fenetre = nouvelleFenetre();

    try {
      const resultat = await initierPaiement(methode, {
        loyer_id: loyer.id,
        montant,
        telephone,
        description: `Loyer ${nomMois(loyer.mois)} — app. ${loyer.appartements?.numero ?? ""}`
      });

      // Le backend doit d'abord avoir ouvert une vraie session de paiement :
      // aucune ligne « en attente » n'est créée sinon (pas de fantôme éternel).
      if (!resultat.payment_url && !resultat.qr_data) {
        throw new Error("Le backend n'a renvoyé aucune URL de paiement.");
      }

      // Suivi local du paiement en attente de confirmation (erreur contrôlée)
      const { error: errSuivi } = await supabase.from("paiements").insert([
        {
          loyer_id: loyer.id,
          locataire_id: loyer.locataire_id ?? null,
          montant,
          methode,
          statut: "en_attente",
          reference: resultat.payment_id ?? null
        }
      ]);
      if (errSuivi) {
        fermerFenetre(fenetre);
        setMessage({
          type: "erreur",
          texte: `${libelle} : session de paiement ouverte, mais le suivi local n'a pas pu être enregistré (${errSuivi.message}).`
        });
        return;
      }

      let messageSuite: string | null = null;
      if (resultat.qr_data) {
        fermerFenetre(fenetre);
        setQrImage(true);
        setQr({
          methode,
          montant,
          loyer,
          url: resultat.payment_url,
          data: resultat.qr_data
        });
        messageSuite = `${libelle} — QR code de ${fcfa(montant)} généré pour ${nomMois(loyer.mois)}.`;
      } else if (resultat.payment_url) {
        diriger(fenetre, resultat.payment_url);
        messageSuite = `${libelle} — demande de paiement de ${fcfa(montant)} ouverte pour ${nomMois(loyer.mois)}.`;
      }

      setToursVerifications(0);
      await charger(true);
      if (messageSuite) setMessage({ type: "succes", texte: messageSuite });
    } catch (e) {
      fermerFenetre(fenetre);
      const texte = e instanceof Error ? e.message : "Erreur inattendue.";
      setMessage({
        type: "erreur",
        texte: texte.includes(ERREUR_BACKEND) ? texte : `${libelle} : ${texte}`
      });
    } finally {
      setEnCours(null);
    }
  };

  const relancer = (loyer: Loyer) => {
    const telephone = loyer.locataires?.telephone;
    if (!telephone) {
      setMessage({ type: "erreur", texte: "Ce locataire n'a pas de téléphone : relance impossible." });
      return;
    }
    const lien = `${window.location.origin}/locataire`;
    const messageWhatsapp = `Salam ${loyer.locataires?.nom ?? ""}, ton loyer de ${nomMois(loyer.mois)} de ${fcfa(
      resteALoyer(loyer)
    )} est en attente. Paie ici : ${lien} - Sunu Keur`;
    window.open(lienWhatsApp(telephone, messageWhatsapp), "_blank", "noopener,noreferrer");
  };

  // -----------------------------------------------------------------
  // GUARDS
  // -----------------------------------------------------------------
  if (chargementAuth) return <EcranChargement texte="Vérification de votre session…" />;
  if (!user)
    return (
      <EcranAcces
        titre="Connexion requise"
        message="Connectez-vous pour accéder à l'espace d'encaissement."
        href="/"
        libelle="Se connecter"
      />
    );
  if (role !== "gerant" && role !== "super_admin")
    return (
      <EcranAcces
        titre="Espace gérant"
        message="Cette page est réservée aux gérants de l'agence. Retournez dans votre espace personnel."
        href={role === "proprietaire" ? "/owner" : role === "locataire" ? "/locataire" : "/"}
        libelle="Aller à mon espace"
      />
    );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-or-500">Encaissement</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Paiements Mobile Money</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Lancez un encaissement Wave, Orange Money ou Free Money et suivez les confirmations reçues du backend.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {heureMaj && <span className="text-xs text-muted-foreground">Mise à jour à {heureMaj}</span>}
          <Button variant="outline" onClick={() => verifier()} loading={verification}>
            <RefreshCw className="h-4 w-4" /> Vérifier les paiements
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {message && <Alerte etat={message} onFermer={() => setMessage(null)} />}
      </AnimatePresence>

      {/* Paiement de démonstration renvoyé par le backend (?demo=1) */}
      {modeDemo && enAttenteCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-or-500/40 bg-or-500/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 text-or-600 dark:text-or-400">
            <FlaskConical className="h-4 w-4 shrink-0" />
            Paiement de démonstration : aucun débit réel. Validez-le pour voir le suivi passer en « Confirmé » et le
            loyer se régler.
          </p>
          <Button variant="success" size="sm" loading={enCours === "demo"} onClick={() => validerDemo()}>
            <CheckCircle2 className="h-4 w-4" /> Valider le paiement de démo
          </Button>
        </div>
      )}

      {/* Vérification automatique bornée */}
      {verificationEpuisee && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
          Vérification automatique interrompue après {NB_TOURS_VERIFICATIONS} tentatives. Cliquez sur « Vérifier les
          paiements » pour relancer la synchronisation avec le backend.
        </div>
      )}

      {erreur && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p>{erreur}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => charger()}>
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        </div>
      )}

      {chargement ? (
        <EcranChargement />
      ) : (
        <>
          {/* Statistiques */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Encaissé ce mois</p>
                <p className="mt-2 font-serif text-2xl font-bold text-emeraude-500">
                  <CountUp to={stats.encaisse} currency />
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">En attente de confirmation</p>
                <p className="mt-2 font-serif text-2xl font-bold text-orange-500">
                  <CountUp to={stats.enAttente} currency />
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Loyers impayés</p>
                <p className="mt-2 font-serif text-2xl font-bold text-red-500">
                  <CountUp to={stats.impaye} currency />
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Loyers en attente */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-or-500" /> Loyers à encaisser
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {loyers.length} loyer{loyers.length > 1 ? "s" : ""} non réglé{loyers.length > 1 ? "s" : ""} sur vos immeubles
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {loyers.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emeraude-500/15">
                    <Wallet className="h-6 w-6 text-emeraude-500" />
                  </div>
                  <p className="font-medium">Tout est encaissé</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Aucun loyer en attente sur vos immeubles. Les prochains échéanciers apparaîtront ici.
                  </p>
                </div>
              ) : (
                <Stagger className="space-y-3">
                  {loyers.map((loyer) => {
                    const montant = resteALoyer(loyer);
                    const telephone = loyer.locataires?.telephone;
                    return (
                      <motion.div
                        key={loyer.id}
                        variants={staggerItem}
                        className="rounded-xl border p-4 transition-colors hover:border-or-500/40"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Building2 className="h-4 w-4 text-or-500" />
                              <span className="font-semibold">
                                {loyer.appartements?.immeubles?.nom ?? "Immeuble"}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                App. {loyer.appartements?.numero ?? "—"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm">
                              {loyer.locataires?.nom ?? "Locataire non renseigné"}
                              {telephone && (
                                <span className="ml-2 text-muted-foreground">{formatTel(telephone)}</span>
                              )}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {nomMois(loyer.mois)} · échéance {dateCourte(loyer.date_echeance)}
                            </p>
                          </div>

                          <div className="text-right">
                            <Badge tone={TON_STATUT_LOYER[loyer.statut] ?? "danger"}>
                              {LIBELLE_STATUT_LOYER[loyer.statut] ?? "Impayé"}
                            </Badge>
                            <p className="mt-2 font-serif text-xl font-bold">{fcfa(montant)}</p>
                            {Number(loyer.montant_paye || 0) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                déjà {fcfa(Number(loyer.montant_paye))} versés
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {METHODES_MOBILE.map((methode) => {
                            const operateur = MOBILE_MONEY[methode];
                            const cle = `${loyer.id}-${methode}`;
                            return (
                              <Button
                                key={methode}
                                size="sm"
                                variant="outline"
                                loading={enCours === cle}
                                disabled={!!enCours && enCours !== cle}
                                onClick={() => payer(loyer, methode)}
                                className="gap-2"
                              >
                                <span
                                  className="flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold text-white"
                                  style={{ backgroundColor: operateur.couleur }}
                                >
                                  {operateur.initiale}
                                </span>
                                {operateur.label}
                              </Button>
                            );
                          })}
                          <span className="flex-1" />
                          <Button size="sm" variant="ghost" onClick={() => relancer(loyer)}>
                            <MessageCircle className="h-4 w-4" /> Relancer WhatsApp
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </Stagger>
              )}
            </CardContent>
          </Card>

          {/* Historique */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-or-500" /> Historique des paiements
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Les paiements confirmés par le webhook passent automatiquement en &laquo;&nbsp;Confirmé&nbsp;&raquo;.
              </p>
            </CardHeader>
            <CardContent>
              {historique.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium">Aucun paiement enregistré</p>
                  <p className="text-sm text-muted-foreground">
                    Lancez un encaissement ci-dessus : il apparaîtra ici immédiatement. L&apos;historique couvre vos
                    immeubles.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Locataire</th>
                        <th className="py-2 pr-4">Loyer</th>
                        <th className="py-2 pr-4">Méthode</th>
                        <th className="py-2 pr-4 text-right">Montant</th>
                        <th className="py-2 text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historique.map((paiement) => (
                        <tr key={paiement.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 text-muted-foreground">{dateCourte(paiement.created_at)}</td>
                          <td className="py-3 pr-4 font-medium">{paiement.locataires?.nom ?? "—"}</td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {paiement.loyers?.mois ? nomMois(paiement.loyers.mois) : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    paiement.methode in MOBILE_MONEY
                                      ? MOBILE_MONEY[paiement.methode as MobileMoney].couleur
                                      : "#94A3B8"
                                }}
                              />
                              <span className="capitalize">{paiement.methode.replace("_", " ")}</span>
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right font-medium tabular-nums">
                            {fcfa(Number(paiement.montant || 0))}
                          </td>
                          <td className="py-3 text-right">
                            <Badge tone={TON_STATUT_PAIEMENT[paiement.statut] ?? "neutral"}>
                              {LIBELLE_STATUT_PAIEMENT[paiement.statut] ?? paiement.statut}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {historique.length >= pageHistorique && (
                <div className="mt-4 text-center">
                  <Button variant="outline" size="sm" onClick={() => setPageHistorique((p) => p + 40)}>
                    Afficher plus de paiements
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* QR code de paiement */}
      <Modal
        open={!!qr}
        onClose={() => {
          setQr(null);
          verifier(true);
        }}
        title={qr ? `Paiement ${MOBILE_MONEY[qr.methode].label}` : "Paiement"}
      >
        {qr && (
          <div className="space-y-5">
            <div className="rounded-xl bg-creme p-5 text-center dark:bg-nuit-800">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceQr(qr.data)}
                  alt={`QR code de paiement ${MOBILE_MONEY[qr.methode].label}`}
                  className="mx-auto rounded-lg bg-white p-2"
                  width={260}
                  height={260}
                  onError={() => setQrImage(false)}
                />
              ) : (
                <code className="block break-all rounded-lg bg-white p-4 text-xs text-nuit-900">{qr.data}</code>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Scannez ce code dans l&apos;application {MOBILE_MONEY[qr.methode].label} de{" "}
                {qr.loyer.locataires?.nom ?? "ce locataire"}.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Montant</span>
              <span className="font-serif text-lg font-bold">{fcfa(qr.montant)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Loyer</span>
              <span className="font-medium">
                {nomMois(qr.loyer.mois)} · app. {qr.loyer.appartements?.numero ?? "—"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {qr.url && (
                <Button className="flex-1" onClick={() => diriger(nouvelleFenetre(), qr.url as string)}>
                  <QrCode className="h-4 w-4" /> Ouvrir le paiement
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="success"
                className="flex-1"
                onClick={() => {
                  setQr(null);
                  verifier();
                }}
              >
                J&apos;ai payé, vérifier
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
