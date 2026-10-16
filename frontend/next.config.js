/** @type {import('next').NextConfig} */

// Origines autorisées pour les Server Actions : localhost en dev, plus le
// domaine de production fourni via NEXT_PUBLIC_SITE_URL (ex. https://mon-app.onrender.com).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
const origineSite = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

const allowedOrigins = ["localhost:3000", "127.0.0.1:3000"];
if (origineSite && !allowedOrigins.includes(origineSite)) allowedOrigins.push(origineSite);

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
  },
  experimental: {
    serverActions: { allowedOrigins }
  }
};

module.exports = nextConfig;
