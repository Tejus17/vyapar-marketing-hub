import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2, MapPin, Save, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useStore } from '../state/store';
import { SERVICES, CITIES, STATES } from '../lib/constants';
import { parseLatLng, isShortMapsLink, geocode } from '../lib/geo';
import { formatPhone } from '../lib/format';

const blank = {
  name: '', phones: [''], google_maps_url: '', address: '', area: '', city: '', state: '', pincode: '',
  services: [], rates: [], website: '', description: '', latitude: null, longitude: null, location_precision: 'city',
};

const dedupeKey = (name, city) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${city.toLowerCase().trim()}`;

export default function VendorForm() {
  const { id } = useParams();
  const { vendors, addVendor, updateVendor, me, setMe, notify } = useStore();
  const navigate = useNavigate();
  const existing = id ? vendors.find((v) => v.id === id) : null;

  const [f, setF] = useState(blank);
  const [author, setAuthor] = useState(me);
  const [locMsg, setLocMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (existing) setF({ ...blank, ...existing, phones: existing.phones?.length ? existing.phones : [''], rates: existing.rates || [] });
  }, [existing?.id]); // eslint-disable-line

  const cityOptions = useMemo(
    () => [...new Set([...Object.keys(CITIES), ...vendors.map((v) => v.city)])].sort((a, b) => a.localeCompare(b)),
    [vendors]
  );

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const onMapsLink = (url) => {
    set('google_maps_url', url);
    if (!url) return setLocMsg(null);
    const p = parseLatLng(url);
    if (p) {
      setF((s) => ({ ...s, google_maps_url: url, latitude: p.lat, longitude: p.lng, location_precision: 'exact' }));
      setLocMsg({ ok: true, text: `Exact pin found: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` });
    } else if (isShortMapsLink(url)) {
      setLocMsg({ ok: false, text: 'Short links can’t be read. Open it and copy the full URL from the address bar — or use “Locate from address”.' });
    } else {
      setLocMsg({ ok: false, text: 'No coordinates in this link. Use “Locate from address” below.' });
    }
  };

  const onCity = (city) => {
    setF((s) => ({ ...s, city, state: CITIES[city]?.state || s.state }));
  };

  const locate = async () => {
    const q = [f.address || f.area, f.city, f.state, f.pincode].filter(Boolean).join(', ');
    if (!f.city) return setLocMsg({ ok: false, text: 'Add the city first.' });
    setLocMsg({ ok: true, text: 'Looking up…' });
    try {
      const hit = (await geocode(q)) || (f.area ? await geocode(`${f.area}, ${f.city}`) : null);
      if (!hit) return setLocMsg({ ok: false, text: 'Couldn’t place this address — the city centre will be used.' });
      setF((s) => ({ ...s, latitude: hit.lat, longitude: hit.lng, location_precision: 'area', pincode: s.pincode || hit.pincode || '' }));
      setLocMsg({ ok: true, text: `Pinned near: ${hit.label.split(',').slice(0, 3).join(',')}` });
    } catch (e) {
      setLocMsg({ ok: false, text: e.message });
    }
  };

  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Enter the vendor’s name';
    if (!f.city.trim()) e.city = 'Pick a city';
    if (!f.state.trim()) e.state = 'Pick a state';
    const phones = f.phones.map((p) => p.trim()).filter(Boolean);
    if (!phones.length && !f.address.trim()) e.phones = 'Add at least one phone number or an address';
    if (phones.some((p) => p.replace(/\D/g, '').length < 8)) e.phones = 'One of the numbers looks too short';
    if (!author.trim()) e.author = 'Enter your name so the team knows who added this';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    if (author !== me) setMe(author.trim());
    let { latitude, longitude, location_precision } = f;
    if (latitude == null && CITIES[f.city]) {
      latitude = CITIES[f.city].lat;
      longitude = CITIES[f.city].lng;
      location_precision = 'city';
    }
    const row = {
      name: f.name.trim(),
      phones: [...new Set(f.phones.map((p) => p.trim()).filter(Boolean).map(formatPhone))],
      google_maps_url: f.google_maps_url.trim() || null,
      address: f.address.trim() || null,
      area: f.area.trim() || null,
      city: f.city.trim(),
      state: f.state.trim(),
      pincode: f.pincode?.trim() || null,
      services: f.services,
      rates: f.rates
        .filter((r) => r.item?.trim() && r.price !== '' && r.price != null)
        .map((r) => ({ item: r.item.trim(), price: Number(r.price), price_max: r.price_max ? Number(r.price_max) : null, unit: r.unit || 'sq ft' })),
      website: f.website?.trim() || null,
      description: f.description?.trim() || null,
      latitude,
      longitude,
      location_precision,
    };
    let savedId;
    if (existing) {
      const ok = await updateVendor(existing.id, row);
      savedId = ok ? existing.id : null;
    } else {
      const saved = await addVendor({
        ...row,
        added_by: author.trim(),
        source_name: 'Added by team',
        dedupe_key: dedupeKey(row.name, row.city),
      });
      savedId = saved?.id;
    }
    setSaving(false);
    if (savedId) {
      notify(existing ? 'Vendor updated' : 'Vendor added');
      navigate(`/vendors?city=${encodeURIComponent(row.city)}`, { state: { openVendor: savedId } });
    }
  };

  if (id && !existing) {
    return (
      <div className="page">
        <p>That vendor wasn’t found. <Link to="/vendors">Back to vendors</Link></p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 900, paddingTop: 24 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        <ArrowLeft /> Back
      </button>
      <h1 className="h2">{existing ? `Edit ${existing.name}` : 'Add a vendor'}</h1>
      <p className="sub" style={{ marginBottom: 20 }}>
        {existing ? 'Changes are visible to the whole team.' : 'For vendors you know that aren’t listed yet — everyone in the team will see them.'}
      </p>

      <form onSubmit={save} className="card card-pad" noValidate>
        <div className="form-grid">
          <div className="field span-2">
            <span className="label">Vendor / shop name *</span>
            <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Shree Ganesh Sign Boards" />
            {errors.name && <span className="hint" style={{ color: 'var(--red)' }}>{errors.name}</span>}
          </div>

          <div className="field span-2">
            <span className="label">Phone numbers *</span>
            {f.phones.map((p, i) => (
              <div className="row" key={i}>
                <input
                  className="input"
                  type="tel"
                  value={p}
                  onChange={(e) => set('phones', f.phones.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="+91 98xxx xxxxx"
                />
                {f.phones.length > 1 && (
                  <button type="button" className="icon-btn" onClick={() => set('phones', f.phones.filter((_, j) => j !== i))} aria-label="Remove number">
                    <Trash2 />
                  </button>
                )}
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('phones', [...f.phones, ''])}>
                <Plus /> Another number
              </button>
            </div>
            {errors.phones && <span className="hint" style={{ color: 'var(--red)' }}>{errors.phones}</span>}
          </div>

          <div className="field span-2">
            <span className="label">Google Maps link</span>
            <input className="input" value={f.google_maps_url} onChange={(e) => onMapsLink(e.target.value)} placeholder="https://www.google.com/maps/place/…" />
            <span className="hint">Paste the full link from Google Maps — it gives an exact pin for “Find near a shop”.</span>
          </div>

          <div className="field span-2">
            <span className="label">Street address</span>
            <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Shop no., street, landmark" />
          </div>
          <div className="field">
            <span className="label">Area / locality</span>
            <input className="input" value={f.area} onChange={(e) => set('area', e.target.value)} placeholder="Okhla Phase 2" />
          </div>
          <div className="field">
            <span className="label">Pincode</span>
            <input className="input" value={f.pincode || ''} onChange={(e) => set('pincode', e.target.value)} inputMode="numeric" placeholder="110020" />
          </div>
          <div className="field">
            <span className="label">City *</span>
            <input className="input" list="city-list" value={f.city} onChange={(e) => onCity(e.target.value)} placeholder="Delhi" />
            <datalist id="city-list">
              {cityOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {errors.city && <span className="hint" style={{ color: 'var(--red)' }}>{errors.city}</span>}
          </div>
          <div className="field">
            <span className="label">State *</span>
            <select className="select" value={f.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">Select state</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {errors.state && <span className="hint" style={{ color: 'var(--red)' }}>{errors.state}</span>}
          </div>
          <div className="span-2">
            <button type="button" className="btn btn-sm" onClick={locate}>
              <MapPin /> Locate from address
            </button>
            {locMsg && (
              <div className={`alert ${locMsg.ok ? 'alert-cream' : 'alert-amber'}`} style={{ marginTop: 10 }}>
                {locMsg.ok ? <CheckCircle2 /> : <AlertCircle />} <span>{locMsg.text}</span>
              </div>
            )}
          </div>

          <div className="field span-2">
            <span className="label">What they make</span>
            <div className="chips">
              {SERVICES.map((s) => {
                const on = f.services.includes(s);
                return (
                  <button type="button" key={s} className={`chip ${on ? 'on' : ''}`} onClick={() => set('services', on ? f.services.filter((x) => x !== s) : [...f.services, s])}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field span-2">
            <span className="label">Rates</span>
            {f.rates.map((r, i) => (
              <div className="row" key={i} style={{ flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: '2 1 180px' }} placeholder="Item, e.g. Backlit flex board" value={r.item} onChange={(e) => set('rates', f.rates.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
                <input className="input" style={{ flex: '1 1 90px' }} type="number" min="0" placeholder="₹ from" value={r.price ?? ''} onChange={(e) => set('rates', f.rates.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <input className="input" style={{ flex: '1 1 90px' }} type="number" min="0" placeholder="₹ to (opt.)" value={r.price_max ?? ''} onChange={(e) => set('rates', f.rates.map((x, j) => (j === i ? { ...x, price_max: e.target.value } : x)))} />
                <select className="select" style={{ flex: '1 1 110px' }} value={r.unit || 'sq ft'} onChange={(e) => set('rates', f.rates.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}>
                  <option>sq ft</option>
                  <option>piece</option>
                  <option>running ft</option>
                  <option>job</option>
                </select>
                <button type="button" className="icon-btn" onClick={() => set('rates', f.rates.filter((_, j) => j !== i))} aria-label="Remove rate">
                  <Trash2 />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('rates', [...f.rates, { item: '', price: '', price_max: '', unit: 'sq ft' }])}>
                <Plus /> Add a rate
              </button>
            </div>
          </div>

          <div className="field">
            <span className="label">Website</span>
            <input className="input" value={f.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </div>
          <div className="field">
            <span className="label">Your name *</span>
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Who’s adding this" />
            {errors.author && <span className="hint" style={{ color: 'var(--red)' }}>{errors.author}</span>}
          </div>
          <div className="field span-2">
            <span className="label">About this vendor</span>
            <textarea className="textarea" value={f.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Good with large backlit boards, has own installation team" />
          </div>
        </div>

        <div className="row" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            <Save /> {saving ? 'Saving…' : existing ? 'Save changes' : 'Add vendor'}
          </button>
        </div>
      </form>
    </div>
  );
}
