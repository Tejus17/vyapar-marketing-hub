import { useMemo } from 'react';
import { MapContainer, CircleMarker, Tooltip } from 'react-leaflet';
import { IndiaOnlyMap, INDIA_BOUNDS } from './IndiaShape';
import { useNavigate } from 'react-router-dom';
import { CITIES } from '../lib/constants';


/** One bubble per city, sized by how many vendors we have there. */
export default function IndiaMap({ vendors }) {
  const navigate = useNavigate();

  const bubbles = useMemo(() => {
    const byCity = new Map();
    for (const v of vendors) {
      const c = byCity.get(v.city) || { city: v.city, state: v.state, n: 0, backlit: 0, lat: 0, lng: 0, pts: 0 };
      c.n += 1;
      if (v.services?.includes('Backlit / Light boards')) c.backlit += 1;
      if (v.latitude != null) {
        c.lat += v.latitude;
        c.lng += v.longitude;
        c.pts += 1;
      }
      byCity.set(v.city, c);
    }
    return [...byCity.values()]
      .map((c) => {
        const known = CITIES[c.city];
        const lat = known ? known.lat : c.pts ? c.lat / c.pts : null;
        const lng = known ? known.lng : c.pts ? c.lng / c.pts : null;
        return { ...c, lat, lng };
      })
      .filter((c) => c.lat != null && CITIES[c.city]?.country !== 'UAE')
      .sort((a, b) => b.n - a.n);
  }, [vendors]);

  const max = Math.max(1, ...bubbles.map((b) => b.n));

  return (
    <MapContainer
      bounds={INDIA_BOUNDS}
      boundsOptions={{ padding: [10, 10] }}
      zoomSnap={0.1}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
      attributionControl
    >
      <IndiaOnlyMap />
      {bubbles.map((b) => (
        <CircleMarker
          key={b.city}
          center={[b.lat, b.lng]}
          radius={7 + 19 * Math.sqrt(b.n / max)}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#E8213E', fillOpacity: 0.78 }}
          eventHandlers={{ click: () => navigate(`/vendors?city=${encodeURIComponent(b.city)}`) }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <b>{b.city}</b> · {b.n} vendor{b.n === 1 ? '' : 's'}
            <br />
            <span style={{ color: '#6b6f78' }}>{b.backlit} make backlit / light boards</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
