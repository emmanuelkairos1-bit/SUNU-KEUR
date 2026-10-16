// =====================================================================
// ONBOARDING GÉRANT — 3 étapes plein écran (hors dashboard)
// 1) Infos agence + logo (Storage "documents")  2) Premier immeuble
// 3) Invitation du propriétaire                  → /dashboard
// =====================================================================
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Mail,
  MapPin,
  Phone,
  Trash2,
  Upload,
  User
} from "lucide-react";

import { SunuKeurLogo } from "@/components/brand/logo";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { destinationParRole, estRoleConfiguration } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

type ImmeubleApercu = {
  id: string;
  nom: string;
  adresse: string;
  ville: string;
  nombre_appartements: number;
};

const ETAPES = [
  { titre: "Votre agence", sous: "Identité, contact et logo" },
  { titre: "Votre immeuble", sous: "Le premier bâtiment géré" },
  { titre: "Votre propriétaire", sous: "Invitation à suivre en un clic" }
];

const PROGRES = [33, 66, 100];

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 72 : -72, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -72 : 72, opacity: 0 })
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function MessageErreur({ texte }: { texte?: string }) {
  if (!texte) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-500">
      {texte}
    </p>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, role, loading, refresh } = useAuth();
  const initialise = useRef(false);

  // Seuls gérant / super_admin configurent une agence : les autres rôles
  // sont renvoyés vers leur propre espace (évite qu'un locataire crée un immeuble).
  useEffect(() => {
    if (!loading && user && role && !estRoleConfiguration(role)) {
      router.replace(destinationParRole(role));
    }
  }, [loading, user, role, router]);

  // --- navigation entre étapes ---
  const [etape, setEtape] = useState(1);
  const [direction, setDirection] = useState(1);
  const [enCours, setEnCours] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  // --- étape 1 : agence ---
  const [agenceNom, setAgenceNom] = useState("");
  const [gerantNom, setGerantNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [apercuLogo, setApercuLogo] = useState<string | null>(null);
  const [envoiLogo, setEnvoiLogo] = useState(false);
  const [nomFichier, setNomFichier] = useState<string | null>(null);

  // --- étape 2 : immeuble ---
  const [immeubleExistant, setImmeubleExistant] = useState<ImmeubleApercu | null>(null);
  const [nouveauFormulaire, setNouveauFormulaire] = useState(false);
  const [nomImmeuble, setNomImmeuble] = useState("");
  const [adresse, setAdresse] = useState("");
  const [ville, setVille] = useState("");
  const [nbAppartements, setNbAppartements] = useState("4");
  const [loyerMensuel, setLoyerMensuel] = useState("");

  // --- étape 3 : invitation ---
  const [emailProprio, setEmailProprio] = useState("");
  const [invitationEnvoyee, setInvitationEnvoyee] = useState(false);

  const avancer = () => {
    setErreurGlobale(null);
    setErreurs({});
    setDirection(1);
    setEtape((e) => Math.min(3, e + 1));
  };

  const reculer = () => {
    setErreurGlobale(null);
    setErreurs({});
    setDirection(-1);
    setEtape((e) => Math.max(1, e - 1));
  };

  // Préremplissage depuis le profil + détection d'un immeuble déjà créé
  useEffect(() => {
    if (!user || initialise.current) return;
    initialise.current = true;
    setAgenceNom(user.agence_nom ?? "");
    setGerantNom(user.nom ?? "");
    setTelephone(user.telephone ?? "");
    if (user.logo_url) setLogoUrl(user.logo_url);

    let annule = false;
    (async () => {
      const { data } = await getSupabaseBrowser()
        .from("immeubles")
        .select("id, nom, adresse, ville, nombre_appartements")
        .eq("gerant_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!annule && data) setImmeubleExistant(data as ImmeubleApercu);
    })();
    return () => {
      annule = true;
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (apercuLogo) URL.revokeObjectURL(apercuLogo);
    };
  }, [apercuLogo]);

  // ------------------------------------------------------------------
  // ÉTAPE 1 — logo + infos agence
  // ------------------------------------------------------------------
  const choisirLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || !user) return;

    if (!fichier.type.startsWith("image/")) {
      setErreurs((p) => ({ ...p, logo: "Choisissez une image (PNG, JPG ou SVG)." }));
      return;
    }
    if (fichier.size > 2 * 1024 * 1024) {
      setErreurs((p) => ({ ...p, logo: "Image trop lourde (2 Mo maximum)." }));
      return;
    }

    if (apercuLogo) URL.revokeObjectURL(apercuLogo);
    setApercuLogo(URL.createObjectURL(fichier));
    setNomFichier(fichier.name);
    setEnvoiLogo(true);
    setErreurs((p) => {
      const reste = { ...p };
      delete reste.logo;
      return reste;
    });

    const supabase = getSupabaseBrowser();
    const chemin = `logos/${user.id}`;
    const { error } = await supabase.storage
      .from("documents")
      .upload(chemin, fichier, { upsert: true, contentType: fichier.type });

    if (error) {
      setEnvoiLogo(false);
      setErreurs((p) => ({ ...p, logo: "Téléversement du logo impossible. Réessayez." }));
      return;
    }
    const { data } = supabase.storage.from("documents").getPublicUrl(chemin);
    setLogoUrl(data.publicUrl);
    setEnvoiLogo(false);
  };

  const retirerLogo = () => {
    if (apercuLogo) URL.revokeObjectURL(apercuLogo);
    setApercuLogo(null);
    setNomFichier(null);
    setLogoUrl(null);
  };

  const validerEtape1 = () => {
    const e: Record<string, string> = {};
    if (!agenceNom.trim()) e.agenceNom = "Indiquez le nom de votre agence.";
    if (!gerantNom.trim()) e.gerantNom = "Indiquez le nom du gérant.";
    const chiffres = telephone.replace(/\D/g, "");
    if (chiffres.length < 8) e.telephone = "Numéro invalide (ex : 77 123 45 67).";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrerAgence = async () => {
    if (!user || enCours) return;
    if (!validerEtape1()) return;
    setEnCours(true);
    setErreurGlobale(null);

    const { error } = await getSupabaseBrowser()
      .from("users")
      .update({
        agence_nom: agenceNom.trim(),
        nom: gerantNom.trim(),
        telephone: telephone.trim(),
        logo_url: logoUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    setEnCours(false);
    if (error) {
      setErreurGlobale("Impossible d'enregistrer vos informations. Vérifiez votre connexion.");
      return;
    }
    await refresh();
    avancer();
  };

  // ------------------------------------------------------------------
  // ÉTAPE 2 — premier immeuble + appartements
  // ------------------------------------------------------------------
  const validerEtape2 = () => {
    const e: Record<string, string> = {};
    if (!nomImmeuble.trim()) e.nomImmeuble = "Nommez votre immeuble.";
    if (!adresse.trim()) e.adresse = "Indiquez l'adresse.";
    if (!ville.trim()) e.ville = "Indiquez la ville.";
    const nb = Number(nbAppartements);
    if (!Number.isInteger(nb) || nb < 1 || nb > 60) e.nb = "Entre 1 et 60 appartements.";
    const loyer = Number(loyerMensuel);
    if (!loyerMensuel || Number.isNaN(loyer) || loyer <= 0) e.loyer = "Indiquez un loyer mensuel (> 0).";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const creerImmeuble = async () => {
    if (!user || enCours) return;
    if (!validerEtape2()) return;
    setEnCours(true);
    setErreurGlobale(null);

    const nb = Number(nbAppartements);
    const loyer = Number(loyerMensuel);

    const { data: immeuble, error } = await getSupabaseBrowser()
      .from("immeubles")
      .insert({
        gerant_id: user.id,
        nom: nomImmeuble.trim(),
        adresse: adresse.trim(),
        ville: ville.trim(),
        nombre_appartements: nb
      })
      .select("id, nom, adresse, ville, nombre_appartements")
      .single();

    if (error || !immeuble) {
      setEnCours(false);
      setErreurGlobale("Impossible de créer l'immeuble. Vérifiez votre connexion puis réessayez.");
      return;
    }

    // Appartements A1..An (insert multi-lignes = une seule transaction)
    const lignes: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= nb; i++) {
      lignes.push({
        immeuble_id: immeuble.id,
        numero: `A${i}`,
        loyer_mensuel: loyer
      });
    }
    const { error: erreurAppartements } = await getSupabaseBrowser()
      .from("appartements")
      .insert(lignes);

    setEnCours(false);

    if (erreurAppartements) {
      setImmeubleExistant(immeuble as ImmeubleApercu);
      setNouveauFormulaire(true);
      setErreurGlobale("L'immeuble est enregistré mais les appartements ont échoué. Réessayez dans un instant.");
      return;
    }

    setImmeubleExistant(immeuble as ImmeubleApercu);
    setNouveauFormulaire(false);
    avancer();
  };

  // ------------------------------------------------------------------
  // ÉTAPE 3 — invitation du propriétaire
  // ------------------------------------------------------------------
  const envoyerInvitation = async () => {
    if (enCours) return;
    if (!immeubleExistant) return;

    if (!EMAIL_RE.test(emailProprio.trim())) {
      setErreurs({ emailProprio: "Adresse e-mail invalide." });
      return;
    }
    setErreurs({});
    setEnCours(true);
    setErreurGlobale(null);

    const { error } = await getSupabaseBrowser()
      .from("invitations")
      .insert({
        immeuble_id: immeubleExistant.id,
        email: emailProprio.trim().toLowerCase(),
        role: "proprietaire"
      });

    if (error) {
      setEnCours(false);
      setErreurGlobale("Invitation impossible : vérifiez l'adresse ou votre connexion.");
      return;
    }

    // Si un compte propriétaire existe déjà avec cet e-mail, on relie
    // immédiatement l'immeuble (proprietaire_id) pour que son portail
    // s'affiche sans attendre. Sinon, le lien se fera à son inscription
    // (voir la page d'inscription).
    const email = emailProprio.trim().toLowerCase();
    const { data: proprio } = await getSupabaseBrowser()
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (proprio?.id) {
      await getSupabaseBrowser()
        .from("immeubles")
        .update({ proprietaire_id: proprio.id })
        .eq("id", immeubleExistant.id);
    }

    setEnCours(false);
    setInvitationEnvoyee(true);
  };

  // ------------------------------------------------------------------
  // ÉCRANS TRANSITAIRES
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-nuit-900">
        <motion.div
          className="h-14 w-14 rounded-2xl border-2 border-emeraude-500/40 border-t-emeraude-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <p className="text-sm text-emeraude-100/70">Chargement de votre espace…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nuit-900 px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <SunuKeurLogo className="justify-center" size={48} />
          <h1 className="mt-6 font-serif text-2xl font-bold">Connexion requise</h1>
          <p className="mt-2 text-sm text-white/70">
            Connectez-vous pour configurer votre agence et votre premier immeuble.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emeraude-500 text-sm font-medium text-white transition hover:bg-emeraude-600"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  // Rôle non autorisé (locataire/propriétaire) : on affiche un écran de
  // redirection le temps que l'effet ci-dessus bascule vers leur espace.
  if (role && !estRoleConfiguration(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nuit-900 px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emeraude-500/40 border-t-emeraude-500" />
      </div>
    );
  }

  const apercu = apercuLogo ?? logoUrl;
  const nbNombre = Number(nbAppartements);

  // ------------------------------------------------------------------
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-nuit-900 text-white">
      {/* Atmosphère lumineuse */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emeraude-500/20 blur-3xl" />
        <div className="absolute -right-40 top-1/4 h-[28rem] w-[28rem] rounded-full bg-or-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-orange-500/15 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-10">
        <Link href="/" aria-label="Sunu Keur">
          <SunuKeurLogo size={40} />
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-14 sm:px-6">
        <div className="w-full max-w-2xl">
          <div className="mb-7 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              className="font-serif text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Bienvenue dans <span className="text-gradient">Sunu Keur</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 240, damping: 24 }}
              className="mx-auto mt-2 max-w-md text-sm text-white/70 sm:text-base"
            >
              Trois étapes rapides, et votre cahier devient numérique.
            </motion.p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-card p-5 text-card-foreground shadow-2xl sm:p-8">
            <ProgressBar
              value={PROGRES[etape - 1]}
              color="bg-emeraude-500"
              label={`Étape ${etape} sur 3 · ${ETAPES[etape - 1].titre}`}
              className="mb-6"
            />

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={etape}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
                className="min-h-[420px]"
              >
                <div className="mb-6 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nuit-900 text-or-500">
                    {etape === 1 ? <User className="h-5 w-5" /> : etape === 2 ? <Building2 className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                  </span>
                  <div>
                    <h2 className="font-serif text-xl font-semibold sm:text-2xl">{ETAPES[etape - 1].titre}</h2>
                    <p className="text-sm text-muted-foreground">{ETAPES[etape - 1].sous}</p>
                  </div>
                </div>

                {erreurGlobale && (
                  <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {erreurGlobale}
                  </div>
                )}

                {/* ---------------- ÉTAPE 1 ---------------- */}
                {etape === 1 && (
                  <div>
                    <Field label="Nom de l'agence">
                      <Input
                        value={agenceNom}
                        onChange={(e) => setAgenceNom(e.target.value)}
                        placeholder="Agence Keur Immobilier"
                        autoComplete="organization"
                      />
                    </Field>
                    <MessageErreur texte={erreurs.agenceNom} />

                    <Field label="Nom du gérant">
                      <Input
                        value={gerantNom}
                        onChange={(e) => setGerantNom(e.target.value)}
                        placeholder="Mamadou Ndiaye"
                        autoComplete="name"
                      />
                    </Field>
                    <MessageErreur texte={erreurs.gerantNom} />

                    <Field label="Téléphone" hint="Visible par vos locataires et propriétaires">
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={telephone}
                          onChange={(e) => setTelephone(e.target.value)}
                          placeholder="77 123 45 67"
                          inputMode="tel"
                          className="pl-9"
                        />
                      </div>
                    </Field>
                    <MessageErreur texte={erreurs.telephone} />

                    <p className="mb-1.5 text-sm font-medium">Logo de l'agence</p>
                    {apercu ? (
                      <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-4">
                        <img
                          src={apercu}
                          alt="Logo de l'agence"
                          className="h-20 w-20 rounded-lg bg-white object-contain p-1 shadow-soft"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {nomFichier ?? "Logo enregistré"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {envoiLogo ? "Téléversement…" : logoUrl ? "Téléversé dans vos documents" : "Aperçu local"}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={retirerLogo}>
                          <Trash2 className="h-4 w-4" /> Retirer
                        </Button>
                      </div>
                    ) : (
                      <label
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-7 text-center transition hover:border-emeraude-500/60 hover:bg-emeraude-500/5",
                          erreurs.logo && "border-red-400"
                        )}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="sr-only"
                          onChange={choisirLogo}
                        />
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emeraude-500/15">
                          <Upload className="h-5 w-5 text-emeraude-500" />
                        </span>
                        <span className="text-sm font-medium">
                          {envoiLogo ? "Téléversement en cours…" : "Cliquez pour ajouter votre logo"}
                        </span>
                        <span className="text-xs text-muted-foreground">PNG, JPG ou SVG — 2 Mo max.</span>
                      </label>
                    )}
                    <MessageErreur texte={erreurs.logo} />

                    <div className="mt-7 flex items-center justify-end">
                      <Button type="button" variant="success" size="lg" loading={enCours} onClick={enregistrerAgence}>
                        Continuer <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ---------------- ÉTAPE 2 ---------------- */}
                {etape === 2 &&
                  (immeubleExistant && !nouveauFormulaire ? (
                    <div>
                      <div className="rounded-xl border border-emeraude-500/30 bg-emeraude-500/10 p-5">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emeraude-500" />
                          <div className="min-w-0">
                            <p className="font-semibold">Un immeuble est déjà enregistré</p>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {immeubleExistant.nom} · {immeubleExistant.adresse}, {immeubleExistant.ville} —{" "}
                              {immeubleExistant.nombre_appartements} appartement(s)
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-muted-foreground">
                        Vous pouvez poursuivre la configuration ou déclarer un second immeuble.
                      </p>
                      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => setNouveauFormulaire(true)}>
                          Ajouter un autre immeuble
                        </Button>
                        <Button type="button" variant="success" onClick={avancer}>
                          Continuer <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Field label="Nom de l'immeuble">
                        <Input
                          value={nomImmeuble}
                          onChange={(e) => setNomImmeuble(e.target.value)}
                          placeholder="Résidence Ndiaye"
                        />
                      </Field>
                      <MessageErreur texte={erreurs.nomImmeuble} />

                      <Field label="Adresse">
                        <Input
                          value={adresse}
                          onChange={(e) => setAdresse(e.target.value)}
                          placeholder="Rue 12, Point E"
                        />
                      </Field>
                      <MessageErreur texte={erreurs.adresse} />

                      <Field label="Ville">
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={ville}
                            onChange={(e) => setVille(e.target.value)}
                            placeholder="Dakar"
                            className="pl-9"
                          />
                        </div>
                      </Field>
                      <MessageErreur texte={erreurs.ville} />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Field label="Nombre d'appartements">
                            <Input
                              type="number"
                              min={1}
                              max={60}
                              value={nbAppartements}
                              onChange={(e) => setNbAppartements(e.target.value)}
                              inputMode="numeric"
                            />
                          </Field>
                          <MessageErreur texte={erreurs.nb} />
                        </div>
                        <div>
                          <Field label="Loyer mensuel (F CFA)" hint="Appliqué à chaque appartement">
                            <Input
                              type="number"
                              min={0}
                              step={5000}
                              value={loyerMensuel}
                              onChange={(e) => setLoyerMensuel(e.target.value)}
                              placeholder="150000"
                              inputMode="numeric"
                            />
                          </Field>
                          <MessageErreur texte={erreurs.loyer} />
                        </div>
                      </div>

                      {Number.isInteger(nbNombre) && nbNombre >= 1 && nbNombre <= 60 && (
                        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                          {nbNombre} appartement(s) créé(s) et numéroté(s) de A1 à A{nbNombre}.
                        </p>
                      )}

                      <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
                        {immeubleExistant && (
                          <Button type="button" variant="ghost" onClick={() => setNouveauFormulaire(false)}>
                            Annuler
                          </Button>
                        )}
                        <Button type="button" variant="outline" onClick={reculer}>
                          <ChevronLeft className="h-4 w-4" /> Retour
                        </Button>
                        <Button type="button" variant="success" loading={enCours} onClick={creerImmeuble}>
                          Créer l'immeuble <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                {/* ---------------- ÉTAPE 3 ---------------- */}
                {etape === 3 &&
                  (!immeubleExistant ? (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-6 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/15">
                        <Building2 className="h-6 w-6 text-orange-500" />
                      </span>
                      <p className="mt-4 font-semibold">Aucun immeuble pour l'instant</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                        Créez d'abord votre immeuble : l'invitation du propriétaire lui sera automatiquement rattachée.
                      </p>
                      <div className="mt-5 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setNouveauFormulaire(true);
                            setDirection(-1);
                            setEtape(2);
                          }}
                        >
                          Créer mon immeuble
                        </Button>
                      </div>
                    </div>
                  ) : invitationEnvoyee ? (
                    <div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        className="rounded-xl border border-emeraude-500/30 bg-emeraude-500/10 p-6 text-center"
                      >
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emeraude-500 text-white shadow-glow">
                          <CheckCircle2 className="h-7 w-7" />
                        </span>
                        <p className="mt-4 font-serif text-xl font-semibold">Invitation envoyée</p>
                        <p className="mx-auto mt-2 max-w-sm break-words text-sm text-muted-foreground">
                          {emailProprio.trim()} peut maintenant suivre « {immeubleExistant.nom} » en toute transparence.
                        </p>
                      </motion.div>
                      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setInvitationEnvoyee(false);
                            setEmailProprio("");
                          }}
                        >
                          Inviter un autre propriétaire
                        </Button>
                        <Button type="button" variant="success" size="lg" onClick={() => router.push("/dashboard")}>
                          Aller au tableau de bord <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        Immeuble concerné : <span className="font-medium text-foreground">{immeubleExistant.nom}</span>
                      </div>

                      <div className="mt-5">
                        <Field
                          label="E-mail du propriétaire"
                          hint="Il recevra un lien pour consulter les loyers et rapports de son immeuble."
                        >
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="email"
                              value={emailProprio}
                              onChange={(e) => setEmailProprio(e.target.value)}
                              placeholder="proprietaire@exemple.com"
                              className="pl-9"
                              autoComplete="email"
                            />
                          </div>
                        </Field>
                        <MessageErreur texte={erreurs.emailProprio} />
                      </div>

                      <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => router.push("/dashboard")}
                          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
                        >
                          Passer cette étape
                        </button>
                        <Button type="button" variant="outline" onClick={reculer}>
                          <ChevronLeft className="h-4 w-4" /> Retour
                        </Button>
                        <Button type="button" variant="success" loading={enCours} onClick={envoyerInvitation}>
                          Envoyer l'invitation <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="mt-5 text-center text-xs text-white/50">
            Étape {etape} / 3 — vos données sont enregistrées au fur et à mesure.
          </p>
        </div>
      </main>
    </div>
  );
}
