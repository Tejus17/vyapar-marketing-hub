#!/usr/bin/env node
/**
 * Clean the collected vendor files in data/raw/*.json and load them into Supabase.
 *
 *   node scripts/import-vendors.mjs --dry     # clean + geocode only, writes data/vendors.json
 *   node scripts/import-vendors.mjs           # …and upload to Supabase (needs scripts/.env)
 *
 * scripts/.env must contain:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY=sb_secret_...
 *
 * Existing rows are never overwritten (matched on name + city), so stars, notes
 * and edits made in the dashboard survive re-imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'vendors.json');
const CACHE = path.join(ROOT, 'data', 'geocode-cache.json');
const DRY = process.argv.includes('--dry');
// --update refreshes the scraped fields of vendors already in the database (phones, address,
// rates, pin…). Stars, "worked with", notes and archive status are never touched, but manual
// edits to those scraped fields would be replaced — so only use it before the team starts editing.
const UPDATE = process.argv.includes('--update');

const SERVICES = new Set(['Backlit / Light boards', 'Flex boards', 'Standees', 'Vinyl & creatives', 'ACP & 3D letters', 'Installation', 'Exhibition stalls & booths']);

// Keep in sync with app/src/lib/constants.js
const CITIES = {
  Delhi: ['Delhi', 28.6139, 77.209], Mumbai: ['Maharashtra', 19.076, 72.8777], Bengaluru: ['Karnataka', 12.9716, 77.5946],
  Chennai: ['Tamil Nadu', 13.0827, 80.2707], Kolkata: ['West Bengal', 22.5726, 88.3639], Hyderabad: ['Telangana', 17.385, 78.4867],
  Pune: ['Maharashtra', 18.5204, 73.8567], Ahmedabad: ['Gujarat', 23.0225, 72.5714], Noida: ['Uttar Pradesh', 28.5355, 77.391],
  Gurugram: ['Haryana', 28.4595, 77.0266], Ghaziabad: ['Uttar Pradesh', 28.6692, 77.4538], Faridabad: ['Haryana', 28.4089, 77.3178],
  Thane: ['Maharashtra', 19.2183, 72.9781], 'Navi Mumbai': ['Maharashtra', 19.033, 73.0297], Howrah: ['West Bengal', 22.5958, 88.2636],
  Secunderabad: ['Telangana', 17.4399, 78.4983], Jaipur: ['Rajasthan', 26.9124, 75.7873], Lucknow: ['Uttar Pradesh', 26.8467, 80.9462],
  Kanpur: ['Uttar Pradesh', 26.4499, 80.3319], Nagpur: ['Maharashtra', 21.1458, 79.0882], Indore: ['Madhya Pradesh', 22.7196, 75.8577],
  Bhopal: ['Madhya Pradesh', 23.2599, 77.4126], Surat: ['Gujarat', 21.1702, 72.8311], Vadodara: ['Gujarat', 22.3072, 73.1812],
  Rajkot: ['Gujarat', 22.3039, 70.8022], Patna: ['Bihar', 25.5941, 85.1376], Ludhiana: ['Punjab', 30.901, 75.8573],
  Amritsar: ['Punjab', 31.634, 74.8723], Chandigarh: ['Chandigarh', 30.7333, 76.7794], Mohali: ['Punjab', 30.7046, 76.7179],
  Panchkula: ['Haryana', 30.6942, 76.8606], Jodhpur: ['Rajasthan', 26.2389, 73.0243], Agra: ['Uttar Pradesh', 27.1767, 78.0081],
  Varanasi: ['Uttar Pradesh', 25.3176, 82.9739], Dehradun: ['Uttarakhand', 30.3165, 78.0322], Nashik: ['Maharashtra', 19.9975, 73.7898],
  Coimbatore: ['Tamil Nadu', 11.0168, 76.9558], Madurai: ['Tamil Nadu', 9.9252, 78.1198], Kochi: ['Kerala', 9.9312, 76.2673],
  Thiruvananthapuram: ['Kerala', 8.5241, 76.9366], Visakhapatnam: ['Andhra Pradesh', 17.6868, 83.2185], Vijayawada: ['Andhra Pradesh', 16.5062, 80.648],
  Mysuru: ['Karnataka', 12.2958, 76.6394], Bhubaneswar: ['Odisha', 20.2961, 85.8245], Guwahati: ['Assam', 26.1445, 91.7362],
  Ranchi: ['Jharkhand', 23.3441, 85.3096], Raipur: ['Chhattisgarh', 21.2514, 81.6296],
  Gandhinagar: ['Gujarat', 23.2156, 72.6369], 'Greater Noida': ['Uttar Pradesh', 28.4744, 77.504], Goa: ['Goa', 15.4909, 73.8278],
  Dubai: ['Dubai', 25.2048, 55.2708], 'Abu Dhabi': ['Abu Dhabi', 24.4539, 54.3773], Sharjah: ['Sharjah', 25.3463, 55.4209],
};
const UAE_CITIES = new Set(['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Al Ain', 'Ras Al Khaimah']);
const CITY_ALIASES = {
  'new delhi': 'Delhi', 'delhi ncr': 'Delhi', bangalore: 'Bengaluru', bengaluru: 'Bengaluru', gurgaon: 'Gurugram', mysore: 'Mysuru',
  vizag: 'Visakhapatnam', cochin: 'Kochi', ernakulam: 'Kochi', trivandrum: 'Thiruvananthapuram', bombay: 'Mumbai', calcutta: 'Kolkata',
  'pimpri chinchwad': 'Pune', 'pimpri-chinchwad': 'Pune', pimpri: 'Pune', chinchwad: 'Pune', 'greater noida': 'Noida',
  'new mumbai': 'Navi Mumbai', baroda: 'Vadodara', 'sas nagar': 'Mohali', 'gautam buddha nagar': 'Noida',
};

const canonCity = (c) => {
  const s = String(c || '').trim();
  const alias = CITY_ALIASES[s.toLowerCase()];
  if (alias) return alias;
  const hit = Object.keys(CITIES).find((k) => k.toLowerCase() === s.toLowerCase());
  return hit || s.replace(/\b\w/g, (m) => m.toUpperCase());
};

// STD codes, used to complete local landline numbers listed without one (e.g. "2382209" in Madurai).
const STD = {
  Delhi: '11', Noida: '120', Ghaziabad: '120', Gurugram: '124', Faridabad: '129', Mumbai: '22', Thane: '22', 'Navi Mumbai': '22',
  Kolkata: '33', Howrah: '33', Chennai: '44', Bengaluru: '80', Hyderabad: '40', Secunderabad: '40', Pune: '20', Ahmedabad: '79',
  Surat: '261', Vadodara: '265', Rajkot: '281', Jaipur: '141', Jodhpur: '291', Lucknow: '522', Kanpur: '512', Varanasi: '542',
  Agra: '562', Dehradun: '135', Nagpur: '712', Nashik: '253', Indore: '731', Bhopal: '755', Raipur: '771', Patna: '612',
  Ranchi: '651', Bhubaneswar: '674', Guwahati: '361', Chandigarh: '172', Mohali: '172', Panchkula: '172', Ludhiana: '161',
  Amritsar: '183', Coimbatore: '422', Madurai: '452', Kochi: '484', Thiruvananthapuram: '471', Visakhapatnam: '891',
  Vijayawada: '866', Mysuru: '821',
};

function normUaePhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00971')) d = d.slice(5);
  else if (d.startsWith('971')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 7 || d.length > 9) return null;
  // mobiles 5x xxx xxxx, landlines 4 xxx xxxx (Dubai), 2 (Abu Dhabi), 6 (Sharjah)
  return d.startsWith('5') ? `+971 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : `+971 ${d.slice(0, 1)} ${d.slice(1, 4)} ${d.slice(4)}`;
}

function normPhone(raw, city) {
  if (UAE_CITIES.has(city)) return normUaePhone(raw);
  // IndiaMART forwarding lines carry an extension that routes to the specific seller: keep it.
  const ext = String(raw).match(/\s*(?:ext\.?|extn\.?|x)\s*(\d{2,5})\s*$/i);
  if (ext) {
    const base = normPhone(String(raw).slice(0, ext.index), city);
    return base ? `${base} ext ${ext[1]}` : null;
  }
  let d = String(raw).replace(/\D/g, '');
  const std = STD[city];
  if (std && d.length >= 6 && d.length <= 8 && std.length + d.length === 10 && !/^[6-9]\d{9}$/.test(d)) d = std + d;
  if (d.startsWith('0091')) d = d.slice(4);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10) return d.length >= 8 && d.length <= 12 ? `+91 ${d}` : null;
  if (/^[6-9]/.test(d)) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  // landline: metros have 2-digit STD codes, everywhere else 3 (4-digit codes are rare in these cities)
  const n = /^(11|20|22|33|40|44|79|80)/.test(d) ? 2 : 3;
  return `+91 ${d.slice(0, n)} ${d.slice(n, 6)} ${d.slice(6)}`;
}

const splitPhones = (list) =>
  (Array.isArray(list) ? list : [list])
    .filter(Boolean)
    // "+918043829217,3224" is number + extension, not two numbers
    .map((p) => String(p).replace(/(\d{10})\s*,\s*(\d{2,5})(?!\d)/g, '$1 ext $2'))
    .flatMap((p) => p.split(/[,;/|]|\s{2,}|\bor\b/i))
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, '').length >= 6);

const normName = (n) =>
  n.toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|co|company|the|m\/s)\b\.?/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const s = (v) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|na|-)$/i.test(v.trim()) ? v.trim() : null);

function parseLatLng(url) {
  if (!url) return null;
  const t = decodeURIComponent(url);
  for (const re of [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/]) {
    const m = t.match(re);
    if (m) return { lat: +m[1], lng: +m[2] };
  }
  return null;
}

const haversine = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// ── geocoding (OpenStreetMap Nominatim, max 1 request / second) ──────────────
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
let lastCall = 0;
async function nominatim(params) {
  const key = JSON.stringify(params);
  if (key in cache) return cache[key];
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'in', ...params });
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'VyaparVendorHub/1.0 (internal vendor directory)' } });
    if (!res.ok) return null; // don't cache transient failures
    const [hit] = await res.json();
    cache[key] = hit ? { lat: +hit.lat, lng: +hit.lon } : null;
  } catch {
    return null;
  }
  if (Object.keys(cache).length % 20 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache[key];
}

async function locate(v) {
  const exact = parseLatLng(v.google_maps_url);
  if (exact) return { ...exact, precision: 'exact' };
  const centre = CITIES[v.city] ? { lat: CITIES[v.city][1], lng: CITIES[v.city][2] } : null;
  const near = (p) => p && (!centre || haversine(p, centre) < 45); // reject wrong-city matches
  const tries = [];
  const cc = v.country === 'UAE' ? { countrycodes: 'ae' } : {};
  if (v.area) tries.push({ q: `${v.area}, ${v.city}, ${v.state}`, ...cc });
  if (v.country !== 'UAE' && v.pincode && /^\d{6}$/.test(v.pincode)) tries.push({ postalcode: v.pincode });
  for (const t of tries) {
    const hit = await nominatim(t);
    if (near(hit)) return { ...hit, precision: 'area' };
  }
  if (centre) return { ...centre, precision: 'city' };
  const hit = await nominatim({ q: `${v.city}, ${v.state}` });
  return hit ? { ...hit, precision: 'city' } : { lat: null, lng: null, precision: 'city' };
}

// ── load + clean ────────────────────────────────────────────────────────────
const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.json'));
const merged = new Map();
let rawCount = 0;
const problems = [];

for (const file of files) {
  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  } catch (e) {
    problems.push(`${file}: invalid JSON (${e.message})`);
    continue;
  }
  for (const r of Array.isArray(rows) ? rows : []) {
    rawCount += 1;
    const name = s(r.name);
    const city = canonCity(r.city);
    if (!name || !city) continue;
    const phones = [...new Set(splitPhones(r.phones).map((p) => normPhone(p, city)).filter(Boolean))];
    const address = s(r.address);
    if (!phones.length && !address) continue;
    const v = {
      name: name.replace(/\s+/g, ' '),
      phones,
      address,
      area: /^(deals in|serving|located in)\b/i.test(r.area || '') ? null : s(r.area),
      city,
      state: CITIES[city]?.[0] || s(r.state) || '',
      country: UAE_CITIES.has(city) || /uae|emirates/i.test(r.country || '') ? 'UAE' : 'India',
      pincode: (() => {
        const pin = s(r.pincode)?.replace(/\D/g, '').slice(0, 6) || null;
        // Sulekha puts 110037 on Delhi listings whose address is only a locality — not a real pincode.
        if (pin === '110037' && /sulekha/i.test(r.source_name || r.source_url || '') && !String(r.address || '').includes('110037')) return null;
        return pin;
      })(),
      services: [...new Set((r.services || []).filter((x) => SERVICES.has(x)))],
      rates: (r.rates || [])
        .map((x) => ({ item: s(x.item), price: Number(x.price), price_max: x.price_max ? Number(x.price_max) : null, unit: s(x.unit) || null }))
        .filter((x) => x.item && Number.isFinite(x.price) && x.price > 0),
      website: s(r.website),
      google_maps_url: s(r.google_maps_url),
      rating: Number.isFinite(Number(r.rating)) && Number(r.rating) > 0 && Number(r.rating) <= 5 ? Number(r.rating) : null,
      established: s(String(r.established ?? '')),
      description: s(r.description),
      source_name: s(r.source_name),
      source_url: s(r.source_url),
    };
    if (!v.services.length) v.services = ['Flex boards'].filter(() => /flex/i.test(`${v.name} ${v.description}`));
    const key = `${normName(v.name)}|${v.city.toLowerCase()}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, { ...v, dedupe_key: key });
    else mergeInto(prev, v);
  }
}

function mergeInto(prev, v) {
  prev.phones = [...new Set([...prev.phones, ...v.phones])];
  prev.services = [...new Set([...prev.services, ...v.services])];
  prev.rates = [...prev.rates, ...v.rates.filter((x) => !prev.rates.some((y) => y.item === x.item && y.price === x.price))];
  for (const k of ['address', 'area', 'pincode', 'website', 'google_maps_url', 'rating', 'established', 'description'])
    if (!prev[k] || (k === 'address' && v[k] && v[k].length > prev[k].length)) prev[k] = v[k] || prev[k];
  if (v.source_name && prev.source_name && !prev.source_name.includes(v.source_name)) prev.source_name += ` + ${v.source_name}`;
}

// Same shop listed under slightly different names on different sites: merge when two
// vendors in one city share a real mobile number (not a directory forwarding line).
const realMobile = (p) => {
  const d = p.replace(/\D/g, '');
  return /^91[6-9]\d{9}$/.test(d) && !/^91(804[1-9]|794[2-9]|8069)/.test(d) ? d : null;
};
const byPhone = new Map();
let phoneMerges = 0;
for (const [key, v] of merged) {
  const owner = v.phones.map(realMobile).filter(Boolean).map((d) => byPhone.get(`${d}|${v.city}`)).find(Boolean);
  if (owner && owner !== v) {
    mergeInto(owner, v);
    merged.delete(key);
    phoneMerges += 1;
    continue;
  }
  for (const d of v.phones.map(realMobile).filter(Boolean)) byPhone.set(`${d}|${v.city}`, v);
}

const vendors = [...merged.values()];
console.log(`Read ${rawCount} rows from ${files.length} files → ${vendors.length} unique vendors (${phoneMerges} merged by shared mobile number)`);

let i = 0;
for (const v of vendors) {
  const loc = await locate(v);
  v.latitude = loc.lat;
  v.longitude = loc.lng;
  v.location_precision = loc.precision;
  if (++i % 50 === 0) console.log(`  located ${i}/${vendors.length}`);
}
fs.writeFileSync(CACHE, JSON.stringify(cache));
fs.writeFileSync(OUT, JSON.stringify(vendors, null, 1));

const tally = (fn) => vendors.filter(fn).length;
console.log(
  `Phones: ${tally((v) => v.phones.length)} · rates: ${tally((v) => v.rates.length)} · pins exact/area/city: ` +
    `${tally((v) => v.location_precision === 'exact')}/${tally((v) => v.location_precision === 'area')}/${tally((v) => v.location_precision === 'city')}`
);
if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '));
console.log(`Wrote ${path.relative(ROOT, OUT)}`);

if (DRY) process.exit(0);

// ── upload ──────────────────────────────────────────────────────────────────
const envFile = path.join(ROOT, 'scripts', '.env');
const env = Object.fromEntries(
  (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in scripts/.env');
  process.exit(1);
}

let sent = 0;
for (let k = 0; k < vendors.length; k += 200) {
  const batch = vendors.slice(k, k + 200);
  const res = await fetch(`${URL_}/rest/v1/hub_vendors?on_conflict=dedupe_key`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: `resolution=${UPDATE ? 'merge' : 'ignore'}-duplicates,return=minimal`,
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    console.error(`Upload failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  sent += batch.length;
}
console.log(
  UPDATE
    ? `Uploaded ${sent} vendors (existing rows refreshed; stars and notes kept).`
    : `Uploaded ${sent} vendors (rows already in the dashboard were left untouched).`
);
