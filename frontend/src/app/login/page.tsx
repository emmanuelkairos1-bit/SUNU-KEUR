// =====================================================================
// PAGE CONNEXION — authentification réelle Supabase + redirection par rôle
// =====================================================================
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { cheminInterne, destinationParRole } from "@/lib/rbac";
import type { RoleUtilisateur } from "@/lib/types";
import { SunuKeurLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Lit le paramètre `next` (posé par le middleware) depuis l'URL, et renvoie
// la destination : la route d'origine si elle est interne, sinon l'espace
// par défaut du rôle. On lit `window` à l'exécution (client) pour éviter
// les soucis de prerender liés à useSearchParams.
function lireNext(): string | null {
  if (typeof window === "undefined") return null;
  return cheminInterne(new URLSearchParams(window.location.search).get("next"));
}

function redirectionConnexion(role: RoleUtilisateur | null | undefined): string {
  return lireNext() ?? destinationParRole(role);
}

function messageErreur(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid_credentials")) {
    return "Email ou mot de passe incorrect. Vérifie tes informations et réessaie.";
  }
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
    return "Ton adresse email n'est pas encore confirmée. Ouvre le lien reçu par email.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Trop de tentatives. Attends quelques instants avant de réessayer.";
  }
  if (m.includes("disabled")) {
    return "Ce compte a été désactivé. Contacte le support Sunu Keur.";
  }
  return message || "Connexion impossible. Réessaie dans un instant.";
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const { session, loading: chargementSession, role } = useAuth();

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [lienMagique, setLienMagique] = useState(false);
  const [lienEnvoye, setLienEnvoye] = useState(false);

  // Déjà connecté → on part directement au bon espace
  useEffect(() => {
    if (!chargementSession && session) {
      router.replace(redirectionConnexion(role));
    }
  }, [chargementSession, session, role, router]);

  async function seConnecter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: motDePasse
      });
      if (error) {
        setErreur(messageErreur(error.message));
        return;
      }
      if (!data.user) {
        setErreur("Connexion impossible. Réessaie dans un instant.");
        return;
      }
      const { data: profil, error: profilError } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profilError || !profil) {
        // Profil absent (compte créé avant confirmation de l'email) : on le
        // recrée maintenant avec le rôle choisi à l'inscription, puis on part.
        const meta = data.user.user_metadata as { nom?: unknown; role?: unknown } | null;
        const roleChoisi =
          meta?.role === "gerant" || meta?.role === "proprietaire" || meta?.role === "locataire"
            ? (meta.role as RoleUtilisateur)
            : "gerant";
        const nomChoisi = typeof meta?.nom === "string" && meta.nom.trim().length > 0 ? meta.nom.trim() : data.user.email ?? "";

        const { data: profilCree } = await supabase
          .from("users")
          .insert({ id: data.user.id, email: data.user.email ?? email.trim(), nom: nomChoisi, role: roleChoisi })
          .select("role")
          .maybeSingle();

        router.replace(redirectionConnexion((profilCree?.role as RoleUtilisateur) ?? roleChoisi));
        router.refresh();
        return;
      }

      router.replace(redirectionConnexion(profil.role as RoleUtilisateur));
      router.refresh();
    } finally {
      setEnvoi(false);
    }
  }

  async function lienMagiqueEnvoye(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    if (!email.trim()) {
      setErreur("Indique d'abord ton adresse email pour recevoir le lien.");
      return;
    }
    setLienMagique(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) {
        setErreur(messageErreur(error.message));
        return;
      }
      setLienEnvoye(true);
    } finally {
      setLienMagique(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-nuit-900 px-4 py-12">
      {/* Décor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(245,158,11,0.14),transparent_55%)]"
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
          <SunuKeurLogo size={56} />
        </div>

        <Card className="border-white/10 shadow-glow">
          <CardHeader>
            <CardTitle className="text-2xl">Bon retour parmi nous</CardTitle>
            <CardDescription>
              Connecte-toi pour retrouver tes immeubles, tes loyers et tes relances.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={seConnecter} className="space-y-4">
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
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
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

              <Button type="submit" variant="success" size="lg" className="w-full" loading={envoi}>
                Se connecter <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            {/* Hors du formulaire principal : l'enveloppe du lien magique a sa propre soumission */}
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                ou
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={lienMagiqueEnvoye}>
                <Button type="submit" variant="outline" size="lg" className="w-full" loading={lienMagique}>
                  <KeyRound className="h-4 w-4" /> Se connecter avec un lien magique
                </Button>
              </form>

              <AnimatePresence>
                {lienEnvoye && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 rounded-lg border border-emeraude-500/30 bg-emeraude-500/10 px-3 py-2.5 text-sm text-emeraude-600 dark:text-emeraude-300"
                  >
                    <MailCheck className="h-4 w-4 shrink-0" />
                    Lien envoyé — vérifie ta boîte mail.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-6 flex flex-col gap-2 text-center text-sm">
              <Link href="/signup" className="font-medium text-emeraude-600 hover:underline dark:text-emeraude-300">
                Pas de compte ? Créer un compte
              </Link>
              <Link href="/onboarding" className="text-muted-foreground hover:underline">
                Je suis gérant, je m&apos;inscris
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
