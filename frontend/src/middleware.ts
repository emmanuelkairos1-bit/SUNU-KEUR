// =====================================================================
// MIDDLEWARE — protège /dashboard, /loyers, etc. + redirection par rôle
// Mode local (pas de vraies clés) : on accepte la requête si le cookie
// non-HttpOnly "local_auth" est présent, sinon on redirige /login.
// Mode Supabase réel : vérification via les cookies SSR.
// =====================================================================
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTEGEES = [
  "/dashboard",
  "/loyers",
  "/locataires",
  "/finances",
  "/facturation",
  "/paiements",
  "/owner",
  "/locataire",
  "/onboarding",
  "/immeubles"
];
const CLE_COOKIE_LOCAL = "local_auth";

function estLocal(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return !url || url.includes("placeholder");
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const estProtegee = PROTEGEES.some((p) => path.startsWith(p));

  // Origine publique fiable (Render expose l'origin interne localhost:10000).
  const xfh = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const xfp = request.headers.get("x-forwarded-proto") || "https";
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const baseOrigin =
    (envOrigin && !envOrigin.includes("localhost"))
      ? envOrigin.replace(/\/$/, "")
      : (!xfh.includes("localhost") && xfh
        ? `${xfp}://${xfh}`
        : "https://sunu-keur-web.onrender.com");

  let response = NextResponse.next({ request });

  // ---------------- MODE LOCAL ----------------
  // Intercepte le code de confirmation email amené à la racine (?code=...)
  // par le lien Supabase Auth et le route vers le handler qui crée la session.
  const codeConfirmation = request.nextUrl.searchParams.get("code");
  if (codeConfirmation && path === "/") {
    return NextResponse.redirect(`${baseOrigin}/auth/callback?code=${encodeURIComponent(codeConfirmation)}`);
  }
  if (estLocal()) {
    const uid = request.cookies.get(CLE_COOKIE_LOCAL)?.value;
    if (estProtegee && !uid) {
      return NextResponse.redirect(`${baseOrigin}/login?next=${encodeURIComponent(path)}`);
    }
    return response;
  }

  // ---------------- MODE SUPABASE RÉEL ----------------
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value: "", ...options });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (estProtegee && !user) {
    return NextResponse.redirect(`${baseOrigin}/login?next=${encodeURIComponent(path)}`);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};