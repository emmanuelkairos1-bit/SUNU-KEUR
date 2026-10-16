// LAYOUT DASHBOARD — sidebar + zone de contenu (transitions de page)
// + garde RBAC : une fois le profil chargé, un rôle non autorisé sur la
// route courante est redirigé vers son propre espace.
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { PageTransition } from "@/components/ui/motion";
import { useAuth } from "@/components/providers/auth-provider";
import { destinationParRole, rolePeutAcceder } from "@/lib/rbac";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !role) return;
    if (!rolePeutAcceder(role, pathname)) {
      router.replace(destinationParRole(role));
    }
  }, [loading, user, role, pathname, router]);

  return (
    <div className="min-h-screen bg-creme dark:bg-nuit-950">
      <Sidebar />
      <main className="ml-64 min-h-screen p-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
