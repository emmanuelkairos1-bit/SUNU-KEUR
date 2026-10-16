// =====================================================================
// DONNÉES DE DOCUMENTS — pont MODE LOCAL
// ---------------------------------------------------------------------
// Le backend Python ne peut pas lire la base localStorage du navigateur :
// en mode local (aucune clé Supabase), une requête serveur renverrait 503.
// Pour que les documents (reçu, quittances de masse, rapports PDF/Word/
// Excel) se génèrent réellement hors ligne, on assemble ici les données
// déjà présentes côté client et on les envoye en clair (champ « donnees »).
// Le backend se contente alors de calculer/formater et d'écrire le fichier.
//
// En mode Supabase réel, chaque fonction renvoie `undefined` : le champ
// « donnees » est absent du corps JSON et le backend fait ses propres
// requêtes comme avant (comportement d'origine, intact).
// =====================================================================
"use client";

import { estModeLocal, getSupabaseBrowser } from "@/lib/supabase/client";

type Ligne = Record<string, any>;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** « orange_money » → « Orange Money ». */
function libelleMethode(valeur: unknown): string {
  const brut = String(valeur ?? "").replace(/_/g, " ").trim();
  if (!brut) return "Mobile Money";
  return brut.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Premier jour du mois suivant « AAAA-MM-01 ». */
function moisSuivantIso(moisIso: string): string {
  const [a, m] = moisIso.split("-").map(Number);
  if (!a || !m) return moisIso;
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
}

async function uneLigne(sb: ReturnType<typeof getSupabaseBrowser>, table: string, id: string): Promise<Ligne | null> {
  try {
    const { data } = await sb.from(table).select("*").eq("id", id).maybeSingle();
    return (data as Ligne) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// REÇU / QUITTANCE INDIVIDUEL (endpoint POST /api/generate/receipt)
// ---------------------------------------------------------------------
export async function donneesRecu(
  loyerId: string,
  paiementId?: string | null
): Promise<Record<string, unknown> | undefined> {
  if (!estModeLocal()) return undefined;
  const sb = getSupabaseBrowser();

  const loyer = await uneLigne(sb, "loyers", loyerId);
  if (!loyer) return undefined;

  const app = loyer.appartement_id ? await uneLigne(sb, "appartements", String(loyer.appartement_id)) : null;
  const immeuble = app?.immeuble_id ? await uneLigne(sb, "immeubles", String(app.immeuble_id)) : null;

  let loc: Ligne | null = null;
  if (loyer.locataire_id) {
    loc = await uneLigne(sb, "locataires", String(loyer.locataire_id));
  } else if (app?.id) {
    try {
      const { data } = await sb
        .from("locataires")
        .select("*")
        .eq("appartement_id", app.id)
        .eq("statut", "actif")
        .maybeSingle();
      loc = (data as Ligne) ?? null;
    } catch {
      loc = null;
    }
  }

  let methode = "Mobile Money";
  if (paiementId) {
    try {
      const { data } = await sb.from("paiements").select("methode").eq("id", paiementId).maybeSingle();
      const p = data as Ligne | null;
      if (p?.methode) methode = libelleMethode(p.methode);
    } catch {
      // méthode par défaut conservée
    }
  }

  return {
    mois: String(loyer.mois || "").slice(0, 7),
    montant: n(loyer.montant_paye) || n(loyer.montant),
    methode,
    locataire: { nom: loc?.nom ?? "Locataire", telephone: loc?.telephone ?? null },
    appartement: { numero: app?.numero ?? "—", type: app?.type ?? "" },
    immeuble: {
      nom: immeuble?.nom ?? "",
      adresse: immeuble?.adresse ?? "",
      ville: immeuble?.ville ?? ""
    }
  };
}

// ---------------------------------------------------------------------
// QUITTANCES DE MASSE (endpoint POST /api/generate/quittances)
// ---------------------------------------------------------------------
export async function donneesQuittances(
  immeubleId: string,
  moisIso: string
): Promise<Record<string, unknown> | undefined> {
  if (!estModeLocal()) return undefined;
  const sb = getSupabaseBrowser();

  const immeuble = await uneLigne(sb, "immeubles", immeubleId);
  const entete = {
    nom: immeuble?.nom ?? "",
    adresse: immeuble?.adresse ?? "",
    ville: immeuble?.ville ?? ""
  };

  let apps: Ligne[] = [];
  try {
    const { data } = await sb.from("appartements").select("*").eq("immeuble_id", immeubleId).order("numero");
    apps = (data as Ligne[]) ?? [];
  } catch {
    apps = [];
  }
  const appIds = apps.map((a) => a.id).filter(Boolean);
  if (!appIds.length) return { immeuble: entete, quittances: [] };

  let loyers: Ligne[] = [];
  let locs: Ligne[] = [];
  try {
    const r = await sb
      .from("loyers")
      .select("*")
      .in("appartement_id", appIds)
      .gte("mois", moisIso)
      .lt("mois", moisSuivantIso(moisIso));
    loyers = (r.data as Ligne[]) ?? [];
  } catch {
    loyers = [];
  }
  try {
    const r = await sb.from("locataires").select("*").in("appartement_id", appIds).eq("statut", "actif");
    locs = (r.data as Ligne[]) ?? [];
  } catch {
    locs = [];
  }

  const appParId = new Map(apps.map((a) => [a.id, a]));
  const locParApp = new Map(locs.filter((l) => l.appartement_id).map((l) => [l.appartement_id, l]));
  const payes = loyers.filter((l) => l.statut === "paye" || n(l.montant_paye) + 0.009 >= n(l.montant));

  return {
    immeuble: entete,
    quittances: payes.map((l) => {
      const app = appParId.get(l.appartement_id) ?? {};
      const loc = locParApp.get(l.appartement_id) ?? {};
      return {
        mois: String(l.mois || moisIso).slice(0, 7),
        locataire: { nom: loc.nom ?? "Locataire", telephone: loc.telephone ?? null },
        appartement: { numero: app.numero ?? "—", type: app.type ?? "" },
        montant: n(l.montant_paye) || n(l.montant),
        methode: "Mobile Money"
      };
    })
  };
}

// ---------------------------------------------------------------------
// RAPPORTS (PDF / Word / Excel — endpoints report-pdf, report-docx, excel)
// On renvoie les lignes brutes : le backend applique exactement le même
// calcul de KPIs que pour le mode Supabase (aucune divergence).
// ---------------------------------------------------------------------
export async function donneesRapport(
  immeubleId: string,
  debut: string,
  fin: string
): Promise<Record<string, unknown> | undefined> {
  if (!estModeLocal()) return undefined;
  const sb = getSupabaseBrowser();

  const immeuble = await uneLigne(sb, "immeubles", immeubleId);

  let apps: Ligne[] = [];
  try {
    const { data } = await sb.from("appartements").select("*").eq("immeuble_id", immeubleId).order("numero");
    apps = (data as Ligne[]) ?? [];
  } catch {
    apps = [];
  }
  const appIds = apps.map((a) => a.id).filter(Boolean);

  let locataires: Ligne[] = [];
  let loyers: Ligne[] = [];
  if (appIds.length) {
    try {
      const r = await sb.from("locataires").select("*").in("appartement_id", appIds).eq("statut", "actif");
      locataires = (r.data as Ligne[]) ?? [];
    } catch {
      locataires = [];
    }
    try {
      const r = await sb
        .from("loyers")
        .select("*")
        .in("appartement_id", appIds)
        .gte("mois", debut)
        .lte("mois", fin);
      loyers = (r.data as Ligne[]) ?? [];
    } catch {
      loyers = [];
    }
  }

  let factures: Ligne[] = [];
  try {
    const r = await sb
      .from("factures_communes")
      .select("*")
      .eq("immeuble_id", immeubleId)
      .gte("date", debut)
      .lte("date", fin);
    factures = (r.data as Ligne[]) ?? [];
  } catch {
    factures = [];
  }

  let travaux: Ligne[] = [];
  try {
    const r = await sb.from("travaux").select("*").eq("immeuble_id", immeubleId);
    travaux = (r.data as Ligne[]) ?? [];
  } catch {
    travaux = [];
  }

  return {
    immeuble: immeuble ?? {},
    appartements: apps,
    locataires,
    loyers,
    factures_communes: factures,
    travaux
  };
}
