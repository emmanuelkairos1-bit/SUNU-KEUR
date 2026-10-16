// =====================================================================
// FINANCES — Factures communes (répartition au prorata) + Kanban Travaux
// =====================================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Coins,
  FileImage,
  GripVertical,
  Hammer,
  Plus,
  Receipt,
  Trash2,
  Upload,
  Wrench
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { cn, fcfa } from "@/lib/utils";
import type { Appartement, FactureCommune, Immeuble, StatutTravaux, Travaux } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Stagger, staggerItem } from "@/components/ui/motion";

// ---------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------
type ModeRepartition = "egales" | "prorata";
type TravauxLigne = Travaux & { appartements: { numero: string } | null };
type Message = { ton: "ok" | "erreur"; texte: string } | null;

interface TypeSupabase {
  storage: {
    from(bucket: string): {
      upload(path: string, fichier: File, options?: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
      createSignedUrl(path: string, duree: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------
function dateISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function frDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Répartition du montant_total entre les appartements OCCUPÉS.
 * - mode "egales"  : part = total / nombre d'occupés
 * - mode "prorata" : part = total × (loyer_appart / somme des loyers)
 * Arrondi entier (FCFA) avec redistribution des arrondis pour que la somme
 * des parts soit EXACTEMENT égale au montant total.
 */
function calculerRepartition(
  appartements: Appartement[],
  total: number,
  mode: ModeRepartition
): Record<string, number> {
  const occupes = appartements.filter((a) => a.statut === "occupe");
  if (occupes.length === 0 || !Number.isFinite(total) || total <= 0) return {};

  const poids =
    mode === "prorata"
      ? occupes.map((a) => Math.max(0, Number(a.loyer_mensuel) || 0))
      : occupes.map(() => 1);
  const sommePoids = poids.reduce((s, p) => s + p, 0);
  if (sommePoids <= 0) return {};

  const exact = poids.map((p) => (total * p) / sommePoids);
  const entiers = exact.map((v) => Math.floor(v));
  let reste = Math.round(total - entiers.reduce((s, v) => s + v, 0));
  const ordre = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  let k = 0;
  while (reste > 0 && ordre.length > 0) {
    entiers[ordre[k % ordre.length].i] += 1;
    reste -= 1;
    k += 1;
  }
  while (reste < 0 && ordre.length > 0) {
    const idx = ordre[ordre.length - 1 - (k % ordre.length)].i;
    if (entiers[idx] > 0) {
      entiers[idx] -= 1;
      reste += 1;
    }
    k += 1;
  }

  const repartition: Record<string, number> = {};
  occupes.forEach((a, i) => {
    repartition[a.id] = entiers[i];
  });
  return repartition;
}

function sommeRepartition(r: Record<string, number>): number {
  return Object.values(r).reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Téléverse la photo de la facture dans le bucket privé "documents". */
async function verserPhoto(
  supabase: TypeSupabase,
  fichier: File,
  uid: string
): Promise<string> {
  const brut = fichier.name.split(".").pop() || "jpg";
  const ext = brut.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const chemin = `${uid}/factures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("documents").upload(chemin, fichier, {
    contentType: fichier.type || "image/jpeg",
    upsert: false
  });
  if (error) throw new Error(`Photo non téléversée : ${error.message}`);
  return chemin;
}

/** Bucket privé → URL signée (7 jours). Une URL http complète est renvoyée telle quelle. */
async function resoudrePhoto(
  supabase: TypeSupabase,
  ref?: string | null
): Promise<string | null> {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(ref, 60 * 60 * 24 * 7);
  if (error || !data) return null;
  return data.signedUrl;
}

// ---------------------------------------------------------------------
// Kanban — colonnes
// ---------------------------------------------------------------------
const COLONNES: { id: StatutTravaux; label: string; pastille: string; bordure: string }[] = [
  {
    id: "a_faire",
    label: "À faire",
    pastille: "bg-orange-500",
    bordure: "border-orange-500/30 bg-orange-500/5"
  },
  {
    id: "en_cours",
    label: "En cours",
    pastille: "bg-or-500",
    bordure: "border-or-500/30 bg-or-500/5"
  },
  {
    id: "termine",
    label: "Terminé",
    pastille: "bg-emeraude-500",
    bordure: "border-emeraude-500/30 bg-emeraude-500/5"
  }
];

function CarteTravaux({ t, survol }: { t: TravauxLigne; survol?: boolean }) {
  const depart = t.date_debut ? frDate(t.date_debut) : null;
  const fin = t.date_fin ? frDate(t.date_fin) : null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-soft transition-colors",
        survol && "border-or-500/60 shadow-gold"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-semibold leading-snug">{t.titre}</p>
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      {t.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {t.description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge tone={t.appartements ? "info" : "neutral"}>
          {t.appartements ? `Appartement ${t.appartements.numero}` : "Immeuble entier"}
        </Badge>
        {depart && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {depart}
          </span>
        )}
        {fin && <span className="inline-flex items-center gap-1">→ {fin}</span>}
      </div>
      <p className="mt-3 font-serif text-lg font-bold text-or-500">{fcfa(Number(t.cout) || 0)}</p>
    </div>
  );
}

function CarteGlissable({ t }: { t: TravauxLigne }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: t.id
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("touch-none transition-opacity", isDragging && "opacity-25")}
      {...listeners}
      {...attributes}
    >
      <CarteTravaux t={t} />
    </div>
  );
}

function ColonneKanban({
  col,
  items,
  total
}: {
  col: (typeof COLONNES)[number];
  items: TravauxLigne[];
  total: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[340px] flex-col rounded-2xl border p-3 transition-colors",
        isOver ? "border-emeraude-500 bg-emeraude-500/10" : col.bordure
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", col.pastille)} />
          <h3 className="font-serif text-sm font-semibold">{col.label}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {items.length}
          </span>
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {fcfa(total)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {items.map((t) => (
          <CarteGlissable key={t.id} t={t} />
        ))}
        {items.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            Glissez une carte ici
          </div>
        )}
      </div>
    </div>
  );
}

function FormulaireTravaux({
  immeubleId,
  appartements,
  onFermer,
  onCree
}: {
  immeubleId: string;
  appartements: Appartement[];
  onFermer: () => void;
  onCree: (t: TravauxLigne) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [form, setForm] = useState({
    titre: "",
    description: "",
    cout: "",
    appartement_id: "",
    date_debut: "",
    date_fin: ""
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const maj = (cle: keyof typeof form, valeur: string) =>
    setForm((f) => ({ ...f, [cle]: valeur }));

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (!form.titre.trim()) {
      setErreur("Indiquez un titre pour le travaux.");
      return;
    }
    setEnvoi(true);
    try {
      const { data, error } = await supabase
        .from("travaux")
        .insert({
          immeuble_id: immeubleId,
          titre: form.titre.trim(),
          description: form.description.trim() || null,
          cout: Number(form.cout) || 0,
          appartement_id: form.appartement_id || null,
          date_debut: form.date_debut || null,
          date_fin: form.date_fin || null,
          statut: "a_faire"
        })
        .select("*, appartements(numero)")
        .single();
      if (error) throw new Error(error.message);
      onCree(data as TravauxLigne);
      onFermer();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <Field label="Titre">
        <Input
          value={form.titre}
          onChange={(e) => maj("titre", e.target.value)}
          placeholder="Réparer la fuite du toit"
          autoFocus
        />
      </Field>
      <Field label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => maj("description", e.target.value)}
          placeholder="Détail des interventions…"
        />
      </Field>
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-4">
        <Field label="Coût estimé (FCFA)">
          <Input
            type="number"
            min={0}
            step={100}
            value={form.cout}
            onChange={(e) => maj("cout", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Appartement lié (facultatif)">
          <Select
            value={form.appartement_id}
            onChange={(e) => maj("appartement_id", e.target.value)}
          >
            <option value="">Immeuble entier</option>
            {appartements.map((a) => (
              <option key={a.id} value={a.id}>
                Appartement {a.numero} · {a.type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date de début">
          <Input
            type="date"
            value={form.date_debut}
            onChange={(e) => maj("date_debut", e.target.value)}
          />
        </Field>
        <Field label="Date de fin">
          <Input
            type="date"
            value={form.date_fin}
            onChange={(e) => maj("date_fin", e.target.value)}
          />
        </Field>
      </div>

      {erreur && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erreur}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onFermer}>
          Annuler
        </Button>
        <Button type="submit" variant="success" loading={envoi}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      </div>
    </form>
  );
}

function KanbanTravaux({
  travaux,
  setTravaux,
  immeubleId,
  appartements,
  onErreur
}: {
  travaux: TravauxLigne[];
  setTravaux: React.Dispatch<React.SetStateAction<TravauxLigne[]>>;
  immeubleId: string;
  appartements: Appartement[];
  onErreur: (message: string) => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [ouvert, setOuvert] = useState(false);
  const [idActif, setIdActif] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const enCours = travaux.find((t) => t.id === idActif) ?? null;

  const surDragStart = (e: DragStartEvent) => setIdActif(String(e.active.id));

  const surDragEnd = async (e: DragEndEvent) => {
    setIdActif(null);
    const { active, over } = e;
    if (!over) return;
    const cible = String(over.id) as StatutTravaux;
    if (!COLONNES.some((c) => c.id === cible)) return;

    const carte = travaux.find((t) => t.id === active.id);
    if (!carte || carte.statut === cible) return;

    const precedent = carte.statut;
    setTravaux((prev) =>
      prev.map((t) => (t.id === carte.id ? { ...t, statut: cible } : t))
    );

    const { error } = await supabase
      .from("travaux")
      .update({ statut: cible, updated_at: new Date().toISOString() })
      .eq("id", carte.id);

    if (error) {
      setTravaux((prev) =>
        prev.map((t) => (t.id === carte.id ? { ...t, statut: precedent } : t))
      );
      onErreur(`Déplacement impossible pour « ${carte.titre} » : ${error.message}`);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Glissez les cartes d&apos;une colonne à l&apos;autre — le statut est enregistré
          immédiatement.
        </p>
        <Button variant="accent" onClick={() => setOuvert(true)} disabled={!immeubleId}>
          <Plus className="h-4 w-4" /> Ajouter un travaux
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={surDragStart}
        onDragEnd={surDragEnd}
        onDragCancel={() => setIdActif(null)}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {COLONNES.map((col) => {
            const items = travaux.filter((t) => t.statut === col.id);
            const total = items.reduce((s, t) => s + (Number(t.cout) || 0), 0);
            return (
              <ColonneKanban key={col.id} col={col} items={items} total={total} />
            );
          })}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
          {enCours ? <CarteTravaux t={enCours} survol /> : null}
        </DragOverlay>
      </DndContext>

      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Ajouter un travaux">
        <FormulaireTravaux
          key={ouvert ? "ouvert" : "ferme"}
          immeubleId={immeubleId}
          appartements={appartements}
          onFermer={() => setOuvert(false)}
          onCree={(t) => setTravaux((prev) => [t, ...prev])}
        />
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------
// Carte d'une facture commune (vignette + répartition dépliable)
// ---------------------------------------------------------------------
function CarteFactureCommune({
  f,
  photo,
  appartements
}: {
  f: FactureCommune;
  photo?: string;
  appartements: Appartement[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [imageKo, setImageKo] = useState(false);
  const repartition = (f.repartition ?? {}) as Record<string, number>;
  const lignes = Object.entries(repartition);
  const totalLignes = sommeRepartition(repartition);

  return (
    <motion.div variants={staggerItem} layout>
      <Card className="overflow-hidden">
        <div className="relative h-32 bg-muted">
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <FileImage className="h-8 w-8" />
          </div>
          {photo && !imageKo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={f.libelle}
              onError={() => setImageKo(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <span className="absolute right-2 top-2 rounded-full bg-nuit-900/85 px-2.5 py-1 text-xs font-semibold text-white">
            {fcfa(Number(f.montant_total) || 0)}
          </span>
        </div>

        <div className="p-4">
          <p className="font-serif font-semibold">{f.libelle}</p>
          <p className="text-xs text-muted-foreground">{frDate(f.date)}</p>

          <button
            onClick={() => setOuvert((v) => !v)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emeraude-600 transition hover:underline dark:text-emeraude-300"
          >
            {ouvert ? "Masquer la répartition" : `Voir la répartition (${lignes.length})`}
          </button>

          <AnimatePresence initial={false}>
            {ouvert && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
                  {lignes.map(([appId, montant]) => {
                    const app = appartements.find((a) => a.id === appId);
                    return (
                      <div key={appId} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {app ? `Appartement ${app.numero}` : "Appartement"}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {fcfa(Number(montant) || 0)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-2 border-t pt-2">
                    <span className="font-medium">Total</span>
                    <span className="font-semibold tabular-nums">{fcfa(totalLignes)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------
export default function FinancesPage() {
  const { user, role, loading: chargementAuth } = useAuth();
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [onglet, setOnglet] = useState<"communes" | "travaux">("communes");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState<Message>(null);

  const [immeubles, setImmeubles] = useState<Immeuble[]>([]);
  const [immeubleId, setImmeubleId] = useState("");
  const [appartements, setAppartements] = useState<Appartement[]>([]);
  const [factures, setFactures] = useState<FactureCommune[]>([]);
  const [travaux, setTravaux] = useState<TravauxLigne[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  // --- immeubles du gérant ---
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;
    (async () => {
      setChargement(true);
      let requete = supabase.from("immeubles").select("*").order("nom");
      if (role !== "super_admin") requete = requete.eq("gerant_id", user.id);
      const { data, error } = await requete;
      if (annule) return;
      if (error) {
        setErreur(error.message);
        setChargement(false);
        return;
      }
      const liste = (data ?? []) as Immeuble[];
      setImmeubles(liste);
      setImmeubleId((courant) =>
        courant && liste.some((i) => i.id === courant) ? courant : liste[0]?.id ?? ""
      );
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [user?.id, role, supabase]);

  // --- données de l'immeuble sélectionné ---
  useEffect(() => {
    if (!immeubleId) {
      setAppartements([]);
      setFactures([]);
      setTravaux([]);
      return;
    }
    let annule = false;
    (async () => {
      setChargement(true);
      setErreur("");
      const [apps, facts, trs] = await Promise.all([
        supabase
          .from("appartements")
          .select("*")
          .eq("immeuble_id", immeubleId)
          .order("numero"),
        supabase
          .from("factures_communes")
          .select("*")
          .eq("immeuble_id", immeubleId)
          .order("date", { ascending: false }),
        supabase
          .from("travaux")
          .select("*, appartements(numero)")
          .eq("immeuble_id", immeubleId)
          .order("created_at", { ascending: false })
      ]);
      if (annule) return;
      if (apps.error) setErreur(apps.error.message);
      if (facts.error) setErreur(facts.error.message);
      if (trs.error) setErreur(trs.error.message);
      setAppartements((apps.data ?? []) as Appartement[]);
      setFactures((facts.data ?? []) as FactureCommune[]);
      setTravaux((trs.data ?? []) as TravauxLigne[]);
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [immeubleId, supabase]);

  // --- résolution des vignettes (bucket privé) ---
  useEffect(() => {
    let annule = false;
    if (factures.length === 0) {
      setPhotos({});
      return;
    }
    (async () => {
      const entrees = await Promise.all(
        factures.map(
          async (f) =>
            [f.id, await resoudrePhoto(supabase as unknown as TypeSupabase, f.photo_url)] as const
        )
      );
      if (annule) return;
      setPhotos(
        Object.fromEntries(entrees.filter(([, v]) => v !== null)) as Record<string, string>
      );
    })();
    return () => {
      annule = true;
    };
  }, [factures, supabase]);

  // --- état du formulaire facture commune ---
  const [form, setForm] = useState(() => ({
    libelle: "",
    montant: "",
    date: dateISO()
  }));
  const [mode, setMode] = useState<ModeRepartition>("egales");
  const [fichier, setFichier] = useState<File | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const occupes = useMemo(
    () => appartements.filter((a) => a.statut === "occupe"),
    [appartements]
  );
  const montantTotal = Number(form.montant) || 0;
  const repartition = useMemo(
    () => calculerRepartition(appartements, montantTotal, mode),
    [appartements, montantTotal, mode]
  );
  const totalReparti = useMemo(() => sommeRepartition(repartition), [repartition]);
  const repartitionValide =
    occupes.length > 0 && montantTotal > 0 && totalReparti === montantTotal;

  const totalCharges = factures.reduce((s, f) => s + (Number(f.montant_total) || 0), 0);
  const totalTravaux = travaux.reduce((s, t) => s + (Number(t.cout) || 0), 0);
  const nbEnCours = travaux.filter((t) => t.statut === "en_cours").length;

  const soumettreFacture = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!user) return;
    if (!immeubleId) {
      setMessage({ ton: "erreur", texte: "Sélectionnez un immeuble." });
      return;
    }
    if (!form.libelle.trim()) {
      setMessage({ ton: "erreur", texte: "Indiquez un libellé (ex : « Facture Senelec »)." });
      return;
    }
    if (montantTotal <= 0) {
      setMessage({ ton: "erreur", texte: "Le montant total doit être supérieur à 0." });
      return;
    }
    if (occupes.length === 0) {
      setMessage({
        ton: "erreur",
        texte: "Aucun appartement occupé dans cet immeuble : rien à répartir."
      });
      return;
    }
    if (!repartitionValide) {
      setMessage({
        ton: "erreur",
        texte: "La répartition ne correspond pas au montant total."
      });
      return;
    }

    setEnregistrement(true);
    try {
      let photo_url: string | null = null;
      if (fichier) {
        photo_url = await verserPhoto(
          supabase as unknown as TypeSupabase,
          fichier,
          user.id
        );
      }
      const { data, error } = await supabase
        .from("factures_communes")
        .insert({
          immeuble_id: immeubleId,
          libelle: form.libelle.trim(),
          montant_total: montantTotal,
          photo_url,
          date: form.date,
          repartition
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      const cree = data as FactureCommune;
      setFactures((prev) => [cree, ...prev]);
      setForm({ libelle: "", montant: "", date: dateISO() });
      setFichier(null);
      setMessage({
        ton: "ok",
        texte: `« ${cree.libelle} » enregistrée et répartie sur ${occupes.length} appartement(s).`
      });
    } catch (err) {
      setMessage({
        ton: "erreur",
        texte: err instanceof Error ? err.message : "Enregistrement impossible."
      });
    } finally {
      setEnregistrement(false);
    }
  };

  const onglets = [
    { id: "communes" as const, label: "Factures communes", icon: Receipt },
    { id: "travaux" as const, label: "Travaux", icon: Hammer }
  ];

  return (
    <div className="space-y-8">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-or-500">
            Charges & chantiers
          </p>
          <h1 className="font-serif text-3xl font-bold">Finances</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Répartissez les charges d&apos;immeuble entre les appartements occupés et suivez
            vos travaux en glisser-déposer.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Field label="Immeuble">
            <Select value={immeubleId} onChange={(e) => setImmeubleId(e.target.value)}>
              {immeubles.length === 0 && <option value="">Aucun immeuble</option>}
              {immeubles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nom} · {i.ville}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {erreur && (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erreur}
        </p>
      )}

      {!chargementAuth && !user && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Session expirée : reconnectez-vous pour gérer vos finances.
          </CardContent>
        </Card>
      )}

      {/* ---------- Statistiques ---------- */}
      {user && (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Charges communes
                  </p>
                  <Receipt className="h-4 w-4 text-or-500" />
                </div>
                <p className="mt-2 font-serif text-2xl font-bold">
                  <CountUp to={totalCharges} currency />
                </p>
                <p className="text-xs text-muted-foreground">{factures.length} facture(s)</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Appartements occupés
                  </p>
                  <Coins className="h-4 w-4 text-emeraude-500" />
                </div>
                <p className="mt-2 font-serif text-2xl font-bold">
                  {occupes.length}
                  <span className="text-base font-medium text-muted-foreground">
                    {" "}
                    / {appartements.length}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">éligibles à la répartition</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Coût des travaux
                  </p>
                  <Wrench className="h-4 w-4 text-orange-500" />
                </div>
                <p className="mt-2 font-serif text-2xl font-bold">
                  <CountUp to={totalTravaux} currency />
                </p>
                <p className="text-xs text-muted-foreground">{travaux.length} chantier(s)</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Travaux en cours
                  </p>
                  <Hammer className="h-4 w-4 text-nuit-900 dark:text-white" />
                </div>
                <p className="mt-2 font-serif text-2xl font-bold">{nbEnCours}</p>
                <p className="text-xs text-muted-foreground">
                  {travaux.filter((t) => t.statut === "termine").length} terminé(s)
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </Stagger>
      )}

      {/* ---------- Onglets ---------- */}
      <div className="inline-flex gap-1 rounded-xl border bg-card p-1.5 shadow-soft">
        {onglets.map((o) => {
          const actif = onglet === o.id;
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className="relative rounded-lg px-4 py-2.5 text-sm font-medium"
            >
              {actif && (
                <motion.span
                  layoutId="onglet-finances"
                  className="absolute inset-0 rounded-lg bg-nuit-900 dark:bg-emeraude-500"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 inline-flex items-center gap-2",
                  actif ? "text-white dark:text-nuit-900" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" /> {o.label}
              </span>
            </button>
          );
        })}
      </div>

      {user && chargement && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      )}

      {user && !chargement && !immeubleId && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Aucun immeuble rattaché à votre compte pour le moment.
          </CardContent>
        </Card>
      )}

      {user && !chargement && immeubleId && (
        <AnimatePresence mode="wait">
          {onglet === "communes" ? (
            <motion.div
              key="communes"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="space-y-8"
            >
              {/* ======== FORMULAIRE FACTURE COMMUNE ======== */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-or-500" /> Nouvelle facture commune
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Le montant est réparti automatiquement entre les{" "}
                    {occupes.length} appartement(s) occupé(s) de l&apos;immeuble.
                  </p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={soumettreFacture}>
                    <div className="grid gap-x-6 md:grid-cols-2">
                      <Field label="Libellé">
                        <Input
                          value={form.libelle}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, libelle: e.target.value }))
                          }
                          placeholder="Facture Senelec, Eau…"
                        />
                      </Field>
                      <Field label="Montant total (FCFA)">
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          value={form.montant}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, montant: e.target.value }))
                          }
                          placeholder="0"
                        />
                      </Field>
                      <Field label="Date de la facture">
                        <Input
                          type="date"
                          value={form.date}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, date: e.target.value }))
                          }
                        />
                      </Field>
                      <Field
                        label="Mode de répartition"
                        hint="Part égale, ou proportionnelle au loyer de chaque appartement."
                      >
                        <Select
                          value={mode}
                          onChange={(e) => setMode(e.target.value as ModeRepartition)}
                        >
                          <option value="egales">Parts égales</option>
                          <option value="prorata">Au prorata du loyer</option>
                        </Select>
                      </Field>
                    </div>

                    <Field label="Photo de la facture (facultatif)">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-input px-4 text-sm font-medium transition hover:bg-muted">
                          <Upload className="h-4 w-4" />
                          Choisir une photo
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
                          />
                        </label>
                        {fichier && (
                          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
                            {fichier.name}
                            <button
                              type="button"
                              onClick={() => setFichier(null)}
                              aria-label="Retirer la photo"
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                      </div>
                    </Field>

                    {/* ======== TABLEAU DE RÉPARTITION ======== */}
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2.5 text-left">Appartement</th>
                            <th className="px-4 py-2.5 text-right">Loyer</th>
                            <th className="px-4 py-2.5 text-right">Part</th>
                            <th className="px-4 py-2.5 text-right">% du total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {occupes.map((a) => {
                            const part = repartition[a.id] ?? 0;
                            const pct =
                              montantTotal > 0 ? (part / montantTotal) * 100 : 0;
                            return (
                              <tr key={a.id} className="border-t">
                                <td className="px-4 py-2.5">
                                  Appartement {a.numero}{" "}
                                  <span className="text-muted-foreground">· {a.type}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                                  {fcfa(Number(a.loyer_mensuel) || 0)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                                  {fcfa(part)}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                  {pct.toFixed(1).replace(".", ",")} %
                                </td>
                              </tr>
                            );
                          })}
                          {occupes.length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-6 text-center text-muted-foreground"
                              >
                                Aucun appartement occupé : la répartition est impossible.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/40 font-semibold">
                            <td className="px-4 py-3" colSpan={2}>
                              Total réparti sur {occupes.length} appartement(s)
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {fcfa(totalReparti)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {montantTotal > 0
                                ? ((totalReparti / montantTotal) * 100)
                                    .toFixed(1)
                                    .replace(".", ",")
                                : "0,0"}{" "}
                              %
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      {repartitionValide ? (
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emeraude-600 dark:text-emeraude-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Total vérifié : la somme des parts correspond au montant total.
                        </p>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                          <AlertTriangle className="h-4 w-4" />
                          {montantTotal > 0
                            ? `Écart de ${fcfa(Math.abs(montantTotal - totalReparti))}.`
                            : "Saisissez un montant pour calculer la répartition."}
                        </p>
                      )}

                      <AnimatePresence>
                        {message && (
                          <motion.p
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={cn(
                              "text-xs font-medium",
                              message.ton === "ok"
                                ? "text-emeraude-600 dark:text-emeraude-300"
                                : "text-red-600 dark:text-red-400"
                            )}
                          >
                            {message.texte}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <Button
                        type="submit"
                        variant="success"
                        loading={enregistrement}
                        disabled={!immeubleId}
                      >
                        <Receipt className="h-4 w-4" /> Enregistrer la facture commune
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* ======== LISTE ======== */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-emeraude-500" /> Factures communes
                    enregistrées
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {factures.length} facture(s) · {fcfa(totalCharges)} au total
                  </p>
                </CardHeader>
                <CardContent>
                  {factures.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
                      <FileImage className="h-8 w-8 text-muted-foreground" />
                      <p className="font-medium">Aucune facture commune</p>
                      <p className="text-sm text-muted-foreground">
                        Ajoutez la facture Senelec, l&apos;eau ou une autre charge au-dessus.
                      </p>
                    </div>
                  ) : (
                    <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {factures.map((f) => (
                        <CarteFactureCommune
                          key={f.id}
                          f={f}
                          photo={photos[f.id]}
                          appartements={appartements}
                        />
                      ))}
                    </Stagger>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="travaux"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-orange-500" /> Chantiers & travaux
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Total {fcfa(totalTravaux)} · {travaux.length} carte(s) sur le tableau.
                  </p>
                </CardHeader>
                <CardContent>
                  <KanbanTravaux
                    travaux={travaux}
                    setTravaux={setTravaux}
                    immeubleId={immeubleId}
                    appartements={appartements}
                    onErreur={(m) => setErreur(m)}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
