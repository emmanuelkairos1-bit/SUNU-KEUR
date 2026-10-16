// =====================================================================
// CLIENT SUPABASE (navigateur) — RLS respectée
// Bascule : si NEXT_PUBLIC_SUPABASE_URL est vide ou contient "placeholder",
// on utilise le shim LOCAL (base localStorage réelle). Sinon, le vrai
// client Supabase est retourné, intact, pour basculer avec 2 clés.
// =====================================================================
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { creerSupabaseLocal } from "./local-shim";

type ClientSupabase = ReturnType<typeof createBrowserClient>;

let client: ClientSupabase | null = null;

/** Vrai si l'application tourne en mode local (pas de vraies clés Supabase). */
export function estModeLocal(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return !url || url.includes("placeholder") || !anon || anon.includes("placeholder");
}

export function getSupabaseBrowser(): ClientSupabase {
  if (client) return client;
  if (estModeLocal()) {
    client = creerSupabaseLocal() as unknown as ClientSupabase;
    return client;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  client = createBrowserClient(url, anon);
  return client;
}
