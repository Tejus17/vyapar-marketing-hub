import { TileLayer } from 'react-leaflet';

// Esri World Street Map: Google-like colours (blue water, coloured roads), English labels.
// Free to use with attribution — no account or key needed.
const STREET = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
export const ATTR = 'Tiles &copy; Esri — Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors';

// Light blue used outside India on India-only maps (matches the map's water colour family).
export const OUTSIDE = '#e6eef7';

export function BaseTiles() {
  return <TileLayer url={STREET} attribution={ATTR} maxZoom={19} />;
}
/** Labels are part of the street map, so nothing extra is needed. */
export function LabelTiles() {
  return null;
}
export function EnglishMap() {
  return <BaseTiles />;
}
