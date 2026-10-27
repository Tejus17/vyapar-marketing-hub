#!/usr/bin/env node
/**
 * Load hand-researched events into the Expos section:
 *   data/events/assoc-*.json    computer / IT dealer association events
 *   data/events/partner-*.json  partner-acquisition events (IT channel, CAs & tax pros, entrepreneurs)
 *
 *   node scripts/import-assoc-events.mjs --dry   # show what would be added / tagged
 *   node scripts/import-assoc-events.mjs         # upload (needs scripts/.env)
 *
 * New rows use dedupe keys starting with "assoc:" or "partner:", which the daily refresh never
 * touches, and team fields (status, notes, stars) are never sent, so re-running is safe.
 * When a researched event is already listed by the daily refresh, it isn't added again; instead its
 * niches (e.g. "Partner acquisition") are added to that row and saved in data/manual-tags.json,
 * which the daily refresh re-applies so the tag survives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/events');
const TAGS = path.join(ROOT, 'data/manual-tags.json'); // outside data/events, which the GitHub run restores from cache
const DRY = process.argv.includes('--dry');
const PARTNER = 'Partner acquisition';
const ASSOC_RE = /\b(association|federation|confed|faiita|cmda|tait|vcmdwa|fitag|acma|akitda|compass|upcdwa|pact|isoda|dealers?)\b/i;

// Niches by file: what makes these events findable in the dashboard's Niche filter.
function nichesFor(file, r) {
  if (file.startsWith('assoc-')) return ['Mobile, IT & tech', 'Computer dealer associations'];
  const n = [PARTNER];
  if (/it-channel/.test(file)) n.push('Mobile, IT & tech', ...(ASSOC_RE.test(r.organiser || '') ? ['Computer dealer associations'] : []));
  if (/entrepreneur/.test(file)) n.push('MSME, franchise & business');
  return n;
}

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 2 && !/^(20\d\d|expo|the|and|india|fair|show)$/.test(t)));
const overlap = (a, b) => {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((t) => B.has(t)).length / Math.min(A.size, B.size);
};
const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
// Undated entries (a past edition with "usually January") match by name, but never across years:
// "CMDA IT Expo 2026" and "CMDA IT Expo 2027" stay separate.
const years = (s) => String(s || '').match(/\b20\d\d\b/g) || [];
const sameYear = (a, b) => !years(a.name).length || !years(b.name).length || years(a.name).some((y) => years(b.name).includes(y));
const same = (a, b) =>
  norm(a.city) === norm(b.city) && overlap(a.name, b.name) >= 0.6 &&
  (a.start_date && b.start_date ? days(a.start_date, b.start_date) <= 7 : sameYear(a, b));

// Same spellings as the dashboard (the daily refresh uses these).
const CITY_ALIAS = { 'new delhi': 'Delhi', bangalore: 'Bengaluru', gurgaon: 'Gurugram', cochin: 'Kochi', mysore: 'Mysuru', baroda: 'Vadodara', trivandrum: 'Thiruvananthapuram', 'zirakpur (chandigarh)': 'Zirakpur' };
const rows = fs.readdirSync(DIR).filter((f) => /^(assoc|partner)-.*\.json$/.test(f)).sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).map((r) => ({ ...r, city: CITY_ALIAS[String(r.city || '').toLowerCase()] || r.city, _file: f, _niches: nichesFor(f, r) })))
  // roadshows across many cities have no single place to show on the map
  .filter((r) => !/^multiple\b/i.test(r.city || ''));
const listed = JSON.parse(fs.readFileSync(path.join(DIR, 'events.json'), 'utf8')).filter((e) => e.country === 'India');
const venues = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/venues/venues.json'), 'utf8'));
const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};

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

const describe = (r) => {
  if (r._file.startsWith('assoc-')) {
    return [r.kind && `${r.kind} by ${r.association || 'a computer dealer association'}.`, r.description, r.month_hint && !r.end_date && `Dates not announced (${r.month_hint}).`];
  }
  return [
    r.kind && r.organiser && `${r.kind} by ${r.organiser}.`,
    r.why_fit && `Partner fit (${r.partner_type || 'partners'}): ${r.why_fit}`,
    r.audience && `Audience: ${r.audience}`,
    r.exhibit_options && `Exhibiting: ${r.exhibit_options}`,
    r.month_hint && !r.end_date && `Dates not announced (${r.month_hint}).`,
  ];
};

const out = [];
const tagged = [];
const unmatched = [];
for (const r of rows) {
  if (!r.name || !r.city || !r.source_url) continue;
  // Already listed by the daily refresh → tag that row instead of adding a copy.
  const dup = listed.find((e) => e.start_date && r.start_date && same(e, r));
  if (dup) {
    const add = r._niches.filter((n) => !(dup.niches || []).includes(n) && !(tags[dup.dedupe_key] || []).includes(n));
    if (add.length) tagged.push({ key: dup.dedupe_key, name: dup.name, add });
    tags[dup.dedupe_key] = [...new Set([...(tags[dup.dedupe_key] || []), ...r._niches])];
    continue;
  }
  // Same event in two research files → one row with both sets of niches.
  const twin = out.find((e) => same(e, r));
  if (twin) {
    twin.niches = [...new Set([...twin.niches, ...r._niches])];
    continue;
  }
  // The researcher saw it in the dashboard under another name, and it has no dates to match on.
  if (r.in_dashboard && !r.start_date) { unmatched.push(r.name); continue; }
  const prefix = r._file.startsWith('assoc-') ? 'assoc' : 'partner';
  const key = `${prefix}:${norm(r.name).replace(/ /g, '-')}|${norm(r.city)}|${(r.start_date || r.month_hint || '').slice(0, 7)}`;
  const venue = r.venue_name && venues.find((v) => norm(v.city) === norm(r.city) && [v.name, ...(v.aliases || [])].some((n) => overlap(n, r.venue_name) >= 0.6));
  const pt = venue?.latitude != null ? { lat: venue.latitude, lng: venue.longitude } : await cityPoint(r.city, r.state);
  const audience = /^(B2B|B2C|B2B \+ B2C)$/.test(r.audience || '') ? r.audience : 'B2B';
  const phone = /\d{8,}/.test(String(r.organiser_contact || r.organiser_phone || '').replace(/\D/g, '')) ? r.organiser_contact || r.organiser_phone : null;
  out.push({
    name: r.name, description: describe(r).filter(Boolean).join(' ') || null, country: 'India', city: r.city, state: r.state || null,
    venue_name: venue?.name || r.venue_name || null, venue_address: r.venue_address || venue?.address || null,
    latitude: pt?.lat ?? null, longitude: pt?.lng ?? null, start_date: r.start_date || null, end_date: r.end_date || null, cycle: null,
    niches: r._niches,
    industries: [r.kind || 'Event', r._file.startsWith('assoc-') ? 'Computer / IT dealers' : `Partners: ${r.partner_type || 'mixed'}`],
    audience,
    footfall: Number.isFinite(r.footfall) ? r.footfall : null, footfall_text: r.footfall_text || null,
    footfall_source: Number.isFinite(r.footfall) ? `${r.source_name || 'Organiser'} (organiser claim)` : null,
    footfall_source_url: Number.isFinite(r.footfall) ? r.source_url : null,
    exhibitors: Number.isFinite(r.exhibitors) ? r.exhibitors : null,
    organiser: r.association || r.organiser || null, organiser_phone: phone, organiser_website: null,
    website: r.website || null, source_name: r.source_name || 'Organiser', source_url: r.source_url,
    last_seen_at: new Date().toISOString(), dedupe_key: key, venue_key: venue ? venue.dedupe_key || `${norm(venue.name)}|${norm(venue.city)}` : null,
  });
}
console.log(`${rows.length} researched · ${out.length} to add or update · ${tagged.length} existing events get new niches`);
for (const t of tagged) console.log(`  tag: ${t.name} + ${t.add.join(', ')}`);
for (const n of unmatched) console.log(`  already in Expos under another name (not tagged): ${n}`);
for (const e of out) console.log(`  ${e.start_date || '—'}  ${e.name} · ${e.city} · ${e.niches.join(', ')}`);
if (DRY) process.exit(0);

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'scripts/.env'), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const H = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' };
const vmap = Object.fromEntries((await fetch(`${env.SUPABASE_URL}/rest/v1/hub_venues?select=id,dedupe_key&limit=5000`, { headers: H }).then((r) => r.json())).map((v) => [v.dedupe_key, v.id]));
const body = out.map(({ venue_key, ...e }) => ({ ...e, venue_id: (venue_key && vmap[venue_key]) || null }));
const res = await fetch(`${env.SUPABASE_URL}/rest/v1/hub_events?on_conflict=dedupe_key`, {
  method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

// Tag rows the refresh owns (it re-applies manual-tags.json every day).
for (const t of tagged) {
  const cur = await fetch(`${env.SUPABASE_URL}/rest/v1/hub_events?select=niches&dedupe_key=eq.${encodeURIComponent(t.key)}`, { headers: H }).then((r) => r.json());
  if (!cur[0]) continue;
  const niches = [...new Set([...(cur[0].niches || []), ...t.add])];
  const p = await fetch(`${env.SUPABASE_URL}/rest/v1/hub_events?dedupe_key=eq.${encodeURIComponent(t.key)}`, { method: 'PATCH', headers: H, body: JSON.stringify({ niches }) });
  if (!p.ok) throw new Error(`tag ${t.name}: ${p.status} ${await p.text()}`);
}
fs.writeFileSync(TAGS, JSON.stringify(tags, null, 1));
console.log(`Uploaded ${body.length} events and tagged ${tagged.length} existing ones.`);
