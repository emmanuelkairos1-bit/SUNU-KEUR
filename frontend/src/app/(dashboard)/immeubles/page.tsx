"use client";

// =====================================================================
// /immeubles — gestion des immeubles du gérant (ou du super_admin)
// Liste + création (immeuble + appartements A1..An en une opération).
// Un propriétaire ne gère pas d'immeubles ici : il suit les siens via /owner.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, MapPin, Plus, Users, Wallet } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Appartement, Immeuble } from "@/lib/types";
import { cn, fcfa } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/input";
import { Stagger, staggerItem } from "@/components/ui/motion";
import { EcranAcces, EcranChargement, Alerte, type EtatMessage } from "../_components/ecrans";

const FORM_VIDE = { nom: "", adresse: "", ville: "", nombre: "4", loyer: "250000" };

export default function PageImmeubles() {
  const { user, role, loading: chargementAuth } = useAuth();

  const [chargement, setChargement] = useState(true);
  const [immeubles, setImmeubles] = useState<Immeuble[]>([]);
  const [appartements, setAppartements] = useState<Appartement[]>([]);
  const [locataires, setLocataires] = useState<{ appartement_id: string }[]>([]);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);

  const [drawerOuverte, setDrawerOuverte] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [message, setMessage] = useState<EtatMessage>(null);

  // -------------------------------------------------------------------
  // Chargement (même périmètre que les locataires : immeubles du gérant)
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
        setAppartements([]);
        setLocataires([]);
        return;
      }

      const { data: listeAppartements, error: errAppartements } = await supabase
        .from("appartements")
        .select("*")
        .in("immeuble_id", immeubleIds);
      if (errAppartements) throw new Error(errAppartements.message);
      setAppartements((listeAppartements ?? []) as Appartement[]);

      const appartementIds = ((listeAppartements ?? []) as Appartement[]).map((a) => a.id);
      if (appartementIds.length) {
        const { data: listeLocataires, error: errLocataires } = await supabase
          .from("locataires")
          .select("appartement_id")
          .in("appartement_id", appartementIds);
        if (errLocataires) throw new Error(errLocataires.message);
        setLocataires((listeLocataires ?? []) as { appartement_id: string }[]);
      } else {
        setLocataires([]);
      }
    } catch (e) {
      setErreurGlobale(e instanceof Error ? e.message : "Impossible de charger les immeubles.");
    } finally {
      setChargement(false);
    }
  }, [user?.id, role]);

  useEffect(() => {
    if (user?.id) void charger();
  }, [user?.id, charger]);

  // -------------------------------------------------------------------
  // Statistiques par immeuble
  // -------------------------------------------------------------------
  const statsParImmeuble = useMemo(() => {
    const map = new Map<string, { total: number; occupes: number; locataires: number; loyerMoyen: number }>();
    for (const im of immeubles) {
      map.set(im.id, { total: 0, occupes: 0, locataires: 0, loyerMoyen: 0 });
    }
    let sommeLoyers = 0;
    for (const a of appartements) {
      const s = map.get(a.immeuble_id);
      if (!s) continue;
      s.total += 1;
      if (a.statut === "occupe") s.occupes += 1;
      sommeLoyers += Number(a.loyer_mensuel) || 0;
    }
    for (const l of locataires) {
      const s = map.get(appartements.find((a) => a.id === l.appartement_id)?.immeuble_id ?? "");
      if (s) s.locataires += 1;
    }
    for (const [id, s] of map) {
      s.loyerMoyen = s.total ? Math.round(sommeLoyers / appartements.filter((a) => a.immeuble_id === id).length) : 0;
    }
    return map;
  }, [immeubles, appartements, locataires]);

  // -------------------------------------------------------------------
  // Création d'un immeuble (+ appartements A1..An, une seule transaction)
  // -------------------------------------------------------------------
  const valider = (): string | null => {
    if (!form.nom.trim()) return "Nommez votre immeuble.";
    if (!form.adresse.trim()) return "Indiquez l'adresse.";
    if (!form.ville.trim()) return "Indiquez la ville.";
    const nb = Number(form.nombre);
    if (!Number.isInteger(nb) || nb < 1 || nb > 60) return "Entre 1 et 60 appartements.";
    const loyer = Number(form.loyer);
    if (!form.loyer || Number.isNaN(loyer) || loyer <= 0) return "Indiquez un loyer mensuel (> 0).";
    return null;
  };

  const creer = async () => {
    if (!user || envoi) return;
    const erreur = valider();
    if (erreur) {
      setErreurForm(erreur);
      return;
    }
    setEnvoi(true);
    setErreurForm(null);
    try {
      const supabase = getSupabaseBrowser();
      const nb = Number(form.nombre);
      const loyer = Number(form.loyer);

      const { data: immeuble, error } = await supabase
        .from("immeubles")
        .insert({
          gerant_id: user.id,
          nom: form.nom.trim(),
          adresse: form.adresse.trim(),
          ville: form.ville.trim(),
          nombre_appartements: nb
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      // Appartements A1..An (insert multi-lignes = une seule transaction)
      const lignes: Array<Record<string, unknown>> = [];
      for (let i = 1; i <= nb; i++) {
        lignes.push({
          immeuble_id: (immeuble as { id: string }).id,
          numero: `A${i}`,
          loyer_mensuel: loyer,
          statut: "vacant"
        });
      }
      const { error: erreurAppartements } = await supabase.from("appartements").insert(lignes);
      if (erreurAppartements) {
        // L'immeuble existe mais pas les appartements : on nettoie pour ne pas
        // laisser un immeuble vide, puis on signale l'erreur.
        await supabase.from("immeubles").delete().eq("id", (immeuble as { id: string }).id);
        throw new Error(erreurAppartements.message);
      }

      setMessage({ type: "succes", texte: `« ${form.nom.trim()} » créé avec ${nb} appartements vacants.` });
      setForm(FORM_VIDE);
      setDrawerOuverte(false);
      await charger();
    } catch (e) {
      setErreurForm(e instanceof Error ? e.message : "Impossible de créer l'immeuble. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  // -------------------------------------------------------------------
  // Garde RBAC
  // -------------------------------------------------------------------
  if (!chargementAuth && user && role === "locataire") {
    return (
      <EcranAcces
        titre="Espace réservé"
        message="La gestion des immeubles est réservée aux gérants de l'agence."
        href="/locataire"
        libelle="Aller à mon espace"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Immeubles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tous vos immeubles et leurs appartements, au même endroit.
          </p>
        </div>
        <Button variant="gold" onClick={() => setDrawerOuverte(true)}>
          <Plus className="h-4 w-4" /> Nouvel immeuble
        </Button>
      </div>

      {message && <Alerte etat={message} onFermer={() => setMessage(null)} />}
      {erreurGlobale && <Alerte etat={{ type: "erreur", texte: erreurGlobale }} onFermer={() => setErreurGlobale(null)} />}

      {chargement ? (
        <EcranChargement texte="Chargement de vos immeubles…" />
      ) : immeubles.length === 0 ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-soft"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-or-500/15">
              <Building2 className="h-7 w-7 text-or-500" />
            </div>
            <h2 className="mt-5 font-serif text-2xl font-bold">Aucun immeuble pour l'instant</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Créez votre premier immeuble : les appartements sont ajoutés automatiquement,
              prêts à recevoir vos locataires.
            </p>
            <Button variant="gold" className="mt-6 w-full" onClick={() => setDrawerOuverte(true)}>
              <Plus className="h-4 w-4" /> Créer mon immeuble
            </Button>
          </motion.div>
        </div>
      ) : (
        <Stagger className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {immeubles.map((im) => {
            const s = statsParImmeuble.get(im.id) ?? { total: 0, occupes: 0, locataires: 0, loyerMoyen: 0 };
            const vacants = s.total - s.occupes;
            return (
              <motion.div
                key={im.id}
                variants={staggerItem}
                className="rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-soft-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-nuit-900 dark:bg-emeraude-500/15">
                    <Building2 className="h-5 w-5 text-or-500 dark:text-emeraude-500" />
                  </div>
                  <Badge tone={vacants > 0 ? "success" : "warning"}>
                    {vacants} vacant{vacants > 1 ? "s" : ""}
                  </Badge>
                </div>
                <h3 className="mt-4 font-serif text-xl font-bold">{im.nom}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {im.adresse}, {im.ville}
                </p>
                <div className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-center">
                  <div>
                    <p className="font-serif text-lg font-bold">{s.total}</p>
                    <p className="text-[11px] text-muted-foreground">appartements</p>
                  </div>
                  <div>
                    <p className="font-serif text-lg font-bold">{s.locataires}</p>
                    <p className="text-[11px] text-muted-foreground">locataires</p>
                  </div>
                  <div>
                    <p className="font-serif text-lg font-bold">{s.loyerMoyen ? fcfa(s.loyerMoyen) : "—"}</p>
                    <p className="text-[11px] text-muted-foreground">loyer moyen</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </Stagger>
      )}

      {/* -------------------------------------------------------------------
          Tiroir de création
      ------------------------------------------------------------------- */}
      <Drawer open={drawerOuverte} onClose={() => setDrawerOuverte(false)} title="Nouvel immeuble">
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            L'immeuble est créé avec ses appartements (A1, A2…) au loyer indiqué.
            Vous pourrez ensuite y ajouter vos locataires.
          </p>

          <Field label="Nom de l'immeuble *" hint="Ex. : Résidence Faidou, Immeuble Awa…">
            <Input
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Résidence Faidou"
            />
          </Field>

          <Field label="Adresse *">
            <Input
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              placeholder="12 rue les Manguiers"
            />
          </Field>

          <Field label="Ville *">
            <Input
              value={form.ville}
              onChange={(e) => setForm({ ...form, ville: e.target.value })}
              placeholder="Dakar"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre d'appartements *" hint="1 à 60">
              <Input
                type="number"
                min={1}
                max={60}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </Field>
            <Field label="Loyer mensuel (FCFA) *" hint="Identique pour tous">
              <Input
                type="number"
                min={0}
                step={1000}
                value={form.loyer}
                onChange={(e) => setForm({ ...form, loyer: e.target.value })}
                placeholder="250 000"
              />
            </Field>
          </div>

          {erreurForm && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
              {erreurForm}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button variant="ghost" onClick={() => setDrawerOuverte(false)} disabled={envoi}>
              Annuler
            </Button>
            <Button variant="gold" onClick={creer} disabled={envoi}>
              {envoi ? "Création…" : "Créer l'immeuble"}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
