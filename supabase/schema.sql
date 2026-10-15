-- Vyapar Vendor Hub — database schema
-- Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates things that don't exist yet.

create extension if not exists pgcrypto;

-- ─── Vendors ────────────────────────────────────────────────────────────────
create table if not exists hub_vendors (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  phones             text[] not null default '{}',
  address            text,
  area               text,
  city               text not null,
  state              text not null,
  pincode            text,
  latitude           double precision,
  longitude          double precision,
  -- how precise the pin is: 'exact' (from a maps link), 'area' (geocoded locality), 'city' (city centre)
  location_precision text not null default 'city',
  google_maps_url    text,
  website            text,
  services           text[] not null default '{}',
  -- [{ "item": "Glow sign board", "price": 150, "price_max": null, "unit": "sq ft" }]
  rates              jsonb not null default '[]'::jsonb,
  rating             numeric,
  established        text,
  description        text,
  source_name        text,          -- e.g. IndiaMART, Added by team
  source_url         text,
  is_starred         boolean not null default false,
  starred_by         text,
  starred_at         timestamptz,
  is_verified        boolean not null default false,  -- a teammate has worked with / called them
  is_archived        boolean not null default false,  -- "removed" from the dashboard
  added_by           text,
  dedupe_key         text unique,   -- lower(name)|lower(city), used by the import script
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists hub_vendors_city_idx     on hub_vendors (city);
create index if not exists hub_vendors_state_idx    on hub_vendors (state);
create index if not exists hub_vendors_services_idx on hub_vendors using gin (services);

-- ─── Notes / comments on a vendor ──────────────────────────────────────────
create table if not exists hub_vendor_notes (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references hub_vendors(id) on delete cascade,
  author       text not null,
  partner_shop text,               -- which Shop-in-Shop partner this was for
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists hub_vendor_notes_vendor_idx on hub_vendor_notes (vendor_id, created_at desc);

-- keep updated_at fresh
create or replace function hub_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists hub_vendors_touch on hub_vendors;
create trigger hub_vendors_touch before update on hub_vendors
  for each row execute function hub_touch_updated_at();

-- ─── Access rules ──────────────────────────────────────────────────────────
-- The dashboard has no login (team decision), so the public "publishable" key
-- may read, add and edit vendors and notes. Hard deletes of vendors are not
-- allowed from the dashboard — it archives instead.
alter table hub_vendors      enable row level security;
alter table hub_vendor_notes enable row level security;

drop policy if exists "hub vendors read"   on hub_vendors;
drop policy if exists "hub vendors insert" on hub_vendors;
drop policy if exists "hub vendors update" on hub_vendors;
create policy "hub vendors read"   on hub_vendors for select to anon, authenticated using (true);
create policy "hub vendors insert" on hub_vendors for insert to anon, authenticated with check (true);
create policy "hub vendors update" on hub_vendors for update to anon, authenticated using (true) with check (true);

drop policy if exists "hub notes read"   on hub_vendor_notes;
drop policy if exists "hub notes insert" on hub_vendor_notes;
drop policy if exists "hub notes delete" on hub_vendor_notes;
create policy "hub notes read"   on hub_vendor_notes for select to anon, authenticated using (true);
create policy "hub notes insert" on hub_vendor_notes for insert to anon, authenticated with check (true);
create policy "hub notes delete" on hub_vendor_notes for delete to anon, authenticated using (true);

-- ─── Optional clean-up of the old prototype tables ─────────────────────────
-- The earlier prototype created users / vendors / user_favorites and filled
-- "vendors" with 14 made-up placeholder rows. Nothing uses them any more.
-- Uncomment and run these three lines if you want them gone:
-- drop table if exists user_favorites;
-- drop table if exists vendors;
-- drop table if exists users;
