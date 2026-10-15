import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPinned, Store, Building2, Lightbulb, Star, ArrowRight, List, BadgeCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { useOpenVendor } from '../state/drawer';
import { CITIES } from '../lib/constants';
import { timeAgo } from '../lib/format';
import IndiaMap from '../components/IndiaMap';

export default function Overview() {
  const { vendors } = useStore();
  const navigate = useNavigate();
  const open = useOpenVendor();

  const stats = useMemo(() => {
    const cities = new Set(vendors.map((v) => v.city));
    return {
      total: vendors.length,
      cities: cities.size,
      backlit: vendors.filter((v) => v.services?.includes('Backlit / Light boards')).length,
      starred: vendors.filter((v) => v.is_starred).length,
    };
  }, [vendors]);

  const cityRows = useMemo(() => {
    const m = new Map();
    for (const v of vendors) {
      const r = m.get(v.city) || { city: v.city, state: v.state, n: 0, backlit: 0 };
      r.n += 1;
      if (v.services?.includes('Backlit / Light boards')) r.backlit += 1;
      m.set(v.city, r);
    }
    const rows = [...m.values()].map((r) => ({ ...r, tier: CITIES[r.city]?.tier ?? 3 }));
    return [1, 2, 4, 3]
      .map((tier) => ({ tier, rows: rows.filter((r) => r.tier === tier).sort((a, b) => b.n - a.n) }))
      .filter((g) => g.rows.length);
  }, [vendors]);

  const favourites = useMemo(
    () =>
      vendors
        .filter((v) => v.is_starred)
        .sort((a, b) => new Date(b.starred_at || 0) - new Date(a.starred_at || 0))
        .slice(0, 6),
    [vendors]
  );

  const statItems = [
    { icon: Store, value: stats.total, label: 'Vendors listed' },
    { icon: Building2, value: stats.cities, label: 'Cities covered' },
    { icon: Lightbulb, value: stats.backlit, label: 'Make backlit / light boards' },
    { icon: Star, value: stats.starred, label: 'Starred by the team' },
  ];

  return (
    <>
      <section className="page" style={{ paddingBottom: 40 }}>
        <div className="hero">
          <div>
            <span className="eyebrow">Shop-in-Shop · Internal tool</span>
            <h1 className="h1">
              Find the right branding vendor, <span className="gradient-text">near every partner shop</span>
            </h1>
            <p className="lede">
              Light boards, backlit boards, flex, standees and creatives — vendors across India’s Tier 1 and Tier 2 cities,
              with every phone number, rates where published, and notes from the team.
            </p>
            <div className="hero-actions">
              <Link to="/near" className="btn btn-primary btn-lg">
                <MapPinned /> Find vendors near a shop
              </Link>
              <Link to="/vendors" className="btn btn-lg btn-outline-red">
                <List /> Browse all
              </Link>
            </div>
          </div>
          <div className="hero-map">
            <IndiaMap vendors={vendors} />
            <div className="map-legend">
              <b>{stats.total.toLocaleString('en-IN')}</b>
              vendors in {stats.cities} cities · tap a city
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="page" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="stats">
            {statItems.map(({ icon: Icon, value, label }) => (
              <div className="stat" key={label}>
                <div className="stat-icon">
                  <Icon />
                </div>
                <div className="stat-value">{value.toLocaleString('en-IN')}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', gap: 28, alignItems: 'start' }}>
          <div>
            <div className="page-head" style={{ marginBottom: 16 }}>
              <div>
                <h2 className="h2">Coverage by city</h2>
                <p className="sub">Tap a city to see its vendors.</p>
              </div>
            </div>
            {cityRows.map((g) => (
              <div key={g.tier} style={{ marginBottom: 22 }}>
                <p className="tier-tag" style={{ margin: '0 0 10px' }}>
                  {g.tier === 3 ? 'Other cities' : g.tier === 4 ? 'UAE' : `Tier ${g.tier}`}
                </p>
                <div className="city-grid">
                  {g.rows.map((r) => (
                    <button key={r.city} className="city-card" onClick={() => navigate(`/vendors?city=${encodeURIComponent(r.city)}`)}>
                      <span className="city-count">{r.n}</span>
                      <span style={{ minWidth: 0 }}>
                        <b>{r.city}</b>
                        <span>
                          {r.backlit} backlit · {r.state}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className="card card-pad">
            <div className="between" style={{ marginBottom: 6 }}>
              <h3 className="h3">Team favourites</h3>
              <Link to="/starred" className="btn btn-ghost btn-sm">
                All <ArrowRight />
              </Link>
            </div>
            {favourites.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Star a vendor you trust and it shows up here for everyone — with your notes on what you used them for.
              </p>
            ) : (
              favourites.map((v) => (
                <div className="feed-item" key={v.id} onClick={() => open(v.id)} style={{ cursor: 'pointer' }}>
                  <div className="icon-btn starred" style={{ pointerEvents: 'none' }}>
                    <Star />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {v.name} {v.is_verified && <BadgeCheck size={15} color="#138a52" />}
                    </b>
                    <div className="hint">
                      {v.city}
                      {v.starred_by ? ` · by ${v.starred_by}` : ''}
                      {v.starred_at ? ` · ${timeAgo(v.starred_at)}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
