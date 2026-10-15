import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import IndiaShape, { INDIA_BOUNDS } from './IndiaShape';

const BOUNDS = {
  India: INDIA_BOUNDS,
  UAE: [[22.6, 51.5], [26.2, 56.5]],
  all: [[6.5, 51.5], [35.7, 97.5]],
};

/** Small "where are these events" map for the top-right of the Events page. */
export default function RadarMap({ events, country }) {
  const navigate = useNavigate();
  const dots = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (e.latitude == null) continue;
      const key = `${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`;
      const d = m.get(key) || { lat: e.latitude, lng: e.longitude, n: 0, label: e.venue_name || e.city, city: e.city };
      d.n += 1;
      m.set(key, d);
    }
    return [...m.values()];
  }, [events]);
  const max = Math.max(1, ...dots.map((d) => d.n));
  const placed = dots.reduce((s, d) => s + d.n, 0);

  return (
    <>
      <div className="radar">
        <MapContainer
          key={country}
          bounds={BOUNDS[country] || BOUNDS.all}
          zoomControl={false}
          attributionControl={country !== 'India'}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          zoomSnap={0.1}
          style={{ height: '100%' }}
        >
          {country === 'India' ? (
            <IndiaShape />
          ) : (
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OSM" className="map-muted" />
          )}
          {dots.map((d) => (
            <CircleMarker
              key={`${d.lat},${d.lng}`}
              center={[d.lat, d.lng]}
              radius={2.5 + 6 * Math.sqrt(d.n / max)}
              pathOptions={{ color: '#fff', weight: 1, fillColor: '#E8213E', fillOpacity: 0.8 }}
              eventHandlers={{ click: () => navigate(`/expos/venues`) }}
            >
              <Tooltip direction="top">{d.label} · {d.n}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="radar-cap"><b>{placed}</b> of {events.length} shown on map · hover a dot</p>
    </>
  );
}
