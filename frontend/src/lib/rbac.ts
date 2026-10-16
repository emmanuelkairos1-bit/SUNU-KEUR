// =====================================================================
// RBAC — règles d'accès par rôle, partagées par le layout, la sidebar,
// la page de connexion et l'onboarding. Source unique de vérité pour
// « qui a le droit d'ouvrir quoi » et « où atterrir après connexion ».
// =====================================================================
import type { RoleUtilisateur } from "@/lib/types";

/** Routes protégées du back-office → rôles autorisés. */
const ACCES: Record<string, RoleUtilisateur[]> = {
  "/onboarding": ["gerant", "super_admin"],
  "/dashboard": ["gerant", "super_admin"],
  "/loyers": ["gerant", "super_admin"],
  "/locataires": ["gerant", "super_admin"],
  "/finances": ["gerant", "super_admin"],
  "/facturation": ["gerant", "super_admin"],
  "/paiements": ["gerant", "super_admin", "proprietaire", "locataire"],
  "/owner": ["proprietaire"],
  "/locataire": ["locataire"]
};

/** Destination par défaut après inscription / connexion, selon le rôle. */
export function destinationParRole(role: RoleUtilisateur | null | undefined): string {
  switch (role) {
    case "proprietaire":
      return "/owner";
    case "locataire":
      return "/locataire";
    case "super_admin":
    case "gerant":
    default:
      return "/dashboard";
  }
}

/** Le rôle a-t-il le droit d'ouvrir ce chemin ? (match par plus long préfixe) */
export function rolePeutAcceder(role: RoleUtilisateur | null | undefined, path: string): boolean {
  if (!role) return false;
  let meilleure: string | null = null;
  for (const cle of Object.keys(ACCES)) {
    if (path === cle || path.startsWith(cle + "/")) {
      if (meilleure === null || cle.length > meilleure.length) meilleure = cle;
    }
  }
  // Chemin inconnu du back-office → on laisse la page décider.
  if (meilleure === null) return true;
  return ACCES[meilleure].includes(role);
}

/** Rôles autorisés sur une page d'onboarding / configuration. */
export function estRoleConfiguration(role: RoleUtilisateur | null | undefined): boolean {
  return role === "gerant" || role === "super_admin";
}

/**
 * Assainit un paramètre de redirection « next » : chemin interne uniquement
 * (évite les open redirects vers un domaine externe ou `//host`).
 */
export function cheminInterne(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
