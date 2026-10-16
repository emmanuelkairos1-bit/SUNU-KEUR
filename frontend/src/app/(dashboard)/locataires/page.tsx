// =====================================================================
// LOCATAIRES — CRUD complet + fiche en Drawer (3 onglets animés)
// Recherche · filtre actif/archivé · upload CNI & Contrat (Storage)
// =====================================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Appartement, Immeuble, Loyer, Locataire, StatutLocataire } from "@/lib/types";
import { cn, fcfa, formatTel, initiales, lienWhatsApp, nomMois } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Stagger, staggerItem } from "@/components/ui/motion";
import { EcranAcces } from "../_components/ecrans";

// ---------------------------------------------------------------------
// Types & constantes
// ---------------------------------------------------------------------
interface Formulaire {
  id: string | null;
  nom: string;
  telephone: string;
  email: string;
  appartementId: string;
  cniUrl: string | null;
  contratUrl: string | null;
}

type FiltreStatut = "tous" | "actif" | "archive";
type IdOnglet = "infos" | "documents" | "historique";

const ONGLETS: { id: IdOnglet; label: string }[] = [
  { id: "infos", label: "Infos" },
  { id: "documents", label: "Documents" },
  { id: "historique", label: "Historique" }
];

const LIBELLE_FILTRE: Record<FiltreStatut, string> = { tous: "Tous", actif: "Actifs", archive: "Archivés" };
const LIBELLE_STATUT: Record<StatutLocataire, string> = { actif: "Actif", archive: "Archivé" };

const FORMULAIRE_VIDE: Formulaire = {
  id: null,
  nom: "",
  telephone: "",
  email: "",
  appartementId: "",
  cniUrl: null,
  contratUrl: null
};

const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES_CNI = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

// ---------------------------------------------------------------------
// Aperçu d'un document (PDF en iframe, image en Image)
// ---------------------------------------------------------------------
function ApercuDocument({ url, titre }: { url: string | null | undefined; titre: string }) {
  const estPdf = url ? /\.pdf(\?|$)/i.test(url) : false;

  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-or-500" />
          {titre}
        </p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Télécharger ${titre}`}
            className="rounded-full border bg-card p-2 text-muted-foreground transition hover:bg-emeraude-500 hover:text-white"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>

      {url ? (
        estPdf ? (
          <iframe src={url} title={titre} className="h-60 w-full rounded-lg border bg-muted" />
        ) : (
          <div className="relative h-60 w-full overflow-hidden rounded-lg border bg-muted">
            <Image src={url} alt={titre} fill sizes="(max-width: 768px) 100vw, 400px" className="object-contain" />
          </div>
        )
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Aucun document enregistré
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------
export default function PageLocataires() {
  const { user, role, loading: chargementAuth } = useAuth();

  const [chargement, setChargement] = useState(true);
  const [immeubles, setImmeubles] = useState<Immeuble[]>([]);
  const [appartements, setAppartements] = useState<Appartement[]>([]);
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);

  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<FiltreStatut>("tous");

  // Formulaire (ajout / édition)
  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState<Formulaire>(FORMULAIRE_VIDE);
  const [fichierCni, setFichierCni] = useState<File | null>(null);
  const [fichierContrat, setFichierContrat] = useState<File | null>(null);
  const [cleFichiers, setCleFichiers] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  // Fiche
  const [fiche, setFiche] = useState<Locataire | null>(null);
  const [onglet, setOnglet] = useState<IdOnglet>("infos");
  const [loyersFiche, setLoyersFiche] = useState<Loyer[]>([]);
  const [chargementLoyers, setChargementLoyers] = useState(false);

  // Suppression
  const [aSupprimer, setASupprimer] = useState<Locataire | null>(null);

  // -------------------------------------------------------------------
  // Chargement
  // -------------------------------------------------------------------
  const charger = useCallback(async (): Promise<Locataire[]> => {
    if (!user?.id) return [];
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
        setAppartements([]);
        setLocataires([]);
        return [];
      }

      const { data: listeAppartements, error: errAppartements } = await supabase
        .from("appartements")
        .select("*, immeubles(*)")
        .in("immeuble_id", immeubleIds)
        .order("numero");
      if (errAppartements) throw new Error(errAppartements.message);
      setAppartements((listeAppartements ?? []) as Appartement[]);

      const appartementIds = ((listeAppartements ?? []) as Appartement[]).map((a) => a.id);
      if (!appartementIds.length) {
        setLocataires([]);
        return [];
      }

      const { data: listeLocataires, error: errLocataires } = await supabase
        .from("locataires")
        .select("*, appartements(*, immeubles(*))")
        .in("appartement_id", appartementIds)
        .order("created_at", { ascending: false });
      if (errLocataires) throw new Error(errLocataires.message);
      const lignes = (listeLocataires ?? []) as Locataire[];
      setLocataires(lignes);
      return lignes;
    } catch (e) {
      setErreurGlobale(e instanceof Error ? e.message : "Impossible de charger les locataires.");
      setLocataires([]);
      setAppartements([]);
      return [];
    } finally {
      setChargement(false);
    }
  }, [user?.id, role]);

  useEffect(() => {
    if (user?.id) charger();
  }, [user?.id, charger]);

  // -------------------------------------------------------------------
  // Listes filtrées
  // -------------------------------------------------------------------
  const locatairesFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return locataires.filter((l) => {
      const conformeFiltre = filtre === "tous" ? true : l.statut === filtre;
      const conformeRecherche = !q || l.nom.toLowerCase().includes(q);
      return conformeFiltre && conformeRecherche;
    });
  }, [locataires, recherche, filtre]);

  const compteActifs = useMemo(() => locataires.filter((l) => l.statut === "actif").length, [locataires]);
  const compteArchives = useMemo(() => locataires.filter((l) => l.statut === "archive").length, [locataires]);

  const appartementsDisponibles = useMemo(
    () => appartements.filter((a) => a.statut !== "occupe" || a.id === form.appartementId),
    [appartements, form.appartementId]
  );

  // -------------------------------------------------------------------
  // Téléversement Storage (bucket "documents")
  // -------------------------------------------------------------------
  const televerser = async (fichier: File, dossier: "cni" | "contrat"): Promise<string> => {
    const supabase = getSupabaseBrowser();
    const extension = (fichier.name.split(".").pop() || "bin").toLowerCase();
    const chemin = `${dossier}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error } = await supabase.storage.from("documents").upload(chemin, fichier, { upsert: false });
    if (error) throw new Error(`Échec du téléversement (${dossier}) : ${error.message}`);
    const { data } = supabase.storage.from("documents").getPublicUrl(chemin);
    return data.publicUrl;
  };

  const validerFichiers = (): string | null => {
    if (fichierCni) {
      const conforme =
        fichierCni.type
          ? TYPES_CNI.includes(fichierCni.type)
          : /\.(png|jpe?g|webp|pdf)$/i.test(fichierCni.name);
      if (!conforme) return "La CNI doit être une image (PNG, JPG, WEBP) ou un PDF.";
      if (fichierCni.size > TAILLE_MAX) return "La CNI dépasse 10 Mo.";
    }
    if (fichierContrat) {
      if (fichierContrat.type && fichierContrat.type !== "application/pdf")
        return "Le contrat doit être un fichier PDF.";
      if (!fichierContrat.type && !/\.pdf$/i.test(fichierContrat.name)) return "Le contrat doit être un fichier PDF.";
      if (fichierContrat.size > TAILLE_MAX) return "Le contrat dépasse 10 Mo.";
    }
    return null;
  };

  // -------------------------------------------------------------------
  // Formulaire : ouverture / soumission
  // -------------------------------------------------------------------
  const ouvrirFormulaire = (locataire?: Locataire) => {
    setForm(
      locataire
        ? {
            id: locataire.id,
            nom: locataire.nom,
            telephone: locataire.telephone ?? "",
            email: locataire.email ?? "",
            appartementId: locataire.appartement_id ?? "",
            cniUrl: locataire.cni_url ?? null,
            contratUrl: locataire.contrat_url ?? null
          }
        : FORMULAIRE_VIDE
    );
    setFichierCni(null);
    setFichierContrat(null);
    setErreurForm(null);
    setCleFichiers((k) => k + 1);
    setFormOuvert(true);
  };

  const fermerFormulaire = () => {
    setFormOuvert(false);
    setErreurForm(null);
  };

  const libererAppartement = async (appartementId: string, locataireExclu: string) => {
    const supabase = getSupabaseBrowser();
    const autreActif = locataires.some(
      (l) => l.id !== locataireExclu && l.appartement_id === appartementId && l.statut === "actif"
    );
    if (autreActif) return;
    const { error } = await supabase.from("appartements").update({ statut: "vacant" }).eq("id", appartementId);
    if (error) throw new Error(error.message);
  };

  const occuperAppartement = async (appartementId: string) => {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from("appartements").update({ statut: "occupe" }).eq("id", appartementId);
    if (error) throw new Error(error.message);
  };

  const soumettreFormulaire = async (e: React.FormEvent) => {
    e.preventDefault();
    const nom = form.nom.trim();
    if (!nom) {
      setErreurForm("Le nom du locataire est obligatoire.");
      return;
    }
    if (!form.appartementId) {
      setErreurForm("Sélectionnez un appartement pour ce locataire.");
      return;
    }
    const erreurFichier = validerFichiers();
    if (erreurFichier) {
      setErreurForm(erreurFichier);
      return;
    }

    setEnvoi(true);
    setErreurForm(null);
    try {
      const supabase = getSupabaseBrowser();

      const cniUrl = fichierCni ? await televerser(fichierCni, "cni") : form.cniUrl;
      const contratUrl = fichierContrat ? await televerser(fichierContrat, "contrat") : form.contratUrl;

      const charge = {
        nom,
        telephone: form.telephone.trim() || null,
        email: form.email.trim() || null,
        appartement_id: form.appartementId,
        cni_url: cniUrl,
        contrat_url: contratUrl
      };

      if (form.id) {
        const existante = locataires.find((l) => l.id === form.id);
        const ancienAppartement = existante?.appartement_id ?? null;

        const { error } = await supabase.from("locataires").update(charge).eq("id", form.id);
        if (error) throw new Error(error.message);

        if (ancienAppartement !== form.appartementId) {
          if (ancienAppartement) await libererAppartement(ancienAppartement, form.id);
          await occuperAppartement(form.appartementId);
        }
      } else {
        const { error } = await supabase.from("locataires").insert({
          ...charge,
          statut: "actif"
        });
        if (error) throw new Error(error.message);
        await occuperAppartement(form.appartementId);
      }

      fermerFormulaire();
      const listeMaj = await charger();
      if (fiche && fiche.id === form.id) {
        const maj = listeMaj.find((l) => l.id === form.id);
        if (maj) setFiche({ ...maj, ...charge });
      }
    } catch (e2) {
      setErreurForm(e2 instanceof Error ? e2.message : "Enregistrement impossible. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  // -------------------------------------------------------------------
  // Archive / suppression
  // -------------------------------------------------------------------
  const basculerStatut = async (locataire: Locataire) => {
    const nouvelle: StatutLocataire = locataire.statut === "actif" ? "archive" : "actif";
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from("locataires").update({ statut: nouvelle }).eq("id", locataire.id);
    if (error) {
      setErreurGlobale(error.message);
      return;
    }
    try {
      if (locataire.appartement_id) {
        if (nouvelle === "actif") {
          const apt = appartements.find((a) => a.id === locataire.appartement_id);
          if (apt?.statut === "vacant") await occuperAppartement(locataire.appartement_id);
        } else {
          // Archivage : l'appartement redevient affectable à un nouveau locataire
          await libererAppartement(locataire.appartement_id, locataire.id);
        }
      }
    } catch (e) {
      setErreurGlobale(
        e instanceof Error ? e.message : "Impossible de mettre à jour l'appartement."
      );
    }
    const listeMaj = await charger();
    setFiche((courante) => {
      if (!courante || courante.id !== locataire.id) return courante;
      return listeMaj.find((l) => l.id === locataire.id) ?? { ...courante, statut: nouvelle };
    });
  };

  const confirmerSuppression = async () => {
    if (!aSupprimer) return;
    setEnvoi(true);
    try {
      const supabase = getSupabaseBrowser();

      // Détacher l'historique avant suppression (pas de FK côté shim)
      const { error: errLoyers } = await supabase
        .from("loyers")
        .update({ locataire_id: null })
        .eq("locataire_id", aSupprimer.id);
      if (errLoyers) throw new Error(`Détachement des loyers impossible : ${errLoyers.message}`);

      const { error: errPaiements } = await supabase
        .from("paiements")
        .update({ locataire_id: null })
        .eq("locataire_id", aSupprimer.id);
      if (errPaiements) throw new Error(`Détachement des paiements impossible : ${errPaiements.message}`);

      const { error } = await supabase.from("locataires").delete().eq("id", aSupprimer.id);
      if (error) throw new Error(error.message);
      if (aSupprimer.appartement_id) await libererAppartement(aSupprimer.appartement_id, aSupprimer.id);
      setFiche((courante) => (courante && courante.id === aSupprimer.id ? null : courante));
      setASupprimer(null);
      await charger();
    } catch (e) {
      setErreurGlobale(e instanceof Error ? e.message : "Suppression impossible.");
      setASupprimer(null);
    } finally {
      setEnvoi(false);
    }
  };

  // -------------------------------------------------------------------
  // Fiche (Drawer) + historique des loyers
  // -------------------------------------------------------------------
  const ouvrirFiche = async (locataire: Locataire) => {
    setFiche(locataire);
    setOnglet("infos");
    setLoyersFiche([]);
    setChargementLoyers(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("loyers")
        .select("*")
        .eq("locataire_id", locataire.id)
        .order("mois", { ascending: false });
      if (error) throw new Error(error.message);
      setLoyersFiche((data ?? []) as Loyer[]);
    } catch (e) {
      setErreurGlobale(e instanceof Error ? e.message : "Historique indisponible.");
    } finally {
      setChargementLoyers(false);
    }
  };

  const totalDuFiche = loyersFiche.reduce((somme, l) => somme + Number(l.montant ?? 0), 0);
  const totalPayeFiche = loyersFiche.reduce((somme, l) => somme + Number(l.montant_paye ?? 0), 0);
  const resteFiche = Math.max(0, totalDuFiche - totalPayeFiche);

  const appartementFiche = fiche?.appartements ?? null;
  const immeubleFiche = appartementFiche?.immeubles ?? null;

  // -------------------------------------------------------------------
  // Guards (session absente → pas de squelette infini)
  // -------------------------------------------------------------------
  if (!chargementAuth && !user) {
    return (
      <EcranAcces
        titre="Connexion requise"
        message="Connectez-vous pour consulter et gérer vos locataires."
        href="/"
        libelle="Se connecter"
      />
    );
  }

  if (user && role === "locataire") {
    return (
      <EcranAcces
        titre="Espace réservé"
        message="La gestion des locataires est réservée aux gérants et aux propriétaires de l'agence."
        href="/locataire"
        libelle="Aller à mon espace"
      />
    );
  }

  // -------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ---------------- En-tête ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Locataires</h1>
          <p className="text-sm text-muted-foreground">
            {compteActifs} actif(s) · {compteArchives} archivé(s) · {locataires.length} au total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un nom…"
              aria-label="Rechercher un locataire"
              className="w-56 pl-9"
            />
          </div>

          <div className="flex rounded-lg border bg-muted/50 p-1">
            {(["tous", "actif", "archive"] as FiltreStatut[]).map((f) => {
              const actif = filtre === f;
              const compte = f === "tous" ? locataires.length : f === "actif" ? compteActifs : compteArchives;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltre(f)}
                  className={cn(
                    "relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    actif ? "text-white dark:text-nuit-900" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {actif && (
                    <motion.span
                      layoutId="filtre-locataires"
                      className="absolute inset-0 rounded-md bg-nuit-900 dark:bg-emeraude-500"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {LIBELLE_FILTRE[f]} ({compte})
                  </span>
                </button>
              );
            })}
          </div>

          <Button variant="accent" onClick={() => ouvrirFormulaire()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      {/* ---------------- Erreur globale ---------------- */}
      {erreurGlobale && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {erreurGlobale}
        </div>
      )}

      {/* ---------------- Liste ---------------- */}
      {chargement || chargementAuth ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border bg-card p-5 shadow-soft">
              <div className="mb-4 h-10 w-10 animate-pulse rounded-full bg-muted" />
              <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : locataires.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-14 text-center shadow-soft">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-serif text-lg font-semibold">Aucun locataire enregistré</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Ajoutez votre premier locataire, assignez-lui un appartement vacant et joignez sa CNI ainsi que son
            contrat de bail.
          </p>
          <Button variant="accent" onClick={() => ouvrirFormulaire()}>
            <Plus className="h-4 w-4" /> Ajouter un locataire
          </Button>
        </div>
      ) : locatairesFiltres.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center shadow-soft">
          <p className="font-serif text-lg font-semibold">Aucun résultat</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Aucun locataire ne correspond à « {recherche || LIBELLE_FILTRE[filtre]} ».
          </p>
        </div>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" key={`${filtre}-${recherche}`}>
          {locatairesFiltres.map((locataire) => {
            const appartement = locataire.appartements ?? null;
            const immeuble = appartement?.immeubles ?? null;
            return (
              <motion.div
                key={locataire.id}
                variants={staggerItem}
                className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-soft"
              >
                <div>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                          locataire.statut === "actif" ? "bg-emeraude-500" : "bg-muted-foreground/60"
                        )}
                      >
                        {initiales(locataire.nom)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-serif font-semibold">{locataire.nom}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {appartement ? `App. ${appartement.numero}` : "Sans appartement"}
                          {immeuble ? ` · ${immeuble.nom}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge tone={locataire.statut === "actif" ? "success" : "neutral"}>
                      {LIBELLE_STATUT[locataire.statut]}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {formatTel(locataire.telephone)}
                    </p>
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {locataire.email || "—"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      {appartement ? `${fcfa(Number(appartement.loyer_mensuel))}/mois` : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1.5 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => ouvrirFiche(locataire)} className="flex-1">
                    Voir la fiche
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    title="Modifier"
                    aria-label={`Modifier ${locataire.nom}`}
                    onClick={() => ouvrirFormulaire(locataire)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    title={locataire.statut === "actif" ? "Archiver" : "Désarchiver"}
                    aria-label={locataire.statut === "actif" ? "Archiver" : "Désarchiver"}
                    onClick={() => basculerStatut(locataire)}
                  >
                    {locataire.statut === "actif" ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <ArchiveRestore className="h-4 w-4 text-emeraude-500" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-red-500 hover:text-red-600"
                    title="Supprimer"
                    aria-label={`Supprimer ${locataire.nom}`}
                    onClick={() => setASupprimer(locataire)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </Stagger>
      )}

      {/* ---------------- MODAL : ajout / édition ---------------- */}
      <Modal
        open={formOuvert}
        onClose={fermerFormulaire}
        title={form.id ? "Modifier le locataire" : "Nouveau locataire"}
        className="max-w-2xl"
      >
        <form onSubmit={soumettreFormulaire}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nom complet *">
                <Input
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex. Aminata Diop"
                  autoFocus
                />
              </Field>
            </div>

            <Field label="Téléphone">
              <Input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="+221 77 000 00 00"
              />
            </Field>

            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="locataire@email.com"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Appartement *"
                hint="Seuls les appartements vacants (ou l'actuel) sont proposés."
              >
                <Select
                  value={form.appartementId}
                  onChange={(e) => setForm({ ...form, appartementId: e.target.value })}
                >
                  <option value="">
                    {appartementsDisponibles.length ? "— Choisir un appartement —" : "Aucun appartement disponible"}
                  </option>
                  {appartementsDisponibles.map((a) => (
                    <option key={a.id} value={a.id}>
                      App. {a.numero} — {a.immeubles?.nom ?? "—"} — {fcfa(Number(a.loyer_mensuel))}/mois
                      {a.statut && a.statut !== "vacant" ? " (occupé)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Pièce d'identité (CNI)">
              <input
                key={`cni-${cleFichiers}`}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setFichierCni(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-lg border border-input bg-background file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/70"
              />
              {fichierCni ? (
                <p className="mt-1 truncate text-xs text-emeraude-500">Nouveau : {fichierCni.name}</p>
              ) : form.cniUrl ? (
                <a
                  href={form.cniUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  <FileText className="h-3 w-3" /> Document actuel
                </a>
              ) : null}
            </Field>

            <Field label="Contrat de bail (PDF)">
              <input
                key={`contrat-${cleFichiers}`}
                type="file"
                accept="application/pdf"
                onChange={(e) => setFichierContrat(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-lg border border-input bg-background file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/70"
              />
              {fichierContrat ? (
                <p className="mt-1 truncate text-xs text-emeraude-500">Nouveau : {fichierContrat.name}</p>
              ) : form.contratUrl ? (
                <a
                  href={form.contratUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  <FileText className="h-3 w-3" /> Contrat actuel
                </a>
              ) : null}
            </Field>
          </div>

          {erreurForm && (
            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {erreurForm}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fermerFormulaire}>
              Annuler
            </Button>
            <Button type="submit" variant="success" loading={envoi}>
              {form.id ? "Enregistrer" : "Créer le locataire"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---------------- MODAL : suppression ---------------- */}
      <Modal open={!!aSupprimer} onClose={() => setASupprimer(null)} title="Supprimer le locataire">
        <p className="mb-1 text-sm">
          Vous êtes sur le point de définitivement supprimer{" "}
          <span className="font-semibold">{aSupprimer?.nom}</span>.
        </p>
        <p className="mb-5 text-sm text-muted-foreground">
          Ses loyers resteront au dossier mais seront détachés du locataire. Cette action est irréversible.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setASupprimer(null)}>
            Annuler
          </Button>
          <Button variant="destructive" loading={envoi} onClick={confirmerSuppression}>
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
        </div>
      </Modal>

      {/* ---------------- DRAWER : fiche ---------------- */}
      <Drawer open={!!fiche} onClose={() => setFiche(null)} title={fiche?.nom ?? "Fiche locataire"}>
        {fiche && (
          <div>
            {/* En-tête de fiche */}
            <div className="mb-5 flex items-center gap-3">
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white",
                  fiche.statut === "actif" ? "bg-emeraude-500" : "bg-muted-foreground/60"
                )}
              >
                {initiales(fiche.nom)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-serif text-lg font-semibold">{fiche.nom}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={fiche.statut === "actif" ? "success" : "neutral"}>
                    {LIBELLE_STATUT[fiche.statut]}
                  </Badge>
                  {appartementFiche && <Badge tone="gold">App. {appartementFiche.numero}</Badge>}
                </div>
              </div>
            </div>

            {/* Onglets animés */}
            <div className="mb-4 flex gap-1 rounded-lg border bg-muted/50 p-1">
              {ONGLETS.map((o) => {
                const actif = onglet === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOnglet(o.id)}
                    className={cn(
                      "relative flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                      actif ? "text-white dark:text-nuit-900" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {actif && (
                      <motion.span
                        layoutId="onglet-fiche"
                        className="absolute inset-0 rounded-md bg-nuit-900 dark:bg-emeraude-500"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{o.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Contenu des onglets */}
            <AnimatePresence mode="wait">
              <motion.div
                key={onglet}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
              >
                {/* ---------- ONGLET 1 : INFOS ---------- */}
                {onglet === "infos" && (
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Téléphone</p>
                        <p className="font-medium">{formatTel(fiche.telephone)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="break-all font-medium">{fiche.email || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Appartement</p>
                        <p className="font-medium">
                          {appartementFiche ? `App. ${appartementFiche.numero}` : "Non assigné"}
                          {immeubleFiche ? ` · ${immeubleFiche.nom}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {appartementFiche
                            ? `${appartementFiche.type ?? "T2"} · étage ${appartementFiche.etage ?? 0} · ${fcfa(
                                Number(appartementFiche.loyer_mensuel)
                              )}/mois`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Inscrit le</p>
                        <p className="font-medium">
                          {new Date(fiche.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric"
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {fiche.telephone && (
                        <a
                          href={lienWhatsApp(
                            fiche.telephone,
                            `Salam ${fiche.nom}, message de votre gérant (Sunu Keur). Merci de me contacter, jazaakallah.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="success" size="sm">
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                          </Button>
                        </a>
                      )}
                      <Button variant="outline" size="sm" onClick={() => ouvrirFormulaire(fiche)}>
                        <Pencil className="h-4 w-4" /> Modifier
                      </Button>
                      <Button
                        variant={fiche.statut === "actif" ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => basculerStatut(fiche)}
                      >
                        {fiche.statut === "actif" ? (
                          <>
                            <Archive className="h-4 w-4" /> Archiver
                          </>
                        ) : (
                          <>
                            <ArchiveRestore className="h-4 w-4" /> Désarchiver
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => setASupprimer(fiche)}
                      >
                        <Trash2 className="h-4 w-4" /> Supprimer
                      </Button>
                    </div>
                  </div>
                )}

                {/* ---------- ONGLET 2 : DOCUMENTS ---------- */}
                {onglet === "documents" && (
                  <div className="space-y-4">
                    <ApercuDocument url={fiche.cni_url} titre="Carte d'identité (CNI)" />
                    <ApercuDocument url={fiche.contrat_url} titre="Contrat de bail" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => ouvrirFormulaire(fiche)}
                    >
                      <FileText className="h-4 w-4" /> Ajouter ou remplacer un document
                    </Button>
                  </div>
                )}

                {/* ---------- ONGLET 3 : HISTORIQUE ---------- */}
                {onglet === "historique" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">Total payé</p>
                        <p className="font-serif text-base font-bold text-emeraude-500">
                          <CountUp key={`paye-${fiche.id}`} to={totalPayeFiche} currency />
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">Reste à payer</p>
                        <p className="font-serif text-base font-bold text-orange-500">
                          <CountUp key={`reste-${fiche.id}`} to={resteFiche} currency />
                        </p>
                      </div>
                    </div>

                    {chargementLoyers ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/70" />
                        ))}
                      </div>
                    ) : loyersFiche.length === 0 ? (
                      <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                        <p className="text-sm font-medium">Aucun loyer enregistré</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Les loyers de ce locataire apparaîtront ici après le premier encaissement.
                        </p>
                        <Link href="/loyers" className="mt-3 inline-block">
                          <Button variant="accent" size="sm">
                            Ouvrir le tableau des loyers
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <>
                        <ul className="space-y-2">
                          {loyersFiche.map((loyer, index) => (
                            <motion.li
                              key={loyer.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(index * 0.05, 0.3) }}
                              className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{nomMois(loyer.mois)}</p>
                                <p className="text-xs text-muted-foreground">
                                  Dû {fcfa(Number(loyer.montant))} · payé {fcfa(Number(loyer.montant_paye))}
                                </p>
                              </div>
                              <Badge
                                tone={
                                  loyer.statut === "paye"
                                    ? "success"
                                    : loyer.statut === "partiel"
                                    ? "warning"
                                    : "danger"
                                }
                              >
                                {loyer.statut === "paye" ? "Payé" : loyer.statut === "partiel" ? "Partiel" : "Impayé"}
                              </Badge>
                            </motion.li>
                          ))}
                        </ul>
                        <p className="text-center text-xs text-muted-foreground">
                          Total dû sur la période : {fcfa(totalDuFiche)}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </Drawer>
    </div>
  );
}
