import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // Design system SUNU KEUR
        nuit: {
          50: "#f1f5f9",
          100: "#e2e8f0",
          200: "#cbd5e1",
          300: "#94a3b8",
          400: "#64748b",
          500: "#475569",
          600: "#334155",
          700: "#1e293b",
          800: "#172033",
          900: "#0F172A",
          950: "#080e1c"
        },
        emeraude: {
          50: "#ecfdf5",
          100: "#d1fae5",
          300: "#6ee7b7",
          500: "#10B981",
          600: "#059669",
          700: "#047857"
        },
        orange: {
          50: "#fff7ed",
          100: "#ffedd5",
          400: "#fb923c",
          500: "#F97316",
          600: "#ea580c",
          700: "#c2410c"
        },
        or: {
          50: "#fffbeb",
          100: "#fef3c7",
          400: "#fbbf24",
          500: "#F59E0B",
          600: "#d97706"
        },
        creme: "#F8FAFC",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" }
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Playfair Display", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"]
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-14px)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        ripple: { to: { transform: "scale(4)", opacity: "0" } }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s infinite"
      },
      boxShadow: {
        soft: "0 10px 40px -12px rgba(15,23,42,0.15)",
        glow: "0 0 40px -8px rgba(16,185,129,0.45)",
        gold: "0 0 40px -8px rgba(245,158,11,0.4)"
      }
    }
  },
  plugins: []
};
export default config;
