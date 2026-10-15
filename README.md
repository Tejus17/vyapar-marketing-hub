# Vyapar Marketing Hub

Internal dashboard with two sections:

- **Vendors**: light-board, backlit, flex, standee, creative and exhibition-booth vendors near any partner shop or expo venue (India and UAE).
- **Expos**: every trade show and expo in India and the UAE, with footfall, niches, venues, the team's plan and notes, and booth vendors near each venue.

## What's in it

| Page | What it does |
|---|---|
| **Overview** | India map with a bubble per city (size = vendor count), coverage by city, team favourites. |
| **Find near a shop** | Paste the partner shop's Google Maps link, an address, or coordinates; set the radius in km and filter by need. Vendors are ranked by **road distance** with drive time and a **trip-cost estimate** (₹/km per travel mode, editable, round trip on/off). |
| **All vendors** | Search by name, area or phone number. Filter by state → city → area, service, max ₹/sq ft, starred, worked-with, has rates. Export the current list to CSV. |
| **Starred** | Vendors the team has starred or worked with, plus their notes. |
| **Add vendor** | Add a vendor that isn't listed. Paste their Google Maps link for an exact pin. |
| **Vendor panel** | Every phone number (call, WhatsApp, copy), address and Maps link, services, published rates, source page, **Star as trusted**, **We've worked with them**, and a **team notes** thread ("used for Sharma Traders, good finish, ₹160/sq ft"). |

No login — anyone with the link can use it (team decision). Vendors are never hard-deleted from the dashboard; "Remove" archives them.

## Expos section

| Page | What it does |
|---|---|
| **Events** | Upcoming expos grouped by month. Filter by country, dates, city, venue, niche, footfall (default 10k+, adjustable; events with no published footfall stay visible), B2B or consumer, and team status. Export to CSV. |
| **Event panel** | Dates, venue, footfall with the organiser's own sentence, organiser contact, website. Team status: New / Shortlisted / Going / Went / Not for us. Your own footfall count after attending, team notes, and **vendors near the venue** (booth builders, flex and signage). |
| **Our plan** | Board of Shortlisted → Going → Went. |
| **Venues** | Expo centres on a map, busiest first, each with its upcoming events, details and vendors nearby. |
| **Add event** | For events the team hears about that aren't listed. |

**Data:** events come from EventsEye (India and UAE listings plus each event's page). Footfall is the figure the organiser publishes on the event's own website, quoted word for word. Organiser-wide totals, website traffic and similar numbers are rejected. Venues come from a researched list in `data/venues/venues.json`.

**Daily update:** `node scripts/refresh-events.mjs` adds new events and refreshes dates and footfall. It never touches team status, notes or your footfall counts. `.github/workflows/refresh-events.yml` runs it every morning at 07:00 IST once the project is on GitHub. Add the repo secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

## Project layout

```
app/                 React + Vite dashboard (talks to Supabase directly)
supabase/schema.sql  Vendor tables + access rules (run once)
supabase/expos.sql   Expo tables + access rules (run once)
scripts/             import-vendors.mjs (vendors) · refresh-events.mjs (expos, daily)
data/raw/            Vendor data collected from the web, one JSON file per city
data/vendors.json    Cleaned, de-duplicated, geocoded output of the import
legacy/              The earlier prototype (kept for reference, safe to delete)
```

## Run it locally

```bash
cd app
npm install
npm run dev
```

## Load / refresh vendor data

```bash
node scripts/import-vendors.mjs --dry   # clean + geocode only → data/vendors.json
node scripts/import-vendors.mjs         # …and upload to Supabase
```

Needs `scripts/.env` (git-ignored) with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Re-imports only add new vendors — anything already in the dashboard (stars, notes, edits) is left alone.

### Where the data comes from

Vendors were collected from public listings — mainly IndiaMART company pages, plus Dial4Trade, ExportersIndia, TradeIndia, IndianYellowPages, Sulekha and vendors' own websites. Every vendor keeps a link to its source page. Nothing was filled in by guesswork: if a page didn't show a phone, address or rate, the field is empty.

Things to know:
- Numbers starting **+91 804…** are IndiaMART call-forwarding lines; they ring the vendor, but some are shared between sellers (the app flags these).
- Most listings give only a locality or pincode, so map pins are marked **exact** (from a Maps link), **area** (locality), or **approx.** (city centre). Paste a vendor's Google Maps link in *Edit* to fix its pin.
- Rates are the sellers' own listed prices — quality varies, so confirm before ordering.

## Deploy (free) — GitHub Pages

```bash
cd app && npm run build      # outputs app/dist
```

Publish `app/dist` with GitHub Pages (Settings → Pages), or any static host (Netlify, Vercel, Cloudflare Pages). A custom domain can be pointed at it later. The Supabase publishable key in `app/src/lib/supabase.js` is meant to be public; the secret key must never go into `app/`.
