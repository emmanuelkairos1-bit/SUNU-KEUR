// =====================================================================
// TYPES PARTAGÉS SUNU KEUR — miroir du schéma PostgreSQL
// =====================================================================

export type RoleUtilisateur = "super_admin" | "gerant" | "proprietaire" | "locataire";
export type StatutAppartement = "occupe" | "vacant";
export type StatutLoyer = "paye" | "impaye" | "partiel";
export type StatutPaiement = "en_attente" | "confirme" | "echec";
export type MethodePaiement = "wave" | "orange_money" | "free_money" | "especes" | "virement" | "cheque";
export type TypeDocument = "facture" | "devis" | "quittance" | "rapport";
export type StatutTravaux = "a_faire" | "en_cours" | "termine";
export type StatutLocataire = "actif" | "archive";

export interface User {
  id: string;
  email: string;
  nom: string;
  telephone?: string | null;
  role: RoleUtilisateur;
  agence_nom?: string | null;
  logo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Immeuble {
  id: string;
  proprietaire_id?: string | null;
  gerant_id: string;
  nom: string;
  adresse: string;
  ville: string;
  nombre_appartements: number;
  created_at: string;
  updated_at: string;
}

export interface Appartement {
  id: string;
  immeuble_id: string;
  numero: string;
  etage?: number | null;
  type: string;
  loyer_mensuel: number;
  statut: StatutAppartement;
  created_at: string;
  immeubles?: Immeuble;
}

export interface Locataire {
  id: string;
  user_id?: string | null;
  appartement_id?: string | null;
  nom: string;
  telephone?: string | null;
  email?: string | null;
  cni_url?: string | null;
  contrat_url?: string | null;
  statut: StatutLocataire;
  created_at: string;
  updated_at: string;
  appartements?: Appartement;
}

export interface Loyer {
  id: string;
  appartement_id: string;
  locataire_id?: string | null;
  mois: string;
  montant: number;
  montant_paye: number;
  statut: StatutLoyer;
  date_echeance?: string | null;
  created_at: string;
  updated_at: string;
  appartements?: Appartement;
  locataires?: Locataire;
}

export interface Paiement {
  id: string;
  loyer_id?: string | null;
  locataire_id?: string | null;
  montant: number;
  methode: MethodePaiement;
  reference?: string | null;
  statut: StatutPaiement;
  wave_payment_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Facture {
  id: string;
  numero: string;
  immeuble_id?: string | null;
  appartement_id?: string | null;
  locataire_id?: string | null;
  type: TypeDocument;
  montant: number;
  description?: string | null;
  pdf_url?: string | null;
  statut: string;
  date_emission: string;
  created_at: string;
}

export interface FactureCommune {
  id: string;
  immeuble_id: string;
  libelle: string;
  montant_total: number;
  photo_url?: string | null;
  date: string;
  repartition: Record<string, number>;
  created_at: string;
}

export interface Travaux {
  id: string;
  immeuble_id: string;
  appartement_id?: string | null;
  titre: string;
  description?: string | null;
  cout: number;
  statut: StatutTravaux;
  date_debut?: string | null;
  date_fin?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activite {
  id: string;
  user_id?: string | null;
  immeuble_id?: string | null;
  type: string;
  message: string;
  created_at: string;
}
