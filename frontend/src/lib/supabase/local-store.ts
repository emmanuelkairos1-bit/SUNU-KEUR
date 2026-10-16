// =====================================================================
// PERSISTANCE LOCALE — mode hors-ligne (localStorage)
// Fournit la persistance réelle des tables, de l'authentification et du
// stockage de fichiers, utilisée par le shim Supabase (local-shim.ts).
// =====================================================================

export type Ligne = Record<string, unknown>;

export const TABLES = [
  "users",
  "immeubles",
  "appartements",
  "locataires",
  "loyers",
  "paiements",
  "factures",
  "factures_communes",
  "travaux",
  "abonnements",
  "invitations",
  "activites"
] as const;

export type Table = (typeof TABLES)[number];

export const CLE_DB = "sunu_keur_db_v1";
export const CLE_AUTH = "sunu_keur_auth_v1";
export const CLE_STOCKAGE = "sunu_keur_stockage_v1";
export const CLE_DEMO = "sunu_keur_demo_v1";
export const CLE_COOKIE_LOCAL = "local_auth";

export interface BaseDonnees {
  version: number;
  tables: Record<string, Ligne[]>;
}

export interface UtilisateurAuth {
  id: string;
  email: string;
  mot_de_passe_hache: string;
  sel: string;
  metadonnees: Record<string, unknown>;
  cree_le: string;
}

export interface SessionStockee {
  utilisateur_id: string;
  cree_le: string;
}

export interface AuthStockee {
  utilisateurs: UtilisateurAuth[];
  session: SessionStockee | null;
}

export interface FichierStocke {
  nom: string;
  taille: number;
  type: string;
  dataUrl: string | null;
  tropGros: boolean;
}

function disponible(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function lireJSON<T>(cle: string, secours: T): T {
  if (!disponible()) return secours;
  try {
    const brut = window.localStorage.getItem(cle);
    if (!brut) return secours;
    return JSON.parse(brut) as T;
  } catch {
    return secours;
  }
}

function ecrireJSON(cle: string, valeur: unknown): void {
  if (!disponible()) return;
  try {
    window.localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Quota dépassé ou stockage indisponible : on ignore proprement.
  }
}

function baseVide(): BaseDonnees {
  const tables: Record<string, Ligne[]> = {};
  for (const t of TABLES) tables[t] = [];
  return { version: 1, tables };
}

export function lireDb(): BaseDonnees {
  const db = lireJSON<BaseDonnees | null>(CLE_DB, null);
  if (!db || typeof db !== "object" || !db.tables) {
    const vide = baseVide();
    ecrireJSON(CLE_DB, vide);
    return vide;
  }
  for (const t of TABLES) if (!Array.isArray(db.tables[t])) db.tables[t] = [];
  return db;
}

export function ecrireDb(db: BaseDonnees): void {
  ecrireJSON(CLE_DB, db);
}

export function lireAuth(): AuthStockee {
  const auth = lireJSON<AuthStockee | null>(CLE_AUTH, null);
  if (!auth || typeof auth !== "object" || !Array.isArray(auth.utilisateurs)) {
    return { utilisateurs: [], session: null };
  }
  return auth;
}

export function ecrireAuth(auth: AuthStockee): void {
  ecrireJSON(CLE_AUTH, auth);
}

export function lireStockage(): Record<string, FichierStocke> {
  return lireJSON<Record<string, FichierStocke>>(CLE_STOCKAGE, {});
}

export function ecrireStockage(stockage: Record<string, FichierStocke>): void {
  ecrireJSON(CLE_STOCKAGE, stockage);
}

export function demoSeeded(): boolean {
  return disponible() && window.localStorage.getItem(CLE_DEMO) === "1";
}

export function marquerDemo(): void {
  if (disponible()) window.localStorage.setItem(CLE_DEMO, "1");
}

// ---------------------------------------------------------------------
// Identifiants
// ---------------------------------------------------------------------
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------
// Hachage des mots de passe (SHA-256 via Web Crypto, repli déterministe)
// ---------------------------------------------------------------------
export function genererSel(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const tab = new Uint8Array(16);
    crypto.getRandomValues(tab);
    return Array.from(tab)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let sel = "";
  for (let i = 0; i < 32; i++) sel += Math.floor(Math.random() * 16).toString(16);
  return sel;
}

function hacherRepli(texte: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export async function hacher(motDePasse: string, sel: string): Promise<string> {
  const texte = `${sel}:${motDePasse}`;
  if (
    typeof crypto !== "undefined" &&
    crypto.subtle &&
    typeof TextEncoder !== "undefined"
  ) {
    try {
      const donnees = new TextEncoder().encode(texte);
      const buf = await crypto.subtle.digest("SHA-256", donnees);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return hacherRepli(texte);
    }
  }
  return hacherRepli(texte);
}
