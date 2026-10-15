#!/usr/bin/env node
/**
 * Daily refresh for the Expos section.
 *
 *   node scripts/refresh-events.mjs --dry   # collect → data/events/events.json only
 *   node scripts/refresh-events.mjs         # …and upsert venues + events into Supabase
 *
 * Sources
 *   • EventsEye (eventseye.com) country listings for India and the UAE + each event's detail page:
 *     name, description, dates, cycle, city, venue (+address), industries, audience, organisers, event website.
 *   • The event's own website: visitor / exhibitor numbers the organiser claims ("25,000+ visitors"),
 *     stored with the sentence they came from.
 *   • data/venues/venues.json: the curated list of expo centres (address, pin, area, calendar).
 *
 * Team fields (status, notes, starred, team footfall) are never sent, so the daily run can't
 * overwrite them. Events that disappear from the source are kept (past editions stay for reference).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'events');
const CACHE = path.join(DIR, 'cache');
const OUT = path.join(DIR, 'events.json');
const VENUES = path.join(ROOT, 'data', 'venues', 'venues.json');
const GEO_CACHE = path.join(ROOT, 'data', 'geocode-cache.json');
const DRY = process.argv.includes('--dry');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const EE = 'https://www.eventseye.com/fairs/';
const COUNTRIES = [
  { country: 'India', list: 'c1_trade-shows_india' },
  { country: 'UAE', list: 'c1_trade-shows_uae-united-arab-emirates' },
];
const DETAIL_MAX_AGE_DAYS = 14; // re-read event pages at most every 2 weeks
const SITE_MAX_AGE_DAYS = 30; // re-read event websites for footfall monthly

fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fetching with a file cache ───────────────────────────────────────────────
let lastHit = {};
const fixUrl = (u) => {
  if (!u) return null;
  const t = String(u).trim();
  if (!t || /\s/.test(t)) return null;
  const full = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  try { return new URL(full).href; } catch { return null; }
};
async function get(rawUrl, { maxAgeDays = 0, minGapMs = 1200, timeout = 25000, validate = null } = {}) {
  const url = fixUrl(rawUrl);
  if (!url) return null;
  const file = path.join(CACHE, crypto.createHash('md5').update(url).digest('hex') + '.html');
  if (maxAgeDays && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < maxAgeDays * 864e5) {
    const cached = fs.readFileSync(file, 'utf8');
    if (!validate || validate(cached)) return cached;
  }
  const host = new URL(url).host;
  const wait = minGapMs - (Date.now() - (lastHit[host] || 0));
  if (wait > 0) await sleep(wait);
  lastHit[host] = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (validate && !validate(html)) throw new Error('blocked or incomplete page');
      fs.writeFileSync(file, html);
      return html;
    } catch (e) {
      if (attempt === 2) return null;
      await sleep(4000 * (attempt + 1));
    }
  }
  return null;
}

const decode = (raw = '') =>
  String(raw ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const text = (s = '') => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|And|For|The|In|On|At|&)\b/g, (m) => m.toLowerCase()).replace(/^./, (m) => m.toUpperCase()) : s);

// ── 1. listing pages ────────────────────────────────────────────────────────
function parseListing(html, country) {
  const rows = [];
  const body = html.slice(html.indexOf('<table class="tradeshows"'));
  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const ev = tr.match(/href="(f-[^"]+-(\d+)-\d+\.html)"><b>([\s\S]*?)<\/b>(?:<i>([\s\S]*?)<\/i>)?/);
    if (!ev) continue;
    const tds = tr.match(/<td>([\s\S]*?)<\/td>/g) || [];
    const cycle = text(tds[1] || '');
    const city = (tds[2] || '').match(/cy1_[^"]+">([^<]+)</)?.[1];
    const venue = (tds[2] || '').match(/href="(pl1_[^"]+_(\d+)\.html)">([^<]+)</);
    const cell = text(tds[3] || '');
    const date = cell.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const days = Number(cell.match(/(\d+)\s*days?/)?.[1] || 1);
    let start;
    let end;
    if (date) {
      start = `${date[3]}-${date[1]}-${date[2]}`;
      end = new Date(Date.parse(start) + (days - 1) * 864e5).toISOString().slice(0, 10);
    } else {
      // Only a tentative month, e.g. "Feb. 2027 (?)" — keep it, flagged by end_date = null.
      const m = cell.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i);
      if (!m) continue;
      const mi = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].toLowerCase().slice(0, 3)) / 3 + 1;
      start = `${m[2]}-${String(mi).padStart(2, '0')}-01`;
      end = null;
    }
    rows.push({
      ee_id: ev[2],
      detail_url: EE + ev[1],
      name: titleCase(decode(ev[3]).trim()),
      description: ev[4] ? decode(ev[4]).trim() : null,
      cycle: cycle && cycle !== 'unknown' ? cycle : null,
      country,
      city: city ? decode(city).trim() : null,
      venue_name: venue ? decode(venue[3]).trim() : null,
      ee_venue_id: venue?.[2] || null,
      start_date: start,
      end_date: end,
    });
  }
  return rows;
}

async function collectListings() {
  const all = [];
  for (const { country, list } of COUNTRIES) {
    const first = await get(`${EE}${list}.html`, { maxAgeDays: 0, validate: (h) => h.includes('class="tradeshows"') });
    if (!first) throw new Error(`EventsEye listing for ${country} is unreachable — try again later`);
    const total = Number(first.match(/<caption>(\d+) Trade Shows/)?.[1] || 0);
    const pages = Math.max(1, Math.ceil(total / 50));
    const rows = parseListing(first, country);
    for (let page = 1; page < pages; page += 1) {
      let html = null;
      for (let attempt = 0; attempt < 4 && !html; attempt += 1) {
        html = await get(`${EE}${list}_${page}.html`, { maxAgeDays: 0, minGapMs: 2500, validate: (h) => h.includes('class="tradeshows"') });
        if (!html || !html.includes('class="tradeshows"')) {
          html = null;
          await sleep(15000 * (attempt + 1)); // rate-limited — wait and retry
        }
      }
      if (html) rows.push(...parseListing(html, country));
      else console.log(`  ! ${country} page ${page + 1}/${pages} unavailable today`);
    }
    all.push(...rows);
    console.log(`  ${country}: ${rows.length} of ${total} listed`);
  }
  return all;
}

// ── 2. detail pages ─────────────────────────────────────────────────────────
function parseDetail(html) {
  const sec = (cls) => html.match(new RegExp(`<div class="${cls}"[^>]*>([\\s\\S]*?)</div>`))?.[1] || '';
  const industries = [...sec('industries').matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => decode(m[1]).trim());
  const audience = text(sec('audience')).replace(/^Audience\s*/i, '');
  const website = html.match(/title="Go to [^"]* website" href="([^"]+)"/)?.[1] || null;
  const venueBlock = html.match(/<div class="venue">([\s\S]*?)<div class="links">/)?.[1] || '';
  const venueText = venueBlock.match(/<div class="text">([\s\S]*?)<a class="countrylink"/)?.[1] || '';
  const venueLines = text(venueText).split('\n').map((l) => l.trim()).filter(Boolean);
  const venuePhone = text(venueBlock.match(/<div class="ev-phone"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '') || null;
  const venueSite = venueBlock.match(/href="([^"]+)"[^>]*class="ev-web"/)?.[1] || null;
  const orgs = [...html.matchAll(/<div class="org">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)].map((m) => {
    const b = m[1];
    return {
      name: decode(b.match(/class="orglink"[^>]*>([^<]+)</)?.[1] || '').trim(),
      phone: text(b.match(/<div class="ev-phone"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '') || null,
      website: b.match(/class="ev-web" href="([^"]+)"/)?.[1] || null,
    };
  }).filter((o) => o.name);
  return {
    industries,
    audience: /trade/i.test(audience) && /public/i.test(audience) ? 'B2B + B2C' : /trade/i.test(audience) ? 'B2B' : /public/i.test(audience) ? 'B2C' : null,
    website,
    venue_address: venueLines.slice(1).join(', ') || null,
    venue_phone: venuePhone,
    venue_website: venueSite,
    organisers: orgs,
  };
}

// ── 3. footfall claims from the event's own website ─────────────────────────
const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(lakhs?|lacs?|k|thousand)?\s*\+?`;
const VISITOR_RE = new RegExp(
  `${NUM}\\s*(?:plus\\s+)?(?:[A-Za-z&-]+\\s+){0,3}?(visitors|footfalls?|attendees|buyers|delegates|visitations)`,
  'gi'
);
// "Footfall: 12,000" / "visitors of over 25,000" — label first, only with a clear separator.
const FOOTFALL_RE = new RegExp(`(?:footfall|visitors)\\s*(?::|-|of|of over|of more than|of around|of about)\\s*(?:over|more than|around|about|nearly|upto|up to)?\\s*${NUM}`, 'gi');
// Portfolio-wide or cumulative claims ("10 editions … 4,25,000 visitors", "our events annually").
const CUMULATIVE_RE = /(website|online|page ?views|monthly|per month|subscribers|followers|newsletter|social media|impressions|readers|editions?|our (events|exhibitions|shows)|events annually|across (all|our)|till date|to date|so far|over the years|since \d{4}|in total|cumulative|portfolio)/i;
const EXHIB_RE = new RegExp(`${NUM}\\s*(?:plus\\s+)?(?:\\w+\\s+)?(exhibitors|exhibiting companies|brands)`, 'gi');
const toNum = (n, unit) => {
  let v = parseFloat(String(n).replace(/,/g, ''));
  if (/lakh|lac/i.test(unit || '')) v *= 1e5;
  else if (/^(k|thousand)$/i.test(unit || '')) v *= 1e3;
  return Math.round(v);
};

function footfallFrom(html) {
  if (!html) return null;
  const t = text(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')).replace(/\n/g, ' ');
  const hits = [];
  for (const re of [VISITOR_RE, FOOTFALL_RE]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const v = toNum(m[1], m[2]);
      // skip years ("2024 visitors") and pincodes ("Bengaluru 560001 … Visitors")
      if (v >= 300 && v <= 3e6 && !/^(19|20)\d\d$/.test(m[1]) && !(/^\d{6}$/.test(m[1]) && v % 1000 !== 0)) {
        const i = m.index;
        const from = Math.max(0, i - 60);
        const to = i + m[0].length + 40;
        let snippet = t.slice(from, to).trim();
        if (from > 0) snippet = snippet.replace(/^\S*\s+/, ''); // start and end on whole words
        if (to < t.length) snippet = snippet.replace(/\s+\S*$/, '');
        if (!CUMULATIVE_RE.test(snippet)) hits.push({ v, snippet });
      }
    }
  }
  let exhibitors = null;
  EXHIB_RE.lastIndex = 0;
  for (const m of t.matchAll(EXHIB_RE)) {
    const v = toNum(m[1], m[2]);
    if (v >= 10 && v <= 20000 && !/^(19|20)\d\d$/.test(m[1])) exhibitors = Math.max(exhibitors || 0, v);
  }
  if (!hits.length) return exhibitors ? { exhibitors } : null;
  hits.sort((a, b) => b.v - a.v); // headline figure is usually the biggest
  return { footfall: hits[0].v, footfall_text: hits[0].snippet.slice(0, 220), exhibitors };
}

// ── 4. niche tags (Vyapar's buyers are small-business owners) ───────────────
const NICHES = [
  ['Retail & FMCG', /\b(retail\w*|fmcg|supermarkets?|kirana|grocer\w*|consumer goods|private label|modern trade|hypermarkets?)\b/i],
  ['Pharma & healthcare', /\b(pharma\w*|healthcare|medical (devices?|equipment)|hospitals?|ayush|ayurved\w*|dental|drugs?|chemists?|diagnostics?|nutraceuticals?|homeopath\w*)\b/i],
  ['Hardware & building materials', /\b(building materials?|construction|hardware|tiles?|ceramics?|sanitary|plumbing|paints?|cement|architect\w*|interiors?|marble|granite|roofing|bathroom)/i],
  ['Electricals & electronics', /\b(electricals?|electronics?|led\b|lighting|solar|cables?|wires?|appliances?|renewable|batter(y|ies)|semiconductor)/i],
  ['Mobile, IT & tech', /\b(mobile|telecom|smartphone|computers?|software|saas|gitex|cyber|e-?commerce|fintech|information technology|\bai\b|artificial intelligence|data cent)/i],
  ['Textiles, apparel & footwear', /\b(textiles?|garments?|apparel|fashion|fabrics?|yarn|sarees?|footwear|leather|handloom|hosiery|knit\w*|denim|ethnic wear|clothing)/i],
  ['Jewellery', /\b(jewel\w*|gems?|gold|diamonds?|silver|bullion)\b/i],
  ['Auto & auto parts', /\b(automobiles?|automotive|auto ?parts|auto expo|tyres?|tires?|two.wheelers?|electric vehicles?|\bev\b|motor show|cars?)\b/i],
  ['Food, beverage & HoReCa', /\b(food|beverages?|dairy|bakery|horeca|hospitality|restaurants?|spices?|tea|coffee|grains?|rice|sweets|confectionery|catering|snacks?)\b/i],
  ['Furniture & home décor', /\b(furniture|home d[eé]cor|d[eé]cor|furnishings?|housewares?|kitchenware|mattress\w*|carpets?|rugs)\b/i],
  ['Gifts, stationery & toys', /\b(gifts?|gifting|stationery|toys?|handicrafts?|novelt\w*|promotional products)\b/i],
  ['Agriculture & agri-inputs', /\b(agri\w*|farm\w*|tractors?|poultry|seeds?|fertili[sz]ers?|horticulture|irrigation|livestock|aqua\w*|fisheries)\b/i],
  ['Manufacturing, machinery & packaging', /\b(machine\w*|engineering|industrial|plastics?|packaging|printing|manufactur\w*|automation|machine tools?|fabrication|metals?|foundr\w*|castings?|welding|pumps?|valves?|compressors?|chemicals?|rubber)\b/i],
  ['MSME, franchise & business', /\b(msme|smes?|franchis\w*|startups?|entrepreneur\w*|business expo|international trade fair|trade fair)\b/i],
  ['Beauty & personal care', /\b(beauty|cosmetics?|salons?|spa|hair|skin ?care|personal care|perfumes?|fragrances?)\b/i],
  ['Weddings & consumer shows', /\b(wedding|bridal|exhibition.?cum.?sale|lifestyle exhibition|shopping festival|consumer show)/i],
  ['Real estate', /\b(property|real estate|realty|housing|homebuyers?)\b/i],
  ['Education & careers', /\b(education|universit\w*|schools?|careers?|study abroad|edtech|masters programmes?)\b/i],
  ['Logistics & transport', /\b(logistics?|warehous\w*|supply chain|cold chain|freight|shipping|cargo)\b/i],
  ['Travel & tourism', /\b(travel|tourism|tourist)\b/i],
];
const nichesFor = (e) => {
  const hay = `${e.name} ${e.description || ''} ${(e.industries || []).join(' ')}`;
  return NICHES.filter(([, re]) => re.test(hay)).map(([n]) => n);
};

// ── 5. venues ───────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|centre|center|ltd|limited)\b/g, ' ').replace(/\s+/g, ' ').trim();
const venues = fs.existsSync(VENUES) ? JSON.parse(fs.readFileSync(VENUES, 'utf8')) : [];
function matchVenue(e) {
  const vn = norm(e.venue_name);
  if (!vn) return null;
  const cands = venues.filter((v) => v.country === e.country);
  const names = (v) => [v.name, ...(v.aliases || [])].map(norm).filter(Boolean);
  return (
    cands.find((v) => names(v).some((n) => n === vn)) ||
    cands.find((v) => names(v).some((n) => n.length > 5 && (vn.includes(n) || n.includes(vn)))) ||
    null
  );
}

const geo = fs.existsSync(GEO_CACHE) ? JSON.parse(fs.readFileSync(GEO_CACHE, 'utf8')) : {};
async function geocode(q, country) {
  const key = JSON.stringify({ q, country });
  if (key in geo) return geo[key];
  await sleep(1100);
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q, format: 'jsonv2', limit: '1', countrycodes: country === 'UAE' ? 'ae' : 'in' });
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'VyaparMarketingHub/1.0 (internal events directory)' } });
    if (!res.ok) return null;
    const [hit] = await res.json();
    geo[key] = hit ? { lat: +hit.lat, lng: +hit.lon } : null;
  } catch {
    return null;
  }
  return geo[key];
}

// Indian states for the cities that show up most; others are left blank.
const STATE = {
  Delhi: 'Delhi', 'New Delhi': 'Delhi', 'Greater Noida': 'Uttar Pradesh', Noida: 'Uttar Pradesh', Gurgaon: 'Haryana', Gurugram: 'Haryana',
  Mumbai: 'Maharashtra', 'Navi Mumbai': 'Maharashtra', Pune: 'Maharashtra', Nagpur: 'Maharashtra', Nashik: 'Maharashtra', Aurangabad: 'Maharashtra',
  Bangalore: 'Karnataka', Bengaluru: 'Karnataka', Mysore: 'Karnataka', Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu', Madurai: 'Tamil Nadu',
  Hyderabad: 'Telangana', Kolkata: 'West Bengal', Ahmedabad: 'Gujarat', Gandhinagar: 'Gujarat', Surat: 'Gujarat', Vadodara: 'Gujarat', Rajkot: 'Gujarat',
  Jaipur: 'Rajasthan', Jodhpur: 'Rajasthan', Udaipur: 'Rajasthan', Lucknow: 'Uttar Pradesh', Kanpur: 'Uttar Pradesh', Varanasi: 'Uttar Pradesh', Agra: 'Uttar Pradesh',
  Indore: 'Madhya Pradesh', Bhopal: 'Madhya Pradesh', Raipur: 'Chhattisgarh', Ludhiana: 'Punjab', Amritsar: 'Punjab', Chandigarh: 'Chandigarh',
  Kochi: 'Kerala', Cochin: 'Kerala', Thiruvananthapuram: 'Kerala', Patna: 'Bihar', Bhubaneswar: 'Odisha', Guwahati: 'Assam', Goa: 'Goa', Panaji: 'Goa',
  Visakhapatnam: 'Andhra Pradesh', Vijayawada: 'Andhra Pradesh', Dehradun: 'Uttarakhand', Ranchi: 'Jharkhand',
  Dubai: 'Dubai', 'Abu Dhabi': 'Abu Dhabi', Sharjah: 'Sharjah', 'Al Ain': 'Abu Dhabi', Ajman: 'Ajman', 'Ras Al Khaimah': 'Ras Al Khaimah',
};
const CITY_ALIAS = { Bangalore: 'Bengaluru', Gurgaon: 'Gurugram', Cochin: 'Kochi', Mysore: 'Mysuru', 'New Delhi': 'Delhi', Trivandrum: 'Thiruvananthapuram', Baroda: 'Vadodara' };

// ── 6. TradeIndia (India) ───────────────────────────────────────────────────
const TI = 'https://www.tradeindia.com';
const nextData = (html) => {
  const m = html && html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};
function* walkObj(o) {
  if (Array.isArray(o)) for (const v of o) yield* walkObj(v);
  else if (o && typeof o === 'object') { yield o; for (const v of Object.values(o)) yield* walkObj(v); }
}
const tiListValid = (h) => /"fair_name"/.test(h || '');
async function tiPage(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : TI + pathOrUrl;
  const html = await get(url, { maxAgeDays: 0.5, minGapMs: 2500, validate: tiListValid });
  const d = nextData(html);
  if (!d) return { fairs: [], data: null };
  const fairs = [];
  for (const o of walkObj(d)) if (o.fair_id && o.fair_name && (o.fair_date || o.date)) fairs.push(o);
  return { fairs, data: d };
}
const totalOf = (d) => Number(JSON.stringify(d || {}).match(/"total_count":\s*(\d+)/)?.[1] || 0);

async function collectTradeIndia() {
  const found = new Map();
  const add = (list) => list.forEach((f) => found.set(String(f.fair_id), { ...found.get(String(f.fair_id)), ...f }));
  const home = await tiPage('/tradeshows/country/india/');
  if (!home.data) { console.log('  TradeIndia unreachable today — skipped'); return []; }
  add(home.fairs);
  const listing = [...walkObj(home.data)].find((o) => o.filter_by_months && o.popular_cities) || {};
  const months = (listing.filter_by_months?.calendar_months || []).map((m) => m.url.replace(/\/$/, '').split('/').slice(-2).join('/'));
  const total = totalOf(home.data);
  for (const m of months) add((await tiPage(`/tradeshows/country/india/${m}`)).fairs);
  for (const c of listing.popular_cities || []) {
    const base = c.city_url.replace(/\/$/, '');
    const page = await tiPage(base);
    add(page.fairs);
    if (totalOf(page.data) > 30) for (const m of months) add((await tiPage(`${base}/${m}`)).fairs);
  }
  // Categories catch events in smaller cities.
  const cats = new Set();
  for (const o of walkObj(home.data)) if (o.category_url && /\/tradeshows\/[a-z0-9-]+\/?$/.test(o.category_url)) cats.add(o.category_url);
  for (const u of cats) add((await tiPage(u)).fairs);
  const india = [...found.values()].filter((f) => !f.country || /india/i.test(f.country) || /india/i.test(f.country_name || ''));
  console.log(`  TradeIndia: ${india.length} of ${total} listed`);

  const out = [];
  let k = 0;
  for (const f of india) {
    const url = String(f.fair_url || `${TI}/tradeshows/${f.fair_id}/`).replace('://wwww.', '://www.');
    const html = await get(url, { maxAgeDays: DETAIL_MAX_AGE_DAYS, minGapMs: 2500, validate: (h) => /profile_details_res/.test(h) });
    const p = [...walkObj(nextData(html) || {})].find((o) => 'expected_visitor_count' in o) || {};
    if (p.fair_country && !/india/i.test(p.fair_country)) continue; // category pages include shows abroad
    const desc = text(p.fair_description || f.fair_desc || '').replace(/\s+/g, ' ').trim();
    const site = [f.website, p.fair_website].find((w) => w && !/tradeindia\.com/.test(w)) || null;
    const ev = {
      ti_id: String(f.fair_id),
      name: decode(String(p.fair_name || f.fair_name)).replace(/\s+(19|20)\d\d\s*$/, '').trim(),
      description: desc ? desc.slice(0, 600) : null,
      country: 'India',
      city: CITY_ALIAS[p.fair_city || f.city] || p.fair_city || f.city || null,
      state: p.fair_state || null,
      venue_name: decode(p.fair_venue || f.venue || '') || null,
      start_date: p.s_date || null,
      end_date: p.e_date || p.s_date || null,
      industries: [...new Set([...(f.fair_categories || []).map((c) => c.category_name), ...(f.keyword || []).map((x) => x.trim())].filter(Boolean))],
      website: site,
      organisers: p.organizer_name ? [{ name: decode(p.organizer_name), phone: null, website: null }] : [],
      ti_url: url,
    };
    if (!ev.start_date) {
      const m = String(f.fair_date || '').match(/(\d{1,2}) (\w{3}),? (\d{4})/);
      if (m) ev.start_date = new Date(`${m[2]} ${m[1]}, ${m[3]} 12:00 UTC`).toISOString().slice(0, 10);
      ev.end_date = ev.start_date;
    }
    if (!ev.start_date) continue;
    const vis = Number(String(p.expected_visitor_count || '').replace(/[^\d]/g, ''));
    const exh = Number(String(p.expected_exhibitor_count || '').replace(/[^\d]/g, ''));
    if (vis >= 300) Object.assign(ev, { footfall: vis, footfall_text: `Expected visitors: ${p.expected_visitor_count} (organiser, on TradeIndia)`, footfall_source: 'TradeIndia (organiser estimate)', footfall_source_url: url });
    else {
      const ff = footfallFrom(desc);
      if (ff?.footfall) Object.assign(ev, { footfall: ff.footfall, footfall_text: ff.footfall_text, footfall_source: 'TradeIndia listing (organiser description)', footfall_source_url: url });
      if (ff?.exhibitors) ev.exhibitors = ff.exhibitors;
    }
    if (exh >= 10) ev.exhibitors = exh;
    ev.niches = nichesFor(ev);
    out.push(ev);
    if (++k % 100 === 0) console.log(`  TradeIndia details ${k}/${india.length}`);
  }
  return out;
}

// Same show listed on both sites? Same city, start within 3 days, similar name.
const nameTokens = (n) => new Set(String(n).toLowerCase().replace(/\b(19|20)\d\d\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !['the', 'and', 'of', 'expo', 'exhibition', 'india', 'international', 'show', 'fair', 'trade'].includes(w)));
function sameEvent(a, b) {
  if (a.country !== b.country) return false;
  if (norm(a.city) !== norm(b.city)) return false;
  if (!a.start_date || !b.start_date) return false;
  const monthOnly = !a.end_date || !b.end_date; // EventsEye sometimes knows only the month
  if (monthOnly ? a.start_date.slice(0, 7) !== b.start_date.slice(0, 7) : Math.abs(Date.parse(a.start_date) - Date.parse(b.start_date)) > 3 * 864e5) return false;
  const x = nameTokens(a.name), y = nameTokens(b.name);
  if (!x.size || !y.size) return norm(a.name) === norm(b.name);
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / Math.min(x.size, y.size) >= 0.6;
}

// ── 7. Dubai World Trade Centre (its own events database) ───────────────────
const DWTC = 'https://www.dwtc.com';
const DWTC_AUDIENCE = { 'Trade Only': 'B2B', Corporate: 'B2B', 'Trade and Public': 'B2B + B2C', Public: 'B2C' };
async function collectDWTC() {
  const pd = await get(`${DWTC}/page-data/en/events/page-data.json`, { maxAgeDays: 0.5, validate: (h) => /staticQueryHashes/.test(h) });
  if (!pd) { console.log('  DWTC unreachable today — skipped'); return []; }
  let items = [];
  for (const hash of JSON.parse(pd).staticQueryHashes || []) {
    const sq = await get(`${DWTC}/page-data/sq/d/${hash}.json`, { maxAgeDays: 0.5 });
    if (sq && sq.includes('"allEvent"')) { items = JSON.parse(sq).data?.umbraco?.allEvent?.items || []; break; }
  }
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const t0 = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const it of items) {
    const start = (it.startDate || '').slice(0, 10);
    const end = (it.endDate || it.startDate || '').slice(0, 10);
    if (!start || end < since) continue;
    let det = {};
    if (end >= t0 && it.url) {
      const raw = await get(`${DWTC}/page-data${it.url.replace(/\/?$/, '/')}page-data.json`, { maxAgeDays: DETAIL_MAX_AGE_DAYS, minGapMs: 800, validate: (h) => /"websiteURL"|"pageContent"/.test(h) });
      if (raw) det = [...walkObj(JSON.parse(raw))].find((o) => 'websiteURL' in o || 'pageContent' in o) || {};
    }
    const desc = text(det.pageContent || det.metadataDescription || '').replace(/\s+/g, ' ').trim();
    const ev = {
      name: decode(it.title).trim(),
      description: desc ? desc.slice(0, 600) : null,
      country: 'UAE', city: 'Dubai', state: 'Dubai',
      venue_name: 'Dubai World Trade Centre',
      start_date: start, end_date: end,
      industries: [...(it.eventSectors || []), ...(it.eventType || [])],
      audience: DWTC_AUDIENCE[it.eventAudiences] || null,
      website: fixUrl(det.websiteURL),
      organisers: det.eventOrganiser ? [{ name: det.eventOrganiser, phone: null, website: null }] : [],
      dwtc_url: `${DWTC}${it.url || ''}`,
      dwtc_id: it.id,
    };
    const ff = footfallFrom(desc);
    if (ff?.footfall) Object.assign(ev, { footfall: ff.footfall, footfall_text: ff.footfall_text, footfall_source: 'DWTC event page (organiser figure)', footfall_source_url: ev.dwtc_url });
    if (ff?.exhibitors) ev.exhibitors = ff.exhibitors;
    ev.niches = nichesFor(ev);
    out.push(ev);
  }
  console.log(`  DWTC: ${out.length} events (past year + upcoming)`);
  return out;
}

// Dubai World Central (DWC, Dubai South) hosts the Dubai Airshow and MEBAA — directories
// often file them under DWTC, so put them at the right venue.
const DWC_RE = /\b(dubai airshow|mebaa)\b/i;

// ── run ─────────────────────────────────────────────────────────────────────
// Last run's results: keep a footfall figure if the event's website is down today.
const previous = Object.fromEntries(
  (fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : []).map((e) => [e.dedupe_key, e])
);

console.log('Reading EventsEye listings…');
const listed = await collectListings();
const seen = new Set();
const events = [];
// Pass 1 — EventsEye detail pages, one at a time (polite to a single site).
let i = 0;
for (const row of listed) {
  const key = `ee:${row.ee_id}:${row.start_date.slice(0, 4)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const html = await get(row.detail_url, { maxAgeDays: DETAIL_MAX_AGE_DAYS, validate: (h) => h.includes('class="dates"') });
  const d = html ? parseDetail(html) : { industries: [], organisers: [] };
  const e = { ...row, ...d, dedupe_key: key };
  e.city = CITY_ALIAS[e.city] || e.city;
  e.state = STATE[e.city] || STATE[row.city] || null;
  e.niches = nichesFor(e);
  events.push(e);
  if (++i % 100 === 0) console.log(`  details ${i}/${listed.length}`);
}

// Pass 1b — TradeIndia: merge into EventsEye events where it's the same show, add the rest.
let tiAdded = 0, tiMerged = 0;
for (const t of await collectTradeIndia()) {
  const match = events.find((e) => sameEvent(e, t));
  if (match) {
    tiMerged += 1;
    for (const k of ['description', 'website', 'state', 'venue_name']) if (!match[k] && t[k]) match[k] = t[k];
    if (!match.organisers?.length && t.organisers.length) match.organisers = t.organisers;
    if (!match.footfall && t.footfall) for (const k of ['footfall', 'footfall_text', 'footfall_source', 'footfall_source_url']) match[k] = t[k];
    if (!match.exhibitors && t.exhibitors) match.exhibitors = t.exhibitors;
    match.industries = [...new Set([...(match.industries || []), ...t.industries])];
    match.niches = nichesFor(match);
    if (!match.end_date && t.end_date) Object.assign(match, { start_date: t.start_date, end_date: t.end_date }); // exact dates beat "month only"
    match.also_listed = t.ti_url;
  } else {
    tiAdded += 1;
    events.push({ ...t, dedupe_key: `ti:${t.ti_id}`, detail_url: t.ti_url, source_name: 'TradeIndia' });
  }
}
console.log(`  TradeIndia: ${tiMerged} matched EventsEye events, ${tiAdded} new`);

// Pass 1c — DWTC's own calendar: richest data for Dubai (organiser, website, audience).
let dwAdded = 0, dwMerged = 0;
for (const t of await collectDWTC()) {
  const match = events.find((e) => sameEvent(e, t));
  if (match) {
    dwMerged += 1;
    for (const k of ['description', 'website', 'audience']) if (t[k] && (!match[k] || k === 'audience')) match[k] = t[k];
    if (t.organisers.length && !match.organisers?.length) match.organisers = t.organisers;
    if (!match.footfall && t.footfall) for (const k of ['footfall', 'footfall_text', 'footfall_source', 'footfall_source_url']) match[k] = t[k];
    if (!match.exhibitors && t.exhibitors) match.exhibitors = t.exhibitors;
    if (!match.end_date) Object.assign(match, { start_date: t.start_date, end_date: t.end_date });
    match.industries = [...new Set([...(match.industries || []), ...t.industries])];
    match.niches = nichesFor(match);
  } else {
    dwAdded += 1;
    events.push({ ...t, dedupe_key: `dwtc:${t.dwtc_id}`, detail_url: t.dwtc_url, source_name: 'DWTC' });
  }
}
console.log(`  DWTC: ${dwMerged} matched existing events, ${dwAdded} new`);

for (const e of events) {
  if (e.country === 'UAE' && DWC_RE.test(e.name)) e.venue_name = 'Dubai Airshow Site';
  if (e.website) e.website = fixUrl(e.website);
}

// Pass 2 — footfall claims from each event's own website, 8 sites at a time.
async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}
await pool(events.filter((e) => e.website && !e.footfall), 8, async (e) => {
  const ff = footfallFrom(await get(e.website, { maxAgeDays: SITE_MAX_AGE_DAYS, minGapMs: 0, timeout: 12000 }));
  if (ff?.footfall) Object.assign(e, ff, { footfall_source: 'Event website (organiser claim)', footfall_source_url: e.website });
  else if (ff?.exhibitors) e.exhibitors = ff.exhibitors;
});

// A figure that several differently-named events share comes from an organiser's
// site rather than the event itself — don't present it as that event's footfall.
const byText = {};
for (const e of events) if (e.footfall_text) (byText[e.footfall_text] ||= new Set()).add(e.name.replace(/\s*[-–].*$/, '').toLowerCase());
for (const e of events) {
  if (e.footfall_text && byText[e.footfall_text].size > 1) {
    for (const k of ['footfall', 'footfall_text', 'footfall_source', 'footfall_source_url']) delete e[k];
    e.organiser_wide_claim = true;
  }
}

// Pass 3 — keep last known footfall, link venues, place on the map.
for (const e of events) {
  const prev = previous[e.dedupe_key];
  // website down today → reuse last known figure, re-checked with today's rules
  const again = !e.footfall && !e.organiser_wide_claim && prev?.footfall_text ? footfallFrom(prev.footfall_text) : null;
  if (again?.footfall) Object.assign(e, { footfall: again.footfall, footfall_text: prev.footfall_text, footfall_source: prev.footfall_source, footfall_source_url: prev.footfall_source_url });
  if (!e.exhibitors && prev?.exhibitors) e.exhibitors = prev.exhibitors;
  const v = matchVenue(e);
  if (v) {
    e.venue_key = v.dedupe_key || `${norm(v.name)}|${norm(v.city)}`;
    e.latitude = v.latitude ?? null;
    e.longitude = v.longitude ?? null;
  }
  if (e.latitude == null && e.venue_name) {
    const g = (await geocode(`${e.venue_name}, ${e.city}`, e.country)) || (await geocode(`${e.city}`, e.country));
    if (g) Object.assign(e, { latitude: g.lat, longitude: g.lng });
  }
}
fs.writeFileSync(GEO_CACHE, JSON.stringify(geo));
fs.writeFileSync(OUT, JSON.stringify(events, null, 1));
const n = (f) => events.filter(f).length;
console.log(
  `Events: ${events.length} (India ${n((e) => e.country === 'India')}, UAE ${n((e) => e.country === 'UAE')}) · ` +
    `with footfall ${n((e) => e.footfall)} · 10k+ ${n((e) => e.footfall >= 10000)} · linked to a venue ${n((e) => e.venue_key)} · with niches ${n((e) => e.niches.length)}`
);
if (DRY) process.exit(0);

// ── upload ──────────────────────────────────────────────────────────────────
const envFile = path.join(ROOT, 'scripts', '.env');
const env = Object.fromEntries(
  (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '').split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]])
);
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function upsert(table, rows, conflict) {
  for (let k = 0; k < rows.length; k += 200) {
    const res = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(k, k + 200)),
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  }
}

// venues (curated list; source fields only)
const venueRows = venues.map((v) => ({
  name: v.name, aliases: v.aliases || [], country: v.country, city: CITY_ALIAS[v.city] || v.city, state: v.state || null,
  address: v.address || null, latitude: v.latitude ?? null, longitude: v.longitude ?? null, google_maps_url: v.google_maps_url || null,
  website: v.website || null, events_calendar_url: v.events_calendar_url || null, exhibition_area_sqm: v.exhibition_area_sqm ?? null,
  halls: v.halls ?? null, capacity_note: v.capacity_note || null, phone: v.phone || null, type: v.type || null,
  source_url: v.source_url || null, notes: v.notes || null, dedupe_key: v.dedupe_key || `${norm(v.name)}|${norm(v.city)}`,
}));
if (venueRows.length) await upsert('hub_venues', venueRows, 'dedupe_key');
const vres = await fetch(`${URL_}/rest/v1/hub_venues?select=id,dedupe_key&limit=5000`, { headers: H });
const venueId = Object.fromEntries((await vres.json()).map((v) => [v.dedupe_key, v.id]));

const now = new Date().toISOString();
const eventRows = events.map((e) => ({
  name: e.name, description: e.description, country: e.country, city: e.city || 'Unknown', state: e.state,
  venue_id: e.venue_key ? venueId[e.venue_key] || null : null, venue_name: e.venue_name, venue_address: e.venue_address,
  latitude: e.latitude ?? null, longitude: e.longitude ?? null, start_date: e.start_date, end_date: e.end_date, cycle: e.cycle,
  niches: e.niches, industries: e.industries || [], audience: e.audience,
  footfall: e.footfall ?? null, footfall_text: e.footfall_text ?? null, footfall_source: e.footfall_source ?? null, footfall_source_url: e.footfall_source_url ?? null,
  exhibitors: e.exhibitors ?? null,
  organiser: (e.organisers || []).map((o) => o.name).join(' · ') || null,
  organiser_phone: (e.organisers || []).map((o) => o.phone).filter(Boolean).join(' · ') || null,
  organiser_website: (e.organisers || []).find((o) => o.website)?.website || null,
  website: e.website, source_name: e.source_name || (e.also_listed ? 'EventsEye + TradeIndia' : 'EventsEye'), source_url: e.detail_url, last_seen_at: now, dedupe_key: e.dedupe_key,
}));
// One row per key (a show can appear twice in a source listing).
// Every row must carry the same fields (missing ones become null), one row per key.
const uniqueRows = [...new Map(eventRows.map((r) => [r.dedupe_key, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === undefined ? null : v]))])).values()];
await upsert('hub_events', uniqueRows, 'dedupe_key');
console.log(`Uploaded ${venueRows.length} venues and ${uniqueRows.length} events (team status / notes untouched).`);
