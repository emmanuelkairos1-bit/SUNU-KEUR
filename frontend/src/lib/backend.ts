// URL du backend Python FastAPI (PDF / Word / Excel / Paiements)
export const FASTAPI_URL =
  process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

// Endpoint d'un document généré côté Python
export function documentUrl(path: string): string {
  return `${FASTAPI_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
