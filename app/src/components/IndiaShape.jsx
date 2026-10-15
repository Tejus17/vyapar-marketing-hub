import { GeoJSON, TileLayer } from 'react-leaflet';
import india from '../lib/india.json';

// India outline (official boundary, DataMeet india-composite, simplified).
export const INDIA_BOUNDS = [[6.5, 68], [35.7, 97.5]];

const indiaRings = india.features[0].geometry.coordinates.map((poly) => poly[0]);

// A world-sized sheet with India cut out of it: drawn over the map tiles so only India's
// streets and cities show, and neighbouring countries are hidden.
const MASK = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...indiaRings],
  },
};

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Map tiles inside India only, with the official outline. */
export function IndiaOnlyMap({ muted = true, background = '#ffffff' }) {
  return (
    <>
      <TileLayer url={TILES} attribution="&copy; OpenStreetMap contributors" className={muted ? 'map-muted' : ''} />
      <GeoJSON data={MASK} style={{ stroke: false, fillColor: background, fillOpacity: 1 }} interactive={false} />
      <GeoJSON data={india} style={{ color: '#cdbfb1', weight: 1.2, fill: false }} interactive={false} />
    </>
  );
}

/** Flat India silhouette (no tiles) — for tiny static maps. */
export default function IndiaShape({ fill = '#f6efe8', stroke = '#d9cbbd' }) {
  return <GeoJSON data={india} style={{ color: stroke, weight: 1, fillColor: fill, fillOpacity: 1 }} interactive={false} />;
}
