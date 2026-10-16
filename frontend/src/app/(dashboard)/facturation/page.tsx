// =====================================================================
// FACTURATION — Génération de VRAIS documents (PDF / Word / Excel)
// via le backend Python FastAPI (aucun jsPDF côté navigateur)
// =====================================================================
"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Coins,
  FileDown,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Plus,
  Receipt,
  Stamp,
  Trash2
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { donneesQuittances, donneesRapport } from "@/lib/documents";
import { useAuth } from "@/components/providers/auth-provider";
import { FASTAPI_URL, documentUrl } from "@/lib/backend";
import { MOIS_LONGS, cn, fcfa } from "@/lib/utils";
import type { Appartement, Facture, Immeuble, Locataire } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Stagger, staggerItem } from "@/components/ui/motion";

// ---------------------------------------------------------------------
// Contrats d'API (backend Python FastAPI)
// ---------------------------------------------------------------------
interface RepFacture {
  numero: string;
  pdf_url: string;
}
interface RepDevis {
  numero: string;
  pdf_url: string;
}
interface RepQuittances {
  count: number;
  pdf_urls: string[];
}
interface RepRapport {
  pdf_url?: string;
  docx_url?: string;
  xlsx_url?: string;
}

type Lien = { label: string; chemin: string };
type EtatDoc = { chargement: boolean; erreur: string; liens: Lien[]; meta?: string };

const ETAT_VIDE: EtatDoc = { chargement: false, erreur: "", liens: [] };

/** Appel POST générique du backend Python (FastAPI). */
async function generer<T>(endpoint: string, payload: unknown): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`${FASTAPI_URL}/api/generate/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(
      "Backend FastAPI injoignable. Lancez le backend : python main.py"
    );
  }

  if (!reponse.ok) {
    let detail = "";
    try {
      const corps = await reponse.json();
      detail = corps?.detail || corps?.erreur || corps?.error || "";
    } catch {
      detail = "";
    }
    throw new Error(
      detail ||
        `Erreur ${reponse.status} du backend. Lancez le backend : python main.py`
    );
  }

  return (await reponse.json()) as T;
}

function lienComplet(chemin: string): string {
  return /^https?:\/\//i.test(chemin) ? chemin : documentUrl(chemin);
}

function ouvrirDocument(chemin: string) {
  try {
    window.open(lienComplet(chemin), "_blank", "noopener,noreferrer");
  } catch {
    // bloqueur de pop-ups : le bouton de téléchargement reste disponible
  }
}

function frDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function isoJour(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function moisValeur(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dixHuitDerniersMois(): { valeur: string; label: string }[] {
  const maintenant = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    return {
      valeur: moisValeur(d),
      label: `${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`
    };
  });
}

// ---------------------------------------------------------------------
// Pièces d'interface réutilisables
// ---------------------------------------------------------------------
function Alerte({ texte }: { texte: string }) {
  if (!texte) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-600 dark:text-red-400"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {texte}
    </motion.p>
  );
}

function MessageOk({ texte }: { texte: string }) {
  if (!texte) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-start gap-2 rounded-xl border border-emeraude-500/30 bg-emeraude-500/10 p-3.5 text-sm text-emeraude-600 dark:text-emeraude-300"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {texte}
    </motion.p>
  );
}

/** Carte de résultat : numéro généré + lien d'aperçu + téléchargement. */
function CarteDocument({
  titre,
  meta,
  liens,
  icone: Icon = FileText
}: {
  titre: string;
  meta?: string;
  liens: Lien[];
  icone?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <Card className="border-emeraude-500/40 bg-emeraude-500/5 shadow-glow">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emeraude-500 text-white">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif font-semibold">{titre}</p>
              {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {liens.map((l, i) => (
                  <span key={`${l.chemin}-${i}`} className="inline-flex items-center gap-2">
                    <a
                      href={lienComplet(l.chemin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-emeraude-500/40 bg-card px-3 text-xs font-medium text-emeraude-600 transition hover:bg-emeraude-500 hover:text-white dark:text-emeraude-300 dark:hover:text-white"
                    >
                      <FileDown className="h-3.5 w-3.5" /> {l.label}
                    </a>
                    <button
                      onClick={() => ouvrirDocument(l.chemin)}
                      className="text-xs font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
                    >
                      Ouvrir
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// =====================================================================
// SECTION 1 — FACTURE RÉELLE
// =====================================================================
function SectionFacture({
  immeubleId,
  appartements,
  locataires
}: {
  immeubleId: string;
  appartements: Appartement[];
  locataires: Pick<Locataire, "id" | "nom" | "appartement_id">[];
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [appartementId, setAppartementId] = useState("");
  const [locataireId, setLocataireId] = useState("");
  const [montant, setMontant] = useState("");
  const [description, setDescription] = useState("");
  const [etat, setEtat] = useState<EtatDoc>(ETAT_VIDE);
  const [numero, setNumero] = useState("");
  const [message, setMessage] = useState("");
  const [dernieres, setDernieres] = useState<Facture[]>([]);

  useEffect(() => {
    setAppartementId("");
    setLocataireId("");
    setDernieres([]);
  }, [immeubleId]);

  useEffect(() => {
    if (!immeubleId) return;
    let annule = false;
    (async () => {
      const { data } = await supabase
        .from("factures")
        .select("*")
        .eq("immeuble_id", immeubleId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (!annule) setDernieres((data ?? []) as Facture[]);
    })();
    return () => {
      annule = true;
    };
  }, [immeubleId, supabase]);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setNumero("");
    setEtat({ ...ETAT_VIDE, chargement: true, erreur: "" });
    if (!immeubleId) {
      setEtat({ ...ETAT_VIDE, erreur: "Sélectionnez un immeuble." });
      return;
    }
    const valeur = Number(montant) || 0;
    if (valeur <= 0) {
      setEtat({ ...ETAT_VIDE, erreur: "Le montant doit être supérieur à 0." });
      return;
    }

    try {
      const rep = await generer<RepFacture>("facture", {
        immeuble_id: immeubleId,
        appartement_id: appartementId || null,
        locataire_id: locataireId || null,
        montant: valeur,
        description: description.trim() || "Loyer et charges"
      });

      setNumero(rep.numero);
      setEtat({
        chargement: false,
        erreur: "",
        liens: [{ label: `Télécharger ${rep.numero}.pdf`, chemin: rep.pdf_url }],
        meta: `Facture ${rep.numero}`
      });
      ouvrirDocument(rep.pdf_url);

      const { error } = await supabase.from("factures").insert({
        numero: rep.numero,
        immeuble_id: immeubleId,
        appartement_id: appartementId || null,
        locataire_id: locataireId || null,
        type: "facture",
        montant: valeur,
        description: description.trim() || null,
        pdf_url: rep.pdf_url,
        statut: "emise",
        date_emission: isoJour(new Date())
      });
      if (error) {
        setMessage(
          `PDF généré (${rep.numero}) mais l'enregistrement en base a échoué : ${error.message}`
        );
      } else {
        setDernieres((prev) =>
          [
            {
              id: `local-${rep.numero}`,
              numero: rep.numero,
              immeuble_id: immeubleId,
              appartement_id: appartementId || null,
              locataire_id: locataireId || null,
              type: "facture" as const,
              montant: valeur,
              description: description.trim() || null,
              pdf_url: rep.pdf_url,
              statut: "emise",
              date_emission: isoJour(new Date()),
              created_at: new Date().toISOString()
            } as Facture,
            ...prev
          ].slice(0, 6)
        );
        setMessage(`Facture ${rep.numero} enregistrée et PDF généré.`);
      }
      setMontant("");
      setDescription("");
    } catch (err) {
      setEtat({
        ...ETAT_VIDE,
        erreur: err instanceof Error ? err.message : "Génération impossible."
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-or-500" /> Facture réelle
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Numérotation automatique (SK-AAAA-001) et PDF signé par le backend Python.
        </p>
      </CardHeader>
      <CardContent>
        <Alerte texte={etat.erreur} />
        <MessageOk texte={message} />

        <form onSubmit={soumettre} className="grid gap-x-6 md:grid-cols-2">
          <Field label="Appartement (facultatif)">
            <Select value={appartementId} onChange={(e) => setAppartementId(e.target.value)}>
              <option value="">Aucun / immeuble entier</option>
              {appartements.map((a) => (
                <option key={a.id} value={a.id}>
                  Appartement {a.numero} · {a.type} · {fcfa(Number(a.loyer_mensuel) || 0)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Locataire (facultatif)">
            <Select value={locataireId} onChange={(e) => setLocataireId(e.target.value)}>
              <option value="">Aucun locataire</option>
              {locataires.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Montant (FCFA)">
            <Input
              type="number"
              min={0}
              step={500}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Loyer octobre, charges…"
            />
          </Field>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" variant="success" loading={etat.chargement} disabled={!immeubleId}>
              <FileText className="h-4 w-4" /> Générer la facture PDF
            </Button>
          </div>
        </form>

        {numero && (
          <div className="mt-5">
            <CarteDocument
              titre={`Facture ${numero} générée`}
              meta="Document PDF disponible en un clic."
              liens={etat.liens}
              icone={Receipt}
            />
          </div>
        )}

        {dernieres.length > 0 && (
          <div className="mt-6 border-t pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dernières factures
            </p>
            <div className="space-y-2">
              {dernieres.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-semibold">{f.numero}</span>
                    <span className="ml-2 truncate text-muted-foreground">
                      {f.description || "—"} · {frDate(f.date_emission)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums font-medium">{fcfa(Number(f.montant) || 0)}</span>
                    {f.pdf_url && (
                      <a
                        href={lienComplet(f.pdf_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-emeraude-600 hover:underline dark:text-emeraude-300"
                      >
                        <FileDown className="h-3.5 w-3.5" /> PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SECTION 2 — DEVIS TRAVAUX
// =====================================================================
interface LigneDevis {
  cle: string;
  description: string;
  quantite: string;
  prix_unitaire: string;
}

let compteurLignes = 0;

function SectionDevis({ immeubleId }: { immeubleId: string }) {
  const [titre, setTitre] = useState("");
  const [lignes, setLignes] = useState<LigneDevis[]>([
    { cle: `l-${compteurLignes++}`, description: "", quantite: "1", prix_unitaire: "" }
  ]);
  const [etat, setEtat] = useState<EtatDoc>(ETAT_VIDE);

  useEffect(() => {
    setEtat(ETAT_VIDE);
  }, [immeubleId]);

  const total = lignes.reduce(
    (s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0),
    0
  );

  const majLigne = (cle: string, champ: keyof LigneDevis, valeur: string) =>
    setLignes((prev) => prev.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)));

  const ajouterLigne = () =>
    setLignes((prev) => [
      ...prev,
      { cle: `l-${compteurLignes++}`, description: "", quantite: "1", prix_unitaire: "" }
    ]);

  const retirerLigne = (cle: string) =>
    setLignes((prev) => (prev.length > 1 ? prev.filter((l) => l.cle !== cle) : prev));

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!immeubleId) {
      setEtat({ ...ETAT_VIDE, erreur: "Sélectionnez un immeuble." });
      return;
    }
    const valides = lignes.filter(
      (l) => l.description.trim() && (Number(l.quantite) || 0) > 0 && (Number(l.prix_unitaire) || 0) >= 0
    );
    if (!titre.trim()) {
      setEtat({ ...ETAT_VIDE, erreur: "Indiquez un titre pour le devis." });
      return;
    }
    if (valides.length === 0) {
      setEtat({
        ...ETAT_VIDE,
        erreur: "Ajoutez au moins une ligne avec une description, une quantité et un prix."
      });
      return;
    }

    setEtat({ ...ETAT_VIDE, chargement: true });
    try {
      const rep = await generer<RepDevis>("devis", {
        immeuble_id: immeubleId,
        titre: titre.trim(),
        lignes: valides.map((l) => ({
          description: l.description.trim(),
          quantite: Number(l.quantite),
          prix_unitaire: Number(l.prix_unitaire)
        }))
      });
      setEtat({
        chargement: false,
        erreur: "",
        liens: [{ label: `Télécharger ${rep.numero}.pdf`, chemin: rep.pdf_url }],
        meta: `Devis ${rep.numero} · ${valides.length} ligne(s) · ${fcfa(total)}`
      });
      ouvrirDocument(rep.pdf_url);
    } catch (err) {
      setEtat({
        ...ETAT_VIDE,
        erreur: err instanceof Error ? err.message : "Génération impossible."
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-orange-500" /> Devis travaux
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Composez vos lignes : le total se calcule en direct, le PDF suit.
        </p>
      </CardHeader>
      <CardContent>
        <Alerte texte={etat.erreur} />

        <form onSubmit={soumettre}>
          <Field label="Titre du devis">
            <Input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Réfection toiture, peinture des parties communes…"
            />
          </Field>

          <div className="mb-2 hidden grid-cols-[1fr_5.5rem_9rem_2.5rem] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Description</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Prix unitaire</span>
            <span />
          </div>

          <div className="space-y-2">
            {lignes.map((l, i) => (
              <motion.div
                key={l.cle}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 gap-2 rounded-xl border p-3 md:grid-cols-[1fr_5.5rem_9rem_2.5rem] md:items-center"
              >
                <Input
                  value={l.description}
                  onChange={(e) => majLigne(l.cle, "description", e.target.value)}
                  placeholder={`Ligne ${i + 1} : fourniture de ciment`}
                />
                <Input
                  type="number"
                  min={1}
                  value={l.quantite}
                  onChange={(e) => majLigne(l.cle, "quantite", e.target.value)}
                  className="md:text-right"
                  aria-label={`Quantité ligne ${i + 1}`}
                />
                <Input
                  type="number"
                  min={0}
                  step={500}
                  value={l.prix_unitaire}
                  onChange={(e) => majLigne(l.cle, "prix_unitaire", e.target.value)}
                  className="md:text-right"
                  aria-label={`Prix unitaire ligne ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => retirerLigne(l.cle)}
                  aria-label={`Supprimer la ligne ${i + 1}`}
                  className="justify-self-start rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500 md:justify-self-center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={ajouterLigne}>
              <Plus className="h-4 w-4" /> Ajouter une ligne
            </Button>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4 text-or-500" /> Total :
              <span className="font-serif text-lg font-bold text-foreground tabular-nums">
                {fcfa(total)}
              </span>
            </p>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              type="submit"
              variant="accent"
              loading={etat.chargement}
              disabled={!immeubleId}
            >
              <FileSignature className="h-4 w-4" /> Générer le devis PDF
            </Button>
          </div>
        </form>

        {etat.liens.length > 0 && (
          <div className="mt-5">
            <CarteDocument
              titre="Devis généré"
              meta={etat.meta}
              liens={etat.liens}
              icone={FileSignature}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SECTION 3 — QUITTANCES DE LOYER EN MASSE
// =====================================================================
function SectionQuittances({ immeubleId }: { immeubleId: string }) {
  const moisOptions = useMemo(() => dixHuitDerniersMois(), []);
  const [mois, setMois] = useState(moisOptions[0]?.valeur ?? "");
  const [etat, setEtat] = useState<EtatDoc>(ETAT_VIDE);

  const labelMois =
    moisOptions.find((m) => m.valeur === mois)?.label ?? mois;

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!immeubleId) {
      setEtat({ ...ETAT_VIDE, erreur: "Sélectionnez un immeuble." });
      return;
    }
    if (!mois) {
      setEtat({ ...ETAT_VIDE, erreur: "Choisissez un mois." });
      return;
    }

    setEtat({ ...ETAT_VIDE, chargement: true });
    try {
      const rep = await generer<RepQuittances>("quittances", {
        immeuble_id: immeubleId,
        mois: `${mois}-01`,
        donnees: await donneesQuittances(immeubleId, `${mois}-01`)
      });
      const liens = (rep.pdf_urls ?? []).map((u, i) => {
        const nom = decodeURIComponent(u.split("?")[0].split("/").pop() || "")
          .replace(/\.pdf$/i, "")
          .slice(0, 40);
        return { label: nom || `Quittance ${i + 1}`, chemin: u };
      });
      if (liens.length === 0) {
        setEtat({
          chargement: false,
          erreur: `Aucun loyer payé enregistré pour ${labelMois} : rien à quitter.`,
          liens: []
        });
        return;
      }
      setEtat({
        chargement: false,
        erreur: "",
        liens,
        meta: `${rep.count} quittance(s) générée(s) pour ${labelMois} · ${liens.length} document(s) prêt(s)`
      });
      ouvrirDocument(liens[0].chemin);
    } catch (err) {
      setEtat({
        ...ETAT_VIDE,
        erreur: err instanceof Error ? err.message : "Génération impossible."
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stamp className="h-5 w-5 text-emeraude-500" /> Quittance de loyer en masse
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Une quittance PDF par appartement payé pour le mois choisi.
        </p>
      </CardHeader>
      <CardContent>
        <Alerte texte={etat.erreur} />

        <form onSubmit={soumettre} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <Field label="Mois concerné">
              <Select value={mois} onChange={(e) => setMois(e.target.value)}>
                {moisOptions.map((m) => (
                  <option key={m.valeur} value={m.valeur}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="pb-4">
            <Button
              type="submit"
              variant="primary"
              loading={etat.chargement}
              disabled={!immeubleId}
            >
              <Stamp className="h-4 w-4" /> Générer les quittances
            </Button>
          </div>
        </form>

        <AnimatePresence>
          {etat.chargement && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 h-2 overflow-hidden rounded-full bg-muted"
            >
              <motion.div
                className="h-full bg-emeraude-500"
                initial={{ width: "5%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {etat.liens.length > 0 && (
          <div className="mt-2">
            <CarteDocument
              titre={`${etat.liens.length} quittance(s) prête(s)`}
              meta={etat.meta}
              liens={etat.liens.slice(0, 12)}
              icone={Stamp}
            />
            {etat.liens.length > 12 && (
              <p className="mt-2 text-xs text-muted-foreground">
                …et {etat.liens.length - 12} autre(s) quittance(s) générée(s).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SECTION 4 — RAPPORT MENSUEL / ANNUEL (PDF, Word, Excel)
// =====================================================================
function SectionRapports({ immeubleId }: { immeubleId: string }) {
  const aujourdhui = useMemo(() => new Date(), []);
  const [debut, setDebut] = useState(() =>
    isoJour(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1))
  );
  const [fin, setFin] = useState(() => isoJour(aujourdhui));
  const [pdf, setPdf] = useState<EtatDoc>(ETAT_VIDE);
  const [docx, setDocx] = useState<EtatDoc>(ETAT_VIDE);
  const [xlsx, setXlsx] = useState<EtatDoc>(ETAT_VIDE);

  const appliquerPreset = (preset: "mois" | "dernier" | "annee") => {
    const a = new Date();
    if (preset === "mois") {
      setDebut(isoJour(new Date(a.getFullYear(), a.getMonth(), 1)));
      setFin(isoJour(new Date(a.getFullYear(), a.getMonth() + 1, 0)));
    } else if (preset === "dernier") {
      setDebut(isoJour(new Date(a.getFullYear(), a.getMonth() - 1, 1)));
      setFin(isoJour(new Date(a.getFullYear(), a.getMonth(), 0)));
    } else {
      setDebut(`${a.getFullYear()}-01-01`);
      setFin(isoJour(a));
    }
  };

  const lancer = async (
    endpoint: "report-pdf" | "report-docx" | "excel",
    cle: "pdf" | "docx" | "xlsx"
  ) => {
    const maj = (v: Partial<EtatDoc>) =>
      cle === "pdf"
        ? setPdf((p) => ({ ...ETAT_VIDE, ...p, ...v }))
        : cle === "docx"
          ? setDocx((p) => ({ ...ETAT_VIDE, ...p, ...v }))
          : setXlsx((p) => ({ ...ETAT_VIDE, ...p, ...v }));

    if (!immeubleId) {
      maj({ erreur: "Sélectionnez un immeuble." });
      return;
    }
    if (!debut || !fin) {
      maj({ erreur: "Choisissez une période complète (début et fin)." });
      return;
    }
    if (debut > fin) {
      maj({ erreur: "La date de début doit précéder la date de fin." });
      return;
    }

    maj({ chargement: true, erreur: "", liens: [] });
    try {
      const rep = await generer<RepRapport>(endpoint, {
        immeuble_id: immeubleId,
        debut,
        fin,
        donnees: await donneesRapport(immeubleId, debut, fin)
      });
      const chemin =
        rep.pdf_url ?? rep.docx_url ?? rep.xlsx_url ?? "";
      if (!chemin) throw new Error("Le backend n'a renvoyé aucun document.");
      const label =
        cle === "pdf" ? "Rapport PDF (2 pages).pdf"
          : cle === "docx" ? "Rapport Word.docx"
            : "Rapport Excel.xlsx";
      maj({
        chargement: false,
        liens: [{ label, chemin }],
        meta: `Période du ${frDate(debut)} au ${frDate(fin)}`
      });
      ouvrirDocument(chemin);
    } catch (err) {
      maj({
        chargement: false,
        liens: [],
        erreur: err instanceof Error ? err.message : "Génération impossible."
      });
    }
  };

  const boutons: {
    cle: "pdf" | "docx" | "xlsx";
    endpoint: "report-pdf" | "report-docx" | "excel";
    label: string;
    variante: "primary" | "success" | "gold";
    icone: React.ComponentType<{ className?: string }>;
    etat: EtatDoc;
  }[] = [
    { cle: "pdf", endpoint: "report-pdf", label: "PDF (2 pages)", variante: "primary", icone: FileText, etat: pdf },
    { cle: "docx", endpoint: "report-docx", label: "Word (.docx)", variante: "success", icone: FileSignature, etat: docx },
    { cle: "xlsx", endpoint: "excel", label: "Excel (.xlsx, 3 onglets)", variante: "gold", icone: FileSpreadsheet, etat: xlsx }
  ];

  const preset = (id: "mois" | "dernier" | "annee", label: string) => (
    <button
      type="button"
      onClick={() => appliquerPreset(id)}
      className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {label}
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-nuit-900 dark:text-white" /> Rapport mensuel / annuel
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Loyers, dépenses et bilan sur la période choisie — export PDF, Word ou Excel (3
          onglets Loyers / Dépenses / Bilan).
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {preset("mois", "Ce mois")}
          {preset("dernier", "Mois dernier")}
          {preset("annee", "Année en cours")}
        </div>

        <div className="grid gap-x-6 md:grid-cols-2">
          <Field label="Début de période">
            <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </Field>
          <Field label="Fin de période">
            <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          {boutons.map((b) => {
            const Icon = b.icone;
            return (
              <div key={b.cle} className="flex flex-col items-end gap-1">
                <Button
                  variant={b.variante}
                  loading={b.etat.chargement}
                  disabled={!immeubleId}
                  onClick={() => lancer(b.endpoint, b.cle)}
                >
                  <Icon className="h-4 w-4" /> {b.label}
                </Button>
                {b.etat.erreur && (
                  <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
                    {b.etat.erreur}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 space-y-3">
          {boutons
            .filter((b) => b.etat.liens.length > 0)
            .map((b) => (
              <CarteDocument
                key={`res-${b.cle}`}
                titre={`${b.label} — document prêt`}
                meta={b.etat.meta}
                liens={b.etat.liens}
                icone={b.icone}
              />
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// PAGE
// =====================================================================
type Onglet = "facture" | "devis" | "quittances" | "rapports";

export default function FacturationPage() {
  const { user, role, loading: chargementAuth } = useAuth();
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [onglet, setOnglet] = useState<Onglet>("facture");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [immeubles, setImmeubles] = useState<Immeuble[]>([]);
  const [immeubleId, setImmeubleId] = useState("");
  const [appartements, setAppartements] = useState<Appartement[]>([]);
  const [locataires, setLocataires] = useState<
    Pick<Locataire, "id" | "nom" | "appartement_id">[]
  >([]);

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

  useEffect(() => {
    if (!immeubleId) {
      setAppartements([]);
      setLocataires([]);
      return;
    }
    let annule = false;
    (async () => {
      const [apps, locs] = await Promise.all([
        supabase
          .from("appartements")
          .select("*")
          .eq("immeuble_id", immeubleId)
          .order("numero"),
        supabase
          .from("locataires")
          .select("id, nom, appartement_id, appartements!inner(immeuble_id)")
          .eq("appartements.immeuble_id", immeubleId)
          .eq("statut", "actif")
          .order("nom")
      ]);
      if (annule) return;
      setAppartements((apps.data ?? []) as Appartement[]);
      if (locs.error) {
        setLocataires([]);
      } else {
        const brut = (locs.data ?? []) as unknown as {
          id: string;
          nom: string;
          appartement_id: string | null;
        }[];
        setLocataires(brut);
      }
    })();
    return () => {
      annule = true;
    };
  }, [immeubleId, supabase]);

  const onglets: { id: Onglet; label: string; icone: React.ComponentType<{ className?: string }> }[] = [
    { id: "facture", label: "Facture", icone: Receipt },
    { id: "devis", label: "Devis travaux", icone: FileSignature },
    { id: "quittances", label: "Quittances", icone: Stamp },
    { id: "rapports", label: "Rapports", icone: BarChart3 }
  ];

  return (
    <div className="space-y-8">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-or-500">
            Documents officiels
          </p>
          <h1 className="font-serif text-3xl font-bold">Facturation</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Factures, devis, quittances et rapports réellement générés (PDF, Word, Excel)
            par le backend Python FastAPI.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="w-full min-w-[240px]">
            <Field label="Immeuble concerné">
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
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraude-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emeraude-500" />
            </span>
            Backend : {FASTAPI_URL}
          </p>
        </div>
      </div>

      {erreur && <Alerte texte={erreur} />}

      {!chargementAuth && !user && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Session expirée : reconnectez-vous pour générer vos documents.
          </CardContent>
        </Card>
      )}

      {/* ---------- Onglets ---------- */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-soft">
        {onglets.map((o) => {
          const actif = onglet === o.id;
          const Icon = o.icone;
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className="relative rounded-lg px-4 py-2.5 text-sm font-medium"
            >
              {actif && (
                <motion.span
                  layoutId="onglet-facturation"
                  className="absolute inset-0 rounded-lg bg-nuit-900 dark:bg-orange-500"
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
            <div key={i} className="h-44 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      )}

      {user && !chargement && !immeubleId && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Aucun immeuble rattaché à votre compte : ajoutez-en un dans « Immeubles ».
          </CardContent>
        </Card>
      )}

      {user && !chargement && immeubleId && (
        <AnimatePresence mode="wait">
          <motion.div
            key={onglet}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            {onglet === "facture" && (
              <SectionFacture
                immeubleId={immeubleId}
                appartements={appartements}
                locataires={locataires}
              />
            )}
            {onglet === "devis" && <SectionDevis key={immeubleId} immeubleId={immeubleId} />}
            {onglet === "quittances" && (
              <SectionQuittances key={immeubleId} immeubleId={immeubleId} />
            )}
            {onglet === "rapports" && (
              <SectionRapports key={immeubleId} immeubleId={immeubleId} />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ---------- Raccourcis ---------- */}
      {user && !chargement && immeubleId && (
        <Stagger className="grid gap-4 sm:grid-cols-3">
          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                <Receipt className="mb-2 h-5 w-5 text-or-500" />
                Les factures générées sont automatiquement enregistrées dans la table{" "}
                <span className="font-medium text-foreground">factures</span>.
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                <FileDown className="mb-2 h-5 w-5 text-emeraude-500" />
                Chaque document s&apos;ouvre dans un nouvel onglet : PDF, DOCX et XLSX
                téléchargés tels quels.
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                <CalendarDays className="mb-2 h-5 w-5 text-orange-500" />
                Les rapports comprennent loyers, dépenses et bilan sur la période
                sélectionnée.
              </CardContent>
            </Card>
          </motion.div>
        </Stagger>
      )}
    </div>
  );
}
