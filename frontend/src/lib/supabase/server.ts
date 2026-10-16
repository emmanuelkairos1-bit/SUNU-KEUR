// =====================================================================
// CLIENT SUPABASE (serveur) — pour Server Components & Server Actions
// =====================================================================
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function getSupabaseServer() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      }
    }
  });
}
