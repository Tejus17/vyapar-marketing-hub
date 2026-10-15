import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, MapPin, Globe, CalendarDays, Phone, Hammer, ExternalLink } from 'lucide-react';
import { useExpos } from '../state/expos';
import { useExpoDrawers } from '../state/drawer';
import { dateRange, compact, telHref } from '../lib/format';
import { FootfallPill } from './EventRow';
import { NearbyVendors } from './EventDrawer';

const today = () => new Date().toISOString().slice(0, 10);

export default function VenueDrawer({ id, onClose }) {
  const { venueById, events } = useExpos();
  const { openEvent } = useExpoDrawers();
  const v = venueById[id];
  const upcoming = useMemo(
    () => events.filter((e) => e.venue_id === id && (e.end_date || e.start_date) >= today()),
    [events, id]
  );
  useEffect(() => {
    const onKey = (k) => k.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!v) return null;
  const point = v.latitude != null ? { lat: v.latitude, lng: v.longitude } : null;
  const maps = v.google_maps_url || (point ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name}, ${v.city}`)}`);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={v.name}>
        <div className="drawer-head">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="tags" style={{ marginBottom: 8 }}>
                {v.type && <span className="tag">{v.type}</span>}
                <span className="tag">{v.country}</span>
              </div>
              <h2 className="h2" style={{ fontSize: 22, lineHeight: 1.2 }}>{v.name}</h2>
              <p className="sub">{[v.city, v.state].filter(Boolean).join(', ')}</p>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="section">
            <div className="facts">
              <div className="fact"><small>Exhibition space</small><b>{v.exhibition_area_sqm ? `${compact(Math.round(v.exhibition_area_sqm))} m²` : '—'}</b><p>{v.halls ? `${v.halls} halls` : ' '}</p></div>
              <div className="fact"><small>Upcoming events</small><b>{upcoming.length}</b><p>{v.capacity_note || ' '}</p></div>
            </div>
            {v.address && <p style={{ margin: '12px 0 0' }}>{v.address}</p>}
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <a className="btn btn-sm" href={maps} target="_blank" rel="noreferrer"><MapPin /> Google Maps</a>
              {v.website && <a className="btn btn-sm btn-ghost" href={v.website} target="_blank" rel="noreferrer"><Globe /> Website</a>}
              {v.events_calendar_url && <a className="btn btn-sm btn-ghost" href={v.events_calendar_url} target="_blank" rel="noreferrer"><CalendarDays /> Their calendar</a>}
              {v.phone && <a className="btn btn-sm btn-ghost" href={telHref(v.phone)}><Phone /> {v.phone}</a>}
            </div>
          </div>
          <div className="section">
            <p className="section-title">Upcoming events here</p>
            {upcoming.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>None in our list yet{v.events_calendar_url ? ' — check their calendar above.' : '.'}</p>
            ) : (
              upcoming.slice(0, 12).map((e) => (
                <div key={e.id} className="near-vendor" onClick={() => openEvent(e.id)}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{e.name}</b>
                    <div className="hint">{dateRange(e.start_date, e.end_date)}</div>
                  </div>
                  <FootfallPill e={e} />
                  <span />
                </div>
              ))
            )}
            {upcoming.length > 12 && (
              <Link to={`/expos?country=${v.country}&venue=${encodeURIComponent(upcoming[0].venue_name || '')}&ff=0`} className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}>
                <CalendarDays /> See all {upcoming.length} events
              </Link>
            )}
          </div>
          <div className="section">
            <p className="section-title"><Hammer size={12} style={{ verticalAlign: -1 }} /> Vendors near this venue</p>
            <NearbyVendors point={point} label={v.name} />
          </div>
          {v.source_url && (
            <div className="section">
              <a href={v.source_url} target="_blank" rel="noreferrer" className="row" style={{ color: 'var(--red)', fontWeight: 500 }}><ExternalLink size={15} /> Source</a>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
