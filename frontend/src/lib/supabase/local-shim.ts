// =====================================================================
// SHIM SUPABASE LOCAL — compatibilité de l'API supabase-js utilisée par
// l'application, adossée à une base localStorage réelle (pas de données
// simulées). Activé uniquement quand NEXT_PUBLIC_SUPABASE_URL contient
// "placeholder" ou est vide (voir lib/supabase/client.ts).
// =====================================================================
"use client";

import {
  type BaseDonnees,
  type FichierStocke,
  CLE_COOKIE_LOCAL,
  ecrireAuth,
  ecrireDb,
  ecrireStockage,
  demoSeeded,
  genererSel,
  hacher,
  lireAuth,
  lireDb,
  lireStockage,
  marquerDemo,
  uuid,
  type Ligne,
  type UtilisateurAuth
} from "./local-store";

// ---------------------------------------------------------------------
// Résultats / erreurs
// ---------------------------------------------------------------------
interface ErreurLocale {
  message: string;
  code?: string;
}
interface Resultat<T> {
  data: T | null;
  error: ErreurLocale | null;
}

function erreur(message: string): ErreurLocale {
  return { message };
}

// ---------------------------------------------------------------------
// Schéma de relations (clés étrangères) — résout les embeddings `table(*)`
// et les filtres pointés `table.colonne`.
// ---------------------------------------------------------------------
interface Relation {
  cle: string; // nom de l'embedding (ex. "appartements")
  colonne: string; // clé étrangère sur la ligne racine (ex. "appartement_id")
  parent: string; // table cible
  colonneParent: string; // colonne de jointure côté parent (généralement "id")
}

const RELATIONS: Record<string, Relation[]> = {
  users: [],
  immeubles: [],
  appartements: [{ cle: "immeubles", colonne: "immeuble_id", parent: "immeubles", colonneParent: "id" }],
  locataires: [{ cle: "appartements", colonne: "appartement_id", parent: "appartements", colonneParent: "id" }],
  loyers: [
    { cle: "appartements", colonne: "appartement_id", parent: "appartements", colonneParent: "id" },
    { cle: "locataires", colonne: "locataire_id", parent: "locataires", colonneParent: "id" }
  ],
  paiements: [
    { cle: "loyers", colonne: "loyer_id", parent: "loyers", colonneParent: "id" },
    { cle: "locataires", colonne: "locataire_id", parent: "locataires", colonneParent: "id" }
  ],
  factures: [
    { cle: "immeubles", colonne: "immeuble_id", parent: "immeubles", colonneParent: "id" },
    { cle: "appartements", colonne: "appartement_id", parent: "appartements", colonneParent: "id" },
    { cle: "locataires", colonne: "locataire_id", parent: "locataires", colonneParent: "id" }
  ],
  factures_communes: [{ cle: "immeubles", colonne: "immeuble_id", parent: "immeubles", colonneParent: "id" }],
  travaux: [
    { cle: "immeubles", colonne: "immeuble_id", parent: "immeubles", colonneParent: "id" },
    { cle: "appartements", colonne: "appartement_id", parent: "appartements", colonneParent: "id" }
  ],
  abonnements: [],
  invitations: [{ cle: "immeubles", colonne: "immeuble_id", parent: "immeubles", colonneParent: "id" }],
  activites: [
    { cle: "immeubles", colonne: "immeuble_id", parent: "immeubles", colonneParent: "id" },
    { cle: "users", colonne: "user_id", parent: "users", colonneParent: "id" }
  ]
};

function trouverRelation(table: string, cle: string): Relation | undefined {
  return (RELATIONS[table] ?? []).find((r) => r.cle === cle);
}

function tables(db: BaseDonnees, nom: string): Ligne[] {
  if (!db.tables[nom]) db.tables[nom] = [];
  return db.tables[nom];
}

function resoudreParent(db: BaseDonnees, ligne: Ligne, rel: Relation): Ligne | undefined {
  const valeur = ligne[rel.colonne];
  if (valeur === null || valeur === undefined) return undefined;
  return tables(db, rel.parent).find((l) => l[rel.colonneParent] === valeur);
}

// ---------------------------------------------------------------------
// Analyse de la chaîne de select (imbriquée + !inner)
// ---------------------------------------------------------------------
interface ItemSelection {
  nom: string;
  interne: boolean;
  enfants: ItemSelection[] | null;
}

function finParenthese(s: string, debut: number): number {
  let profondeur = 0;
  for (let i = debut; i < s.length; i++) {
    if (s[i] === "(") profondeur++;
    else if (s[i] === ")") {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return s.length - 1;
}

function analyserSelection(s: string): ItemSelection[] {
  const items: ItemSelection[] = [];
  let i = 0;
  let nom = "";
  while (i < s.length) {
    const c = s[i];
    if (c === ",") {
      if (nom.trim()) items.push(creerItem(nom.trim(), null));
      nom = "";
      i++;
    } else if (c === "(") {
      const fin = finParenthese(s, i);
      items.push(creerItem(nom.trim(), analyserSelection(s.slice(i + 1, fin))));
      nom = "";
      i = fin + 1;
    } else {
      nom += c;
      i++;
    }
  }
  if (nom.trim()) items.push(creerItem(nom.trim(), null));
  return items;
}

function creerItem(brut: string, enfants: ItemSelection[] | null): ItemSelection {
  const interne = /!inner\s*$/.test(brut);
  const propre = interne ? brut.replace(/!inner\s*$/, "") : brut;
  return { nom: propre.trim(), interne, enfants };
}

const cacheSelection = new Map<string, ItemSelection[]>();
function selection(s: string): ItemSelection[] {
  const enCache = cacheSelection.get(s);
  if (enCache) return enCache;
  const analysee = analyserSelection(s);
  cacheSelection.set(s, analysee);
  return analysee;
}

// ---------------------------------------------------------------------
// Projection d'une ligne (colonnes + embeddings)
// Retourne null si un !inner n'est pas satisfait (ligne à écarter).
// ---------------------------------------------------------------------
function projeter(db: BaseDonnees, table: string, ligne: Ligne, items: ItemSelection[]): Ligne | null {
  const sortie: Ligne = {};
  if (items.some((it) => it.nom === "*")) {
    for (const cle of Object.keys(ligne)) sortie[cle] = ligne[cle];
  }
  for (const it of items) {
    if (it.nom === "*") continue;
    if (it.enfants) {
      const rel = trouverRelation(table, it.nom);
      if (!rel) {
        if (it.interne) return null;
        sortie[it.nom] = null;
        continue;
      }
      const parent = resoudreParent(db, ligne, rel);
      if (parent === undefined) {
        if (it.interne) return null;
        sortie[it.nom] = null;
        continue;
      }
      const projete = projeter(db, rel.parent, parent, it.enfants);
      if (projete === null) {
        if (it.interne) return null;
        sortie[it.nom] = null;
        continue;
      }
      sortie[it.nom] = projete;
    } else {
      sortie[it.nom] = ligne[it.nom];
    }
  }
  return sortie;
}

// ---------------------------------------------------------------------
// Comparaisons
// ---------------------------------------------------------------------
function egal(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a) === String(b);
}

function comparer(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

type Filtre = { type: "eq" | "neq" | "in" | "gte" | "lte" | "gt" | "lt"; colonne: string; valeur: unknown };

// ---------------------------------------------------------------------
// Query builder « thenable »
// ---------------------------------------------------------------------
type ModeRequete = "select" | "insert" | "update" | "delete" | "upsert";

class RequeteLocale implements PromiseLike<Resultat<unknown>> {
  private mode: ModeRequete = "select";
  private projection = "*";
  private filtres: Filtre[] = [];
  private ordre: { colonne: string; asc: boolean } | null = null;
  private maximum: number | null = null;
  private payload: unknown = null;
  private retour: string | null = null;
  private unique: "single" | "maybe" | null = null;

  constructor(private readonly table: string) {}

  select(cols = "*"): this {
    if (this.mode === "select") this.projection = cols;
    else this.retour = cols;
    return this;
  }

  insert(payload: unknown): this {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown): this {
    this.mode = "upsert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  eq(colonne: string, valeur: unknown): this {
    this.filtres.push({ type: "eq", colonne, valeur });
    return this;
  }

  neq(colonne: string, valeur: unknown): this {
    this.filtres.push({ type: "neq", colonne, valeur });
    return this;
  }

  in(colonne: string, valeurs: unknown[]): this {
    this.filtres.push({ type: "in", colonne, valeur: valeurs });
    return this;
  }

  gte(colonne: string, valeur: unknown): this {
    this.filtres.push({ type: "gte", colonne, valeur });
    return this;
  }

  lte(colonne: string, valeur: unknown): this {
    this.filtres.push({ type: "lte", colonne, valeur });
    return this;
  }

  gt(colonne: string, valeur: unknown): this {
    this.filtres.push({ type: "gt", colonne, valeur });
    return this;
  }

  lt(colonne: string, valeur: unknown): this {
    this.filtres.push({ type: "lt", colonne, valeur });
    return this;
  }

  order(colonne: string, options?: { ascending?: boolean }): this {
    this.ordre = { colonne, asc: options?.ascending !== false };
    return this;
  }

  limit(n: number): this {
    this.maximum = n;
    return this;
  }

  single(): this {
    this.unique = "single";
    return this;
  }

  maybeSingle(): this {
    this.unique = "maybe";
    return this;
  }

  // ---- résolution d'un chemin pointé (colonnes liées) ----
  private valeur(db: BaseDonnees, ligne: Ligne, chemin: string): unknown {
    const segments = chemin.split(".");
    let courant: Ligne | undefined = ligne;
    let tableCourante = this.table;
    for (let i = 0; i < segments.length - 1; i++) {
      const rel = trouverRelation(tableCourante, segments[i]);
      if (!rel || !courant) return undefined;
      courant = resoudreParent(db, courant, rel);
      tableCourante = rel.parent;
    }
    if (!courant) return undefined;
    return courant[segments[segments.length - 1]];
  }

  private verifie(db: BaseDonnees, ligne: Ligne): boolean {
    return this.filtres.every((f) => {
      const val = this.valeur(db, ligne, f.colonne);
      switch (f.type) {
        case "eq":
          return egal(val, f.valeur);
        case "neq":
          if (val === null || val === undefined) return false;
          return !egal(val, f.valeur);
        case "in":
          return Array.isArray(f.valeur) && (f.valeur as unknown[]).some((v) => egal(val, v));
        case "gte":
          return val !== null && val !== undefined && comparer(val, f.valeur) >= 0;
        case "lte":
          return val !== null && val !== undefined && comparer(val, f.valeur) <= 0;
        case "gt":
          return val !== null && val !== undefined && comparer(val, f.valeur) > 0;
        case "lt":
          return val !== null && val !== undefined && comparer(val, f.valeur) < 0;
        default:
          return true;
      }
    });
  }

  private formater(lignes: unknown[]): Resultat<unknown> {
    if (this.unique === "single") {
      if (lignes.length === 1) return { data: lignes[0], error: null };
      return { data: null, error: erreur("Objet JSON demandé : aucune ou plusieurs lignes retournées.") };
    }
    if (this.unique === "maybe") return { data: lignes[0] ?? null, error: null };
    return { data: lignes, error: null };
  }

  private async executer(): Promise<Resultat<unknown>> {
    const db = lireDb();
    const lignes = tables(db, this.table);

    if (this.mode === "select") {
      let resultat = lignes.filter((l) => this.verifie(db, l));
      if (this.ordre) {
        const { colonne, asc } = this.ordre;
        resultat = [...resultat].sort((a, b) => {
          const cmp = comparer(a[colonne], b[colonne]);
          return asc ? cmp : -cmp;
        });
      }
      if (this.maximum !== null) resultat = resultat.slice(0, this.maximum);
      const projetees: unknown[] = [];
      const items = selection(this.projection);
      for (const l of resultat) {
        const p = projeter(db, this.table, l, items);
        if (p !== null) projetees.push(p);
      }
      return this.formater(projetees);
    }

    if (this.mode === "insert" || this.mode === "upsert") {
      const brut = Array.isArray(this.payload) ? (this.payload as Ligne[]) : [this.payload as Ligne];
      const traitees: Ligne[] = [];
      const maintenant = new Date().toISOString();
      for (const obj of brut) {
        const copie: Ligne = { ...obj };
        if (!copie.id) copie.id = uuid();
        if (!copie.created_at) copie.created_at = maintenant;
        if (!copie.updated_at) copie.updated_at = maintenant;
        // Valeurs par défaut métier (le shim n'a pas de schéma DB) :
        // un appartement créé est « vacant » tant qu'un locataire l'occupe.
        if (this.table === "appartements" && !copie.statut) copie.statut = "vacant";
        if (this.mode === "upsert") {
          const idx = lignes.findIndex((l) => l.id === copie.id);
          if (idx >= 0) lignes[idx] = { ...lignes[idx], ...copie };
          else lignes.push(copie);
        } else {
          lignes.push(copie);
        }
        traitees.push(copie);
      }
      ecrireDb(db);
      if (this.retour !== null) {
        const items = selection(this.retour);
        const proj = traitees
          .map((l) => projeter(db, this.table, l, items))
          .filter((p): p is Ligne => p !== null);
        return this.formater(proj);
      }
      return { data: null, error: null };
    }

    if (this.mode === "update") {
      const maj = this.payload as Ligne;
      const touchees: Ligne[] = [];
      for (const l of lignes) {
        if (this.verifie(db, l)) {
          Object.assign(l, maj);
          touchees.push(l);
        }
      }
      ecrireDb(db);
      if (this.retour !== null) {
        const items = selection(this.retour);
        const proj = touchees
          .map((l) => projeter(db, this.table, l, items))
          .filter((p): p is Ligne => p !== null);
        return this.formater(proj);
      }
      return { data: null, error: null };
    }

    // delete
    const reste = lignes.filter((l) => !this.verifie(db, l));
    db.tables[this.table] = reste;
    ecrireDb(db);
    return { data: null, error: null };
  }

  then<T1 = Resultat<unknown>, T2 = never>(
    onfulfilled?: ((value: Resultat<unknown>) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.executer().then(onfulfilled, onrejected);
  }
}

// ---------------------------------------------------------------------
// Authentification locale (session + mots de passe hachés)
// ---------------------------------------------------------------------
const ECOUTEURS = new Set<(evenement: string, session: unknown) => void>();

function verserUtilisateur(u: UtilisateurAuth): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    user_metadata: u.metadonnees,
    app_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    phone: "",
    created_at: u.cree_le,
    updated_at: u.cree_le
  };
}

function verserSession(u: UtilisateurAuth): Record<string, unknown> {
  const maintenant = Math.floor(Date.now() / 1000);
  return {
    access_token: "local-access-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    expires_at: maintenant + 60 * 60 * 24 * 30,
    refresh_token: "local-refresh-token",
    user: verserUtilisateur(u)
  };
}

function poserCookie(id: string): void {
  if (typeof document === "undefined") return;
  const expire = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  document.cookie = `${CLE_COOKIE_LOCAL}=${id}; path=/; max-age=${expire}; samesite=lax`;
}

function effacerCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CLE_COOKIE_LOCAL}=; path=/; max-age=0; samesite=lax`;
}

function notifier(evenement: string, session: unknown): void {
  for (const cb of ECOUTEURS) {
    try {
      cb(evenement, session);
    } catch {
      // un écouteur défaillant ne doit pas casser la chaîne
    }
  }
}

function sessionCourante(): Record<string, unknown> | null {
  const auth = lireAuth();
  if (!auth.session) return null;
  const u = auth.utilisateurs.find((x) => x.id === auth.session?.utilisateur_id);
  if (!u) return null;
  return verserSession(u);
}

const MAX_STOCKAGE = 1024 * 1024; // 1 Mo

function lireDataUrl(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(lecteur.error ?? new Error("Lecture impossible"));
    lecteur.readAsDataURL(fichier);
  });
}

function urlLocal(path: string): string {
  const f = lireStockage()[path];
  if (!f) return "";
  if (f.dataUrl) return f.dataUrl;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120">` +
    `<rect width="100%" height="100%" fill="#f1f5f9"/>` +
    `<text x="50%" y="45%" font-size="11" text-anchor="middle" fill="#475569">Fichier local trop volumineux</text>` +
    `<text x="50%" y="62%" font-size="10" text-anchor="middle" fill="#64748b">${Math.round(f.taille / 1024)} Ko</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(svg) : ""}`;
}

// ---------------------------------------------------------------------
// Données de démonstration (marquées, remplaçables, jamais écrasées)
// ---------------------------------------------------------------------
function moisISO(decalage: number): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + decalage;
  const base = new Date(Date.UTC(y, m, 1));
  return base.toISOString().slice(0, 7) + "-01";
}

function semer(gerantId: string): void {
  if (demoSeeded()) return;
  const db = lireDb();
  if (tables(db, "immeubles").length > 0) return; // ne jamais écraser l'existant

  const maintenant = new Date().toISOString();
  const immId = uuid();
  const immeuble: Ligne = {
    id: immId,
    gerant_id: gerantId,
    proprietaire_id: null,
    nom: "Résidence Faidou (démo)",
    adresse: "12 rue les Manguiers",
    ville: "Dakar",
    nombre_appartements: 4,
    created_at: maintenant,
    updated_at: maintenant
  };
  db.tables.immeubles.push(immeuble);

  const apparts: { id: string; numero: string; loyer: number; type: string }[] = [
    { id: uuid(), numero: "A1", loyer: 250000, type: "2 pièces" },
    { id: uuid(), numero: "A2", loyer: 300000, type: "3 pièces" },
    { id: uuid(), numero: "A3", loyer: 350000, type: "3 pièces" },
    { id: uuid(), numero: "A4", loyer: 200000, type: "studio" }
  ];
  for (const a of apparts) {
    db.tables.appartements.push({
      id: a.id,
      immeuble_id: immId,
      numero: a.numero,
      etage: null,
      type: a.type,
      loyer_mensuel: a.loyer,
      statut: a.numero === "A4" ? "vacant" : "occupe",
      created_at: maintenant
    });
  }

  const locataireNoms = ["Aminata Diop", "Moustapha Bâ", "Fatou Sow"];
  const locataires = apparts.slice(0, 3).map((a, i) => {
    const id = uuid();
    db.tables.locataires.push({
      id,
      user_id: null,
      appartement_id: a.id,
      nom: locataireNoms[i],
      telephone: `77 100 2${i}0 3${i}`,
      email: null,
      statut: "actif",
      created_at: maintenant,
      updated_at: maintenant
    });
    return { id, appart: a };
  });

  for (const dec of [-2, -1, 0]) {
    const mois = moisISO(dec);
    for (const loc of locataires) {
      const montant = loc.appart.loyer;
      let statut: string = "impaye";
      let paye = 0;
      if (dec === -2) {
        statut = "paye";
        paye = montant;
      } else if (dec === -1) {
        statut = "partiel";
        paye = Math.round(montant / 2);
      } else if (loc.appart.numero === "A1") {
        statut = "paye";
        paye = montant;
      }
      const loyerId = uuid();
      db.tables.loyers.push({
        id: loyerId,
        appartement_id: loc.appart.id,
        locataire_id: loc.id,
        mois,
        montant,
        montant_paye: paye,
        statut,
        date_echeance: mois,
        created_at: maintenant,
        updated_at: maintenant
      });
      if (paye > 0) {
        db.tables.paiements.push({
          id: uuid(),
          loyer_id: loyerId,
          locataire_id: loc.id,
          montant: paye,
          methode: "wave",
          reference: null,
          statut: "confirme",
          created_at: maintenant,
          updated_at: maintenant
        });
      }
    }
  }

  db.tables.factures_communes.push({
    id: uuid(),
    immeuble_id: immId,
    libelle: "Électricité commune (démo)",
    montant_total: 48000,
    photo_url: null,
    date: moisISO(0).slice(0, 10),
    repartition: {},
    created_at: maintenant
  });

  db.tables.travaux.push(
    {
      id: uuid(),
      immeuble_id: immId,
      appartement_id: null,
      titre: "Réparer la fuite du toit (démo)",
      description: "Intervention sur la descente d'eau.",
      cout: 75000,
      statut: "en_cours",
      date_debut: null,
      date_fin: null,
      created_at: maintenant,
      updated_at: maintenant
    },
    {
      id: uuid(),
      immeuble_id: immId,
      appartement_id: null,
      titre: "Peinture du couloir (démo)",
      description: null,
      cout: 120000,
      statut: "a_faire",
      date_debut: null,
      date_fin: null,
      created_at: maintenant,
      updated_at: maintenant
    }
  );

  db.tables.activites.push({
    id: uuid(),
    user_id: gerantId,
    immeuble_id: immId,
    type: "demo",
    message: "Données de démonstration initialisées pour prévisualiser l'application.",
    created_at: maintenant
  });

  ecrireDb(db);
  marquerDemo();
}

// ---------------------------------------------------------------------
// Client local
// ---------------------------------------------------------------------
export function creerSupabaseLocal() {
  const auth = {
    async signUp(args: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }): Promise<Resultat<{ user: unknown; session: unknown }>> {
      const email = (args.email || "").trim().toLowerCase();
      const stockage = lireAuth();
      if (stockage.utilisateurs.some((u) => u.email.toLowerCase() === email)) {
        return {
          data: { user: null, session: null },
          error: erreur("Un compte existe déjà avec cet email.")
        };
      }
      const sel = genererSel();
      const hache = await hacher(args.password, sel);
      const u: UtilisateurAuth = {
        id: uuid(),
        email,
        mot_de_passe_hache: hache,
        sel,
        metadonnees: args.options?.data ?? {},
        cree_le: new Date().toISOString()
      };
      stockage.utilisateurs.push(u);
      const session = verserSession(u);
      stockage.session = { utilisateur_id: u.id, cree_le: u.cree_le };
      ecrireAuth(stockage);
      poserCookie(u.id);

      // La table profil (users) est insérée par la page d'inscription elle-même.
      notifier("SIGNED_IN", session);
      return { data: { user: verserUtilisateur(u), session }, error: null };
    },

    async signInWithPassword(args: {
      email: string;
      password: string;
    }): Promise<Resultat<{ user: unknown; session: unknown }>> {
      const email = (args.email || "").trim().toLowerCase();
      const stockage = lireAuth();
      const u = stockage.utilisateurs.find((x) => x.email.toLowerCase() === email);
      if (!u) {
        return {
          data: { user: null, session: null },
          error: erreur("Identifiants invalides. Vérifie ton email et ton mot de passe.")
        };
      }
      const hache = await hacher(args.password, u.sel);
      if (hache !== u.mot_de_passe_hache) {
        return {
          data: { user: null, session: null },
          error: erreur("Identifiants invalides. Vérifie ton email et ton mot de passe.")
        };
      }
      const session = verserSession(u);
      stockage.session = { utilisateur_id: u.id, cree_le: new Date().toISOString() };
      ecrireAuth(stockage);
      poserCookie(u.id);
      notifier("SIGNED_IN", session);
      return { data: { user: verserUtilisateur(u), session }, error: null };
    },

    async signInWithOtp(args: { email: string }): Promise<Resultat<Record<string, never>>> {
      void args;
      return { data: {}, error: null };
    },

    async getSession(): Promise<Resultat<{ session: unknown }>> {
      return { data: { session: sessionCourante() }, error: null };
    },

    async getUser(): Promise<Resultat<{ user: unknown }>> {
      const s = sessionCourante() as { user?: unknown } | null;
      return { data: { user: s?.user ?? null }, error: null };
    },

    async signOut(): Promise<Resultat<null>> {
      const stockage = lireAuth();
      stockage.session = null;
      ecrireAuth(stockage);
      effacerCookie();
      notifier("SIGNED_OUT", null);
      return { data: null, error: null };
    },

    onAuthStateChange(cb: (evenement: string, session: unknown) => void) {
      ECOUTEURS.add(cb);
      return {
        data: {
          subscription: {
            unsubscribe: () => ECOUTEURS.delete(cb)
          }
        }
      };
    }
  };

  const storage = {
    from(bucket: string) {
      void bucket;
      return {
        async upload(
          path: string,
          fichier: File,
          options?: { upsert?: boolean; contentType?: string }
        ): Promise<Resultat<{ path: string }>> {
          const stockage = lireStockage();
          if (stockage[path] && options?.upsert !== true) {
            return {
              data: null,
              error: erreur("Un fichier existe déjà à cet emplacement (utilisez upsert).")
            };
          }
          // Mode local : localStorage ne peut pas stocker au-delà de 1 Mo.
          // On renvoie une ERREUR explicite — et non un succès silencieux qui
          // remplacerait le fichier par un simple avis « trop volumineux » —
          // afin que l'appelant affiche clairement le refus au lieu de perdre
          // le document à l'insu de l'utilisateur (l'upload semblait réussir).
          if (fichier.size > MAX_STOCKAGE) {
            const moi = Math.round((fichier.size / (1024 * 1024)) * 10) / 10;
            return {
              data: null,
              error: erreur(`Fichier trop volumineux (${moi} Mo) : 1 Mo maximum en mode local.`)
            };
          }
          let dataUrl: string;
          try {
            dataUrl = await lireDataUrl(fichier);
          } catch {
            return { data: null, error: erreur("Lecture du fichier impossible.") };
          }
          const entree: FichierStocke = {
            nom: fichier.name,
            taille: fichier.size,
            type: options?.contentType || fichier.type || "application/octet-stream",
            dataUrl,
            tropGros: false
          };
          stockage[path] = entree;
          ecrireStockage(stockage);
          return { data: { path }, error: null };
        },

        getPublicUrl(path: string): Resultat<{ publicUrl: string }> {
          return { data: { publicUrl: urlLocal(path) }, error: null };
        },

        async createSignedUrl(
          path: string,
          _duree: number
        ): Promise<Resultat<{ signedUrl: string }>> {
          const f = lireStockage()[path];
          if (!f) return { data: null, error: erreur("Fichier introuvable.") };
          return { data: { signedUrl: urlLocal(path) }, error: null };
        },

        async remove(paths: string | string[]): Promise<Resultat<Record<string, never>>> {
          const liste = Array.isArray(paths) ? paths : [paths];
          const stockage = lireStockage();
          for (const p of liste) delete stockage[p];
          ecrireStockage(stockage);
          return { data: {}, error: null };
        }
      };
    }
  };

  return {
    auth,
    storage,
    from(table: string) {
      return new RequeteLocale(table);
    }
  };
}

// ---------------------------------------------------------------------
// Utilitaire optionnel : peuple un jeu de données de démonstration pour le
// gérant connecté (ou l'identifiant fourni). Aucune donnée réelle n'est
// écrasée : n'est appliqué que si aucun immeuble n'existe déjà.
// ---------------------------------------------------------------------
export function initialiserDonneesDemo(gerantId?: string): boolean {
  const cible =
    gerantId ??
    ((sessionCourante() as { user?: { id?: string } } | null)?.user?.id ?? undefined);
  if (!cible) return false;
  semer(cible);
  return true;
}
