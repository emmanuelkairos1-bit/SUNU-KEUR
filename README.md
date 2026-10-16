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

## 📦 Déploiement (GitHub + Render) — EN LIGNE

Le déploiement passe par **GitHub** (code source) et **Render** (2 services : API + Web).

### 🟢 Production actuelle
| Service | URL publique | Health |
|---|---|---|
| **Web** (Next.js) | https://sunu-keur-web.onrender.com | `/login` |
| **API** (FastAPI) | https://sunu-keur-api.onrender.com | `/api/health` |

### 1. Pousser sur GitHub
```bash
git add .
git commit -m "Ma modification"
git push origin master
```

### 2. Redéployer sur Render
Les 2 services ont `autoDeploy: off` (pas de webhook) : après un push, relance le build **manuellement** —
soit dans le dashboard Render (*service → Manual Deploy → Deploy latest commit*), soit via l'API :
```bash
# POST https://api.render.com/v1/services/{serviceId}/deploys
#   srv-db8vn8gn74is73d0joo0 = sunu-keur-api
#   srv-db8vncgn74is73d0k9kg = sunu-keur-web
```
> ⚠️ **`NEXT_PUBLIC_*` figés au build** : toute modification d'env var côté Web impose un redeploy complet.

> 🔓 **Repo actuellement public** : c'est ce qui permet à Render de le fetcher (l'intégration GitHub du
> compte Render est reliée à un autre compte GitHub que celui qui héberge le repo). Pour repasser le repo
> en **privé** : connecte le compte GitHub du repo dans Render (*Account Settings → Git Deployment
> Credentials*), puis `gh repo edit --visibility private`. N'oublie pas que `render.yaml` sert de contrat
> pour recréer les services via **New + → Blueprint**.

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
