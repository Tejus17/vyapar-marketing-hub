import { useMemo, useState } from 'react';
import { MapContainer, CircleMarker, Tooltip } from 'react-leaflet';
import { EnglishMap } from '../lib/tiles';
import { IndiaOnlyMap } from '../components/IndiaShape';
import { Building2, Search } from 'lucide-react';
import { useExpos } from '../state/expos';
import { useExpoDrawers } from '../state/drawer';
import { dateRange, compact } from '../lib/format';
import ExposGate from '../components/ExposGate';

const BOUNDS = { India: [[7.5, 68.5], [33.5, 95.5]], UAE: [[22.6, 51.5], [26.2, 56.5]] };
const today = () => new Date().toISOString().slice(0, 10);

export default function ExpoVenues() {
  const { venues, events, status } = useExpos();
  const { openVenue } = useExpoDrawers();
  const [country, setCountry] = useState('India');
  const [q, setQ] = useState('');

  const upcomingBy = useMemo(() => {
    const t = today();
    const m = {};
    for (const e of events) if (e.venue_id && (e.end_date || e.start_date) >= t) (m[e.venue_id] ||= []).push(e);
    return m;
  }, [events]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return venues
      .filter((v) => v.country === country)
      .filter((v) => !needle || `${v.name} ${(v.aliases || []).join(' ')} ${v.city}`.toLowerCase().includes(needle))
      .sort((a, b) => (upcomingBy[b.id]?.length || 0) - (upcomingBy[a.id]?.length || 0) || a.name.localeCompare(b.name));
  }, [venues, country, q, upcomingBy]);

  if (status !== 'ready') return <ExposGate />;
  const max = Math.max(1, ...list.map((v) => upcomingBy[v.id]?.length || 0));

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="page-head">
        <div>
          <h1 className="h2">Expo venues</h1>
          <p className="sub">Exhibition and convention centres, busiest first. Open one to see its upcoming events and vendors nearby.</p>
        </div>
        <div className="seg">
          {['India', 'UAE'].map((c) => (
            <button key={c} className={country === c ? 'on' : ''} onClick={() => setCountry(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="grid venues-grid">
        <div className="near-map venues-map">
          <MapContainer key={country} bounds={BOUNDS[country]} zoomSnap={0.25} scrollWheelZoom style={{ height: '100%' }}>
            {country === 'India' ? <IndiaOnlyMap /> : <EnglishMap />}
            {list.filter((v) => v.latitude != null).map((v) => {
              const n = upcomingBy[v.id]?.length || 0;
              return (
                <CircleMarker
                  key={v.id}
                  center={[v.latitude, v.longitude]}
                  radius={6 + 16 * Math.sqrt(n / max)}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: n ? '#E8213E' : '#9a9ea6', fillOpacity: 0.8 }}
                  eventHandlers={{ click: () => openVenue(v.id) }}
                >
                  <Tooltip direction="top"><b>{v.name}</b><br />{v.city} · {n} upcoming event{n === 1 ? '' : 's'}</Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
        <div>
          <div className="input-icon" style={{ marginBottom: 12 }}>
            <Search />
            <input className="input" placeholder="Search venues or cities" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="vlist">
            {list.length === 0 && <div className="empty">No venues match.</div>}
            {list.map((v) => {
              const up = upcomingBy[v.id] || [];
              return (
                <div key={v.id} className="venue-card" onClick={() => openVenue(v.id)}>
                  <div className="avatar"><Building2 size={20} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="vname"><span>{v.name}</span></div>
                    <div className="vplace">
                      {v.city}
                      {v.exhibition_area_sqm ? ` · ${compact(Math.round(v.exhibition_area_sqm))} m²` : ''}
                      {v.halls ? ` · ${v.halls} halls` : ''}
                    </div>
                    {up[0] && <div className="hint" style={{ marginTop: 3 }}>Next: {up[0].name} · {dateRange(up[0].start_date, up[0].end_date)}</div>}
                  </div>
                  <span className={`tag ${up.length ? 'tag-red' : 'tag-muted'}`}>{up.length} upcoming</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
