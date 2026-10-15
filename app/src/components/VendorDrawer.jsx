import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Star, Phone, MessageCircle, Copy, MapPin, ExternalLink, BadgeCheck, Pencil, Trash2, Globe, Store, Send, Archive,
} from 'lucide-react';
import { useStore } from '../state/store';
import { mapsUrlFor } from '../lib/geo';
import { rateLabel, telHref, whatsappHref, timeAgo, isForwardingLine } from '../lib/format';
import { ServiceTags } from './VendorRow';

export default function VendorDrawer({ id, onClose }) {
  const { vendors, toggleStar, updateVendor, archiveVendor, fetchNotes, addNote, deleteNote, me, setMe, notify } = useStore();
  const navigate = useNavigate();
  const v = vendors.find((x) => x.id === id);
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState({ author: me, partner_shop: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    let live = true;
    fetchNotes([id]).then((n) => live && setNotes(n));
    return () => {
      live = false;
    };
  }, [id, fetchNotes]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!v) return null;

  // A number listed for several unrelated vendors is usually a directory's routing line.
  const sharedWith = (p) => {
    const d = p.replace(/\D/g, '');
    return vendors.filter((x) => x.id !== v.id && x.phones?.some((q) => q.replace(/\D/g, '') === d)).length;
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied');
    } catch {
      notify('Copy isn’t allowed here — select the number instead', 'error');
    }
  };

  const submitNote = async (e) => {
    e.preventDefault();
    if (!draft.body.trim() || !draft.author.trim()) return;
    setSaving(true);
    if (draft.author !== me) setMe(draft.author.trim());
    const saved = await addNote({
      vendor_id: v.id,
      author: draft.author.trim(),
      partner_shop: draft.partner_shop.trim() || null,
      body: draft.body.trim(),
    });
    setSaving(false);
    if (saved) {
      setNotes((n) => [saved, ...(n || [])]);
      setDraft((d) => ({ ...d, body: '', partner_shop: '' }));
      notify('Note added');
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={v.name}>
        <div className="drawer-head">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="tags" style={{ marginBottom: 8 }}>
                {v.is_starred && (
                  <span className="tag tag-amber">
                    <Star /> Starred{v.starred_by ? ` by ${v.starred_by}` : ''}
                  </span>
                )}
                {v.is_verified && (
                  <span className="tag tag-green">
                    <BadgeCheck /> Worked with us
                  </span>
                )}
                {v.source_name && <span className="tag">{v.source_name}</span>}
              </div>
              <h2 className="h2" style={{ fontSize: 22, lineHeight: 1.2 }}>{v.name}</h2>
              <p className="sub">
                {[v.area, v.city, v.state].filter(Boolean).join(', ')}
                {v.established ? ` · since ${v.established}` : ''}
                {v.rating ? ` · ★ ${v.rating}` : ''}
              </p>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
          <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${v.is_starred ? 'btn-outline-red' : 'btn-primary'}`} onClick={() => toggleStar(v)}>
              <Star /> {v.is_starred ? 'Unstar' : 'Star as trusted'}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => updateVendor(v.id, { is_verified: !v.is_verified })}
              title="Mark when the team has actually worked with this vendor"
            >
              <BadgeCheck /> {v.is_verified ? 'Unmark worked-with' : 'We’ve worked with them'}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => { navigate(`/edit/${v.id}`); onClose(); }}>
              <Pencil /> Edit
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <div className="section">
            <p className="section-title">Phone numbers</p>
            {v.phones?.length ? (
              v.phones.map((p) => {
                const wa = whatsappHref(p);
                const shared = sharedWith(p);
                return (
                  <div className="phone-line" key={p}>
                    <span className="num">
                      {p}
                      {shared > 0 && (
                        <span className="hint" style={{ display: 'block', fontWeight: 400, letterSpacing: 0 }}>
                          Also listed for {shared} other vendor{shared > 1 ? 's' : ''} — confirm who answers
                        </span>
                      )}
                    </span>
                    <a className="icon-btn" href={telHref(p)} aria-label={`Call ${p}`} title="Call">
                      <Phone />
                    </a>
                    {wa && (
                      <a className="icon-btn" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">
                        <MessageCircle />
                      </a>
                    )}
                    <button className="icon-btn" onClick={() => copy(p)} aria-label="Copy number" title="Copy">
                      <Copy />
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="muted">No phone listed — check the source page.</p>
            )}
            {v.phones?.some(isForwardingLine) && (
              <p className="hint" style={{ marginTop: 6 }}>This is a directory call-forwarding line (IndiaMART / Sulekha) — it rings the vendor, and the call button dials any extension for you, but it won’t work on WhatsApp.</p>
            )}
          </div>

          <div className="section">
            <p className="section-title">Address</p>
            <p style={{ margin: '0 0 10px' }}>{v.address || [v.area, v.city, v.state, v.pincode].filter(Boolean).join(', ')}</p>
            {v.location_precision !== 'exact' && (
              <p className="hint" style={{ margin: '0 0 10px' }}>
                Map pin is {v.location_precision === 'area' ? 'at the locality' : 'at the city centre'} — paste the vendor’s Google Maps link in Edit for an exact pin.
              </p>
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <a className="btn btn-sm" href={mapsUrlFor(v)} target="_blank" rel="noreferrer">
                <MapPin /> Open in Google Maps
              </a>
              {v.website && (
                <a className="btn btn-sm btn-ghost" href={v.website} target="_blank" rel="noreferrer">
                  <Globe /> Website
                </a>
              )}
            </div>
          </div>

          <div className="section">
            <p className="section-title">What they make</p>
            <ServiceTags services={v.services} max={10} />
            {v.description && <p className="muted" style={{ margin: '10px 0 0' }}>{v.description}</p>}
          </div>

          <div className="section">
            <p className="section-title">Rates</p>
            {v.rates?.length ? (
              <table className="rate-table">
                <tbody>
                  {v.rates.map((r, i) => (
                    <tr key={i}>
                      <td>{r.item}</td>
                      <td>{rateLabel(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Not published — ask for a quote. Add the rate in Edit once you have one.</p>
            )}
            {v.rates?.length > 0 && (
              <p className="hint" style={{ marginTop: 8 }}>Listed online; quality and final price vary — confirm before ordering.</p>
            )}
          </div>

          <div className="section">
            <p className="section-title">Team notes {notes?.length ? `(${notes.length})` : ''}</p>
            <form onSubmit={submitNote} className="card" style={{ padding: 14, marginBottom: 14, background: '#fff' }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <input
                  className="input"
                  placeholder="Your name"
                  value={draft.author}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                  required
                  style={{ height: 38 }}
                />
                <input
                  className="input"
                  placeholder="Partner shop (optional)"
                  value={draft.partner_shop}
                  onChange={(e) => setDraft({ ...draft, partner_shop: e.target.value })}
                  style={{ height: 38 }}
                />
              </div>
              <textarea
                className="textarea"
                placeholder="e.g. Made 2 backlit boards for Sharma Traders — good finish, delivered in 4 days, ₹160/sq ft incl. frame."
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                required
              />
              <div className="between" style={{ marginTop: 8 }}>
                <span className="hint">Everyone in the team can see notes.</span>
                <button className="btn btn-primary btn-sm" disabled={saving}>
                  <Send /> {saving ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </form>
            {notes === null ? (
              <div className="spinner" style={{ width: 24, height: 24 }} />
            ) : notes.length === 0 ? (
              <p className="muted">No notes yet. Worked with them? Leave one for the team.</p>
            ) : (
              notes.map((n) => (
                <div className="note" key={n.id}>
                  <div className="note-meta">
                    <b>{n.author}</b>
                    {n.partner_shop && (
                      <span className="tag">
                        <Store /> {n.partner_shop}
                      </span>
                    )}
                    <span>{timeAgo(n.created_at)}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', height: 26, padding: '0 8px' }}
                      onClick={async () => (await deleteNote(n.id)) && setNotes((ns) => ns.filter((x) => x.id !== n.id))}
                      aria-label="Delete note"
                    >
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
            {v.source_url ? (
              <a href={v.source_url} target="_blank" rel="noreferrer" className="row" style={{ color: 'var(--red)', fontWeight: 500 }}>
                <ExternalLink size={15} /> {v.source_name || 'Listing'} page
              </a>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Added by {v.added_by || 'the team'}</p>
            )}
            <div style={{ marginTop: 16 }}>
              {confirmArchive ? (
                <div className="alert alert-red" style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>Remove this vendor from the dashboard? Notes are kept.</span>
                  <button className="btn btn-sm btn-primary" onClick={async () => {
                      if (await archiveVendor(v.id)) {
                        notify('Vendor removed');
                        onClose();
                      }
                    }}>
                    Remove
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setConfirmArchive(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirmArchive(true)}>
                  <Archive /> Remove vendor (closed / wrong / duplicate)
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
