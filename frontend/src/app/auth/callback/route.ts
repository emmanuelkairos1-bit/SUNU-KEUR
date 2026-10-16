// =====================================================================
// Auth callback — le lien « Confirmer l'adresse e-mail » de Supabase
// Auth arrive ici avec `?code=...`. On échange le code contre une
// session (cookies SSR), puis on redirige vers le dashboard (pas de
// page blanche : tout originate depuis l'URL publique via request.nextUrl).
// =====================================================================
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const origin = `${requestUrl.protocol}//${requestUrl.host}`;

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
          set(name: string, value: string, options: unknown) {
            cookieStore.set({ name, value, ...(options as object) });
          },
          remove(name: string, options: unknown) {
            cookieStore.delete({ name, ...(options as object) });
          }
        }
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Échec : retour à la connexion avec un signal léger (pas de page blanche).
  return NextResponse.redirect(new URL("/login?error=confirm", origin));
}