import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Download, X, SearchX, Plus } from 'lucide-react';
import { useStore } from '../state/store';
import { SERVICES } from '../lib/constants';
import { lowestSqftRate } from '../lib/format';
import VendorRow from '../components/VendorRow';

const PAGE = 60;
const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

function toCsv(rows) {
  const cols = ['name', 'phones', 'address', 'area', 'city', 'state', 'pincode', 'services', 'rates', 'starred', 'worked_with', 'google_maps', 'source'];
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((v) =>
    [
      v.name, (v.phones || []).join(' / '), v.address, v.area, v.city, v.state, v.pincode,
      (v.services || []).join(' / '),
      (v.rates || []).map((r) => `${r.item}: ₹${r.price}${r.price_max ? `-${r.price_max}` : ''}/${r.unit || ''}`).join(' | '),
      v.is_starred ? 'yes' : '', v.is_verified ? 'yes' : '', v.google_maps_url, v.source_url,
    ].map(esc).join(',')
  );
  return [cols.join(','), ...lines].join('\n');
}

export default function Vendors() {
  const { vendors, notify } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [limit, setLimit] = useState(PAGE);

  const f = {
    state: params.get('state') || '',
    city: params.get('city') || '',
    area: params.get('area') || '',
    services: params.getAll('service'),
    starred: params.get('starred') === '1',
    worked: params.get('worked') === '1',
    rates: params.get('rates') === '1',
    maxRate: params.get('max') || '',
    sort: params.get('sort') || 'name',
  };

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    if (Array.isArray(value)) value.forEach((x) => next.append(key, x));
    else if (value) next.set(key, value);
    if (key === 'state') {
      next.delete('city');
      next.delete('area');
    }
    if (key === 'city') next.delete('area');
    setParams(next, { replace: true });
  };

  useEffect(() => setLimit(PAGE), [params, q]);

  const states = useMemo(() => uniqSorted(vendors.map((v) => v.state)), [vendors]);
  const cities = useMemo(
    () => uniqSorted([...vendors.filter((v) => !f.state || v.state === f.state).map((v) => v.city), f.city]),
    [vendors, f.state, f.city]
  );
  const areas = useMemo(
    () => (f.city ? uniqSorted(vendors.filter((v) => v.city === f.city).map((v) => v.area)) : []),
    [vendors, f.city]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    const max = Number(f.maxRate) || null;
    let out = vendors.filter((v) => {
      if (f.state && v.state !== f.state) return false;
      if (f.city && v.city !== f.city) return false;
      if (f.area && v.area !== f.area) return false;
      if (f.services.length && !f.services.some((s) => v.services?.includes(s))) return false;
      if (f.starred && !v.is_starred) return false;
      if (f.worked && !v.is_verified) return false;
      if (f.rates && !v.rates?.length) return false;
      if (max) {
        const low = lowestSqftRate(v);
        if (low == null || low > max) return false;
      }
      if (needle) {
        const hay = `${v.name} ${v.area || ''} ${v.address || ''} ${v.city} ${v.description || ''}`.toLowerCase();
        const phoneHit = digits.length >= 4 && (v.phones || []).some((p) => p.replace(/\D/g, '').includes(digits));
        if (!hay.includes(needle) && !phoneHit) return false;
      }
      return true;
    });
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      city: (a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name),
      price: (a, b) => (lowestSqftRate(a) ?? 1e9) - (lowestSqftRate(b) ?? 1e9),
      recent: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      starred: (a, b) => Number(b.is_starred) - Number(a.is_starred) || Number(b.is_verified) - Number(a.is_verified) || a.name.localeCompare(b.name),
    }[f.sort];
    out = [...out].sort(by);
    return out;
  }, [vendors, q, f.state, f.city, f.area, f.services.join('|'), f.starred, f.worked, f.rates, f.maxRate, f.sort]); // eslint-disable-line

  const anyFilter = q || f.state || f.city || f.area || f.services.length || f.starred || f.worked || f.rates || f.maxRate;

  const exportCsv = () => {
    const blob = new Blob(['﻿' + toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vyapar-vendors${f.city ? '-' + f.city.toLowerCase() : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${filtered.length} vendors`);
  };

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="page-head" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="h2">All vendors</h1>
          <p className="sub">Search by name, area or phone number. Filters stack.</p>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download /> Export CSV
          </button>
          <Link to="/add" className="btn btn-sm btn-outline-red">
            <Plus /> Add vendor
          </Link>
        </div>
      </div>

      <div className="filterbar">
        <div className="filter-row">
          <div className="field">
            <span className="label">Search</span>
            <div className="input-icon">
              <Search />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vendor, area or phone…" />
            </div>
          </div>
          <div className="field">
            <span className="label">State</span>
            <select className="select" value={f.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">City</span>
            <select className="select" value={f.city} onChange={(e) => set('city', e.target.value)}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Area</span>
            <select className="select" value={f.area} onChange={(e) => set('area', e.target.value)} disabled={!f.city}>
              <option value="">{f.city ? 'All areas' : 'Pick a city first'}</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Sort</span>
            <select className="select" value={f.sort} onChange={(e) => set('sort', e.target.value === 'name' ? '' : e.target.value)}>
              <option value="name">Name A–Z</option>
              <option value="starred">Starred first</option>
              <option value="price">Lowest rate</option>
              <option value="city">City</option>
              <option value="recent">Recently added</option>
            </select>
          </div>
        </div>
        <div className="filter-row-2">
          <div className="chips">
            {SERVICES.map((s) => {
              const on = f.services.includes(s);
              return (
                <button
                  key={s}
                  className={`chip ${on ? 'on' : ''}`}
                  onClick={() => set('service', on ? f.services.filter((x) => x !== s) : [...f.services, s])}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
            <label className="toggle">
              <input type="checkbox" checked={f.starred} onChange={(e) => set('starred', e.target.checked ? '1' : '')} /> Starred
            </label>
            <label className="toggle">
              <input type="checkbox" checked={f.worked} onChange={(e) => set('worked', e.target.checked ? '1' : '')} /> Worked with
            </label>
            <label className="toggle">
              <input type="checkbox" checked={f.rates} onChange={(e) => set('rates', e.target.checked ? '1' : '')} /> Has rates
            </label>
            <label className="toggle">
              Max ₹/sq ft
              <input
                className="input"
                style={{ width: 84, height: 34 }}
                type="number"
                min="0"
                value={f.maxRate}
                onChange={(e) => set('max', e.target.value)}
                placeholder="Any"
              />
            </label>
            {anyFilter && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setQ('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                <X /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="results-meta">
        <span>
          <b>{filtered.length.toLocaleString('en-IN')}</b> of {vendors.length.toLocaleString('en-IN')} vendors
          {f.city ? ` in ${f.city}` : f.state ? ` in ${f.state}` : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <SearchX />
          </div>
          <h3>No vendors match</h3>
          <p>Loosen a filter, or add a vendor you know.</p>
          <Link to="/add" className="btn btn-primary" style={{ marginTop: 12 }}>
            <Plus /> Add vendor
          </Link>
        </div>
      ) : (
        <>
          <div className="vlist">
            {filtered.slice(0, limit).map((v) => (
              <VendorRow key={v.id} v={v} />
            ))}
          </div>
          {filtered.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button className="btn" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show more ({(filtered.length - limit).toLocaleString('en-IN')} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
