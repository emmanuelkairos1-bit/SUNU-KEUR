// =====================================================================
// MIDDLEWARE — protège /dashboard, /loyers, etc. + redirection par rôle
// Mode local (pas de vraies clés Supabase) : on accepte la requête si le
// cookie non-HttpOnly "local_auth" est présent, sinon on redirige /login.
// Mode Supabase réel : comportement d'origine (vérification via cookies).
// =====================================================================
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTEGEES = ["/dashboard", "/loyers", "/locataires", "/finances", "/facturation", "/paiements", "/owner", "/locataire", "/onboarding"];
const CLE_COOKIE_LOCAL = "local_auth";

function estLocal(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return !url || url.includes("placeholder");
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const estProtegee = PROTEGEES.some((p) => path.startsWith(p));

  // ---------------- MODE LOCAL ----------------
  if (estLocal()) {
    const uid = request.cookies.get(CLE_COOKIE_LOCAL)?.value;
    if (estProtegee && !uid) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return response;
  }

  // ---------------- MODE SUPABASE RÉEL ----------------
  // Le lien « Confirmer l'adresse e-mail » de Supabase atterrit sur la
  // racine avec ?code= (Site URL sans chemin) : on l'achemine vers le
  // handler qui échange le code en session (évite la page blanche).
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname === "/") {
    const cb = request.nextUrl.clone();
    cb.pathname = "/auth/callback";
    cb.searchParams.set("code", code);
    return NextResponse.redirect(cb);
  }

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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
