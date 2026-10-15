import { TileLayer } from 'react-leaflet';

// English-labelled basemap (Esri World Light Gray Canvas). Free to use with attribution.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
export const ATTR = 'Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

export function BaseTiles() {
  return <TileLayer url={`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ATTR} maxZoom={16} />;
}
export function LabelTiles() {
  return <TileLayer url={`${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />;
}
/** Base + English labels — for maps that show everything (UAE, city maps). */
export function EnglishMap() {
  return (
    <>
      <BaseTiles />
      <LabelTiles />
    </>
  );
}
