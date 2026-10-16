import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap"
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Sunu Keur — Fini le cahier. Tes loyers en un coup d'œil.",
  description:
    "SaaS de gestion locative pour gérants sénégalais. Encaisse, relance sur WhatsApp et rassure les propriétaires de la diaspora avec des rapports transparents.",
  keywords: ["gestion locative", "Sénégal", "loyers", "Wave", "Orange Money", "diaspora"],
  openGraph: {
    title: "Sunu Keur",
    description: "Fini le cahier. Tes loyers en un coup d'œil.",
    type: "website",
    locale: "fr_SN"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${playfair.variable} ${inter.variable} font-sans min-h-screen`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
