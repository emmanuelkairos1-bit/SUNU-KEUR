// =====================================================================
// PAGE INSCRIPTION — création du compte Supabase + profil (table users)
// =====================================================================
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { destinationParRole } from "@/lib/rbac";
import type { RoleUtilisateur } from "@/lib/types";
import { SunuKeurLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ROLES: { valeur: RoleUtilisateur; label: string; aide: string }[] = [
  { valeur: "gerant", label: "Gérant", aide: "Je gère des immeubles pour des propriétaires" },
  { valeur: "locataire", label: "Locataire", aide: "Je suis locataire d'un appartement" },
  { valeur: "proprietaire", label: "Propriétaire", aide: "Je possède des logements à suivre" }
];

function messageErreur(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Un compte existe déjà avec cet email. Connecte-toi plutôt.";
  }
  if (m.includes("password") && m.includes("least")) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (m.includes("valid email") || m.includes("invalid")) {
    return "Adresse email invalide. Vérifie la saisie.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de tentatives. Attends quelques instants avant de réessayer.";
  }
  return message || "Inscription impossible. Réessaie dans un instant.";
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const { refresh } = useAuth();

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [role, setRole] = useState<RoleUtilisateur>("gerant");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [emailEnvoye, setEmailEnvoye] = useState(false);

  async function inscrire(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);

    if (motDePasse.length < 8) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setEnvoi(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: motDePasse,
        options: { data: { nom: nom.trim(), role } }
      });

      if (error) {
        setErreur(messageErreur(error.message));
        return;
      }
      if (!data.user) {
        setErreur("Inscription impossible. Réessaie dans un instant.");
        return;
      }

      const { error: profilError } = await supabase.from("users").insert({
        id: data.user.id,
        email: email.trim(),
        nom: nom.trim(),
        role
      });

      // Sans session (confirmation email requise), la création du profil est
      // rejouée automatiquement à la première connexion : on prévient sans bloquer.
      if (profilError && data.session) {
        setErreur(`Profil non enregistré : ${profilError.message}`);
        return;
      }

      if (data.session) {
        // Le profil (table users) vient d'être inséré : on resynchronise le
        // AuthProvider pour que le dashboard voie tout de suite le profil.
        await refresh();

        // Un propriétaire qui s'inscrit avec un e-mail déjà invité par un
        // gérant récupère ses immeubles (proprietaire_id) → son portail
        // s'affiche immédiatement au lieu d'être vide.
        if (role === "proprietaire") {
          const { data: invitations } = await supabase
            .from("invitations")
            .select("immeuble_id")
            .eq("email", email.trim().toLowerCase());
          for (const inv of invitations ?? []) {
            await supabase
              .from("immeubles")
              .update({ proprietaire_id: data.user.id })
              .eq("id", (inv as { immeuble_id: string }).immeuble_id);
          }
        }

        // Seul un gérant configure ses immeubles ; un locataire ou un
        // propriétaire atterrit directement dans son propre espace.
        const destination =
          role === "gerant" || role === "super_admin" ? "/onboarding" : destinationParRole(role);
        router.replace(destination);
        router.refresh();
        return;
      }
      setEmailEnvoye(true);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-nuit-900 px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.16),transparent_55%)]"
      />

      <Link
        href="/"
        className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-sm text-nuit-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à l&apos;accueil
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-6 flex justify-center">
          <SunuKeurLogo size={52} />
        </div>

        <Card className="border-white/10 shadow-gold">
          <CardHeader>
            <CardTitle className="text-2xl">Créer ton compte</CardTitle>
            <CardDescription>
              Quelques secondes : tu choisis ton rôle, on configure ton espace.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={inscrire} className="space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium">Je suis</span>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.valeur}
                      type="button"
                      aria-pressed={role === r.valeur}
                      onClick={() => setRole(r.valeur)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-sm font-medium transition-all",
                        role === r.valeur
                          ? "border-emeraude-500 bg-emeraude-500/10 text-emeraude-600 shadow-glow dark:text-emeraude-300"
                          : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={role}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className="mt-1.5 text-xs text-muted-foreground"
                  >
                    {ROLES.find((r) => r.valeur === role)?.aide}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div>
                <label htmlFor="nom" className="mb-1.5 block text-sm font-medium">
                  Nom complet
                </label>
                <Input
                  id="nom"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Aïssatou Ndiaye"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                  Adresse email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="toi@exemple.sn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                  Mot de passe
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="8 caractères minimum"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="confirmation" className="mb-1.5 block text-sm font-medium">
                  Confirmer le mot de passe
                </label>
                <Input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Retais le même mot de passe"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>

              <AnimatePresence>
                {erreur && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{erreur}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {emailEnvoye && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 rounded-lg border border-emeraude-500/30 bg-emeraude-500/10 px-3 py-2.5 text-sm text-emeraude-600 dark:text-emeraude-300"
                  >
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Compte créé ! Confirme ton email depuis ta boîte mail, puis connecte-toi pour
                      finaliser ton espace.
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" variant="gold" size="lg" className="w-full" loading={envoi}>
                Créer mon compte <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="mt-6 flex flex-col gap-2 text-center text-sm">
              <Link href="/login" className="font-medium text-emeraude-600 hover:underline dark:text-emeraude-300">
                Déjà un compte ? Se connecter
              </Link>
              <Link href="/onboarding" className="text-muted-foreground hover:underline">
                Je suis gérant, je m&apos;inscris directement
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
