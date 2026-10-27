# Brief: partner-acquisition events in India for Vyapar (Nov 2026 – Sep 2027)

Vyapar (billing, inventory and accounting software for small businesses) recruits **partners** who sell
Vyapar to their own customers. Per Vyapar's partner framework there are two partner categories:
- **Non-TP partners:** computer shops, IT resellers, system integrators, hardware vendors, CCTV/AV
  dealers, mobile/electronics dealers and entrepreneurs.
- **TP partners:** tax professionals, i.e. Chartered Accountants (CAs), tax practitioners, GST
  practitioners and accountants.

The team is attending **CMDA B2B IT Expo 2027** (Pune, 11–12 Jan 2027, 71 booths, ~5,500 IT channel
attendees). Find more events like it: events where **many potential partners gather in one place**
and where Vyapar can **exhibit, sponsor, speak or at least attend and network**.

## What counts
- Expos, conventions, conferences, dealer meets and summits whose **audience is mostly the partner profile above**.
- **Upcoming (Nov 2026 – Sep 2027).** If a recurring event hasn't announced its next dates, include the
  last edition with `month_hint` (e.g. "usually January"), with `start_date` and `end_date` null.
- Note whether **exhibitor stalls or sponsorship** are offered, and the price if published.
- Skip: general consumer shows, events abroad, and webinars.

## Where to look
WebSearch and WebFetch:
- organiser and association websites, plus their event pages and PDFs
- event directories: EventsEye, TradeIndia, 10times (if reachable), AllEvents
- trade press: CRN India, DQ Channels, VARINDIA, SMEChannels, ChannelTimes, Express Computer
- for CAs: ICAI.org event pages and regional councils (WIRC, SIRC, NIRC, EIRC, CIRC); taxguru, caclubindia
- LinkedIn and Facebook posts

**Never bypass bot checks or CAPTCHAs; skip such pages.**

## Strict rules
- **Never invent anything.** Every event must come from a page you fetched, and `source_url` must be
  that page.
- **Visitor or attendee numbers:** copy them only as the source states them, in `footfall_text`. They
  are organiser claims, so say so in the text.
- **Already in our dashboard:** check `data/events/events.json` and `data/events/assoc-*.json`, both
  relative to the project root. If an event is already there, still include it, set
  `"in_dashboard": true` and keep it brief.
- One entry per event edition.

## Output
Write one JSON array to the output file named in your task (project root:
`/Users/vyapar/Documents/claude /shop in shop dashboard/`). Each element:

```json
{
  "name": "…",
  "organiser": "…",
  "city": "…",
  "state": "…",
  "venue_name": null,
  "start_date": "2027-01-11",
  "end_date": "2027-01-12",
  "month_hint": null,
  "kind": "Expo | Dealer meet | Conference | Convention | Summit",
  "partner_type": "Non-TP | TP | Both",
  "audience": "who attends, per the source (one line)",
  "footfall": 5500,
  "footfall_text": "exact source wording + '(organiser claim)'",
  "exhibitors": 71,
  "exhibit_options": "stalls / sponsorship / speaking, with prices if published, else null",
  "why_fit": "one line on why partners gather here",
  "website": "https://…",
  "organiser_contact": "only if published on the source page, else null",
  "in_dashboard": false,
  "source_name": "…",
  "source_url": "https://…"
}
```

Validate the file with `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' <file>`. Don't edit
other files or touch the database.

Finish with a short report: events found, the 5 best fits with one line each, and what you checked but
found nothing for.
