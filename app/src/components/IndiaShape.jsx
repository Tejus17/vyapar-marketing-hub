import { GeoJSON } from 'react-leaflet';
import { BaseTiles, OUTSIDE } from '../lib/tiles';
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

/** Map tiles inside India only, with the official outline. */
export function IndiaOnlyMap({ background = OUTSIDE }) {
  return (
    <>
      <BaseTiles />
      <GeoJSON data={MASK} style={{ stroke: false, fillColor: background, fillOpacity: 1 }} interactive={false} />
      <GeoJSON data={india} style={{ color: '#7f9bbd', weight: 1.4, fill: false }} interactive={false} />
    </>
  );
}

/** Flat India silhouette (no tiles) — for tiny static maps. */
export default function IndiaShape({ fill = '#f6efe8', stroke = '#d9cbbd' }) {
  return <GeoJSON data={india} style={{ color: stroke, weight: 1, fillColor: fill, fillOpacity: 1 }} interactive={false} />;
}
