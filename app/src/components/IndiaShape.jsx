import { GeoJSON } from 'react-leaflet';
import india from '../lib/india.json';

// India outline (official boundary, DataMeet india-composite, simplified). Drawn instead of
// map tiles so only India shows — no neighbouring countries.
export const INDIA_BOUNDS = [[6.5, 68], [35.7, 97.5]];

export default function IndiaShape({ fill = '#f6efe8', stroke = '#d9cbbd' }) {
  return <GeoJSON data={india} style={{ color: stroke, weight: 1, fillColor: fill, fillOpacity: 1 }} interactive={false} />;
}
