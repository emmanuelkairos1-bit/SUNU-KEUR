"use client";

// =====================================================================
// PORTAIL LOCATAIRE — mon loyer, paiement Mobile Money, reçus PDF
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Wallet
} from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { donneesRecu } from "@/lib/documents";
import { useAuth } from "@/components/providers/auth-provider";
import type { Loyer, Locataire, Paiement } from "@/lib/types";
import { fcfa, formatTel, lienWhatsApp, nomMois } from "@/lib/utils";
import {
  ERREUR_BACKEND,
  METHODES_MOBILE,
  MOBILE_MONEY,
  confirmeSelonBackend,
  confirmerPaiementLocalement,
  diriger,
  fermerFenetre,
  genererDocument,
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

interface ProfilGérant {
  nom: string;
  telephone?: string | null;
  email?: string | null;
}

function moisDe(date?: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resteALoyer(loyer: Loyer): number {
  return Math.max(0, Number(loyer.montant || 0) - Number(loyer.montant_paye || 0));
}

/** Nombre maximal de vérifications automatiques (~3 minutes) : évite un polling infini. */
const NB_TOURS_VERIFICATIONS = 36;

export default function PageLocataire() {
  const { user, role, loading: chargementAuth } = useAuth();
  const supabase = getSupabaseBrowser();

  const [locataire, setLocataire] = useState<Locataire | null>(null);
  const [loyers, setLoyers] = useState<Loyer[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [gerant, setGerant] = useState<ProfilGérant | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<EtatMessage>(null);

  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const [methodeEnCours, setMethodeEnCours] = useState<MobileMoney | null>(null);
  const [verification, setVerification] = useState(false);
  const [recuEnCours, setRecuEnCours] = useState<string | null>(null);
  const [qr, setQr] = useState<{ data: string; url: string | null } | null>(null);
  const [qrImage, setQrImage] = useState(true);
  const [toursVerifications, setToursVerifications] = useState(0);

  // -----------------------------------------------------------------
  // CHARGEMENT — profil locataire > appartement/immeuble > loyers
  // -----------------------------------------------------------------
  const charger = useCallback(
    async (silencieux = false): Promise<Loyer | null> => {
      if (!user) return null;
      if (!silencieux) setChargement(true);
      setErreur(null);

      try {
        const { data: locData, error: errLoc } = await supabase
          .from("locataires")
          .select("*, appartements(*, immeubles(*))")
          .eq("user_id", user.id)
          .maybeSingle();
        if (errLoc) throw new Error(`Locataire : ${errLoc.message}`);

        const profil = (locData ?? null) as Locataire | null;
        setLocataire(profil);

        if (!profil) {
          setLoyers([]);
          setPaiements([]);
          setGerant(null);
          return null;
        }

        let listeLoyers: Loyer[] = [];
        if (profil.appartement_id) {
          const { data: loyersData, error: errLoyers } = await supabase
            .from("loyers")
            .select("*")
            .eq("appartement_id", profil.appartement_id)
            .order("mois", { ascending: false })
            .limit(36);
          if (errLoyers) throw new Error(`Loyers : ${errLoyers.message}`);
          listeLoyers = (loyersData ?? []) as Loyer[];
        }

        const idsLoyers = listeLoyers.map((l) => l.id);
        const [parLoyer, parLocataire] = await Promise.all([
          idsLoyers.length
            ? supabase.from("paiements").select("*").in("loyer_id", idsLoyers)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("paiements").select("*").eq("locataire_id", profil.id)
        ]);
        if (parLoyer.error) throw new Error(`Paiements : ${parLoyer.error.message}`);
        if (parLocataire.error) throw new Error(`Paiements : ${parLocataire.error.message}`);

        const fusion = new Map<string, Paiement>();
        ((parLoyer.data ?? []) as Paiement[]).concat((parLocataire.data ?? []) as Paiement[]).forEach((p) => {
          fusion.set(p.id, p);
        });
        const listePaiements = Array.from(fusion.values()).sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        );

        setLoyers(listeLoyers);
        setPaiements(listePaiements);

        // Coordonnées du gérant (lecture seule, sans bloquer la page si RLS)
        const gerantId = profil.appartements?.immeubles?.gerant_id;
        if (gerantId) {
          const { data: gerantData } = await supabase
            .from("users")
            .select("nom, telephone, email")
            .eq("id", gerantId)
            .maybeSingle();
          setGerant((gerantData as ProfilGérant | null) ?? null);
        } else {
          setGerant(null);
        }

        const cle = new Date().toISOString().slice(0, 7);
        return listeLoyers.find((l) => moisDe(l.mois) === cle) ?? null;
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue lors du chargement.");
        return null;
      } finally {
        setChargement(false);
      }
    },
    [supabase, user]
  );

  useEffect(() => {
    charger();
  }, [charger]);

  // Loyer du mois en cours
  const loyerDuMois = useMemo(() => {
    const cle = new Date().toISOString().slice(0, 7);
    return loyers.find((l) => moisDe(l.mois) === cle) ?? null;
  }, [loyers]);

  const paiementsEnAttente = useMemo(
    () => paiements.filter((p) => p.statut === "en_attente").length,
    [paiements]
  );

  const verificationEpuisee = paiementsEnAttente > 0 && toursVerifications >= NB_TOURS_VERIFICATIONS;

  const recus = useMemo(() => {
    return loyers
      .filter((l) => l.statut === "paye" || Number(l.montant_paye || 0) > 0)
      .map((loyer) => {
        const paiementsLoyer = paiements.filter((p) => p.loyer_id === loyer.id);
        const paiement =
          paiementsLoyer.find((p) => p.statut === "confirme") ?? paiementsLoyer[0] ?? null;
        return { loyer, paiement };
      });
  }, [loyers, paiements]);

  // -----------------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------------
  /**
   * Interroge le backend (GET /api/pay/status/{reference}) pour les
   * paiements en attente, applique localement les confirmations reçues
   * (miroir du webhook), puis recharge le dossier.
   */
  const verifier = useCallback(async (silencieux = false) => {
    if (!silencieux) setVerification(true);
    let confirmes = 0;
    let derniereErreur: string | null = null;
    let avertissement: string | null = null;

    for (const paiement of paiements) {
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

    const loyerRecharge = await charger(true);
    if (!silencieux) setVerification(false);
    if (silencieux) return;

    if (confirmes > 0) {
      setMessage({
        type: "succes",
        texte: `Paiement confirmé — votre suivi de paiement et votre loyer sont à jour. Votre reçu PDF est disponible ci-dessous.${avertissement ? ` (${avertissement})` : ""}`
      });
    } else if (loyerRecharge && loyerRecharge.statut === "paye") {
      setMessage({
        type: "succes",
        texte: `Paiement confirmé — votre loyer de ${nomMois(loyerRecharge.mois)} est réglé. Votre reçu PDF est disponible ci-dessous.`
      });
    } else if (derniereErreur) {
      setMessage({ type: "erreur", texte: `Vérification incomplète : ${derniereErreur}` });
    } else {
      setMessage({
        type: "succes",
        texte: "Paiement encore en attente de confirmation côté opérateur. Réessayez dans quelques instants."
      });
    }
  }, [charger, paiements, supabase]);

  const refVerifier = useRef(verifier);
  useEffect(() => {
    refVerifier.current = verifier;
  });

  // Vérification arrière-plan bornée tant qu'un paiement reste en attente
  useEffect(() => {
    if (paiementsEnAttente === 0 || verificationEpuisee) return;
    const minuteur = setInterval(() => {
      setToursVerifications((t) => t + 1);
      refVerifier.current(true);
    }, 5000);
    return () => clearInterval(minuteur);
  }, [paiementsEnAttente, verificationEpuisee]);

  const payer = async (methode: MobileMoney) => {
    if (!locataire || !loyerDuMois) return;
    const telephone = locataire.telephone;
    const montant = resteALoyer(loyerDuMois);
    const libelle = MOBILE_MONEY[methode].label;

    if (!telephone) {
      setMessage({
        type: "erreur",
        texte: "Aucun numéro de téléphone enregistré sur votre profil : contactez votre gérant."
      });
      return;
    }
    if (montant <= 0) {
      setMessage({ type: "succes", texte: `Votre loyer de ${nomMois(loyerDuMois.mois)} est déjà réglé.` });
      return;
    }

    setMethodeEnCours(methode);
    const fenetre = nouvelleFenetre();

    try {
      const resultat = await initierPaiement(methode, {
        loyer_id: loyerDuMois.id,
        montant,
        telephone,
        description: `Loyer ${nomMois(loyerDuMois.mois)} — app. ${locataire.appartements?.numero ?? ""}`
      });

      // Le backend doit d'abord avoir ouvert une vraie session de paiement :
      // aucune ligne « en attente » n'est créée sinon (pas de fantôme éternel).
      if (!resultat.payment_url && !resultat.qr_data) {
        throw new Error("Le backend n'a renvoyé aucune URL de paiement.");
      }

      // Suivi local du paiement en attente de confirmation (erreur contrôlée)
      const { error: errSuivi } = await supabase.from("paiements").insert([
        {
          loyer_id: loyerDuMois.id,
          locataire_id: locataire.id,
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
          texte: `${libelle} : demande de paiement ouverte, mais le suivi local n'a pas pu être enregistré (${errSuivi.message}).`
        });
        return;
      }
      setToursVerifications(0);

      if (resultat.payment_url) {
        diriger(fenetre, resultat.payment_url);
      } else {
        fermerFenetre(fenetre);
      }

      if (resultat.qr_data) {
        setQrImage(true);
        setQr({ data: resultat.qr_data, url: resultat.payment_url });
      } else {
        setPaiementOuvert(false);
        setMessage({
          type: "succes",
          texte: `${libelle} — validez le paiement de ${fcfa(montant)} sur votre téléphone, puis vérifiez son statut.`
        });
      }

      await charger(true);
    } catch (e) {
      fermerFenetre(fenetre);
      const texte = e instanceof Error ? e.message : "Erreur inattendue.";
      setMessage({
        type: "erreur",
        texte: texte.includes(ERREUR_BACKEND) ? texte : `${libelle} : ${texte}`
      });
    } finally {
      setMethodeEnCours(null);
    }
  };

  const telechargerRecu = async (loyer: Loyer, paiement: Paiement | null) => {
    setRecuEnCours(loyer.id);
    try {
      const url = await genererDocument(["receipt"], {
        loyer_id: loyer.id,
        paiement_id: paiement?.id ?? null,
        donnees: await donneesRecu(loyer.id, paiement?.id ?? null)
      });
      diriger(nouvelleFenetre(), url);
    } catch (e) {
      const texte = e instanceof Error ? e.message : "Erreur inattendue.";
      setMessage({
        type: "erreur",
        texte: texte.includes(ERREUR_BACKEND) ? texte : `Reçu PDF : ${texte}`
      });
    } finally {
      setRecuEnCours(null);
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
        message="Connectez-vous pour consulter votre loyer et vos reçus."
        href="/"
        libelle="Se connecter"
      />
    );
  if (role !== "locataire")
    return (
      <EcranAcces
        titre="Espace locataire"
        message="Cette page est réservée aux locataires de Sunu Keur."
        href={role === "proprietaire" ? "/owner" : role === "gerant" || role === "super_admin" ? "/dashboard" : "/"}
        libelle="Aller à mon tableau de bord"
      />
    );

  const appartement = locataire?.appartements ?? null;
  const immeuble = appartement?.immeubles ?? null;
  const montantDu = loyerDuMois ? resteALoyer(loyerDuMois) : 0;
  const estPaye = !!loyerDuMois && loyerDuMois.statut === "paye";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-or-500">Espace locataire</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">
            Bonjour {locataire?.nom?.split(" ")[0] ?? ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivez votre loyer, payez par Mobile Money et récupérez vos reçus à tout moment.
          </p>
        </div>
        <Button variant="outline" onClick={() => verifier()} loading={verification}>
          <RefreshCw className="h-4 w-4" /> Vérifier mon paiement
        </Button>
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

      {verificationEpuisee && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
          La vérification automatique s&apos;est interrompue après {NB_TOURS_VERIFICATIONS} tentatives. Cliquez sur
          &laquo;&nbsp;Vérifier mon paiement&nbsp;&raquo; pour relancer la synchronisation avec le backend.
        </div>
      )}

      {chargement ? (
        <EcranChargement texte="Récupération de votre dossier…" />
      ) : !locataire ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-or-500/15">
              <ShieldCheck className="h-7 w-7 text-or-500" />
            </div>
            <p className="font-serif text-lg font-semibold">Aucun dossier locataire</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Votre compte n&apos;est pas encore relié à un appartement. Votre gérant peut rattacher votre profil en
              quelques clics.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            {/* MON LOYER */}
            <Card className="lg:col-span-3">
              <CardContent className="p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      Mon loyer · {loyerDuMois ? nomMois(loyerDuMois.mois) : nomMois(new Date().toISOString())}
                    </p>
                    <p className="mt-3 font-serif text-4xl font-bold">
                      {loyerDuMois ? <CountUp to={montantDu} currency /> : fcfa(Number(appartement?.loyer_mensuel || 0))}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {estPaye
                        ? "Loyer réglé pour ce mois."
                        : loyerDuMois
                          ? `Reste à payer · échéance du ${dateCourte(loyerDuMois.date_echeance)}`
                          : "Aucun loyer émis pour ce mois."}
                    </p>
                  </div>
                  <Badge tone={estPaye ? "success" : loyerDuMois ? "danger" : "neutral"} className="text-sm">
                    {estPaye ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Payé
                      </>
                    ) : loyerDuMois ? (
                      "Impayé"
                    ) : (
                      "En attente d'émission"
                    )}
                  </Badge>
                </div>

                {loyerDuMois && Number(loyerDuMois.montant_paye || 0) > 0 && !estPaye && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Déjà versé : <span className="font-medium text-foreground">{fcfa(Number(loyerDuMois.montant_paye))}</span>
                  </p>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    variant="success"
                    size="lg"
                    disabled={!loyerDuMois || estPaye}
                    onClick={() => {
                      setQr(null);
                      setPaiementOuvert(true);
                    }}
                  >
                    <Wallet className="h-4 w-4" /> {estPaye ? "Loyer réglé" : "Payer maintenant"}
                  </Button>
                  <Button variant="outline" size="lg" loading={verification} onClick={() => verifier()}>
                    <RefreshCw className="h-4 w-4" /> Vérifier mon paiement
                  </Button>
                </div>

                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-or-500" />
                  Paiement par Wave, Orange Money ou Free Money — confirmation automatique par votre gérant.
                </p>
              </CardContent>
            </Card>

            {/* LOGEMENT */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-or-500" /> Mon logement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Immeuble</span>
                  <span className="font-medium">{immeuble?.nom ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Adresse</span>
                  <span className="text-right font-medium">
                    {immeuble ? `${immeuble.adresse}, ${immeuble.ville}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Appartement</span>
                  <span className="font-medium">
                    {appartement ? `N° ${appartement.numero}${appartement.type ? ` · ${appartement.type}` : ""}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Loyer mensuel</span>
                  <span className="font-medium">{fcfa(Number(appartement?.loyer_mensuel || 0))}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* REÇUS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-or-500" /> Mes reçus de paiement
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Chaque loyer réglé dispose d&apos;un reçu PDF officiel à présenter quand vous le souhaitez.
              </p>
            </CardHeader>
            <CardContent>
              {recus.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Download className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium">Aucun reçu pour le moment</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Vos reçus apparaîtront ici dès que votre premier loyer sera confirmé.
                  </p>
                </div>
              ) : (
                <Stagger className="space-y-3">
                  {recus.map(({ loyer, paiement }) => (
                    <motion.div
                      key={loyer.id}
                      variants={staggerItem}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            loyer.statut === "paye" ? "bg-emeraude-500/15" : "bg-or-500/15"
                          }`}
                        >
                          <CheckCircle2
                            className={`h-5 w-5 ${loyer.statut === "paye" ? "text-emeraude-500" : "text-or-500"}`}
                          />
                        </div>
                        <div>
                          <p className="font-medium">{nomMois(loyer.mois)}</p>
                          <p className="text-xs text-muted-foreground">
                            {fcfa(Number(loyer.montant_paye || loyer.montant || 0))}
                            {paiement && ` · ${paiement.methode.replace("_", " ")} · ${dateCourte(paiement.created_at)}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge tone={loyer.statut === "paye" ? "success" : "warning"}>
                          {loyer.statut === "paye" ? "Payé" : "Partiel"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={recuEnCours === loyer.id}
                          onClick={() => telechargerRecu(loyer, paiement)}
                        >
                          <Download className="h-4 w-4" /> Reçu PDF
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </Stagger>
              )}
            </CardContent>
          </Card>

          {/* GÉRANT */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Votre gérant</p>
                <p className="mt-1 font-serif text-lg font-semibold">{gerant?.nom ?? "Agence Sunu Keur"}</p>
                <p className="text-sm text-muted-foreground">
                  {gerant?.telephone ? formatTel(gerant.telephone) : "Coordonnées transmises par l'agence"}
                  {gerant?.email && ` · ${gerant.email}`}
                </p>
              </div>
              {gerant?.telephone && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => window.open(`tel:${gerant.telephone}`)}>
                    <Phone className="h-4 w-4" /> Appeler
                  </Button>
                  <Button
                    variant="success"
                    onClick={() =>
                      window.open(
                        lienWhatsApp(
                          gerant.telephone as string,
                          `Salam ${gerant.nom}, j'ai une question sur mon loyer${
                            loyerDuMois ? ` de ${nomMois(loyerDuMois.mois)}` : ""
                          } à l'appartement ${appartement?.numero ?? ""}.`
                        ),
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* MODAL PAIEMENT */}
      <Modal
        open={paiementOuvert}
        onClose={() => {
          setPaiementOuvert(false);
          setQr(null);
          charger(true);
        }}
        title={qr ? "Scannez et payez" : "Payer mon loyer"}
      >
        {qr ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-creme p-5 text-center dark:bg-nuit-800">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceQr(qr.data)}
                  alt="QR code de paiement"
                  className="mx-auto rounded-lg bg-white p-2"
                  width={240}
                  height={240}
                  onError={() => setQrImage(false)}
                />
              ) : (
                <code className="block break-all rounded-lg bg-white p-4 text-xs text-nuit-900">{qr.data}</code>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Scannez ce code depuis votre application Mobile Money, puis confirmez le montant.
              </p>
            </div>
            <Button
              variant="success"
              className="w-full"
              onClick={() => {
                setPaiementOuvert(false);
                setQr(null);
                verifier();
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> J&apos;ai payé, vérifier
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-5 rounded-xl border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                {loyerDuMois ? `Loyer de ${nomMois(loyerDuMois.mois)}` : "Loyer du mois"}
              </p>
              <p className="mt-1 font-serif text-2xl font-bold">{fcfa(montantDu)}</p>
              <p className="text-xs text-muted-foreground">
                Payé depuis le numéro {locataire?.telephone ? formatTel(locataire.telephone) : "—"}
              </p>
            </div>

            <div className="space-y-2">
              {METHODES_MOBILE.map((methode) => {
                const operateur = MOBILE_MONEY[methode];
                return (
                  <button
                    key={methode}
                    type="button"
                    disabled={!!methodeEnCours}
                    onClick={() => payer(methode)}
                    className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition hover:border-or-500/50 hover:bg-muted/40 disabled:opacity-50"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: operateur.couleur }}
                    >
                      {methodeEnCours === methode ? "…" : operateur.initiale}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium">{operateur.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        Paiement instantané confirmé par SMS
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Après validation sur votre téléphone, revenez sur cette page pour vérifier le paiement.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
