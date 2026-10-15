import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Store, BadgeCheck, MessageSquareText } from 'lucide-react';
import { useStore } from '../state/store';
import { useOpenVendor } from '../state/drawer';
import { timeAgo } from '../lib/format';
import { ServiceTags } from '../components/VendorRow';

export default function Starred() {
  const { vendors, fetchNotes, toggleStar } = useStore();
  const open = useOpenVendor();
  const [notes, setNotes] = useState({});
  const [cityFilter, setCityFilter] = useState('');

  const starred = useMemo(() => vendors.filter((v) => v.is_starred || v.is_verified), [vendors]);
  const ids = starred.map((v) => v.id).join(',');

  useEffect(() => {
    if (!starred.length) return;
    fetchNotes(starred.map((v) => v.id)).then((all) => {
      const byVendor = {};
      for (const n of all) (byVendor[n.vendor_id] ||= []).push(n);
      setNotes(byVendor);
    });
  }, [ids]); // eslint-disable-line

  const cities = [...new Set(starred.map((v) => v.city))].sort();
  const shown = starred
    .filter((v) => !cityFilter || v.city === cityFilter)
    .sort((a, b) => a.city.localeCompare(b.city) || Number(b.is_starred) - Number(a.is_starred) || a.name.localeCompare(b.name));

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="page-head">
        <div>
          <h1 className="h2">Starred and trusted vendors</h1>
          <p className="sub">Vendors the team has starred or worked with, plus what we used them for.</p>
        </div>
        {cities.length > 1 && (
          <select className="select" style={{ width: 220 }} value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="">All cities ({starred.length})</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <Star />
          </div>
          <h3>No starred vendors yet</h3>
          <p>Open any vendor and press “Star as trusted”. Add a note on which partner shop you used them for.</p>
          <Link to="/vendors" className="btn btn-primary" style={{ marginTop: 12 }}>
            Browse vendors
          </Link>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {shown.map((v) => {
            const vn = notes[v.id] || [];
            return (
              <article key={v.id} className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ height: 4, background: 'var(--brand-gradient)' }} />
                <div className="card-pad" style={{ flex: 1, cursor: 'pointer' }} onClick={() => open(v.id)}>
                  <div className="between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 className="h3" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {v.name} {v.is_verified && <BadgeCheck size={16} color="#138a52" />}
                      </h3>
                      <p className="hint" style={{ margin: '2px 0 10px' }}>
                        {[v.area, v.city].filter(Boolean).join(', ')}
                        {v.starred_by ? ` · starred by ${v.starred_by}` : ''}
                      </p>
                    </div>
                    <button
                      className={`icon-btn ${v.is_starred ? 'starred' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(v);
                      }}
                      aria-label={v.is_starred ? 'Unstar' : 'Star'}
                    >
                      <Star />
                    </button>
                  </div>
                  <ServiceTags services={v.services} max={4} />
                  <p style={{ margin: '12px 0 0', fontWeight: 600 }}>{v.phones?.join(' · ') || <span className="soft">No phone</span>}</p>
                  <div style={{ marginTop: 14 }}>
                    {vn.length === 0 ? (
                      <p className="hint" style={{ margin: 0 }}>
                        <MessageSquareText size={13} style={{ verticalAlign: -2 }} /> No notes yet — open to add one.
                      </p>
                    ) : (
                      vn.slice(0, 2).map((n) => (
                        <div className="note" key={n.id} style={{ marginBottom: 8 }}>
                          <div className="note-meta">
                            <b>{n.author}</b>
                            {n.partner_shop && (
                              <span className="tag">
                                <Store /> {n.partner_shop}
                              </span>
                            )}
                            <span>{timeAgo(n.created_at)}</span>
                          </div>
                          <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</p>
                        </div>
                      ))
                    )}
                    {vn.length > 2 && <p className="hint" style={{ margin: 0 }}>+{vn.length - 2} more notes</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
