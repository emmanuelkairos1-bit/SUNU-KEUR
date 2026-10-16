# ☀️ SUNU KEUR

> **Fini le cahier. Tes loyers en un coup d'œil.**

SaaS de gestion locative pour gérants sénégalais. Il remplace le cahier par un dashboard qui **encaisse**, **relance sur WhatsApp** et **rassure les propriétaires de la diaspora** avec des rapports transparents.

[![Déployer sur Render](https://render.com/images/template-button.svg)](https://render.com/deploy?template=https://github.com/emmanuelkairos1-bit/SUNU-KEUR)
[![Voir sur GitHub](https://img.shields.io/badge/GitHub-SUNU__KEUR-181717?logo=github)](https://github.com/emmanuelkairos1-bit/SUNU-KEUR)

---

## 🧱 Stack technique

| Couche | Techno |
|---|---|
| Frontend | **Next.js 14** (App Router), TypeScript, Tailwind CSS, Framer Motion, Recharts, shadcn-style UI |
| Backend | **Python FastAPI** — génération PDF (reportlab + qrcode), Word (python-docx), Excel (openpyxl), paiements mobiles |
| Base de données | **PostgreSQL via Supabase**, RLS activé sur toutes les tables |
| Auth | **Supabase Auth** — 4 rôles RBAC |
| Paiements | Wave, Orange Money, Free Money (API REST + webhooks) |

---

## 🚀 Démarrage local

### 1. Base de données (Supabase)
1. Crée un projet sur [supabase.com](https://supabase.com).
2. Exécute le contenu de **`supabase/schema.sql`** dans l'éditeur SQL (crée les tables, les index, le RLS et le bucket `documents`).
3. Dans *Authentication*, désactive la confirmation email (optionnel, pour le dev).
4. Récupère dans *Settings → API* : `Project URL`, `anon key`, `service_role key`.

### 2. Frontend (Next.js)
```bash
cd frontend
cp ../.env.example .env.local      # puis renseigne NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
npm install
npm run dev                        # http://localhost:3000
```

### 3. Backend (FastAPI)
```bash
cd backend
copy .env.example .env             # (cp sous Linux/Mac) renseigne SUPABASE_URL + SERVICE_KEY
pip install -r requirements.txt
python main.py                     # http://localhost:8000  — health: /api/health
```

### 4. Premier compte
- Va sur `http://localhost:3000/signup`, crée un compte **Gérant**, suis l'onboarding (agence → immeuble → invitation propriétaire).
- Pour le rôle **Super Admin** : crée un compte, puis dans le SQL Supabase :
  `update public.users set role='super_admin' where email='ton@email.sn';`

---

## 👥 Les 4 rôles (RBAC)

| Rôle | Login | Dashboard | Droits |
|---|---|---|---|
| **Super Admin** | `/login` | `/dashboard` | Tout voir, gérer les abonnements |
| **Gérant** | `/login` | `/dashboard` | Gère ses immeubles, encaisse, facture |
| **Propriétaire Diaspora** | `/login` | `/owner` | Lecture seule, NET à reverser, demande de virement |
| **Locataire** | `/login` | `/locataire` | Son loyer, historique, reçus PDF, paie via Wave/OM |

---

## 📄 Les pages

- `/` — Landing publique (hero animé, pricing 10 000 F/mois −20 % annuel, témoignages, FAQ)
- `/onboarding` — 3 étapes réelles (agence + logo → 1er immeuble → invitation propriétaire)
- `/dashboard` — KPIs réels, Area Chart 12 mois, Donut, timeline
- `/loyers` — **tableau matriciel 12 mois**, encaissement en un clic
- `/locataires` — CRUD complet + fiche drawer (infos / documents / historique)
- `/finances` — factures communes (répartition auto) + **Kanban travaux** drag & drop
- `/facturation` — facture, devis, quittances en masse, rapports PDF/Word/Excel
- `/paiements` — encaissement Wave / OM / Free Money + relances WhatsApp
- `/owner` — portail propriétaire (lecture seule)
- `/locataire` — portail locataire (payer + reçus PDF)

---

## 📦 Déploiement (GitHub + Render)

Le déploiement passe par **GitHub** (code source) et **Render** (Blueprint `render.yaml` à la racine → 2 services : API + Web).

### 1. Pousser sur GitHub
```bash
git init
git add .
git commit -m "SUNU KEUR"
gh repo create SUNU-KEUR --private --source=. --push
```

### 2. Déployer sur Render
1. Sur [render.com](https://render.com) : **New + → Blueprint** → connecte le repo GitHub.
2. Render lit `render.yaml` et crée :
   - `sunu-keur-api` (Python/FastAPI, health `/api/health`)
   - `sunu-keur-web` (Node/Next.js, health `/login`)
3. **Vérifie les URLs** dans *Settings* de chaque service, corrige `BASE_URL` + `FRONTEND_URL` (API) puis `NEXT_PUBLIC_FASTAPI_URL` + `NEXT_PUBLIC_SITE_URL` (Web) si elles diffèrent.
4. Relance un **Manual Deploy** sur le Web (les `NEXT_PUBLIC_*` sont figés au build).

> **Mode LOCAL** (par défaut) : aucun compte Supabase requis — données en `localStorage`, documents réels générés par l'API. Pour passer en **mode Supabase réel**, renseigne `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` côté API et `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` côté Web (voir `.env.example`), puis exécute `supabase/schema.sql`.

> ⚠️ **Free plan** : le service se met en veille après ~15 min d'inactivité (1ᵉʳ chargement ≈ 50 s) et le disque est éphémère (les PDF sont regénérés à la demande). Monté en paid = réveil instantané + disque persistant.

*L'ancien chemin Vercel reste possible : le dossier `frontend/` garde son `vercel.json`.*

---

## 🔐 Sécurité
- **RLS** activé sur les 12 tables, politiques par rôle.
- Bucket `documents` privé (upload/liens signés).
- Clés Supabase jamais exposées côté client (anon publique + service key côté serveur uniquement).
- Webhooks paiement vérifiés (HMAC si secret fourni).

> Sunu Keur — Fini le cahier. ☀️
