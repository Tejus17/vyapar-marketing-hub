const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const rupees = (n) => (n == null || Number.isNaN(n) ? '—' : `₹${inr.format(Math.round(n))}`);

export const km = (n) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n < 10 ? n.toFixed(1) : Math.round(n)} km`);

export const minutes = (m) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);

export const rateLabel = (r) => {
  const unit = r.unit ? `/${r.unit}` : '';
  return r.price_max && r.price_max !== r.price
    ? `${rupees(r.price)}–${rupees(r.price_max).slice(1)}${unit}`
    : `${rupees(r.price)}${unit}`;
};

/** Lowest per-sq-ft rate a vendor lists, used for "from ₹X/sq ft" and price filters. */
export const lowestSqftRate = (v) => {
  const sq = (v.rates || []).filter((r) => r.price != null && /^(sq\.?\s*(ft|feet|foot)|sqft|square\s*(ft|feet|foot))$/i.test((r.unit || '').trim()));
  return sq.length ? Math.min(...sq.map((r) => r.price)) : null;
};

/** "09999900000" / "+919999900000" → "+91 99999 00000"; landlines → "+91 11 2642 4919". */
export function formatPhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0091')) d = d.slice(4);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10) return String(raw).trim();
  if (/^[6-9]/.test(d)) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  const n = /^(11|20|22|33|40|44|79|80)/.test(d) ? 2 : 3; // metro STD codes are 2 digits
  return `+91 ${d.slice(0, n)} ${d.slice(n, 6)} ${d.slice(6)}`;
}

// Directory call-forwarding numbers: IndiaMART +91 8041–8049 / 7942–7949, Sulekha +91 8069.
const splitExt = (p) => {
  const m = p.match(/^(.*?)\s*ext\s*(\d+)\s*$/i);
  return m ? [m[1], m[2]] : [p, null];
};
export const isForwardingLine = (p) => /^(91)?(804[1-9]|794[2-9]|8069)\d{6}$/.test(splitExt(p)[0].replace(/\D/g, ''));

// A comma makes the phone pause, then dial the extension.
export const telHref = (p) => {
  const [num, ext] = splitExt(p);
  return `tel:${num.replace(/[^\d+]/g, '')}${ext ? `,${ext}` : ''}`;
};

export const whatsappHref = (p) => {
  const d = p.replace(/\D/g, '');
  if (/^9715\d{8}$/.test(d)) return `https://wa.me/${d}`; // UAE mobile
  const mobile = d.length === 10 ? `91${d}` : d.startsWith('91') && d.length === 12 ? d : null;
  // Only real mobiles can take WhatsApp; landlines and IndiaMART call-forwarding lines can't.
  if (!mobile || !/^91[6-9]/.test(mobile) || isForwardingLine(p)) return null;
  return `https://wa.me/${mobile}`;
};

export const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const initials = (name = '') =>
  name
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = (s) => {
  const [y, m, d] = (s || '').split('-').map(Number);
  return { y, m, d };
};

/** "7–10 Aug 2026", "28 Aug – 2 Sep 2026" */
export function dateRange(start, end) {
  if (!start) return 'Dates TBA';
  const a = ymd(start);
  if (!end) return `${MON[a.m - 1]} ${a.y} · dates TBC`; // only the month is known
  const b = ymd(end || start);
  if (start === (end || start)) return `${a.d} ${MON[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MON[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MON[a.m - 1]} – ${b.d} ${MON[b.m - 1]} ${a.y}`;
  return `${a.d} ${MON[a.m - 1]} ${a.y} – ${b.d} ${MON[b.m - 1]} ${b.y}`;
}
export const monthLabel = (iso) => {
  const { y, m } = ymd(iso);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
};
export const dayBadge = (iso) => {
  const { d, m } = ymd(iso);
  return { day: d, mon: MON[m - 1] };
};
export const daysUntil = (iso) => Math.round((Date.parse(iso) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5);

/** 25000 → "25k", 150000 → "1.5 lakh" */
export const compact = (n) => {
  if (n == null) return '—';
  if (n >= 1e5) return `${(n / 1e5).toFixed(n % 1e5 ? 1 : 0)} lakh`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 && n < 1e4 ? 1 : 0)}k`;
  return String(n);
};
