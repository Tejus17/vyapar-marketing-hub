-- Vyapar Marketing Hub — Expos section (run once in Supabase → SQL Editor; safe to re-run)

-- Vendors can now be outside India (UAE booth fabricators)
alter table hub_vendors add column if not exists country text not null default 'India';
create index if not exists hub_vendors_country_idx on hub_vendors (country);

-- ─── Expo venues ────────────────────────────────────────────────────────────
create table if not exists hub_venues (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  aliases             text[] not null default '{}',
  country             text not null,                 -- India | UAE
  city                text not null,
  state               text,                          -- Indian state or UAE emirate
  address             text,
  latitude            double precision,
  longitude           double precision,
  google_maps_url     text,
  website             text,
  events_calendar_url text,
  exhibition_area_sqm numeric,
  halls               int,
  capacity_note       text,
  phone               text,
  type                text,                          -- Exhibition centre | Convention centre | Trade fair ground
  source_url          text,
  notes               text,
  dedupe_key          text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists hub_venues_city_idx on hub_venues (country, city);

-- ─── Events (one row per edition) ───────────────────────────────────────────
create table if not exists hub_events (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  country            text not null,
  city               text not null,
  state              text,
  venue_id           uuid references hub_venues(id) on delete set null,
  venue_name         text,
  venue_address      text,
  latitude           double precision,
  longitude          double precision,
  start_date         date,
  end_date           date,
  cycle              text,                 -- annual, every 2 years, …
  niches             text[] not null default '{}',   -- Vyapar-relevant niche tags
  industries         text[] not null default '{}',   -- as listed by the source
  audience           text,                 -- B2B | B2C | B2B + B2C
  footfall           int,                  -- best known figure (claimed by organiser unless team-set)
  footfall_text      text,                 -- the sentence it came from
  footfall_source    text,                 -- e.g. "Event website (organiser claim)"
  footfall_source_url text,
  exhibitors         int,
  organiser          text,
  organiser_phone    text,
  organiser_website  text,
  website            text,                 -- the event's own site
  source_name        text,
  source_url         text,
  -- team fields (never overwritten by the daily update)
  team_status        text not null default 'new'
                       check (team_status in ('new','shortlisted','going','went','not_for_us')),
  status_by          text,
  status_at          timestamptz,
  team_footfall      int,                  -- real number after attending
  is_starred         boolean not null default false,
  is_archived        boolean not null default false,
  added_by           text,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  dedupe_key         text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists hub_events_dates_idx on hub_events (start_date);
create index if not exists hub_events_city_idx  on hub_events (country, city);
create index if not exists hub_events_niches_idx on hub_events using gin (niches);

create table if not exists hub_event_notes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references hub_events(id) on delete cascade,
  author     text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists hub_event_notes_event_idx on hub_event_notes (event_id, created_at desc);

drop trigger if exists hub_venues_touch on hub_venues;
create trigger hub_venues_touch before update on hub_venues for each row execute function hub_touch_updated_at();
drop trigger if exists hub_events_touch on hub_events;
create trigger hub_events_touch before update on hub_events for each row execute function hub_touch_updated_at();

-- ─── Access rules (no login, same as vendors) ───────────────────────────────
alter table hub_venues      enable row level security;
alter table hub_events      enable row level security;
alter table hub_event_notes enable row level security;

drop policy if exists "hub venues read"   on hub_venues;
drop policy if exists "hub venues insert" on hub_venues;
drop policy if exists "hub venues update" on hub_venues;
create policy "hub venues read"   on hub_venues for select to anon, authenticated using (true);
create policy "hub venues insert" on hub_venues for insert to anon, authenticated with check (true);
create policy "hub venues update" on hub_venues for update to anon, authenticated using (true) with check (true);

drop policy if exists "hub events read"   on hub_events;
drop policy if exists "hub events insert" on hub_events;
drop policy if exists "hub events update" on hub_events;
create policy "hub events read"   on hub_events for select to anon, authenticated using (true);
create policy "hub events insert" on hub_events for insert to anon, authenticated with check (true);
create policy "hub events update" on hub_events for update to anon, authenticated using (true) with check (true);

drop policy if exists "hub event notes read"   on hub_event_notes;
drop policy if exists "hub event notes insert" on hub_event_notes;
drop policy if exists "hub event notes delete" on hub_event_notes;
create policy "hub event notes read"   on hub_event_notes for select to anon, authenticated using (true);
create policy "hub event notes insert" on hub_event_notes for insert to anon, authenticated with check (true);
create policy "hub event notes delete" on hub_event_notes for delete to anon, authenticated using (true);
