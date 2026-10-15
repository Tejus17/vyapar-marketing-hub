import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, VENDORS, NOTES } from '../lib/supabase';

const Ctx = createContext(null);
const PAGE = 1000;

const readLocal = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const writeLocal = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode — fine */
  }
};

const isMissingTable = (err) =>
  err && (err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|does not exist/i.test(err.message || ''));

export function StoreProvider({ children }) {
  const [vendors, setVendors] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | setup | error
  const [error, setError] = useState(null);
  const [me, setMeState] = useState(() => readLocal('vh_name', ''));
  const [toast, setToast] = useState(null);

  const setMe = (name) => {
    setMeState(name);
    writeLocal('vh_name', name);
  };

  const notify = useCallback((text, tone = 'ok') => {
    setToast({ text, tone, id: Date.now() });
    setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), 3200);
  }, []);

  const load = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const fail = (err) => {
      setError(err);
      setStatus(isMissingTable(err) ? 'setup' : 'error');
    };
    // Count first, then fetch every page in parallel (Supabase returns max 1000 rows per request).
    const { count, error: countErr } = await supabase
      .from(VENDORS)
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false);
    if (countErr) return fail(countErr);
    const pages = await Promise.all(
      Array.from({ length: Math.max(1, Math.ceil((count || 0) / PAGE)) }, (_, i) =>
        supabase.from(VENDORS).select('*').eq('is_archived', false).order('id').range(i * PAGE, i * PAGE + PAGE - 1)
      )
    );
    const bad = pages.find((p) => p.error);
    if (bad) return fail(bad.error);
    const all = pages.flatMap((p) => p.data).sort((a, b) => a.name.localeCompare(b.name));
    setVendors(all);
    setStatus('ready');
  }, []);

  useEffect(() => {
    load();
    // Pick up teammates' changes when someone comes back to the tab.
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 60_000) {
        last = Date.now();
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const updateVendor = useCallback(
    async (id, patch) => {
      const prev = vendors.find((v) => v.id === id);
      setVendors((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
      const { error: err } = await supabase.from(VENDORS).update(patch).eq('id', id);
      if (err) {
        setVendors((vs) => vs.map((v) => (v.id === id ? prev : v)));
        notify(`Couldn’t save: ${err.message}`, 'error');
        return false;
      }
      return true;
    },
    [vendors, notify]
  );

  const addVendor = useCallback(
    async (row) => {
      const { data, error: err } = await supabase.from(VENDORS).insert(row).select().single();
      if (err) {
        notify(
          err.code === '23505' ? 'A vendor with this name already exists in that city.' : `Couldn’t add vendor: ${err.message}`,
          'error'
        );
        return null;
      }
      setVendors((vs) => [...vs, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    },
    [notify]
  );

  const archiveVendor = useCallback(
    async (id) => {
      const ok = await updateVendor(id, { is_archived: true });
      if (ok) setVendors((vs) => vs.filter((v) => v.id !== id));
      return ok;
    },
    [updateVendor]
  );

  const toggleStar = useCallback(
    (v) =>
      updateVendor(
        v.id,
        v.is_starred
          ? { is_starred: false, starred_by: null, starred_at: null }
          : { is_starred: true, starred_by: me || null, starred_at: new Date().toISOString() }
      ),
    [updateVendor, me]
  );

  const fetchNotes = useCallback(async (vendorIds) => {
    if (!vendorIds.length) return [];
    const { data, error: err } = await supabase
      .from(NOTES)
      .select('*')
      .in('vendor_id', vendorIds)
      .order('created_at', { ascending: false });
    if (err) return [];
    return data;
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

  const value = useMemo(
    () => ({
      vendors, status, error, me, setMe, toast, notify, load,
      updateVendor, addVendor, archiveVendor, toggleStar, fetchNotes, addNote, deleteNote,
    }),
    [vendors, status, error, me, toast, notify, load, updateVendor, addVendor, archiveVendor, toggleStar, fetchNotes, addNote, deleteNote]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

export { readLocal, writeLocal };
