// =====================================================================
// PROVIDER AUTH — session Supabase + profil + rôle (RBAC)
// =====================================================================
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { User, RoleUtilisateur } from "@/lib/types";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: RoleUtilisateur | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  role: null,
  signOut: async () => {},
  refresh: async () => {}
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowser();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const chargerProfil = useCallback(
    async (uid: string) => {
      const { data } = await supabase.from("users").select("*").eq("id", uid).single();
      setUser((data as User) ?? null);
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) await chargerProfil(data.session.user.id);
    else setUser(null);
  }, [supabase, chargerProfil]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, s: Session | null) => {
      setSession(s);
      if (s?.user) chargerProfil(s.user.id);
      else setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh, supabase, chargerProfil]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, [supabase]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user,
      loading,
      role: (user?.role as RoleUtilisateur) ?? null,
      signOut,
      refresh
    }),
    [session, user, loading, signOut, refresh]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
