import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from './store';

const EVENTS = 'hub_events';
const VENUES = 'hub_venues';
const NOTES = 'hub_event_notes';
const PAGE = 1000;
const Ctx = createContext(null);

const isMissingTable = (err) =>
  err && (err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|does not exist/i.test(err.message || ''));

async function fetchAll(table, build) {
  const { count, error } = await build(supabase.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw error;
  const pages = await Promise.all(
    Array.from({ length: Math.max(1, Math.ceil((count || 0) / PAGE)) }, (_, i) =>
      build(supabase.from(table).select('*')).order('id').range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );
  const bad = pages.find((p) => p.error);
  if (bad) throw bad.error;
  return pages.flatMap((p) => p.data);
}

export function ExposProvider({ children }) {
  const { notify, me } = useStore();
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | setup | error
  const [error, setError] = useState(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    started.current = true;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const [ev, vn] = await Promise.all([
        fetchAll(EVENTS, (q) => q.eq('is_archived', false)),
        fetchAll(VENUES, (q) => q),
      ]);
      setEvents(ev.map(withIndustries).sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')));
      setVenues(vn.sort((a, b) => a.name.localeCompare(b.name)));
      setStatus('ready');
    } catch (err) {
      setError(err);
      setStatus(isMissingTable(err) ? 'setup' : 'error');
    }
  }, []);

  const ensure = useCallback(() => {
    if (!started.current) load();
  }, [load]);

  // Pick up teammates' changes when someone comes back to the tab.
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (started.current && document.visibilityState === 'visible' && Date.now() - last > 60_000) {
        last = Date.now();
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const updateEvent = useCallback(
    async (id, patch) => {
      const prev = events.find((e) => e.id === id);
      setEvents((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      const { error: err } = await supabase.from(EVENTS).update(patch).eq('id', id);
      if (err) {
        setEvents((es) => es.map((e) => (e.id === id ? prev : e)));
        notify(`Couldn’t save: ${err.message}`, 'error');
        return false;
      }
      return true;
    },
    [events, notify]
  );

  const setEventStatus = useCallback(
    (e, team_status) =>
      updateEvent(e.id, { team_status, status_by: me || null, status_at: new Date().toISOString() }),
    [updateEvent, me]
  );

  const addEvent = useCallback(
    async (row) => {
      const { data, error: err } = await supabase.from(EVENTS).insert(row).select().single();
      if (err) {
        notify(`Couldn’t add event: ${err.message}`, 'error');
        return null;
      }
      setEvents((es) => [...es, withIndustries(data)].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')));
      return data;
    },
    [notify]
  );

  const fetchNotes = useCallback(async (ids) => {
    if (!ids.length) return [];
    const { data, error: err } = await supabase.from(NOTES).select('*').in('event_id', ids).order('created_at', { ascending: false });
    return err ? [] : data;
  }, []);

  const addNote = useCallback(
    async (note) => {
      const { data, error: err } = await supabase.from(NOTES).insert(note).select().single();
      if (err) {
        notify(`Couldn’t save note: ${err.message}`, 'error');
        return null;
      }
      return data;
    },
    [notify]
  );

  const deleteNote = useCallback(
    async (id) => {
      const { error: err } = await supabase.from(NOTES).delete().eq('id', id);
      if (err) notify(`Couldn’t delete note: ${err.message}`, 'error');
      return !err;
    },
    [notify]
  );

  const venueById = useMemo(() => Object.fromEntries(venues.map((v) => [v.id, v])), [venues]);

  const value = useMemo(
    () => ({ events, venues, venueById, status, error, load, ensure, updateEvent, setEventStatus, addEvent, fetchNotes, addNote, deleteNote }),
    [events, venues, venueById, status, error, load, ensure, updateEvent, setEventStatus, addEvent, fetchNotes, addNote, deleteNote]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Use inside Expos pages — triggers the first load. */
export function useExpos() {
  const ctx = useContext(Ctx);
  useEffect(() => ctx.ensure(), [ctx]);
  return ctx;
}

export const EVENT_STATUSES = [
  { key: 'new', label: 'New', tone: '', hint: 'Found by the collector — nobody has reviewed it yet' },
  { key: 'considering', label: 'Considering', tone: 'tag-amber', hint: 'Someone is evaluating it' },
  { key: 'selected', label: 'Selected', tone: 'tag-blue', hint: 'We want to take a stall' },
  { key: 'going', label: 'Going', tone: 'tag-red', hint: 'Booked / confirmed' },
  { key: 'went', label: 'Went', tone: 'tag-green', hint: 'Attended — add notes and real footfall' },
  { key: 'not_for_us', label: 'Not for us', tone: 'tag-muted', hint: 'Rejected' },
];
export const statusMeta = (k) => EVENT_STATUSES.find((s) => s.key === k) || EVENT_STATUSES[0];

export const EXPO_NICHES = [
  'Retail & FMCG', 'Pharma & healthcare', 'Hardware & building materials', 'Electricals & electronics', 'Partner acquisition', 'Mobile, IT & tech', 'Computer dealer associations',
  'Textiles, apparel & footwear', 'Jewellery', 'Auto & auto parts', 'Food, beverage & HoReCa', 'Furniture & home décor',
  'Gifts, stationery & toys', 'Agriculture & agri-inputs', 'Manufacturing, machinery & packaging', 'MSME, franchise & business',
  'Beauty & personal care', 'Weddings & consumer shows', 'Real estate', 'Education & careers', 'Logistics & transport', 'Travel & tourism',
];

/** Footfall the team should see: their own number after attending, else the organiser's claim. */
export const bestFootfall = (e) => e.team_footfall ?? e.footfall ?? null;

/**
 * Broad industry groups (the 15 used by DWTC and newroyal.ae). Events from newroyal.ae carry them
 * as listed there; every other event is sorted into them from its niches, listed industries and name.
 */
export const EXPO_INDUSTRIES = [
  ['Agriculture, Veterinary, Equestrian and Horticulture', ['Agriculture & agri-inputs'], /\b(agri\w*|farm\w*|dairy|poultry|horticultur\w*|veterinar\w*|equestrian|seeds?|fertili[sz]\w*|livestock|fisher\w*|aqua\w*|tractors?|irrigation|organic)\b/],
  ['Beauty, Bridal, Jewellery, Clothing and Accessories', ['Jewellery', 'Textiles, apparel & footwear', 'Beauty & personal care', 'Weddings & consumer shows'], /\b(jewel\w*|gems?|gold|diamonds?|fashion|textiles?|apparel|garments?|clothing|beauty|cosmetics?|bridal|wedding|footwear|shoes?|leather|fabrics?|yarn|saree|perfumes?|salon|spa)\b/],
  ['Business & Finance', [], /\b(business (show|expo|summit|conclave|meet|forum)|finance|financial|fintech|banking|bank|invest\w*|insurance|crypto|blockchain|franchise|start-?ups?|msme|sme|entrepreneur\w*|wealth|trading|forex|ifx)\b/],
  ['Construction, Interiors and Real Estate', ['Hardware & building materials', 'Real estate', 'Furniture & home décor'], /\b(construct\w*|build\w*|interiors?|architect\w*|real estate|property|cement|steel|tiles?|ceramics?|stone|marble|granite|plumbing|hvac|furniture|furnishing|home d[eé]cor|hardware|paints?|glass|doors?|windows?|kitchen|bath\w*)\b/],
  ['Consumer Goods', ['Retail & FMCG', 'Gifts, stationery & toys'], /\b(consumer|retail|fmcg|gifts?|toys?|stationery|home ?ware|appliances?|lifestyle|handicrafts?|houseware|shopping)\b/],
  ['Education, Training and Careers', ['Education & careers'], /\b(educat\w*|careers?|universit\w*|schools?|training|edu\w*|learning|students?|study abroad)\b/],
  ['Energy and Environment', [], /\b(energy|solar|power|renewable|environment\w*|water|oil|gas|petro\w*|electric vehicles?|ev|battery|batteries|recycl\w*|waste|sustainab\w*|climate|green)\b/],
  ['Food, Hotel and Catering', ['Food, beverage & HoReCa'], /\b(food|beverages?|drinks?|hotels?|horeca|hospitality|bakery|coffee|tea|restaurants?|catering|halal|spices?|confectionery|snacks?|rice|grains?)\b/],
  ['Healthcare and Medical', ['Pharma & healthcare'], /\b(health\w*|medical|medicine|pharma\w*|hospitals?|dental|labs?|laborator\w*|diagnostic\w*|ayush|ayurved\w*|wellness|surgical|nursing)\b/],
  ['Industrial and Manufacturing', ['Manufacturing, machinery & packaging'], /\b(industr\w*|manufactur\w*|machine\w*|machinery|engineering|plastics?|chemicals?|automation|tools?|metals?|welding|pumps?|valves?|rubber|foundry|cnc|robotics?)\b/],
  ['Leisure, Sport and Travel', ['Travel & tourism'], /\b(leisure|sports?|fitness|travel|tourism|holiday|adventure|entertainment|amusement|gaming|games|boats?|yachts?|art|music|film)\b/],
  ['Printing, Packaging and Media', [], /\b(print\w*|packag\w*|pack|media|signs?|signage|labels?|paper|publish\w*|advertis\w*|broadcast\w*|graphics?)\b/],
  ['Safety and Defence', [], /\b(safety|security|defen[cs]e|fire|police|surveillance|cctv|military|homeland|cyber ?security)\b/],
  ['Technology', ['Mobile, IT & tech', 'Computer dealer associations', 'Electricals & electronics'], /\b(tech\w*|it|software|ai|digital|electronics?|electricals?|telecom\w*|mobiles?|computers?|gitex|data|cloud|semiconductors?|iot|smart)\b/],
  ['Transport and Logistics', ['Auto & auto parts', 'Logistics & transport'], /\b(logistic\w*|transport\w*|auto\w*|vehicles?|aviation|aircraft|airports?|aerospace|marine|maritime|ships?|shipping|rail\w*|trucks?|motors?|tyres?|cargo|supply chain|warehous\w*)\b/],
].map(([name, niches, re]) => ({ name, niches, re }));

function withIndustries(e) {
  const listed = (e.industries || []).filter((x) => EXPO_INDUSTRIES.some((i) => i.name === x));
  if (listed.length) return { ...e, sectors: listed };
  const text = `${e.name} ${(e.industries || []).join(' ')}`.toLowerCase();
  const sectors = EXPO_INDUSTRIES.filter((i) => i.niches.some((n) => e.niches?.includes(n)) || i.re.test(text)).map((i) => i.name);
  return { ...e, sectors };
}
