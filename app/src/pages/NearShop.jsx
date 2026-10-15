import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MapContainer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import { EnglishMap } from '../lib/tiles';
import L from 'leaflet';
import { MapPinned, LocateFixed, Search, Route, AlertCircle, Navigation, Star, BadgeCheck, Info } from 'lucide-react';
import { useStore, readLocal, writeLocal } from '../state/store';
import { useOpenVendor } from '../state/drawer';
import { SERVICES, TRAVEL_MODES } from '../lib/constants';
import { resolveLocation, haversineKm, roadDistances, estimateRoadKm, directionsUrl } from '../lib/geo';
import { km, minutes, rupees, lowestSqftRate } from '../lib/format';
import { ServiceTags } from '../components/VendorRow';

const MAX_ROUTED = 25;

const shopIcon = L.divIcon({
  className: 'pin-shop',
  html: `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 0C7.6 0 0 7.4 0 16.6 0 29 17 44 17 44s17-15 17-27.4C34 7.4 26.4 0 17 0z" fill="#E8213E"/><circle cx="17" cy="16.5" r="7" fill="#fff"/></svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
});
const vendorIcon = (n, approx) =>
  L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:999px;background:${approx ? '#fff' : '#1b1b1f'};color:${approx ? '#1b1b1f' : '#fff'};border:2px solid ${approx ? '#9a9ea6' : '#fff'};display:grid;place-items:center;font:700 12px Poppins,sans-serif;box-shadow:0 3px 8px rgba(0,0,0,.25)">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

function FitTo({ origin, radius }) {
  const map = useMap();
  useEffect(() => {
    if (!origin) return;
    const b = L.latLng(origin.lat, origin.lng).toBounds(radius * 2000);
    map.fitBounds(b, { padding: [20, 20] });
  }, [origin, radius, map]);
  return null;
}

export default function NearShop() {
  const { vendors } = useStore();
  const open = useOpenVendor();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(params.get('q') || '');
  const [origin, setOrigin] = useState(() => {
    const at = params.get('at');
    if (!at) return null;
    const [lat, lng] = at.split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label: params.get('q') || 'Partner shop' } : null;
  });
  const [radius, setRadius] = useState(Number(params.get('r')) || 10);
  const [services, setServices] = useState(params.getAll('service'));
  const [includeApprox, setIncludeApprox] = useState(true);
  const [mode, setMode] = useState(() => readLocal('vh_mode', 'bike'));
  const [rates, setRates] = useState(() => readLocal('vh_rates', Object.fromEntries(Object.entries(TRAVEL_MODES).map(([k, m]) => [k, m.perKm]))));
  const [roundTrip, setRoundTrip] = useState(() => readLocal('vh_round', true));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [roads, setRoads] = useState(null); // { [vendorId]: {km, min} } or 'unavailable'

  useEffect(() => writeLocal('vh_mode', mode), [mode]);
  useEffect(() => writeLocal('vh_rates', rates), [rates]);
  useEffect(() => writeLocal('vh_round', roundTrip), [roundTrip]);

  const inRadius = useMemo(() => {
    if (!origin) return [];
    return vendors
      .filter((v) => v.latitude != null && (includeApprox || v.location_precision !== 'city'))
      .filter((v) => !services.length || services.some((s) => v.services?.includes(s)))
      .map((v) => ({ v, straight: haversineKm(origin, { lat: v.latitude, lng: v.longitude }) }))
      .filter((x) => x.straight <= radius)
      .sort((a, b) => a.straight - b.straight);
  }, [vendors, origin, radius, services, includeApprox]);

  // Ask the router for real road distances for the closest few.
  useEffect(() => {
    if (!origin || !inRadius.length) {
      setRoads(null);
      return;
    }
    let live = true;
    const top = inRadius.slice(0, MAX_ROUTED);
    roadDistances(origin, top.map(({ v }) => ({ lat: v.latitude, lng: v.longitude }))).then((res) => {
      if (!live) return;
      if (!res) return setRoads('unavailable');
      setRoads(Object.fromEntries(top.map(({ v }, i) => [v.id, res[i]])));
    });
    return () => {
      live = false;
    };
  }, [origin, inRadius]);

  // When nothing is inside the radius, find how far the closest vendors are.
  const nearestAny = useMemo(() => {
    if (!origin || inRadius.length) return [];
    return vendors
      .filter((v) => v.latitude != null && (!services.length || services.some((s) => v.services?.includes(s))))
      .map((v) => ({ v, straight: haversineKm(origin, { lat: v.latitude, lng: v.longitude }) }))
      .sort((a, b) => a.straight - b.straight)
      .slice(0, 5);
  }, [vendors, origin, inRadius.length, services]);

  const perKm = Number(rates[mode]) || 0;
  const results = useMemo(() => {
    return inRadius
      .map(({ v, straight }) => {
        const road = roads && roads !== 'unavailable' ? roads[v.id] : null;
        const roadKm = road?.km ?? estimateRoadKm(straight);
        const mins = road ? road.min * 1.25 : (roadKm / TRAVEL_MODES[mode].kmph) * 60;
        const trips = roundTrip ? 2 : 1;
        return { v, straight, roadKm, routed: !!road, mins: mins * trips, cost: roadKm * perKm * trips };
      })
      .sort((a, b) => a.roadKm - b.roadKm);
  }, [inRadius, roads, perKm, mode, roundTrip]);

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const loc = await resolveLocation(query);
      setOrigin(loc);
      const next = new URLSearchParams(params);
      next.set('at', `${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`);
      next.set('q', query.trim());
      setParams(next, { replace: true });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setErr('This browser can’t share location.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your current location' };
        setOrigin(loc);
        setQuery(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
        setBusy(false);
      },
      () => {
        setErr('Location permission was denied — paste the shop’s Google Maps link instead.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const setR = (r) => {
    setRadius(r);
    const next = new URLSearchParams(params);
    next.set('r', String(r));
    setParams(next, { replace: true });
  };

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <MapPinned size={14} /> Partner shop search
          </span>
          <h1 className="h2" style={{ marginTop: 12 }}>Find vendors near a partner shop</h1>
          <p className="sub">Closest vendors first, by road distance, with an estimate of what the trip will cost.</p>
        </div>
      </div>

      <div className="near-layout">
        <div className="near-panel card card-pad">
          <form onSubmit={search}>
            <div className="field">
              <span className="label">Partner shop location</span>
              <div className="input-icon">
                <Search />
                <input
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Paste Google Maps link, or type an address"
                />
              </div>
              <span className="hint">Paste any Google Maps link (short maps.app.goo.gl links work too), “28.56, 77.24”, or “Lajpat Nagar, Delhi”.</span>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                <Search /> {busy ? 'Finding…' : 'Find vendors'}
              </button>
              <button type="button" className="btn" onClick={useMyLocation} disabled={busy} title="Use my current location">
                <LocateFixed />
              </button>
            </div>
          </form>

          {err && (
            <div className="alert alert-red" style={{ marginTop: 12 }}>
              <AlertCircle /> <span>{err}</span>
            </div>
          )}

          <div className="field" style={{ marginTop: 22 }}>
            <span className="label">Search radius</span>
            <div className="range-wrap">
              <input type="range" min="1" max="60" step="1" value={radius} onChange={(e) => setR(Number(e.target.value))} />
              <input
                className="input"
                type="number"
                min="1"
                max="500"
                value={radius}
                onChange={(e) => setR(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 74, height: 38, textAlign: 'right' }}
                aria-label="Radius in km"
              />
              <span className="muted">km</span>
            </div>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <span className="label">Needs</span>
            <div className="chips">
              {SERVICES.map((s) => {
                const on = services.includes(s);
                return (
                  <button key={s} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setServices(on ? services.filter((x) => x !== s) : [...services, s])}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <span className="label">Travel cost</span>
            <div className="row">
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
                {Object.entries(TRAVEL_MODES).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="input-icon" style={{ width: 120, flexShrink: 0 }}>
                <span style={{ position: 'absolute', left: 12, top: 11, color: 'var(--soft)', fontWeight: 600 }}>₹</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={rates[mode]}
                  onChange={(e) => setRates({ ...rates, [mode]: e.target.value })}
                  style={{ paddingLeft: 26 }}
                  aria-label="Rupees per km"
                />
              </div>
            </div>
            <span className="hint">₹ per km — change it to match what you actually pay.</span>
          </div>

          <div className="row" style={{ marginTop: 14, gap: 18, flexWrap: 'wrap' }}>
            <label className="toggle">
              <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} /> Round trip
            </label>
            <label className="toggle" title="Some vendors only have a city-level address">
              <input type="checkbox" checked={includeApprox} onChange={(e) => setIncludeApprox(e.target.checked)} /> Include approx. pins
            </label>
          </div>
        </div>

        <div>
          <div className="near-map">
            <MapContainer center={origin ? [origin.lat, origin.lng] : [22.6, 80.2]} zoom={origin ? 12 : 4.6} scrollWheelZoom style={{ height: '100%' }}>
              <EnglishMap />
              {origin && (
                <>
                  <FitTo origin={origin} radius={radius} />
                  <Circle
                    center={[origin.lat, origin.lng]}
                    radius={radius * 1000}
                    pathOptions={{ color: '#E8213E', weight: 1.5, fillColor: '#E8213E', fillOpacity: 0.06, dashArray: '6 6' }}
                  />
                  <Marker position={[origin.lat, origin.lng]} icon={shopIcon} zIndexOffset={1000}>
                    <Popup>
                      <b>Partner shop</b>
                      <br />
                      {origin.label}
                    </Popup>
                  </Marker>
                  {results.slice(0, 40).map(({ v }, i) => (
                    <Marker
                      key={v.id}
                      position={[v.latitude, v.longitude]}
                      icon={vendorIcon(i + 1, v.location_precision === 'city')}
                      eventHandlers={{ click: () => open(v.id) }}
                    />
                  ))}
                </>
              )}
            </MapContainer>
          </div>

          {!origin ? (
            <div className="card empty" style={{ marginTop: 16 }}>
              <div className="empty-icon">
                <MapPinned />
              </div>
              <h3>Where’s the partner shop?</h3>
              <p>Paste its Google Maps link on the left — you’ll get the nearest vendors with distance and trip cost.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <h3 className="h3" style={{ marginBottom: 4 }}>No vendors within {radius} km of {origin.label || 'this shop'}</h3>
              {nearestAny.length > 0 ? (
                <>
                  <p className="sub" style={{ marginBottom: 12 }}>
                    The closest ones in our list are {Math.round(nearestAny[0].straight)} km away (straight line):
                  </p>
                  <div className="vlist" style={{ marginBottom: 12 }}>
                    {nearestAny.map(({ v, straight }) => (
                      <div className="near-card" key={v.id} onClick={() => open(v.id)}>
                        <div className="rank" style={{ background: 'var(--ink)' }}>{Math.round(straight)}<span style={{ fontSize: 9, marginLeft: 1 }}>km</span></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="vname"><span>{v.name}</span></div>
                          <div className="vplace">{[v.area, v.city].filter(Boolean).join(', ')}{v.phones?.[0] ? ` · ${v.phones[0]}` : ''}</div>
                        </div>
                        <span />
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setR(Math.min(500, Math.ceil((nearestAny[Math.min(2, nearestAny.length - 1)].straight + 5) / 10) * 10))}>
                      Search {Math.min(500, Math.ceil((nearestAny[Math.min(2, nearestAny.length - 1)].straight + 5) / 10) * 10)} km instead
                    </button>
                    <Link to="/add" className="btn btn-sm">Add a local vendor you know</Link>
                  </div>
                </>
              ) : (
                <p className="sub">No vendors in our list for this need yet.</p>
              )}
            </div>
          ) : (
            <>
              <div className="results-meta">
                <span>
                  <b>{results.length}</b> vendor{results.length === 1 ? '' : 's'} within {radius} km
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {roads === 'unavailable' ? (
                    <>
                      <Info size={14} /> Road distance estimated (routing service busy)
                    </>
                  ) : (
                    <>
                      <Route size={14} /> Road distances for the {Math.min(MAX_ROUTED, results.length)} closest
                    </>
                  )}
                </span>
              </div>
              <div className="vlist">
                {results.map(({ v, roadKm, routed, mins, cost }, i) => {
                  const from = lowestSqftRate(v);
                  return (
                    <div className="near-card" key={v.id} onClick={() => open(v.id)}>
                      <div className="rank" style={i > 2 ? { background: 'var(--ink)' } : undefined}>
                        {i + 1}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="vname">
                          <span>{v.name}</span>
                          {v.is_starred && <Star size={15} fill="#fdc414" color="#e6a100" />}
                          {v.is_verified && <BadgeCheck size={15} color="#138a52" />}
                        </div>
                        <div className="vplace">
                          {[v.area, v.city].filter(Boolean).join(', ')}
                          {v.location_precision === 'city' && ' · approx. location'}
                          {v.phones?.[0] ? ` · ${v.phones[0]}` : ''}
                        </div>
                        <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                          <ServiceTags services={v.services} />
                          {from != null && <span className="tag">from {rupees(from)}/sq ft</span>}
                        </div>
                      </div>
                      <div className="dist">
                        <b>{km(roadKm)}</b>
                        <span>
                          {routed ? 'by road' : '≈ road'} · {minutes(mins)}
                        </span>
                        <div className="cost-pill">
                          {rupees(cost)} {roundTrip ? 'round trip' : 'one way'}
                        </div>
                        <div>
                          <a
                            href={directionsUrl(origin, v)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hint"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, color: 'var(--red)' }}
                          >
                            <Navigation size={12} /> Directions
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
