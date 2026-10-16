// =====================================================================
// PAIEMENTS MOBILE MONEY + DOCUMENTS — pont vers le backend FastAPI
// Wave / Orange Money / Free Money (contrat : POST /api/pay/<operateur>)
// =====================================================================
import { documentUrl, FASTAPI_URL } from "@/lib/backend";
import type { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Paiement } from "@/lib/types";

type ClientSupabase = ReturnType<typeof getSupabaseBrowser>;

export type MobileMoney = "wave" | "orange_money" | "free_money";

/** Message affiché quand le backend Python n'est pas joignable. */
export const ERREUR_BACKEND = "Backend non démarré — lancez python main.py";

export interface OperateurMobile {
  label: string;
  endpoint: string;
  couleur: string;
  initiale: string;
}

export const MOBILE_MONEY: Record<MobileMoney, OperateurMobile> = {
  wave: { label: "Wave", endpoint: "/api/pay/wave", couleur: "#1E88E5", initiale: "W" },
  orange_money: { label: "Orange Money", endpoint: "/api/pay/orange_money", couleur: "#F97316", initiale: "OM" },
  free_money: { label: "Free Money", endpoint: "/api/pay/free_money", couleur: "#E2001A", initiale: "F" }
};

export const METHODES_MOBILE: MobileMoney[] = ["wave", "orange_money", "free_money"];

export interface ResultatPaiement {
  payment_url: string | null;
  payment_id: string | null;
  qr_data: string | null;
}

interface ReponsePaiement {
  payment_url?: string;
  payment_id?: string;
  qr_data?: string;
  detail?: string;
  message?: string;
}

interface ReponseDocument {
  pdf_url?: string;
  docx_url?: string;
  document_url?: string;
  url?: string;
  path?: string;
  filepath?: string;
  filename?: string;
  detail?: string;
}

function estErreurReseau(e: unknown): boolean {
  return e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(e));
}

async function lireJson<T>(res: Response): Promise<T | null> {
  const texte = await res.text();
  if (!texte) return null;
  try {
    return JSON.parse(texte) as T;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------
// INITIER UN PAIEMENT MOBILE MONEY
// -----------------------------------------------------------------
export async function initierPaiement(
  methode: MobileMoney,
  params: { loyer_id: string; montant: number; telephone: string; description?: string }
): Promise<ResultatPaiement> {
  const corps: Record<string, unknown> = {
    loyer_id: params.loyer_id,
    montant: params.montant,
    telephone: params.telephone
  };
  // Seul l'endpoint Wave prend un libellé de description (contrat backend).
  if (params.description) corps.description = params.description;

  let res: Response;
  try {
    res = await fetch(FASTAPI_URL + MOBILE_MONEY[methode].endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps)
    });
  } catch (e) {
    throw new Error(estErreurReseau(e) ? ERREUR_BACKEND : "Connexion impossible au service de paiement.");
  }

  const donnees = await lireJson<ReponsePaiement>(res);
  if (!res.ok) {
    const detail = donnees?.detail ?? donnees?.message;
    throw new Error(typeof detail === "string" && detail ? detail : `Paiement refusé (erreur ${res.status}).`);
  }

  return {
    payment_url: donnees?.payment_url ?? null,
    payment_id: donnees?.payment_id ?? null,
    qr_data: donnees?.qr_data ?? null
  };
}

// -----------------------------------------------------------------
// STATUT D'UNE SESSION DE PAIEMENT — GET /api/pay/status/{payment_id}
// -----------------------------------------------------------------
export interface StatutPaiementBackend {
  payment_id: string | null;
  statut: string | null;
  montant: number | null;
  methode: string | null;
  loyer_id: string | null;
  reference: string | null;
}

interface ReponseStatut {
  payment_id?: string;
  statut?: string;
  montant?: number;
  methode?: string;
  loyer_id?: string;
  reference?: string;
  detail?: string;
}

const STATUTS_REUSSITE = ["confirme", "success", "paid", "succeeded"];
const STATUTS_ECHEC = ["echec", "failed", "cancel", "cancelled"];

/** Vrai si le backend indique un paiement abouti. */
export function confirmeSelonBackend(statut?: string | null): boolean {
  return !!statut && STATUTS_REUSSITE.includes(statut.toLowerCase());
}

/** Vrai si le backend indique un paiement échoué ou annulé. */
export function echecSelonBackend(statut?: string | null): boolean {
  return !!statut && STATUTS_ECHEC.includes(statut.toLowerCase());
}

/**
 * Interroge le backend sur le statut réel d'une session de paiement.
 * Retourne null si le backend ne connaît pas cette référence (404) :
 * c'est le cas en mode local, où la table `paiements` côté Python n'est
 * pas la base localStorage du front.
 */
export async function interrogerStatut(reference: string): Promise<StatutPaiementBackend | null> {
  let res: Response;
  try {
    res = await fetch(`${FASTAPI_URL}/api/pay/status/${encodeURIComponent(reference)}`, {
      headers: { Accept: "application/json" }
    });
  } catch (e) {
    throw new Error(estErreurReseau(e) ? ERREUR_BACKEND : "Connexion impossible au service de paiement.");
  }

  if (res.status === 404) return null;

  const donnees = await lireJson<ReponseStatut>(res);
  if (!res.ok) {
    const detail = donnees?.detail;
    throw new Error(
      typeof detail === "string" && detail ? detail : `Statut du paiement indisponible (erreur ${res.status}).`
    );
  }

  return {
    payment_id: donnees?.payment_id ?? null,
    statut: donnees?.statut ?? null,
    montant: donnees?.montant ?? null,
    methode: donnees?.methode ?? null,
    loyer_id: donnees?.loyer_id ?? null,
    reference: donnees?.reference ?? null
  };
}

// -----------------------------------------------------------------
// CONFIRMATION LOCALE D'UN PAIEMENT (miroir du webhook backend)
// En mode local, le backend Python ne peut pas écrire dans la base
// localStorage du front : le client applique lui-même la confirmation
// (cf. backend/app/services/payment_service.py > confirmer_paiement) :
// `paiements.statut` → confirme, `loyers.montant_paye/statut` à jour,
// journal `activites` écrit en best-effort.
// -----------------------------------------------------------------
export interface ResultatConfirmation {
  confirme: boolean;
  dejaConfirme: boolean;
  montant: number;
  statutLoyer: string | null;
  erreur: string | null;
  avertissement: string | null;
}

function resultatVide(): ResultatConfirmation {
  return {
    confirme: false,
    dejaConfirme: false,
    montant: 0,
    statutLoyer: null,
    erreur: null,
    avertissement: null
  };
}

export async function confirmerPaiementLocalement(
  supabase: ClientSupabase,
  paiementId: string
): Promise<ResultatConfirmation> {
  const lecture = await supabase
    .from("paiements")
    .select("id, loyer_id, montant, methode, statut")
    .eq("id", paiementId)
    .maybeSingle();
  if (lecture.error) return { ...resultatVide(), erreur: `Suivi du paiement : ${lecture.error.message}` };

  const ligne = (lecture.data ?? null) as {
    id: string;
    loyer_id: string | null;
    montant: number;
    methode: string;
    statut: string;
  } | null;
  if (!ligne) return { ...resultatVide(), erreur: "Paiement introuvable dans le suivi local." };
  if (ligne.statut === "confirme") {
    return { ...resultatVide(), confirme: true, dejaConfirme: true, montant: Number(ligne.montant || 0) };
  }
  if (ligne.statut === "echec") {
    return { ...resultatVide(), erreur: "Ce paiement est classé en échec : confirmation impossible." };
  }

  const montant = Number(ligne.montant || 0);
  const maintenant = new Date().toISOString();

  const majPaiement = await supabase
    .from("paiements")
    .update({ statut: "confirme", updated_at: maintenant })
    .eq("id", ligne.id)
    .eq("statut", "en_attente");
  if (majPaiement.error) {
    return { ...resultatVide(), erreur: `Confirmation du paiement : ${majPaiement.error.message}` };
  }

  if (!ligne.loyer_id) return { ...resultatVide(), confirme: true, montant };

  const lectureLoyer = await supabase
    .from("loyers")
    .select("id, mois, montant, montant_paye, appartement_id")
    .eq("id", ligne.loyer_id)
    .maybeSingle();
  if (lectureLoyer.error) {
    return { ...resultatVide(), confirme: true, montant, erreur: `Loyer : ${lectureLoyer.error.message}` };
  }

  const loyer = (lectureLoyer.data ?? null) as {
    id: string;
    mois: string;
    montant: number;
    montant_paye: number;
    appartement_id: string;
  } | null;
  if (!loyer) return { ...resultatVide(), confirme: true, montant, erreur: "Loyer introuvable pour ce paiement." };

  const du = Number(loyer.montant || 0);
  const cumul = Number(loyer.montant_paye || 0) + montant;
  const paye = du > 0 ? Math.min(cumul, du) : cumul; // borné : deux suivis du même versement ne cumulent pas
  const statutLoyer = du > 0 && paye + 0.009 >= du ? "paye" : paye > 0 ? "partiel" : "impaye";

  const majLoyer = await supabase
    .from("loyers")
    .update({ montant_paye: Math.round(paye * 100) / 100, statut: statutLoyer, updated_at: maintenant })
    .eq("id", loyer.id);
  if (majLoyer.error) {
    return {
      ...resultatVide(),
      confirme: true,
      montant,
      statutLoyer,
      erreur: `Mise à jour du loyer : ${majLoyer.error.message}`
    };
  }

  // Journal d'activité (best-effort, comme le backend)
  let immeubleId: string | null = null;
  let numero = "N/A";
  const lectureAppartement = await supabase
    .from("appartements")
    .select("numero, immeubles(id)")
    .eq("id", loyer.appartement_id)
    .maybeSingle();
  if (!lectureAppartement.error && lectureAppartement.data) {
    const app = lectureAppartement.data as { numero?: string; immeubles?: { id: string } | null };
    numero = app.numero ?? "N/A";
    immeubleId = app.immeubles?.id ?? null;
  }

  const journal = await supabase.from("activites").insert([
    {
      immeuble_id: immeubleId,
      type: "paiement",
      message:
        `Paiement de ${Math.round(montant)} FCFA confirmé via ${ligne.methode} ` +
        `(appartement ${numero}, mois ${String(loyer.mois).slice(0, 7)}).`,
      created_at: maintenant
    }
  ]);

  return {
    ...resultatVide(),
    confirme: true,
    montant,
    statutLoyer,
    avertissement: journal.error ? `Journal d'activité non écrit : ${journal.error.message}` : null
  };
}

// -----------------------------------------------------------------
// DOCUMENTS (reçus PDF / rapports PDF, Word, Excel)
// -----------------------------------------------------------------
export async function genererDocument(candidats: string[], corps: Record<string, unknown>): Promise<string> {
  const entetes = { "Content-Type": "application/json" };
  let derniereErreur = "";

  for (const nom of candidats) {
    const url = `${FASTAPI_URL}/api/generate/${nom}`;
    let res: Response;

    try {
      res = await fetch(url, { method: "POST", headers: entetes, body: JSON.stringify(corps) });
    } catch (e) {
      throw new Error(estErreurReseau(e) ? ERREUR_BACKEND : "Connexion impossible au service de documents.");
    }

    // Certains backends exposent ces routes en GET avec query string.
    if (res.status === 405) {
      const params = new URLSearchParams();
      Object.entries(corps).forEach(([cle, valeur]) => {
        if (valeur !== undefined && valeur !== null) params.set(cle, String(valeur));
      });
      try {
        res = await fetch(`${url}?${params.toString()}`);
      } catch (e) {
        throw new Error(estErreurReseau(e) ? ERREUR_BACKEND : "Connexion impossible au service de documents.");
      }
    }

    if (res.status === 404) continue;

    const donnees = await lireJson<ReponseDocument>(res);
    if (!res.ok) {
      const detail = donnees?.detail;
      derniereErreur = typeof detail === "string" && detail ? detail : `Erreur ${res.status} du serveur de documents.`;
      continue;
    }

    const chemin =
      donnees?.pdf_url ??
      donnees?.docx_url ??
      donnees?.document_url ??
      donnees?.url ??
      donnees?.path ??
      donnees?.filepath ??
      donnees?.filename ??
      null;

    if (!chemin) {
      derniereErreur = "Le serveur n'a renvoyé aucun document.";
      continue;
    }
    return /^https?:\/\//i.test(chemin) ? chemin : documentUrl(chemin);
  }

  throw new Error(derniereErreur || "Impossible de générer le document.");
}

// -----------------------------------------------------------------
// FENÊTRES & QR CODE
// -----------------------------------------------------------------

/** Ouvre une fenêtre pendant le geste utilisateur (anti-popup-blocker). */
export function nouvelleFenetre(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

export function diriger(fenetre: Window | null, url: string) {
  if (fenetre && !fenetre.closed) {
    fenetre.location.href = url;
    fenetre.focus();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function fermerFenetre(fenetre: Window | null) {
  if (fenetre && !fenetre.closed) fenetre.close();
}

/** qr_data : soit une image/data-URL renvoyée par l'opérateur, soit un texte à encoder. */
export function sourceQr(qr_data: string): string {
  if (/^(data:image|https?:\/\/)/i.test(qr_data)) return qr_data;
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(qr_data)}`;
}

export function estImageQr(qr_data: string): boolean {
  return /^(data:image|https?:\/\/)/i.test(qr_data);
}
