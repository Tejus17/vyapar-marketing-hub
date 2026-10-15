#!/usr/bin/env node
/**
 * Locate partner shops from Google Maps links and check vendor coverage around each.
 *
 *   node scripts/locate-shops.mjs data/partner-shops/links.txt
 *
 * Writes data/partner-shops/shops.json (one entry per shop: name, lat/lng, town, district, state,
 * nearest vendor distances) and prints the towns that have no vendors nearby.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] || path.join(ROOT, 'data/partner-shops/links.txt');
const OUT = path.join(ROOT, 'data/partner-shops/shops.json');
const FN = 'https://kpwjhooqygwypdhgwtli.supabase.co/functions/v1/resolve-maps-link';
const KEY = 'sb_publishable_J0r2bcrRVW8d8iduj-21GA_xVzAw5F-';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const coordsFrom = (u) => {
  const t = decodeURIComponent(u);
  for (const re of [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/]) {
    const m = t.match(re);
    if (m) return { lat: +m[1], lng: +m[2] };
  }
  return null;
};
const placeName = (u) => {
  const m = decodeURIComponent(u).match(/\/maps\/place\/([^/@?]+)/);
  const n = m ? m[1].replace(/\+/g, ' ').trim() : null;
  return n && !/°/.test(n) ? n : null;
};
const qText = (u) => {
  try {
    const q = new URL(u).searchParams.get('q');
    return q && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q) ? q : null;
  } catch {
    return null;
  }
};

let lastNom = 0;
async function nominatim(pathname, params) {
  const wait = 1100 - (Date.now() - lastNom);
  if (wait > 0) await sleep(wait);
  lastNom = Date.now();
  const url = new URL(`https://nominatim.openstreetmap.org/${pathname}`);
  url.search = new URLSearchParams({ format: 'jsonv2', ...params });
  const res = await fetch(url, { headers: { 'User-Agent': 'VyaparMarketingHub/1.0 (partner shop lookup)' } });
  return res.ok ? res.json() : null;
}
const geocode = async (q) => (await nominatim('search', { q, countrycodes: 'in', limit: '1' }))?.[0] || null;

const haversine = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const lines = fs.readFileSync(input, 'utf8').split('\n').map((l) => l.trim()).filter((l) => /https?:\/\//.test(l));
const seen = new Set();
const shops = [];
for (const line of lines) {
  const link = line.match(/https?:\/\/\S+/)[0];
  if (seen.has(link)) continue;
  seen.add(link);
  const label = line.replace(link, '').trim() || null;
  let pt = null;
  let name = label;
  let how = '';
  let final = link;
  if (/maps\.app\.goo\.gl|goo\.gl\/maps|share\.google/.test(link)) {
    const r = await fetch(`${FN}?url=${encodeURIComponent(link)}`, { headers: { apikey: KEY } }).then((x) => x.json()).catch(() => null);
    final = r?.url || link;
    if (r?.lat != null) { pt = { lat: r.lat, lng: r.lng }; how = 'pin'; }
    name = name || (r?.name && !/°/.test(r.name) ? r.name : null);
    if (!pt && r?.query) {
      const place = r.query.match(/\b(?:in|at|near)\s+([A-Z][\w .'-]{2,40})\s*$/i)?.[1];
      const g = (place && (await geocode(place))) || null;
      if (g) { pt = { lat: +g.lat, lng: +g.lon }; how = `town in name (${place})`; }
      name = name || r.query.split('||')[0].trim();
    }
  } else {
    pt = coordsFrom(link);
    if (pt) how = 'pin';
    name = name || placeName(link);
    const q = qText(link);
    if (!pt && q) {
      name = name || q.split('|')[0].trim();
      const parts = q.split(',').map((s) => s.trim());
      const g = (await geocode(parts.slice(-3).join(', '))) || (await geocode(parts.slice(-2).join(', ')));
      if (g) { pt = { lat: +g.lat, lng: +g.lon }; how = 'address in link'; }
    }
  }
  let where = {};
  if (pt) {
    const rev = await nominatim('reverse', { lat: pt.lat, lon: pt.lng, zoom: '12', addressdetails: '1' });
    const a = rev?.address || {};
    where = {
      town: a.city || a.town || a.village || a.municipality || a.suburb || a.county || null,
      district: a.state_district || a.county || null,
      state: a.state || null,
      pincode: a.postcode || null,
    };
  }
  shops.push({ link, name, ...pt, how: pt ? how : 'not located', ...where });
  console.log(`${pt ? '✓' : '✗'} ${(name || '(no name)').slice(0, 40).padEnd(40)} ${where.town || ''}, ${where.state || ''} ${pt ? '' : '— ' + final.slice(0, 80)}`);
}

// Coverage against the vendors we already have.
const vendors = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/vendors.json'), 'utf8')).filter((v) => v.latitude != null);
for (const s of shops) {
  if (s.lat == null) continue;
  const d = vendors.map((v) => haversine(s, { lat: v.latitude, lng: v.longitude })).sort((a, b) => a - b);
  s.vendors_10km = d.filter((x) => x <= 10).length;
  s.vendors_25km = d.filter((x) => x <= 25).length;
  s.nearest_vendor_km = Math.round(d[0]);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(shops, null, 1));
const located = shops.filter((s) => s.lat != null);
const thin = located.filter((s) => s.vendors_25km < 3);
console.log(`\n${shops.length} shops · located ${located.length} · ${located.length - thin.length} already have 3+ vendors within 25 km · ${thin.length} need vendors`);
