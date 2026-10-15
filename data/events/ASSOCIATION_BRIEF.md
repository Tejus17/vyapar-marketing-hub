# Brief: expos and meets run by computer / IT dealer associations in India

Vyapar (billing & accounting software for small businesses) works with computer dealers, IT resellers,
system integrators and mobile/computer shops. These dealers belong to city and state **computer / IT dealer
associations**, for example:
- FAIITA (Federation of All India IT Associations) and its member associations
- CMDA Pune (Computer & Media Dealers Association)
- TAIT Mumbai (Trade Association of Information Technology)
- CTA Chennai, KCDA / Kerala associations, Hyderabad, Bengaluru, Kolkata and Delhi dealer bodies
- Gujarat bodies such as GCDA / ITAG, plus associations in Tier-2 cities (Nagpur, Indore, Jaipur, Lucknow, Raipur, Coimbatore, Madurai, Vizag, Guwahati…)
- Also MAIT, NASSCOM SME or channel events only if aimed at dealers/resellers, and IT-mall / IT-market fairs

Find the **expos, IT fairs, dealer meets, channel conventions and annual conferences** these associations
organise or host. Focus on **upcoming events (Oct 2026 onwards)**, but also include the most recent past edition
(2025–2026) of recurring events if the next date isn't announced yet. That edition tells us the event exists
and roughly when it happens.

## Where to look
WebSearch and WebFetch:
- association websites and their event or news pages
- Facebook, LinkedIn and Instagram posts
- trade press: CRN India, DQ Channels (dqchannels.com), ChannelTimes, VARINDIA, SMEChannels, Express Computer
- event directories (EventsEye, TradeIndia, AllEvents)

**Never bypass bot checks or CAPTCHAs; skip such pages.**

## Rules (strict)
- **Never invent anything.** Every event must come from a page you fetched, and `source_url` must be that page.
  If dates aren't announced, leave them null and set `month_hint` (e.g. "usually January").
  Footfall and exhibitor counts must be copied exactly from the source, in `footfall_text`; otherwise null.
- One entry per event edition. Don't list the same edition twice.

## Output
Write one JSON array to the output file named in your task (relative to the project root
`/Users/vyapar/Documents/claude /shop in shop dashboard/`). Each element:

```json
{
  "name": "CMDA IT Expo 2027",
  "association": "Computer & Media Dealers Association (CMDA), Pune",
  "city": "Pune",
  "state": "Maharashtra",
  "venue_name": "Auto Cluster Exhibition Centre",
  "venue_address": null,
  "start_date": "2027-01-15",
  "end_date": "2027-01-17",
  "month_hint": null,
  "kind": "Expo",
  "audience": "B2B",
  "description": "One or two short factual lines from the source.",
  "footfall": 25000,
  "footfall_text": "exact sentence with the number",
  "exhibitors": 120,
  "website": "https://…",
  "organiser_phone": null,
  "source_name": "CMDA website",
  "source_url": "https://…"
}
```

- `kind`: "Expo" | "Dealer meet" | "Conference" | "Fair".
- `audience`: "B2B" | "B2C" | "B2B + B2C".
- Dates as YYYY-MM-DD. If only the month is known, use the 1st of the month for `start_date`,
  set `end_date` to null and set `month_hint`.

Validate the file with `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' <file>`.
Don't edit other files or touch the database. Finish with a short report: events found per association,
and the associations you checked that had no events.
