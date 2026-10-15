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

export const isShortMapsLink = (text) => /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs/i.test(text || '');

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
  if (isShortMapsLink(text)) {
    const hit = await expandShortMapsLink(text).catch(() => null);
    if (hit?.lat != null) return { lat: hit.lat, lng: hit.lng, label: hit.name || 'Shop from Google Maps link', precise: true };
    if (hit?.name) {
      const g = await geocode(hit.name);
      if (g) return { ...g, label: hit.name, precise: false };
    }
    throw new Error('Couldn’t read that Google Maps link right now. Try again in a moment, or type the shop’s area and city.');
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
