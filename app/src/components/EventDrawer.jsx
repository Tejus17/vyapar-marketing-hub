import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, CalendarDays, MapPin, ExternalLink, Globe, Phone, Send, Trash2, Hammer, Users, Building2, Info } from 'lucide-react';
import { useExpos, EVENT_STATUSES, bestFootfall } from '../state/expos';
import { useStore } from '../state/store';
import { useOpenVendor, useExpoDrawers } from '../state/drawer';
import { dateRange, daysUntil, compact, timeAgo, telHref } from '../lib/format';
import { vendorsNear } from '../lib/geo';
import { ServiceTags } from './VendorRow';

const BOOTH = 'Exhibition stalls & booths';

/** Booth / branding vendors around a point — shared by the event and venue panels. */
export function NearbyVendors({ point, label }) {
  const { vendors } = useStore();
  const openVendor = useOpenVendor();
  const [radius, setRadius] = useState(15);
  const [kind, setKind] = useState('booth');
  const list = useMemo(
    () =>
      vendorsNear(vendors, point, {
        km: radius,
        services: kind === 'booth' ? [BOOTH] : kind === 'print' ? ['Flex boards', 'Backlit / Light boards', 'Standees', 'Vinyl & creatives'] : [],
        limit: 12,
      }),
    [vendors, point, radius, kind]
  );
  if (!point || point.lat == null) {
    return <p className="muted" style={{ margin: 0 }}>No map location for {label || 'this venue'} yet, so nearby vendors can’t be listed.</p>;
  }
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        <div className="seg">
          {[['booth', 'Booth builders'], ['print', 'Flex & signage'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <div className="seg">
          {[5, 15, 30].map((r) => (
            <button key={r} className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>{r} km</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="muted" style={{ margin: '6px 0' }}>
          No {kind === 'booth' ? 'booth builders' : 'vendors'} within {radius} km in our list yet — try a wider radius or “All”.
        </p>
      ) : (
        list.map(({ v, km: d }) => (
          <div className="near-vendor" key={v.id} onClick={() => openVendor(v.id)}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5 }}>{v.name}</b>
              <div className="hint">{[v.area, v.city].filter(Boolean).join(', ')}{v.location_precision === 'city' ? ' · approx.' : ''}</div>
              <div style={{ marginTop: 4 }}><ServiceTags services={v.services} max={3} /></div>
            </div>
            <span className="hint" style={{ fontWeight: 600, color: 'var(--ink)' }}>{d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`}</span>
            {v.phones?.[0] ? (
              <a className="icon-btn" href={telHref(v.phones[0])} onClick={(e) => e.stopPropagation()} aria-label={`Call ${v.name}`} title={v.phones[0]}>
                <Phone />
              </a>
            ) : <span />}
          </div>
        ))
      )}
      <Link to={`/near?at=${point.lat.toFixed(5)},${point.lng.toFixed(5)}&q=${encodeURIComponent(label || 'Venue')}&r=${radius}`} className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}>
        <MapPin /> Open on the vendor map
      </Link>
    </>
  );
}

export default function EventDrawer({ id, onClose }) {
  const { events, venueById, setEventStatus, updateEvent, fetchNotes, addNote, deleteNote } = useExpos();
  const { me, setMe, notify } = useStore();
  const { openVenue } = useExpoDrawers();
  const e = events.find((x) => x.id === id);
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState({ author: me, body: '' });
  const [teamFoot, setTeamFoot] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    fetchNotes([id]).then((n) => live && setNotes(n));
    return () => { live = false; };
  }, [id, fetchNotes]);
  useEffect(() => setTeamFoot(e?.team_footfall ?? ''), [e?.team_footfall]);
  useEffect(() => {
    const onKey = (k) => k.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!e) return null;
  const venue = venueById[e.venue_id];
  const point = venue?.latitude != null ? { lat: venue.latitude, lng: venue.longitude } : e.latitude != null ? { lat: e.latitude, lng: e.longitude } : null;
  const d = daysUntil(e.start_date);
  const ff = bestFootfall(e);

  const submitNote = async (ev) => {
    ev.preventDefault();
    if (!draft.body.trim() || !draft.author.trim()) return;
    setSaving(true);
    if (draft.author !== me) setMe(draft.author.trim());
    const saved = await addNote({ event_id: e.id, author: draft.author.trim(), body: draft.body.trim() });
    setSaving(false);
    if (saved) {
      setNotes((n) => [saved, ...(n || [])]);
      setDraft((x) => ({ ...x, body: '' }));
      notify('Note added');
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={e.name}>
        <div className="drawer-head">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="tags" style={{ marginBottom: 8 }}>
                <span className="tag tag-red"><CalendarDays /> {dateRange(e.start_date, e.end_date)}</span>
                {d > 0 && e.end_date && <span className="tag">in {d} days</span>}
                {d < 0 && <span className="tag tag-muted">past</span>}
                {e.audience && <span className="tag">{e.audience}</span>}
                <span className="tag">{e.country}</span>
              </div>
              <h2 className="h2" style={{ fontSize: 22, lineHeight: 1.2 }}>{e.name}</h2>
              <p className="sub">
                {e.venue_name ? (
                  venue ? (
                    <button className="linklike" onClick={() => openVenue(venue.id)}>{e.venue_name}</button>
                  ) : e.venue_name
                ) : 'Venue TBA'}
                {`, ${e.city}`}
              </p>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
          </div>
          <div className="status-row" style={{ marginTop: 14 }}>
            {EVENT_STATUSES.map((s) => (
              <button key={s.key} className={`btn btn-sm ${e.team_status === s.key ? 'on' : ''}`} onClick={() => setEventStatus(e, s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          {e.status_by && e.team_status !== 'new' && (
            <p className="hint" style={{ margin: '8px 0 0' }}>Marked “{EVENT_STATUSES.find((s) => s.key === e.team_status)?.label}” by {e.status_by}{e.status_at ? ` · ${timeAgo(e.status_at)}` : ''}</p>
          )}
        </div>

        <div className="drawer-body">
          <div className="section">
            <div className="facts">
              <div className="fact">
                <small>Footfall</small>
                <b>{ff != null ? `${compact(ff)} visitors` : 'Not published'}</b>
                <p>
                  {e.team_footfall != null ? 'Counted by our team' : e.footfall_text ? `“${e.footfall_text}”` : 'Organiser hasn’t published a number'}
                </p>
              </div>
              <div className="fact">
                <small>Exhibitors</small>
                <b>{e.exhibitors ? compact(e.exhibitors) : '—'}</b>
                <p>{e.cycle ? `Held ${e.cycle}` : 'Frequency not listed'}</p>
              </div>
              <div className="fact" style={{ gridColumn: '1 / -1' }}>
                <small>Organiser</small>
                <b style={{ fontSize: 14 }}>{e.organiser || '—'}</b>
                {e.organiser_phone && <p>{e.organiser_phone}</p>}
              </div>
            </div>
            {e.footfall != null && e.team_footfall == null && (
              <p className="hint" style={{ marginTop: 8 }}>
                <Info size={12} style={{ verticalAlign: -2 }} /> Organisers’ numbers are often generous. Add the real count below after you attend.
              </p>
            )}
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {e.website && <a className="btn btn-sm" href={e.website} target="_blank" rel="noreferrer"><Globe /> Event website</a>}
              {e.organiser_website && <a className="btn btn-sm btn-ghost" href={e.organiser_website} target="_blank" rel="noreferrer"><Building2 /> Organiser</a>}
              {e.footfall_source_url && e.footfall_source_url !== e.website && (
                <a className="btn btn-sm btn-ghost" href={e.footfall_source_url} target="_blank" rel="noreferrer"><Users /> Footfall source</a>
              )}
            </div>
          </div>

          {(e.description || e.niches?.length || e.industries?.length) ? (
            <div className="section">
              <p className="section-title">About</p>
              {e.description && <p style={{ margin: '0 0 10px' }}>{e.description}</p>}
              {e.niches?.length > 0 && (
                <div className="tags" style={{ marginBottom: 8 }}>
                  {e.niches.map((n) => <span key={n} className="tag tag-red">{n}</span>)}
                </div>
              )}
              {e.industries?.length > 0 && <p className="hint" style={{ margin: 0 }}>Listed under: {e.industries.join(', ')}</p>}
            </div>
          ) : null}

          <div className="section">
            <p className="section-title"><Hammer size={12} style={{ verticalAlign: -1 }} /> Vendors near this venue</p>
            <NearbyVendors point={point} label={e.venue_name || e.city} />
          </div>

          <div className="section">
            <p className="section-title">Our footfall count</p>
            <div className="row">
              <input className="input" type="number" min="0" placeholder="e.g. 7000 — what we actually saw" value={teamFoot} onChange={(x) => setTeamFoot(x.target.value)} style={{ maxWidth: 260 }} />
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const v = teamFoot === '' ? null : Math.round(Number(teamFoot));
                  if (await updateEvent(e.id, { team_footfall: v })) notify(v == null ? 'Cleared' : 'Saved');
                }}
              >
                Save
              </button>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>Replaces the organiser’s claim everywhere in the dashboard.</p>
          </div>

          <div className="section">
            <p className="section-title">Team notes {notes?.length ? `(${notes.length})` : ''}</p>
            <form onSubmit={submitNote} className="card" style={{ padding: 14, marginBottom: 14 }}>
              <input className="input" placeholder="Your name" value={draft.author} onChange={(x) => setDraft({ ...draft, author: x.target.value })} required style={{ height: 38, marginBottom: 8 }} />
              <textarea
                className="textarea"
                placeholder="e.g. 2025 edition: ~7,000 visitors but 300 solid leads from kirana owners. Stall 3×3 m cost ₹85k incl. fabrication."
                value={draft.body}
                onChange={(x) => setDraft({ ...draft, body: x.target.value })}
                required
              />
              <div className="between" style={{ marginTop: 8 }}>
                <span className="hint">Everyone in the team can see notes.</span>
                <button className="btn btn-primary btn-sm" disabled={saving}><Send /> {saving ? 'Saving…' : 'Add note'}</button>
              </div>
            </form>
            {notes === null ? (
              <div className="spinner" style={{ width: 24, height: 24 }} />
            ) : notes.length === 0 ? (
              <p className="muted">No notes yet. Been to this one before? Tell the team how it went.</p>
            ) : (
              notes.map((n) => (
                <div className="note" key={n.id}>
                  <div className="note-meta">
                    <b>{n.author}</b>
                    <span>{timeAgo(n.created_at)}</span>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', height: 26, padding: '0 8px' }} onClick={async () => (await deleteNote(n.id)) && setNotes((ns) => ns.filter((x) => x.id !== n.id))} aria-label="Delete note">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p>{n.body}</p>
                </div>
              ))
            )}
          </div>

          <div className="section">
            <p className="section-title">Source</p>
            {e.source_url ? (
              <a href={e.source_url} target="_blank" rel="noreferrer" className="row" style={{ color: 'var(--red)', fontWeight: 500 }}>
                <ExternalLink size={15} /> {e.source_name || 'Listing'} page
              </a>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Added by {e.added_by || 'the team'}</p>
            )}
            <p className="hint" style={{ marginTop: 6 }}>Dates can change — confirm with the organiser before booking.</p>
          </div>
        </div>
      </aside>
    </>
  );
}
