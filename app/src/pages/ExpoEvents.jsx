import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, CalendarX2, Download, SlidersHorizontal, X } from 'lucide-react';
import { useExpos, EXPO_NICHES, EVENT_STATUSES, bestFootfall } from '../state/expos';
import { useStore } from '../state/store';
import { monthLabel, compact } from '../lib/format';
import EventRow from '../components/EventRow';
import ExposGate from '../components/ExposGate';
import RadarMap from '../components/RadarMap';

const FOOTFALL_STEPS = [0, 5000, 7000, 10000, 25000, 50000, 100000];
const WHEN = {
  upcoming: 'Upcoming',
  next30: 'Next 30 days',
  next90: 'Next 3 months',
  next180: 'Next 6 months',
  past: 'Past 12 months',
  all: 'All dates',
};
const UAE_DEFAULT_CITY = 'Dubai';
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
  const { events, status } = useExpos();
  const { notify } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [limit, setLimit] = useState(80);
  const [sheet, setSheet] = useState(false); // phone: filters open as a bottom sheet

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
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((x) => next.append(key, x));
      else if (value !== '' && value != null) next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  const set = (key, value) => {
    if (key === 'country') return update({ country: value === 'all' ? '' : value, city: value === 'UAE' ? UAE_DEFAULT_CITY : '', venue: '' });
    if (key === 'city') return update({ city: value, venue: '' });
    return update({ [key]: value });
  };
  useEffect(() => setLimit(80), [params, q]);

  const inCountry = useMemo(() => events.filter((e) => f.country === 'all' || e.country === f.country), [events, f.country]);
  const cities = useMemo(() => uniq(inCountry.map((e) => e.city)), [inCountry]);
  const venueNames = useMemo(() => uniq(inCountry.filter((e) => !f.city || e.city === f.city).map((e) => e.venue_name)), [inCountry, f.city]);

  const inWindow = useMemo(() => {
    const t = today();
    return inCountry.filter((e) => {
      const end = e.end_date || e.start_date;
      if (!e.start_date) return f.when === 'all';
      switch (f.when) {
        case 'upcoming': return end >= t || (!e.end_date && e.start_date.slice(0, 7) >= t.slice(0, 7));
        case 'next30': return end >= t && e.start_date <= plusDays(30);
        case 'next90': return end >= t && e.start_date <= plusDays(90);
        case 'next180': return end >= t && e.start_date <= plusDays(180);
        case 'past': return end < t && e.start_date >= plusDays(-365);
        default: return true;
      }
    });
  }, [inCountry, f.when]);

  // Everything except niches, so the niche list can show live counts.
  const beforeNiche = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inWindow.filter((e) => {
      if (f.city && e.city !== f.city) return false;
      if (f.venue && e.venue_name !== f.venue) return false;
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
  }, [inWindow, q, f.city, f.venue, f.audience, f.status, f.minFoot, f.unknown]);

  const filtered = useMemo(() => {
    let out = f.niches.length ? beforeNiche.filter((e) => f.niches.some((n) => e.niches?.includes(n))) : beforeNiche;
    if (f.sort === 'footfall') out = [...out].sort((a, b) => (bestFootfall(b) ?? -1) - (bestFootfall(a) ?? -1));
    else if (f.when === 'past') out = [...out].sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    return out;
  }, [beforeNiche, f.niches.join('|'), f.sort, f.when]); // eslint-disable-line

  const nicheCount = useMemo(() => {
    const c = {};
    for (const e of beforeNiche) for (const n of e.niches || []) c[n] = (c[n] || 0) + 1;
    return c;
  }, [beforeNiche]);

  const stats = useMemo(() => ({
    total: inWindow.length,
    big: inWindow.filter((e) => (bestFootfall(e) ?? 0) >= 10000).length,
    shortlisted: inWindow.filter((e) => e.team_status === 'shortlisted').length,
    going: inWindow.filter((e) => e.team_status === 'going').length,
  }), [inWindow]);

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

  const activeCount = [f.city, f.venue, f.audience, f.status, params.has('ff'), params.has('unk'), params.has('when')].filter(Boolean).length + f.niches.length;
  const filtersOn = f.city || f.venue || f.niches.length || f.audience || f.status || params.has('ff') || params.has('unk') || params.has('when');
  const clearFilters = () => {
    setQ('');
    setParams(new URLSearchParams(f.country !== 'all' ? { country: f.country } : {}), { replace: true });
  };

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
    <div className="page" style={{ paddingTop: 16 }}>
      {/* Slim top bar: country, search, sort */}
      <div className="ev-top">
        <div className="title">
          <h1>Events</h1>
          <p>Expos and trade shows in India and the UAE</p>
        </div>
        <div className="seg" role="tablist" aria-label="Country">
          {[['all', 'All'], ['India', 'India'], ['UAE', 'UAE']].map(([k, l]) => (
            <button key={k} className={f.country === k ? 'on' : ''} onClick={() => set('country', k)}>{l}</button>
          ))}
        </div>
        <div className="input-icon grow">
          <Search />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, organisers, industries" />
        </div>
        <button className="btn btn-sm only-phone" onClick={() => setSheet(true)}>
          <SlidersHorizontal /> Filters{activeCount ? ` · ${activeCount}` : ''}
        </button>
        <select className="select ev-sort" value={f.sort} onChange={(e) => set('sort', e.target.value === 'date' ? '' : e.target.value)} aria-label="Sort">
          <option value="date">By date</option>
          <option value="footfall">Biggest footfall</option>
        </select>
        <button className="btn btn-sm hide-phone" onClick={exportCsv} disabled={!filtered.length}><Download /> CSV</button>
      </div>

      <div className="ev-layout">
        {/* Left: all filters */}
        {sheet && <div className="sheet-scrim only-phone" onClick={() => setSheet(false)} />}
        <aside className={`ev-side ${sheet ? 'open' : ''}`} aria-label="Filters">
          <div className="sheet-head only-phone">
            <b>Filters</b>
            <button className="icon-btn" onClick={() => setSheet(false)} aria-label="Close filters"><X /></button>
          </div>
          <div className="side-group">
            <p className="side-title">When</p>
            <select className="select" value={f.when} onChange={(e) => set('when', e.target.value === 'upcoming' ? '' : e.target.value)}>
              {Object.entries(WHEN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>

          <div className="side-group">
            <p className="side-title">Where</p>
            <select className="select" value={f.city} onChange={(e) => set('city', e.target.value)} style={{ marginBottom: 8 }}>
              <option value="">{f.country === 'UAE' ? 'All UAE cities' : 'All cities'}</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="select" value={f.venue} onChange={(e) => set('venue', e.target.value)}>
              <option value="">All venues</option>
              {venueNames.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>

          <div className="side-group">
            <p className="side-title">Footfall</p>
            <div className="radio-list">
              {FOOTFALL_STEPS.map((n) => (
                <label key={n}>
                  <input type="radio" name="ff" checked={f.minFoot === n} onChange={() => set('ff', n === 10000 ? '' : String(n))} />
                  {n === 0 ? 'Any' : `${compact(n)}+ visitors`}
                </label>
              ))}
            </div>
            <label className="toggle" style={{ marginTop: 6, paddingLeft: 6 }} title="Many organisers don’t publish visitor numbers">
              <input type="checkbox" checked={f.unknown} onChange={(e) => set('unk', e.target.checked ? '' : '0')} /> Include unknown footfall
            </label>
          </div>

          <div className="side-group">
            <p className="side-title">Audience</p>
            <div className="radio-list">
              {[['', 'B2B and consumer'], ['B2B', 'B2B (trade)'], ['B2C', 'Consumer']].map(([k, l]) => (
                <label key={k || 'all'}>
                  <input type="radio" name="aud" checked={f.audience === k} onChange={() => set('aud', k)} /> {l}
                </label>
              ))}
            </div>
          </div>

          <div className="side-group">
            <p className="side-title">Our status</p>
            <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Any status</option>
              {EVENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="side-group">
            <p className="side-title">
              Niche
              {f.niches.length > 0 && <button onClick={() => set('niche', [])}>Clear</button>}
            </p>
            <div className="check-list">
              {EXPO_NICHES.map((n) => {
                const on = f.niches.includes(n);
                return (
                  <label key={n}>
                    <input type="checkbox" checked={on} onChange={() => set('niche', on ? f.niches.filter((x) => x !== n) : [...f.niches, n])} />
                    {n}
                    <span className="count">{nicheCount[n] || 0}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {filtersOn && (
            <div className="side-group">
              <button className="btn btn-sm" style={{ width: '100%' }} onClick={clearFilters}>Reset filters</button>
            </div>
          )}
          <div className="sheet-foot only-phone">
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setSheet(false)}>
              Show {filtered.length.toLocaleString('en-IN')} events
            </button>
          </div>
        </aside>

        {/* Middle: results */}
        <main className="ev-main">
          <div className="ev-summary">
            <span><b>{filtered.length.toLocaleString('en-IN')}</b> events{f.minFoot ? ` · ${compact(f.minFoot)}+ visitors${f.unknown ? ' or unknown' : ''}` : ''}</span>
            <span>·</span>
            <button onClick={() => set('ff', '10000')}><b>{stats.big}</b> with 10k+ claimed</button>
            <button className={f.status === 'shortlisted' ? 'on' : ''} onClick={() => set('status', f.status === 'shortlisted' ? '' : 'shortlisted')}><b>{stats.shortlisted}</b> shortlisted</button>
            <button className={f.status === 'going' ? 'on' : ''} onClick={() => set('status', f.status === 'going' ? '' : 'going')}><b>{stats.going}</b> going</button>
          </div>

          {filtered.length === 0 ? (
            <div className="card empty" style={{ marginTop: 12 }}>
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
                  <div className="vlist" style={g.label ? undefined : { marginTop: 10 }}>
                    {g.rows.map((e) => <EventRow key={e.id} e={e} />)}
                  </div>
                </section>
              ))}
              {filtered.length > limit && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button className="btn btn-sm" onClick={() => setLimit((l) => l + 120)}>Show more ({filtered.length - limit} left)</button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Right: small radar map */}
        <aside className="ev-aside" aria-label="Map of these events">
          <RadarMap
            events={filtered}
            country={f.country === 'all' ? 'all' : f.country}
            city={f.city}
            activeVenue={f.venue}
            onPickVenue={(venue, city) => update({ city, venue: f.venue === venue ? '' : venue })}
          />
          {f.venue && (
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={() => set('venue', '')}>
              Show all venues again
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
