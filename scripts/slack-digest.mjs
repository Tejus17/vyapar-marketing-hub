#!/usr/bin/env node
/**
 * Post the daily Expos digest to Slack (runs after refresh-events.mjs in the GitHub workflow).
 *
 *   node scripts/slack-digest.mjs --dry    # print the message instead of posting
 *
 * Needs SUPABASE_URL, SUPABASE_SECRET_KEY and SLACK_WEBHOOK_URL (a Slack "Incoming Webhook" for the
 * channel). Without a webhook it does nothing. Posts at most once per day: the backup run skips if
 * the morning run already posted (remembered in data/events/slack-last.json, kept in the run cache).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAST = path.join(ROOT, 'data/events/slack-last.json');
const DRY = process.argv.includes('--dry');
const envFile = path.join(ROOT, 'scripts/.env');
const env = Object.fromEntries(
  (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '').split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]])
);
const get = (k) => process.env[k] || env[k];
const URL_ = get('SUPABASE_URL');
const KEY = get('SUPABASE_SECRET_KEY');
const HOOK = get('SLACK_WEBHOOK_URL');
const SITE = (get('DASHBOARD_URL') || 'https://tejus17.github.io/vyapar-marketing-hub/').replace(/\/?$/, '/');
if (!HOOK && !DRY) {
  console.log('No SLACK_WEBHOOK_URL set — skipping the Slack digest.');
  process.exit(0);
}

// Dates in India time.
const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
const today = istDate();
const last = fs.existsSync(LAST) ? JSON.parse(fs.readFileSync(LAST, 'utf8')) : null;
if (!DRY && last?.date === today) {
  console.log('Slack digest already posted today.');
  process.exit(0);
}
// First digest: everything is "new", so start counting from now instead of listing the whole table.
const since = last?.at || null;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const cols = 'id,name,city,country,venue_name,start_date,end_date,footfall,team_footfall,niches,team_status,first_seen_at,is_archived';
const events = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${URL_}/rest/v1/hub_events?select=${cols}&or=(start_date.gte.${addDays(today, -1)},start_date.is.null)&order=start_date.asc&limit=1000&offset=${from}`, { headers: H });
  if (!res.ok) throw new Error(`hub_events: ${res.status} ${await res.text()}`);
  const page = await res.json();
  events.push(...page);
  if (page.length < 1000) break;
}
const live = events.filter((e) => !e.is_archived && e.team_status !== 'not_for_us');
const foot = (e) => e.team_footfall ?? e.footfall ?? null;
const big = (e) => foot(e) == null || foot(e) >= 10000;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (e) => {
  if (!e.start_date) return 'dates TBA';
  const [y, m, d] = e.start_date.split('-').map(Number);
  if (!e.end_date) return `${MON[m - 1]} ${y} (dates TBC)`;
  const [, m2, d2] = e.end_date.split('-').map(Number);
  return m2 === m ? `${d}${d2 !== d ? `–${d2}` : ''} ${MON[m - 1]}` : `${d} ${MON[m - 1]} – ${d2} ${MON[m2 - 1]}`;
};
const fmtFoot = (e) => (foot(e) == null ? 'footfall unknown' : `${foot(e) >= 1000 ? `${Math.round(foot(e) / 1000)}k` : foot(e)} visitors`);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const line = (e) =>
  `• *<${SITE}#/?event=${e.id}|${esc(e.name)}>* — ${esc(e.city)}${e.country === 'UAE' ? ' (UAE)' : ''} · ${fmtDate(e)} · ${fmtFoot(e)}${e.niches?.length ? ` · _${esc(e.niches.slice(0, 2).join(', '))}_` : ''}`;

// Slack caps a text block at 3,000 characters, so long lists go into several blocks.
const section = (title, list, max = 15) => {
  if (!list.length) return [];
  const lines = list.slice(0, max).map(line);
  if (list.length > max) lines.push(`_…and ${list.length - max} more in the dashboard_`);
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } }];
  for (let i = 0; i < lines.length; i += 8) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.slice(i, i + 8).join('\n') } });
  return blocks;
};

const newOnes = !since ? [] : live.filter((e) => e.first_seen_at > since && (!e.start_date || e.start_date >= today) && big(e));
const in30 = (e) => e.start_date && e.start_date >= today && e.start_date <= addDays(today, 30);
const plan = live.filter((e) => ['selected', 'going'].includes(e.team_status) && in30(e));
const considering = live.filter((e) => e.team_status === 'considering' && e.start_date >= today).length;
const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
const biggest = isMonday ? live.filter((e) => in30(e) && foot(e) >= 10000).sort((a, b) => foot(b) - foot(a)) : [];

const [y, m, d] = today.split('-').map(Number);
const blocks = [
  { type: 'header', text: { type: 'plain_text', text: `Expos update · ${d} ${MON[m - 1]} ${y}` } },
  ...section(`Our plan — next 30 days (${plan.length})`, plan.map((e) => ({ ...e, name: `${e.team_status === 'going' ? '✅ Going' : '⭐ Selected'}: ${e.name}` }))),
  ...(since ? section(`New expos found today (${newOnes.length})`, newOnes) : [{ type: 'section', text: { type: 'mrkdwn', text: `:wave: Daily expo digest is on. From tomorrow, new expos found by the 6:53 AM update show up here. Tracking *${live.filter((e) => !e.start_date || e.start_date >= today).length}* upcoming expos in India and the UAE.` } }]),
  ...section('This month’s biggest expos', biggest, 10),
];
if (since && !newOnes.length && !plan.length && !biggest.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No new expos today.' } });
blocks.push({
  type: 'context',
  elements: [{ type: 'mrkdwn', text: `${considering} upcoming marked _Considering_ · <${SITE}#/|Open the Marketing Hub> · <${SITE}#/expos/planner|Our plan>` }],
});
const message = { text: `Expos update: ${newOnes.length} new, ${plan.length} in our plan this month`, blocks };

if (DRY) {
  console.log(JSON.stringify(message, null, 1));
  process.exit(0);
}
const res = await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
if (!res.ok) throw new Error(`Slack: ${res.status} ${await res.text()}`);
fs.mkdirSync(path.dirname(LAST), { recursive: true });
fs.writeFileSync(LAST, JSON.stringify({ date: today, at: new Date().toISOString() }));
console.log(`Posted to Slack: ${newOnes.length} new, ${plan.length} in plan, ${biggest.length} biggest.`);
