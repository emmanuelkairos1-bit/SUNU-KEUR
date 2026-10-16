"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  Users,
  Wallet,
  Receipt,
  CreditCard,
  Home,
  LogOut,
  ShieldCheck
} from "lucide-react";
import { SunuKeurMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { initiales } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["gerant", "super_admin"] },
  { href: "/immeubles", label: "Immeubles", icon: Building2, roles: ["gerant", "super_admin"] },
  { href: "/loyers", label: "Loyers", icon: Wallet, roles: ["gerant", "super_admin"] },
  { href: "/locataires", label: "Locataires", icon: Users, roles: ["gerant", "super_admin"] },
  { href: "/finances", label: "Finances", icon: Building2, roles: ["gerant", "super_admin"] },
  { href: "/facturation", label: "Facturation", icon: Receipt, roles: ["gerant", "super_admin"] },
  { href: "/paiements", label: "Paiements", icon: CreditCard, roles: ["gerant", "super_admin", "proprietaire", "locataire"] },
  { href: "/owner", label: "Mon immeuble", icon: Home, roles: ["proprietaire"] },
  { href: "/locataire", label: "Mon loyer", icon: Home, roles: ["locataire"] }
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, loading, signOut } = useAuth();

  // Tant que le profil n'est pas chargé, on n'affiche rien plutôt que
  // toutes les entrées (évite de proposer des liens interdits au rôle).
  const items = role ? NAV.filter((n) => n.roles.includes(role)) : [];

  const deconnexion = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <motion.aside
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r bg-card/80 backdrop-blur-xl"
    >
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        <SunuKeurMark size={40} animate={false} />
        <span className="font-serif text-lg font-bold">Sunu Keur</span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-nuit-900 dark:bg-emeraude-500 dark:text-nuit-900"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className={cn("relative z-10 h-4.5 w-4.5", active && "text-or-500 dark:text-nuit-900")} />
                <span className="relative z-10">{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/60 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emeraude-500 text-sm font-bold text-white">
              {initiales(user?.nom || "?")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user?.nom}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground capitalize">
                {role === "super_admin" && <ShieldCheck className="h-3 w-3 text-or-500" />}
                {role}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={deconnexion}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Déconnexion
        </button>
      </div>
    </motion.aside>
  );
}
