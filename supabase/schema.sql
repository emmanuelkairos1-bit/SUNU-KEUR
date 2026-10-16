-- =====================================================================
-- SUNU KEUR — Schéma PostgreSQL (Supabase)
-- Gestion locative Sénégal — Remplace le cahier
-- Exécuter dans l'éditeur SQL Supabase (ou `supabase db push`)
-- =====================================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
create type role_utilisateur as enum ('super_admin', 'gerant', 'proprietaire', 'locataire');
create type statut_appartement as enum ('occupe', 'vacant');
create type statut_loyer as enum ('paye', 'impaye', 'partiel');
create type statut_paiement as enum ('en_attente', 'confirme', 'echec');
create type methode_paiement as enum ('wave', 'orange_money', 'free_money', 'especes', 'virement', 'cheque');
create type type_document as enum ('facture', 'devis', 'quittance', 'rapport');
create type statut_travaux as enum ('a_faire', 'en_cours', 'termine');
create type statut_locataire as enum ('actif', 'archive');

-- ---------- TABLE: users (profil lié à auth.users) ----------
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  nom           text not null,
  telephone     text,
  role          role_utilisateur not null default 'gerant',
  agence_nom    text,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- TABLE: immeubles ----------
create table public.immeubles (
  id                uuid primary key default uuid_generate_v4(),
  proprietaire_id   uuid references public.users(id) on delete set null,
  gerant_id         uuid references public.users(id) on delete cascade not null,
  nom               text not null,
  adresse           text not null,
  ville             text not null default 'Dakar',
  nombre_appartements int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------- TABLE: appartements ----------
create table public.appartements (
  id            uuid primary key default uuid_generate_v4(),
  immeuble_id   uuid not null references public.immeubles(id) on delete cascade,
  numero        text not null,
  etage         int default 0,
  type          text default 'T2',
  loyer_mensuel numeric(12,2) not null default 0,
  statut        statut_appartement not null default 'vacant',
  created_at    timestamptz not null default now(),
  unique (immeuble_id, numero)
);

-- ---------- TABLE: locataires ----------
create table public.locataires (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references public.users(id) on delete set null,
  appartement_id uuid references public.appartements(id) on delete cascade,
  nom            text not null,
  telephone      text,
  email          text,
  cni_url        text,
  contrat_url    text,
  statut         statut_locataire not null default 'actif',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- TABLE: loyers (matriciel 12 mois) ----------
create table public.loyers (
  id             uuid primary key default uuid_generate_v4(),
  appartement_id uuid not null references public.appartements(id) on delete cascade,
  locataire_id   uuid references public.locataires(id) on delete set null,
  mois           date not null, -- le 1er du mois concerné
  montant        numeric(12,2) not null default 0,
  montant_paye   numeric(12,2) not null default 0,
  statut         statut_loyer not null default 'impaye',
  date_echeance  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (appartement_id, mois)
);

-- ---------- TABLE: paiements ----------
create table public.paiements (
  id          uuid primary key default uuid_generate_v4(),
  loyer_id    uuid references public.loyers(id) on delete cascade,
  locataire_id uuid references public.locataires(id) on delete set null,
  montant     numeric(12,2) not null default 0,
  methode     methode_paiement not null default 'wave',
  reference   text,
  statut      statut_paiement not null default 'en_attente',
  wave_payment_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- TABLE: factures ----------
create table public.factures (
  id             uuid primary key default uuid_generate_v4(),
  numero         text unique not null,
  immeuble_id    uuid references public.immeubles(id) on delete cascade,
  appartement_id uuid references public.appartements(id) on delete set null,
  locataire_id   uuid references public.locataires(id) on delete set null,
  type           type_document not null default 'facture',
  montant        numeric(12,2) not null default 0,
  description    text,
  pdf_url        text,
  statut         text not null default 'emise',
  date_emission  date not null default current_date,
  created_at     timestamptz not null default now()
);

-- ---------- TABLE: factures_communes (charges d'immeuble) ----------
create table public.factures_communes (
  id            uuid primary key default uuid_generate_v4(),
  immeuble_id   uuid not null references public.immeubles(id) on delete cascade,
  libelle       text not null,
  montant_total numeric(12,2) not null default 0,
  photo_url     text,
  date          date not null default current_date,
  repartition   jsonb default '{}'::jsonb, -- {appartement_id: montant}
  created_at    timestamptz not null default now()
);

-- ---------- TABLE: travaux ----------
create table public.travaux (
  id             uuid primary key default uuid_generate_v4(),
  immeuble_id    uuid not null references public.immeubles(id) on delete cascade,
  appartement_id uuid references public.appartements(id) on delete set null,
  titre          text not null,
  description    text,
  cout           numeric(12,2) not null default 0,
  statut         statut_travaux not null default 'a_faire',
  date_debut     date,
  date_fin       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- TABLE: abonnements ----------
create table public.abonnements (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  plan        text not null default 'mensuel', -- mensuel | annuel
  montant     numeric(12,2) not null default 10000,
  statut      text not null default 'actif',
  date_debut  date not null default current_date,
  date_fin    date,
  created_at  timestamptz not null default now()
);

-- ---------- TABLE: invitations ----------
create table public.invitations (
  id          uuid primary key default uuid_generate_v4(),
  immeuble_id uuid references public.immeubles(id) on delete cascade,
  email       text not null,
  role        role_utilisateur not null,
  token       text not null default encode(gen_random_bytes(24),'hex'),
  statut      text not null default 'en_attente',
  created_at  timestamptz not null default now()
);

-- ---------- TABLE: activites (journal) ----------
create table public.activites (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.users(id) on delete set null,
  immeuble_id uuid references public.immeubles(id) on delete cascade,
  type        text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- INDEX
-- =====================================================================
create index idx_immeubles_gerant on public.immeubles(gerant_id);
create index idx_immeubles_proprietaire on public.immeubles(proprietaire_id);
create index idx_appartements_immeuble on public.appartements(immeuble_id);
create index idx_locataires_appartement on public.locataires(appartement_id);
create index idx_loyers_appartement_mois on public.loyers(appartement_id, mois);
create index idx_paiements_loyer on public.paiements(loyer_id);
create index idx_factures_immeuble on public.factures(immeuble_id);
create index idx_travaux_immeuble on public.travaux(immeuble_id);

-- =====================================================================
-- RLS (Row Level Security)
-- =====================================================================
alter table public.users enable row level security;
alter table public.immeubles enable row level security;
alter table public.appartements enable row level security;
alter table public.locataires enable row level security;
alter table public.loyers enable row level security;
alter table public.paiements enable row level security;
alter table public.factures enable row level security;
alter table public.factures_communes enable row level security;
alter table public.travaux enable row level security;
alter table public.abonnements enable row level security;
alter table public.invitations enable row level security;
alter table public.activites enable row level security;

-- ---------- FONCTION: rôle de l'utilisateur courant ----------
create or replace function public.current_role_app()
returns role_utilisateur
language sql stable security definer
as $$ select role from public.users where id = auth.uid() $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer
as $$ select public.current_role_app() = 'super_admin' $$;

-- ---------- users ----------
create policy "users: lecture propre profil" on public.users
  for select using (auth.uid() = id or public.is_super_admin());
create policy "users: maj propre profil" on public.users
  for update using (auth.uid() = id or public.is_super_admin());
create policy "users: insertion profil" on public.users
  for insert with check (auth.uid() = id or public.is_super_admin());

-- ---------- immeubles ----------
create policy "immeubles: lecture gerant/proprietaire/super" on public.immeubles
  for select using (
    public.is_super_admin()
    or gerant_id = auth.uid()
    or proprietaire_id = auth.uid()
  );
create policy "immeubles: gerant gere" on public.immeubles
  for insert with check (gerant_id = auth.uid() or public.is_super_admin());
create policy "immeubles: gerant maj" on public.immeubles
  for update using (gerant_id = auth.uid() or public.is_super_admin());
create policy "immeubles: gerant supprime" on public.immeubles
  for delete using (gerant_id = auth.uid() or public.is_super_admin());

-- ---------- appartements ----------
create policy "appartements: lecture" on public.appartements
  for select using (
    exists (
      select 1 from public.immeubles i
      where i.id = immeuble_id
        and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    ) or public.is_super_admin()
  );
create policy "appartements: gerant gere" on public.appartements
  for insert with check (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );
create policy "appartements: gerant maj" on public.appartements
  for update using (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );
create policy "appartements: gerant supprime" on public.appartements
  for delete using (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );

-- ---------- locataires ----------
create policy "locataires: lecture" on public.locataires
  for select using (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id
        and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    ) or user_id = auth.uid() or public.is_super_admin()
  );
create policy "locataires: gerant gere" on public.locataires
  for insert with check (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id and i.gerant_id = auth.uid()
    ) or public.is_super_admin()
  );
create policy "locataires: gerant maj" on public.locataires
  for update using (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id and i.gerant_id = auth.uid()
    ) or user_id = auth.uid() or public.is_super_admin()
  );
create policy "locataires: gerant supprime" on public.locataires
  for delete using (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id and i.gerant_id = auth.uid()
    ) or public.is_super_admin()
  );

-- ---------- loyers ----------
create policy "loyers: lecture" on public.loyers
  for select using (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id
        and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    )
    or exists (
      select 1 from public.locataires l
      where l.id = locataire_id and l.user_id = auth.uid()
    ) or public.is_super_admin()
  );
create policy "loyers: gerant gere" on public.loyers
  for insert with check (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id and i.gerant_id = auth.uid()
    ) or public.is_super_admin()
  );
create policy "loyers: gerant maj" on public.loyers
  for update using (
    exists (
      select 1 from public.appartements a
      join public.immeubles i on i.id = a.immeuble_id
      where a.id = appartement_id and i.gerant_id = auth.uid()
    ) or public.is_super_admin()
  );

-- ---------- paiements ----------
create policy "paiements: lecture" on public.paiements
  for select using (
    exists (
      select 1 from public.loyers lo
      join public.appartements a on a.id = lo.appartement_id
      join public.immeubles i on i.id = a.immeuble_id
      where lo.id = loyer_id
        and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    )
    or exists (
      select 1 from public.locataires l
      where l.id = locataire_id and l.user_id = auth.uid()
    ) or public.is_super_admin()
  );
create policy "paiements: insertion" on public.paiements
  for insert with check (auth.uid() is not null or public.is_super_admin());

-- ---------- factures ----------
create policy "factures: lecture" on public.factures
  for select using (
    exists (
      select 1 from public.immeubles i
      where i.id = immeuble_id
        and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    ) or public.is_super_admin()
  );
create policy "factures: gerant gere" on public.factures
  for insert with check (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );

-- ---------- factures_communes ----------
create policy "factures_communes: lecture" on public.factures_communes
  for select using (
    exists (
      select 1 from public.immeubles i
      where i.id = immeuble_id and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    ) or public.is_super_admin()
  );
create policy "factures_communes: gerant gere" on public.factures_communes
  for insert with check (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );

-- ---------- travaux ----------
create policy "travaux: lecture" on public.travaux
  for select using (
    exists (
      select 1 from public.immeubles i
      where i.id = immeuble_id and (i.gerant_id = auth.uid() or i.proprietaire_id = auth.uid())
    ) or public.is_super_admin()
  );
create policy "travaux: gerant gere" on public.travaux
  for insert with check (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );
create policy "travaux: gerant maj" on public.travaux
  for update using (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );

-- ---------- abonnements ----------
create policy "abonnements: lecture" on public.abonnements
  for select using (user_id = auth.uid() or public.is_super_admin());
create policy "abonnements: super admin gere" on public.abonnements
  for insert with check (public.is_super_admin());

-- ---------- invitations ----------
create policy "invitations: lecture" on public.invitations
  for select using (public.is_super_admin());
create policy "invitations: gerant cree" on public.invitations
  for insert with check (
    exists (select 1 from public.immeubles i where i.id = immeuble_id and i.gerant_id = auth.uid())
    or public.is_super_admin()
  );

-- ---------- activites ----------
create policy "activites: lecture" on public.activites
  for select using (public.is_super_admin() or user_id = auth.uid());
create policy "activites: insertion" on public.activites
  for insert with check (auth.uid() is not null or public.is_super_admin());

-- =====================================================================
-- STORAGE: bucket "documents" (à créer aussi dans le dashboard Supabase)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "storage: upload authentifie" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.uid() is not null);
create policy "storage: lecture proprio" on storage.objects
  for select using (bucket_id = 'documents' and auth.uid() is not null);

-- =====================================================================
-- SEED: Super Admin de démonstration (email: admin@sunukeur.sn)
-- Créer manuellement le compte dans Supabase Auth puis :
-- update public.users set role='super_admin' where email='admin@sunukeur.sn';
-- =====================================================================
