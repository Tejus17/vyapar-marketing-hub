export const SERVICES = [
  'Backlit / Light boards',
  'Flex boards',
  'Standees',
  'Vinyl & creatives',
  'ACP & 3D letters',
  'Installation',
  'Exhibition stalls & booths',
];

// Short labels for dense rows.
export const SERVICE_SHORT = {
  'Backlit / Light boards': 'Backlit',
  'Flex boards': 'Flex',
  'Standees': 'Standees',
  'Vinyl & creatives': 'Vinyl',
  'ACP & 3D letters': 'ACP / 3D',
  'Installation': 'Install',
  'Exhibition stalls & booths': 'Booths',
};

// City centres — used for the India map and as a fallback pin when a vendor
// only has a city-level address. Tier 1 cities first.
export const CITIES = {
  Delhi: { state: 'Delhi', tier: 1, lat: 28.6139, lng: 77.209 },
  Mumbai: { state: 'Maharashtra', tier: 1, lat: 19.076, lng: 72.8777 },
  Bengaluru: { state: 'Karnataka', tier: 1, lat: 12.9716, lng: 77.5946 },
  Chennai: { state: 'Tamil Nadu', tier: 1, lat: 13.0827, lng: 80.2707 },
  Kolkata: { state: 'West Bengal', tier: 1, lat: 22.5726, lng: 88.3639 },
  Hyderabad: { state: 'Telangana', tier: 1, lat: 17.385, lng: 78.4867 },
  Pune: { state: 'Maharashtra', tier: 1, lat: 18.5204, lng: 73.8567 },
  Ahmedabad: { state: 'Gujarat', tier: 1, lat: 23.0225, lng: 72.5714 },
  Noida: { state: 'Uttar Pradesh', tier: 1, lat: 28.5355, lng: 77.391 },
  Gurugram: { state: 'Haryana', tier: 1, lat: 28.4595, lng: 77.0266 },
  Ghaziabad: { state: 'Uttar Pradesh', tier: 1, lat: 28.6692, lng: 77.4538 },
  Faridabad: { state: 'Haryana', tier: 1, lat: 28.4089, lng: 77.3178 },
  Thane: { state: 'Maharashtra', tier: 1, lat: 19.2183, lng: 72.9781 },
  'Navi Mumbai': { state: 'Maharashtra', tier: 1, lat: 19.033, lng: 73.0297 },
  Howrah: { state: 'West Bengal', tier: 1, lat: 22.5958, lng: 88.2636 },
  Secunderabad: { state: 'Telangana', tier: 1, lat: 17.4399, lng: 78.4983 },
  Jaipur: { state: 'Rajasthan', tier: 2, lat: 26.9124, lng: 75.7873 },
  Lucknow: { state: 'Uttar Pradesh', tier: 2, lat: 26.8467, lng: 80.9462 },
  Kanpur: { state: 'Uttar Pradesh', tier: 2, lat: 26.4499, lng: 80.3319 },
  Nagpur: { state: 'Maharashtra', tier: 2, lat: 21.1458, lng: 79.0882 },
  Indore: { state: 'Madhya Pradesh', tier: 2, lat: 22.7196, lng: 75.8577 },
  Bhopal: { state: 'Madhya Pradesh', tier: 2, lat: 23.2599, lng: 77.4126 },
  Surat: { state: 'Gujarat', tier: 2, lat: 21.1702, lng: 72.8311 },
  Vadodara: { state: 'Gujarat', tier: 2, lat: 22.3072, lng: 73.1812 },
  Rajkot: { state: 'Gujarat', tier: 2, lat: 22.3039, lng: 70.8022 },
  Patna: { state: 'Bihar', tier: 2, lat: 25.5941, lng: 85.1376 },
  Ludhiana: { state: 'Punjab', tier: 2, lat: 30.901, lng: 75.8573 },
  Amritsar: { state: 'Punjab', tier: 2, lat: 31.634, lng: 74.8723 },
  Chandigarh: { state: 'Chandigarh', tier: 2, lat: 30.7333, lng: 76.7794 },
  Mohali: { state: 'Punjab', tier: 2, lat: 30.7046, lng: 76.7179 },
  Panchkula: { state: 'Haryana', tier: 2, lat: 30.6942, lng: 76.8606 },
  Jodhpur: { state: 'Rajasthan', tier: 2, lat: 26.2389, lng: 73.0243 },
  Agra: { state: 'Uttar Pradesh', tier: 2, lat: 27.1767, lng: 78.0081 },
  Varanasi: { state: 'Uttar Pradesh', tier: 2, lat: 25.3176, lng: 82.9739 },
  Dehradun: { state: 'Uttarakhand', tier: 2, lat: 30.3165, lng: 78.0322 },
  Nashik: { state: 'Maharashtra', tier: 2, lat: 19.9975, lng: 73.7898 },
  Coimbatore: { state: 'Tamil Nadu', tier: 2, lat: 11.0168, lng: 76.9558 },
  Madurai: { state: 'Tamil Nadu', tier: 2, lat: 9.9252, lng: 78.1198 },
  Kochi: { state: 'Kerala', tier: 2, lat: 9.9312, lng: 76.2673 },
  Thiruvananthapuram: { state: 'Kerala', tier: 2, lat: 8.5241, lng: 76.9366 },
  Visakhapatnam: { state: 'Andhra Pradesh', tier: 2, lat: 17.6868, lng: 83.2185 },
  Vijayawada: { state: 'Andhra Pradesh', tier: 2, lat: 16.5062, lng: 80.648 },
  Mysuru: { state: 'Karnataka', tier: 2, lat: 12.2958, lng: 76.6394 },
  Bhubaneswar: { state: 'Odisha', tier: 2, lat: 20.2961, lng: 85.8245 },
  Guwahati: { state: 'Assam', tier: 2, lat: 26.1445, lng: 91.7362 },
  Ranchi: { state: 'Jharkhand', tier: 2, lat: 23.3441, lng: 85.3096 },
  Raipur: { state: 'Chhattisgarh', tier: 2, lat: 21.2514, lng: 81.6296 },
  Gandhinagar: { state: 'Gujarat', tier: 2, lat: 23.2156, lng: 72.6369 },
  'Greater Noida': { state: 'Uttar Pradesh', tier: 1, lat: 28.4744, lng: 77.504 },
  Goa: { state: 'Goa', tier: 2, lat: 15.4909, lng: 73.8278 },
  Dubai: { state: 'Dubai', country: 'UAE', tier: 4, lat: 25.2048, lng: 55.2708 },
  'Abu Dhabi': { state: 'Abu Dhabi', country: 'UAE', tier: 4, lat: 24.4539, lng: 54.3773 },
  Sharjah: { state: 'Sharjah', country: 'UAE', tier: 4, lat: 25.3463, lng: 55.4209 },
};

export const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

// Travel cost per km (one way). Editable in the UI; these are starting points
// for city travel in 2026 — fuel for own vehicles, typical fares for auto/cab.
export const TRAVEL_MODES = {
  bike: { label: 'Own bike', perKm: 4, kmph: 22 },
  car: { label: 'Own car', perKm: 10, kmph: 20 },
  auto: { label: 'Auto rickshaw', perKm: 18, kmph: 18 },
  cab: { label: 'Cab (Ola / Uber)', perKm: 22, kmph: 20 },
};

// Straight-line distance → road distance in Indian cities, used when live
// routing is unavailable.
export const ROAD_FACTOR = 1.35;
