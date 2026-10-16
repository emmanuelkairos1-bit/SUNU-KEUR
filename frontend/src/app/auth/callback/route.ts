// =====================================================================
// Auth callback — le lien « Confirmer l'adresse e-mail » de Supabase.
// On échange le code contre une session (cookies SSR) puis on redirige
// vers le dashboard (jamais de page blanche).
// =====================================================================
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  // Origine publique fiable : Render inlined NEXT_PUBLIC_SITE_URL n'est pas toujours
  // disponible selon le build, et request.nextUrl derrive vers localhost:10000.
  const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const origin =
    (envOrigin && envOrigin.startsWith("http") && !envOrigin.includes("localhost"))
      ? envOrigin.replace(/\/$/, "")
      : (fwdHost && !fwdHost.includes("localhost")
        ? `${request.headers.get("x-forwarded-proto") || "https"}://${fwdHost}`
        : "https://sunu-keur-web.onrender.com");

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.delete({ name, ...options });
          }
        }
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirm", origin));
}