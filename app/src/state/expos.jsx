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
      setEvents(ev.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')));
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
      setEvents((es) => [...es, data].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')));
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
  'Retail & FMCG', 'Pharma & healthcare', 'Hardware & building materials', 'Electricals & electronics', 'Mobile, IT & tech',
  'Textiles, apparel & footwear', 'Jewellery', 'Auto & auto parts', 'Food, beverage & HoReCa', 'Furniture & home décor',
  'Gifts, stationery & toys', 'Agriculture & agri-inputs', 'Manufacturing, machinery & packaging', 'MSME, franchise & business',
  'Beauty & personal care', 'Weddings & consumer shows', 'Real estate', 'Education & careers', 'Logistics & transport', 'Travel & tourism',
];

/** Footfall the team should see: their own number after attending, else the organiser's claim. */
export const bestFootfall = (e) => e.team_footfall ?? e.footfall ?? null;
