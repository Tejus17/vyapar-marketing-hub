// Supabase Edge Function: resolve-maps-link
// Turns a short Google Maps link (maps.app.goo.gl/…, goo.gl/maps/…) into its full URL plus
// the place's coordinates and name, so the dashboard can find vendors near a shop.
// Only Google Maps links are followed — it can't be used to fetch anything else.

const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co', 'share.google'];
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)g\.co$|(^|\.)app\.goo\.gl$|^share\.google$/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function coordsFrom(url: string) {
  const t = decodeURIComponent(url);
  for (const re of [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/]) {
    const m = t.match(re);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}
function placeName(url: string) {
  const m = decodeURIComponent(url).match(/\/maps\/(?:place|search)\/([^/@?]+)/);
  return m ? m[1].replace(/\+/g, ' ').trim() : null;
}
// Links shared from search results often carry the shop name + full address in ?q= instead of coordinates.
function queryText(url: string) {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('destination');
    return q && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q) ? q.replace(/\+/g, ' ').trim() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let input = new URL(req.url).searchParams.get('url');
  if (!input && req.method === 'POST') input = (await req.json().catch(() => ({})))?.url;
  if (!input) return json({ error: 'Missing url' }, 400);

  let current: URL;
  try {
    current = new URL(input.trim());
  } catch {
    return json({ error: 'Not a valid link' }, 400);
  }
  if (!SHORT_HOSTS.includes(current.hostname) && !GOOGLE_HOST.test(current.hostname)) {
    return json({ error: 'Only Google Maps links are supported' }, 400);
  }

  // Follow up to 6 redirects, staying on Google domains. Stop as soon as we reach a Google
  // Search link (share.google): the shop name is in the link itself, and opening the search
  // page would only trip Google's rate limit.
  for (let hop = 0; hop < 6; hop++) {
    if (current.pathname === '/search') break;
    const res = await fetch(current.href, {
      redirect: 'manual',
      // Keep this plain: with a full desktop-browser UA Google answers with a JavaScript page instead of a redirect.
      headers: { 'User-Agent': 'Mozilla/5.0 (VyaparMarketingHub)', 'Accept-Language': 'en-IN,en;q=0.9' },
    });
    const loc = res.headers.get('location');
    if (!loc || res.status < 300 || res.status >= 400) break;
    const next = new URL(loc, current);
    // Google's cookie-consent page wraps the real link in ?continue=
    const cont = next.hostname.startsWith('consent.') || next.pathname.startsWith('/sorry') ? next.searchParams.get('continue') : null;
    const target = cont ? new URL(cont) : next;
    if (!GOOGLE_HOST.test(target.hostname)) return json({ error: 'Link leaves Google Maps' }, 400);
    current = target;
  }

  const coords = coordsFrom(current.href);
  // share.google links end on a Google Search page (shop name + place ID, no coordinates).
  const isSearch = /\/search$/.test(current.pathname);
  return json({
    url: current.href,
    kind: isSearch ? 'search' : 'maps',
    name: placeName(current.href) || (isSearch ? queryText(current.href) : null),
    query: queryText(current.href),
    ...(coords || {}),
  });
});
