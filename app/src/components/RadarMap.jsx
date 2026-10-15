import { useEffect, useMemo } from 'react';
import { MapContainer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { EnglishMap } from '../lib/tiles';
import { Maximize2 } from 'lucide-react';
import { IndiaOnlyMap, INDIA_BOUNDS } from './IndiaShape';

const BOUNDS = {
  India: INDIA_BOUNDS,
  UAE: [[23.6, 52.6], [25.9, 56.4]],
  all: [[6.5, 51.5], [35.7, 97.5]],
};

function Fitter({ bounds, signal }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [8, 8] });
  }, [map, bounds, signal]);
  return null;
}

function FitButton({ bounds }) {
  const map = useMap();
  return (
    <button
      className="map-fit"
      title="Zoom out to show everything"
      aria-label="Zoom out to show everything"
      onClick={(e) => {
        e.stopPropagation();
        map.fitBounds(bounds, { padding: [8, 8] });
      }}
    >
      <Maximize2 />
    </button>
  );
}

/**
 * Map of the events currently in the list. Zoom with +/−, the scroll wheel (when hovering)
 * or pinch; drag to move. Clicking a dot filters the list to that venue.
 */
export default function RadarMap({ events, country, city, onPickVenue, activeVenue }) {
  const dots = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (e.latitude == null) continue;
      const key = `${e.latitude.toFixed(3)},${e.longitude.toFixed(3)}`;
      const d = m.get(key) || { lat: e.latitude, lng: e.longitude, n: 0, venue: e.venue_name, city: e.city, names: [] };
      d.n += 1;
      if (d.names.length < 3) d.names.push(e.name);
      m.set(key, d);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [events]);
  const max = Math.max(1, ...dots.map((d) => d.n));
  const placed = dots.reduce((s, d) => s + d.n, 0);

  // Zoom to the dots when a city is picked; otherwise show the whole country.
  const bounds = useMemo(() => {
    if (city && dots.length) {
      const lats = dots.map((d) => d.lat);
      const lngs = dots.map((d) => d.lng);
      const pad = 0.08;
      return [[Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad]];
    }
    return BOUNDS[country] || BOUNDS.all;
  }, [city, dots, country]);

  return (
    <div className="radar-wrap">
      <div className="radar">
        <MapContainer bounds={bounds} zoomSnap={0.25} scrollWheelZoom style={{ height: "100%" }}>
          {country === 'India' ? (
            <IndiaOnlyMap background="#fbf8f5" />
          ) : (
            <EnglishMap />
          )}
          <Fitter bounds={bounds} signal={`${country}|${city}`} />
          <FitButton bounds={bounds} />
          {dots.map((d) => {
            const on = activeVenue && d.venue === activeVenue;
            return (
              <CircleMarker
                key={`${d.lat},${d.lng}`}
                center={[d.lat, d.lng]}
                radius={4 + 9 * Math.sqrt(d.n / max)}
                pathOptions={{ color: on ? '#1b1b1f' : '#fff', weight: on ? 2 : 1.2, fillColor: '#E8213E', fillOpacity: 0.82 }}
                eventHandlers={{ click: () => d.venue && onPickVenue?.(d.venue, d.city) }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <b>{d.venue || d.city}</b>
                  <br />
                  {d.n} event{d.n === 1 ? '' : 's'}: {d.names.join(', ')}{d.n > d.names.length ? '…' : ''}
                  {d.venue && <><br /><span style={{ color: '#6b6f78' }}>Click to show only these</span></>}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <p className="radar-cap">
        <b>{placed}</b> of {events.length} events on the map · scroll or pinch to zoom, click a dot to filter
      </p>
    </div>
  );
}
