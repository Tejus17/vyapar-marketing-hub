import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, X, CalendarX2, Plus, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useExpos, EXPO_NICHES, EVENT_STATUSES, bestFootfall } from '../state/expos';
import { useStore } from '../state/store';
import { monthLabel, compact } from '../lib/format';
import EventRow from '../components/EventRow';
import ExposGate from '../components/ExposGate';

const FOOTFALL_STEPS = [0, 5000, 7000, 10000, 25000, 50000, 100000];
const WHEN = {
  upcoming: 'Upcoming',
  next30: 'Next 30 days',
  next90: 'Next 3 months',
  next180: 'Next 6 months',
  past: 'Past 12 months',
  all: 'All dates',
};
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const uniq = (a) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y));

function toCsv(rows) {
  const cols = ['name', 'start', 'end', 'city', 'country', 'venue', 'footfall', 'footfall_source', 'exhibitors', 'audience', 'niches', 'organiser', 'organiser_phone', 'website', 'team_status'];
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((e) =>
    [e.name, e.start_date, e.end_date, e.city, e.country, e.venue_name, bestFootfall(e), e.team_footfall != null ? 'Our team' : e.footfall_source,
      e.exhibitors, e.audience, (e.niches || []).join(' / '), e.organiser, e.organiser_phone, e.website, e.team_status].map(esc).join(','))].join('\n');
}

export default function ExpoEvents() {
  const { events, venueById, status } = useExpos();
  const { notify } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [moreNiches, setMoreNiches] = useState(false);
  const [limit, setLimit] = useState(80);

  const f = {
    country: params.get('country') || 'all',
    when: params.get('when') || 'upcoming',
    city: params.get('city') || '',
    venue: params.get('venue') || '',
    niches: params.getAll('niche'),
    minFoot: params.has('ff') ? Number(params.get('ff')) : 10000,
    unknown: params.get('unk') !== '0',
    audience: params.get('aud') || '',
    status: params.get('status') || '',
    sort: params.get('sort') || 'date',
  };
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    if (Array.isArray(value)) value.forEach((x) => next.append(key, x));
    else if (value !== '' && value != null) next.set(key, value);
    if (key === 'country') {
      next.delete('city');
      next.delete('venue');
    }
    if (key === 'city') next.delete('venue');
    setParams(next, { replace: true });
  };
  useEffect(() => setLimit(80), [params, q]);

  const inCountry = useMemo(() => events.filter((e) => f.country === 'all' || e.country === f.country), [events, f.country]);
  const cities = useMemo(() => uniq(inCountry.map((e) => e.city)), [inCountry]);
  const venueNames = useMemo(
    () => uniq(inCountry.filter((e) => !f.city || e.city === f.city).map((e) => e.venue_name)),
    [inCountry, f.city]
  );

  const inWindow = useMemo(() => {
    const t = today();
    return inCountry.filter((e) => {
      const end = e.end_date || e.start_date;
      if (!e.start_date) return f.when === 'all';
      switch (f.when) {
        case 'upcoming': return end >= t;
        case 'next30': return end >= t && e.start_date <= plusDays(30);
        case 'next90': return end >= t && e.start_date <= plusDays(90);
        case 'next180': return end >= t && e.start_date <= plusDays(180);
        case 'past': return end < t && e.start_date >= plusDays(-365);
        default: return true;
      }
    });
  }, [inCountry, f.when]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = inWindow.filter((e) => {
      if (f.city && e.city !== f.city) return false;
      if (f.venue && e.venue_name !== f.venue) return false;
      if (f.niches.length && !f.niches.some((n) => e.niches?.includes(n))) return false;
      if (f.audience && !(e.audience || '').includes(f.audience)) return false;
      if (f.status && e.team_status !== f.status) return false;
      const ff = bestFootfall(e);
      if (ff == null ? !f.unknown : ff < f.minFoot) return false;
      if (needle) {
        const hay = `${e.name} ${e.description || ''} ${e.venue_name || ''} ${e.city} ${e.organiser || ''} ${(e.industries || []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (f.sort === 'footfall') out = [...out].sort((a, b) => (bestFootfall(b) ?? -1) - (bestFootfall(a) ?? -1));
    else if (f.when === 'past') out = [...out].sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    return out;
  }, [inWindow, q, f.city, f.venue, f.niches.join('|'), f.audience, f.status, f.minFoot, f.unknown, f.sort, f.when]); // eslint-disable-line

  const stats = useMemo(() => ({
    total: inWindow.length,
    big: inWindow.filter((e) => (bestFootfall(e) ?? 0) >= 10000).length,
    shortlisted: inWindow.filter((e) => e.team_status === 'shortlisted').length,
    going: inWindow.filter((e) => e.team_status === 'going').length,
  }), [inWindow]);

  // Group by month when sorted by date.
  const shown = filtered.slice(0, limit);
  const groups = useMemo(() => {
    if (f.sort === 'footfall') return [{ key: 'all', label: null, rows: shown }];
    const g = [];
    for (const e of shown) {
      const key = (e.start_date || '').slice(0, 7) || 'tba';
      if (!g.length || g[g.length - 1].key !== key) g.push({ key, label: key === 'tba' ? 'Dates TBA' : monthLabel(e.start_date), rows: [] });
      g[g.length - 1].rows.push(e);
    }
    return g;
  }, [shown, f.sort]);

  const anyFilter = q || f.city || f.venue || f.niches.length || f.audience || f.status || params.has('ff') || params.has('unk');
  const visibleNiches = moreNiches ? EXPO_NICHES : EXPO_NICHES.slice(0, 8);

  const exportCsv = () => {
    const blob = new Blob(['﻿' + toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vyapar-expos.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${filtered.length} events`);
  };

  if (status !== 'ready') return <ExposGate />;

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">Expos · India and UAE</span>
          <h1 className="h2" style={{ marginTop: 12 }}>Find the expos worth a Vyapar stall</h1>
          <p className="sub">Every trade show and expo we can find. You decide what’s good — mark it, and the team sees it.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="seg" role="tablist" aria-label="Country">
            {[['all', 'All'], ['India', 'India'], ['UAE', 'UAE']].map(([k, l]) => (
              <button key={k} className={f.country === k ? 'on' : ''} onClick={() => set('country', k === 'all' ? '' : k)}>{l}</button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={exportCsv} disabled={!filtered.length}><Download /> CSV</button>
          <Link to="/expos/add" className="btn btn-sm btn-outline-red"><Plus /> Add event</Link>
        </div>
      </div>

      <div className="mini-stats">
        <button className="mini-stat" onClick={() => set('status', '')}>
          <b>{stats.total.toLocaleString('en-IN')}</b><span>{WHEN[f.when].toLowerCase()} events</span>
        </button>
        <button className="mini-stat" onClick={() => set('ff', '10000')}>
          <b>{stats.big.toLocaleString('en-IN')}</b><span>with 10k+ visitors claimed</span>
        </button>
        <button className={`mini-stat ${f.status === 'shortlisted' ? 'on' : ''}`} onClick={() => set('status', f.status === 'shortlisted' ? '' : 'shortlisted')}>
          <b>{stats.shortlisted}</b><span>shortlisted</span>
        </button>
        <button className={`mini-stat ${f.status === 'going' ? 'on' : ''}`} onClick={() => set('status', f.status === 'going' ? '' : 'going')}>
          <b>{stats.going}</b><span>we’re going</span>
        </button>
      </div>

      <div className="filterbar">
        <div className="filter-row">
          <div className="field">
            <span className="label">Search</span>
            <div className="input-icon">
              <Search />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Event, organiser, industry…" />
            </div>
          </div>
          <div className="field">
            <span className="label">When</span>
            <select className="select" value={f.when} onChange={(e) => set('when', e.target.value === 'upcoming' ? '' : e.target.value)}>
              {Object.entries(WHEN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">City</span>
            <select className="select" value={f.city} onChange={(e) => set('city', e.target.value)}>
              <option value="">All cities</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">Venue</span>
            <select className="select" value={f.venue} onChange={(e) => set('venue', e.target.value)}>
              <option value="">All venues</option>
              {venueNames.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">Sort</span>
            <select className="select" value={f.sort} onChange={(e) => set('sort', e.target.value === 'date' ? '' : e.target.value)}>
              <option value="date">By date</option>
              <option value="footfall">Biggest footfall</option>
            </select>
          </div>
        </div>

        <div className="filter-row-2">
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <span className="label">Footfall</span>
            <div className="seg">
              {FOOTFALL_STEPS.map((n) => (
                <button key={n} className={f.minFoot === n ? 'on' : ''} onClick={() => set('ff', n === 10000 ? '' : String(n))}>
                  {n === 0 ? 'Any' : `${compact(n)}+`}
                </button>
              ))}
            </div>
            <label className="toggle" title="Many organisers don’t publish visitor numbers">
              <input type="checkbox" checked={f.unknown} onChange={(e) => set('unk', e.target.checked ? '' : '0')} /> Include unknown footfall
            </label>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <select className="select" style={{ width: 150, height: 36 }} value={f.audience} onChange={(e) => set('aud', e.target.value)}>
              <option value="">B2B and B2C</option>
              <option value="B2B">B2B (trade)</option>
              <option value="B2C">Consumer (B2C)</option>
            </select>
            <select className="select" style={{ width: 150, height: 36 }} value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Any status</option>
              {EVENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {anyFilter && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setParams(new URLSearchParams(f.country !== 'all' ? { country: f.country } : {}), { replace: true }); }}>
                <X /> Clear
              </button>
            )}
          </div>
        </div>

        <div className="chips" style={{ marginTop: 12 }}>
          {visibleNiches.map((n) => {
            const on = f.niches.includes(n);
            return (
              <button key={n} className={`chip ${on ? 'on' : ''}`} onClick={() => set('niche', on ? f.niches.filter((x) => x !== n) : [...f.niches, n])}>
                {n}
              </button>
            );
          })}
          <button className="chip" onClick={() => setMoreNiches((m) => !m)}>
            {moreNiches ? <><ChevronUp /> Fewer</> : <><ChevronDown /> {EXPO_NICHES.length - 8} more niches</>}
          </button>
        </div>
      </div>

      <div className="results-meta">
        <span>
          <b>{filtered.length.toLocaleString('en-IN')}</b> events
          {f.minFoot ? ` · ${compact(f.minFoot)}+ visitors${f.unknown ? ' or unknown' : ''}` : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon"><CalendarX2 /></div>
          <h3>No events match</h3>
          <p>Lower the footfall bar, include unknown footfall, or widen the dates.</p>
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key}>
              {g.label && (
                <div className="month-head">
                  <h3>{g.label}</h3>
                  <span>{g.rows.length} event{g.rows.length === 1 ? '' : 's'}</span>
                </div>
              )}
              <div className="vlist">
                {g.rows.map((e) => <EventRow key={e.id} e={e} venue={venueById[e.venue_id]} />)}
              </div>
            </section>
          ))}
          {filtered.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button className="btn" onClick={() => setLimit((l) => l + 120)}>Show more ({filtered.length - limit} left)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
