// =====================================================================
// PROVIDER THÈME — Mode Sombre/Clair, transition 0.3s, localStorage
// =====================================================================
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {}
});

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = (localStorage.getItem("sunu-theme") as Theme) || "dark";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("sunu-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  };

  // Empêche le flash au chargement
  if (!mounted) return <>{children}</>;

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <div className="transition-colors duration-300">{children}</div>
    </ThemeCtx.Provider>
  );
}
