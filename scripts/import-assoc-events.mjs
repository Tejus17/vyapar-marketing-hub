#!/usr/bin/env node
/**
 * Load computer / IT dealer association events (data/events/assoc-*.json) into the Expos section.
 *
 *   node scripts/import-assoc-events.mjs --dry   # show what would be added
 *   node scripts/import-assoc-events.mjs         # upload (needs scripts/.env)
 *
 * Rows use dedupe keys starting with "assoc:", which the daily refresh never touches, and team
 * fields (status, notes, stars) are never sent, so re-running is safe. Events the daily refresh
 * already lists (same city, close dates, similar name) are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/events');
const DRY = process.argv.includes('--dry');
const NICHES = ['Mobile, IT & tech', 'Computer dealer associations'];

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 2 && !/^(20\d\d|expo|the|and|india|fair|show)$/.test(t)));
const overlap = (a, b) => {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((t) => B.has(t)).length / Math.min(A.size, B.size);
};
const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;

const rows = fs.readdirSync(DIR).filter((f) => /^assoc-.*\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const listed = JSON.parse(fs.readFileSync(path.join(DIR, 'events.json'), 'utf8')).filter((e) => e.country === 'India');
const venues = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/venues/venues.json'), 'utf8'));

let lastNom = 0;
const cache = {};
async function cityPoint(city, state) {
  const key = `${city}|${state}`;
  if (key in cache) return cache[key];
  const wait = 1100 - (Date.now() - lastNom);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNom = Date.now();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=1&q=${encodeURIComponent(`${city}, ${state || ''}`)}`;
  const hit = (await fetch(u, { headers: { 'User-Agent': 'VyaparMarketingHub/1.0' } }).then((r) => r.json()).catch(() => []))[0];
  return (cache[key] = hit ? { lat: +hit.lat, lng: +hit.lon } : null);
}

const out = [];
const skipped = [];
const seen = new Set();
for (const r of rows) {
  if (!r.name || !r.city || !r.source_url) continue;
  const dup = listed.find((e) => norm(e.city) === norm(r.city) && e.start_date && r.start_date && days(e.start_date, r.start_date) <= 7 && overlap(e.name, r.name) >= 0.6);
  if (dup) { skipped.push(`${r.name} (already listed as "${dup.name}")`); continue; }
  const key = `assoc:${norm(r.name).replace(/ /g, '-')}|${norm(r.city)}|${(r.start_date || r.month_hint || '').slice(0, 7)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const venue = r.venue_name && venues.find((v) => norm(v.city) === norm(r.city) && [v.name, ...(v.aliases || [])].some((n) => overlap(n, r.venue_name) >= 0.6));
  const pt = venue?.latitude != null ? { lat: venue.latitude, lng: venue.longitude } : await cityPoint(r.city, r.state);
  const desc = [r.kind && `${r.kind} by ${r.association || 'a computer dealer association'}.`, r.description, r.month_hint && !r.end_date && `Dates not announced (${r.month_hint}).`].filter(Boolean).join(' ');
  out.push({
    name: r.name, description: desc || null, country: 'India', city: r.city, state: r.state || null,
    venue_name: venue?.name || r.venue_name || null, venue_address: r.venue_address || venue?.address || null,
    latitude: pt?.lat ?? null, longitude: pt?.lng ?? null, start_date: r.start_date || null, end_date: r.end_date || null, cycle: null,
    niches: NICHES, industries: [r.kind || 'Event', 'Computer / IT dealers'], audience: r.audience || 'B2B',
    footfall: Number.isFinite(r.footfall) ? r.footfall : null, footfall_text: r.footfall_text || null,
    footfall_source: Number.isFinite(r.footfall) ? `${r.source_name || 'Organiser'} (organiser claim)` : null,
    footfall_source_url: Number.isFinite(r.footfall) ? r.source_url : null,
    exhibitors: Number.isFinite(r.exhibitors) ? r.exhibitors : null,
    organiser: r.association || null, organiser_phone: r.organiser_phone || null, organiser_website: null,
    website: r.website || null, source_name: r.source_name || 'Association', source_url: r.source_url,
    last_seen_at: new Date().toISOString(), dedupe_key: key, venue_key: venue ? venue.dedupe_key || `${norm(venue.name)}|${norm(venue.city)}` : null,
  });
}
console.log(`${rows.length} researched · ${out.length} to add · ${skipped.length} already in Expos`);
for (const s of skipped) console.log('  skip:', s);
for (const e of out) console.log(`  ${e.start_date || '—'}  ${e.name} · ${e.city}`);
if (DRY) process.exit(0);

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'scripts/.env'), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const H = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' };
const vmap = Object.fromEntries((await fetch(`${env.SUPABASE_URL}/rest/v1/hub_venues?select=id,dedupe_key&limit=5000`, { headers: H }).then((r) => r.json())).map((v) => [v.dedupe_key, v.id]));
const body = out.map(({ venue_key, ...e }) => ({ ...e, venue_id: (venue_key && vmap[venue_key]) || null }));
const res = await fetch(`${env.SUPABASE_URL}/rest/v1/hub_events?on_conflict=dedupe_key`, {
  method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
console.log(`Uploaded ${body.length} association events.`);
