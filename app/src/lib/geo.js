import { ROAD_FACTOR } from './constants';

const num = (s) => Number.parseFloat(s);
const valid = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Pull coordinates out of whatever someone pastes: "28.61, 77.20",
 * a full Google Maps URL (…/@28.61,77.20,17z, …!3d28.61!4d77.20, ?q=28.61,77.20).
 * Returns { lat, lng } or null.
 */
export function parseLatLng(text) {
  if (!text) return null;
  const t = decodeURIComponent(String(text).trim());
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // place pin — most precise, check first
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)\s*$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && valid(num(m[1]), num(m[2]))) return { lat: num(m[1]), lng: num(m[2]) };
  }
  return null;
}

export const isShortMapsLink = (text) => /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|share\.google/i.test(text || '');

/** "…/maps/place/POOJA+ELECTRONIC/@…" → "POOJA ELECTRONIC" */
export const placeFromUrl = (text) => {
  const m = decodeURIComponent(String(text || '')).match(/\/maps\/place\/([^/@?]+)/);
  return m ? m[1].replace(/\+/g, ' ').trim() : null;
};

/** Free geocoder (OpenStreetMap Nominatim). Limited to India. */
export async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', countrycodes: 'in', addressdetails: '1' });
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Location lookup is busy. Try again in a few seconds.');
  const [hit] = await res.json();
  if (!hit) return null;
  const a = hit.address || {};
  return {
    lat: num(hit.lat),
    lng: num(hit.lon),
    label: hit.display_name,
    city: a.city || a.town || a.state_district || a.county || null,
    state: a.state || null,
    area: a.suburb || a.neighbourhood || a.city_district || null,
    pincode: a.postcode || null,
  };
}

// Short Google Maps links are expanded by a small Supabase Edge Function
// (supabase/functions/resolve-maps-link), because browsers can't follow them.
const FUNCTIONS = (import.meta.env.VITE_SUPABASE_URL || 'https://kpwjhooqygwypdhgwtli.supabase.co') + '/functions/v1';
const PUBLISHABLE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_J0r2bcrRVW8d8iduj-21GA_xVzAw5F-';

const queryFromUrl = (url) => {
  try {
    const u = new URL(url);
    return u.searchParams.get('q') || u.searchParams.get('query') || null;
  } catch {
    return null;
  }
};
const shopName = (words) => words.split(',')[0].trim();

/**
 * Locate a free-text Indian address: try it whole, then the pincode, then the last parts
 * (area, city, state) — business names alone rarely geocode.
 */
export async function geocodeAddress(words) {
  const tries = [words];
  const pin = words.match(/\b[1-9]\d{5}\b/)?.[0];
  const parts = words.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length > 2) tries.push(parts.slice(1).join(', '));
  if (parts.length > 3) tries.push(parts.slice(-3).join(', '));
  for (const q of tries) {
    const g = await geocode(q).catch(() => null);
    if (g) return g;
  }
  if (pin) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ postalcode: pin, countrycodes: 'in', format: 'jsonv2', limit: '1' });
    const res = await fetch(url).catch(() => null);
    const [hit] = res?.ok ? await res.json() : [];
    if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon), label: `PIN ${pin}` };
  }
  return null;
}

export async function expandShortMapsLink(link) {
  const res = await fetch(`${FUNCTIONS}/resolve-maps-link?url=${encodeURIComponent(link.trim())}`, {
    headers: { apikey: PUBLISHABLE },
  });
  if (!res.ok) return null;
  return res.json(); // { url, name, lat, lng }
}

/** Resolve a pasted link / coordinates / address into a point. */
export async function resolveLocation(text) {
  const direct = parseLatLng(text);
  if (direct) return { ...direct, label: placeFromUrl(text) || 'Pinned location', precise: true };
  if (isShortMapsLink(text) || /google\.[a-z.]+\/maps|maps\.google\./i.test(text)) {
    const hit = isShortMapsLink(text) ? await expandShortMapsLink(text).catch(() => null) : { url: text, query: null, name: placeFromUrl(text) };
    if (hit?.lat != null) {
      const named = hit.name && !/°|^-?\d+\.\d+,/.test(hit.name); // Google names bare pins by their coordinates
      return { lat: hit.lat, lng: hit.lng, label: named ? hit.name : 'Shop from your Google Maps link', precise: true };
    }
    // No coordinates in the link: locate it from the address/place it carries.
    const words = hit?.query || hit?.name || queryFromUrl(hit?.url);
    if (words) {
      const name = shopName(words.split('||')[0]);
      // "…Car Painting Shop In Anjar" → Anjar
      const place = words.match(/\b(?:in|at|near)\s+([A-Z][\w .'-]{2,40})\s*$/i)?.[1];
      const g = (place && (await geocode(place).catch(() => null))) || (/,/.test(words) ? await geocodeAddress(words) : null);
      if (g) return { ...g, label: `${name} (approx. — ${place ? `in ${place}` : 'from the address in the link'})`, precise: false };
      // Only a shop name — ask where it is instead of failing.
      const err = new Error(`Where is ${name}?`);
      err.code = 'NEED_PLACE';
      err.shopName = name;
      throw err;
    }
    throw new Error('This link has no location or address in it. Open it in Google Maps, tap Share → Copy link again, or type the shop’s area and city.');
  }
  const hit = await geocode(text);
  if (!hit) throw new Error('Couldn’t find that place. Add the area and city, e.g. “Lajpat Nagar, Delhi”.');
  return { ...hit, precise: false };
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Road distances (km) and drive times (min) from origin to each destination via
 * the public OSRM router. Returns null if routing is unavailable, so callers can
 * fall back to straight-line × ROAD_FACTOR.
 */
export async function roadDistances(origin, dests) {
  if (!dests.length) return [];
  const coords = [origin, ...dests].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok') return null;
    return dests.map((_, i) => ({
      km: data.distances[0][i + 1] / 1000,
      min: data.durations[0][i + 1] / 60,
    }));
  } catch {
    return null;
  }
}

export const estimateRoadKm = (straightKm) => straightKm * ROAD_FACTOR;

export const mapsUrlFor = (v) => {
  if (v.google_maps_url) return v.google_maps_url;
  if (v.latitude != null && v.location_precision === 'exact')
    return `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`;
  const q = [v.name, v.address || v.area, v.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
};

export const directionsUrl = (from, v) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${encodeURIComponent(
    v.latitude != null && v.location_precision === 'exact'
      ? `${v.latitude},${v.longitude}`
      : [v.name, v.address || v.area, v.city].filter(Boolean).join(', ')
  )}`;

/** Vendors around a point, closest first (straight-line km). */
export function vendorsNear(vendors, point, { km: radius = 15, services = [], limit = 50 } = {}) {
  if (!point || point.lat == null) return [];
  return vendors
    .filter((v) => v.latitude != null && (!services.length || services.some((s) => v.services?.includes(s))))
    .map((v) => ({ v, km: haversineKm(point, { lat: v.latitude, lng: v.longitude }) }))
    .filter((x) => x.km <= radius)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
