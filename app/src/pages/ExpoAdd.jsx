import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useExpos, EXPO_NICHES } from '../state/expos';
import { useStore } from '../state/store';
import { CITIES } from '../lib/constants';
import ExposGate from '../components/ExposGate';

const blank = { name: '', country: 'India', city: '', venue: '', start_date: '', end_date: '', website: '', footfall: '', audience: 'B2B', niches: [], organiser: '', description: '' };

export default function ExpoAdd() {
  const { venues, addEvent, status } = useExpos();
  const { me, setMe, notify } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState(blank);
  const [author, setAuthor] = useState(me);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const countryVenues = useMemo(() => venues.filter((v) => v.country === f.country && (!f.city || v.city === f.city)), [venues, f.country, f.city]);
  const cityOptions = useMemo(
    () => [...new Set([...venues.filter((v) => v.country === f.country).map((v) => v.city), ...Object.entries(CITIES).filter(([, c]) => (c.country || 'India') === f.country).map(([k]) => k)])].sort(),
    [venues, f.country]
  );

  if (status !== 'ready') return <ExposGate />;

  const save = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!f.name.trim()) e.name = 'Enter the event name';
    if (!f.city.trim()) e.city = 'Enter the city';
    if (!f.start_date) e.start_date = 'Pick the start date';
    if (f.end_date && f.end_date < f.start_date) e.end_date = 'End date is before the start';
    if (!author.trim()) e.author = 'Enter your name';
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    if (author !== me) setMe(author.trim());
    const venue = venues.find((v) => v.name === f.venue.trim());
    const city = CITIES[f.city.trim()];
    const row = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      country: f.country,
      city: f.city.trim(),
      state: venue?.state || city?.state || null,
      venue_id: venue?.id || null,
      venue_name: f.venue.trim() || null,
      venue_address: venue?.address || null,
      latitude: venue?.latitude ?? city?.lat ?? null,
      longitude: venue?.longitude ?? city?.lng ?? null,
      start_date: f.start_date,
      end_date: f.end_date || f.start_date,
      niches: f.niches,
      audience: f.audience || null,
      footfall: f.footfall ? Math.round(Number(f.footfall)) : null,
      footfall_source: f.footfall ? `Added by ${author.trim()}` : null,
      organiser: f.organiser.trim() || null,
      website: f.website.trim() || null,
      source_name: 'Added by team',
      added_by: author.trim(),
      dedupe_key: `team:${f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${f.start_date}`,
    };
    const saved = await addEvent(row);
    setSaving(false);
    if (saved) {
      notify('Event added');
      navigate('/', { state: { openEvent: saved.id } });
    }
  };

  return (
    <div className="page" style={{ maxWidth: 900, paddingTop: 24 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}><ArrowLeft /> Back</button>
      <h1 className="h2">Add an event</h1>
      <p className="sub" style={{ marginBottom: 20 }}>For expos the team hears about that aren’t in the list yet. Everyone will see it.</p>
      <form onSubmit={save} className="card card-pad" noValidate>
        <div className="form-grid">
          <div className="field span-2">
            <span className="label">Event name *</span>
            <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="India Retail Expo 2027" />
            {err.name && <span className="hint" style={{ color: 'var(--red)' }}>{err.name}</span>}
          </div>
          <div className="field">
            <span className="label">Country</span>
            <div className="seg">
              {['India', 'UAE'].map((c) => (
                <button type="button" key={c} className={f.country === c ? 'on' : ''} onClick={() => setF((s) => ({ ...s, country: c, city: '', venue: '' }))}>{c}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">City *</span>
            <input className="input" list="expo-cities" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder={f.country === 'UAE' ? 'Dubai' : 'Delhi'} />
            <datalist id="expo-cities">{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
            {err.city && <span className="hint" style={{ color: 'var(--red)' }}>{err.city}</span>}
          </div>
          <div className="field span-2">
            <span className="label">Venue</span>
            <input className="input" list="expo-venues" value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Pick a venue or type one" />
            <datalist id="expo-venues">{countryVenues.map((v) => <option key={v.id} value={v.name} />)}</datalist>
            <span className="hint">Picking a listed venue links its map pin and nearby vendors.</span>
          </div>
          <div className="field">
            <span className="label">Start date *</span>
            <input className="input" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
            {err.start_date && <span className="hint" style={{ color: 'var(--red)' }}>{err.start_date}</span>}
          </div>
          <div className="field">
            <span className="label">End date</span>
            <input className="input" type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
            {err.end_date && <span className="hint" style={{ color: 'var(--red)' }}>{err.end_date}</span>}
          </div>
          <div className="field">
            <span className="label">Expected footfall</span>
            <input className="input" type="number" min="0" value={f.footfall} onChange={(e) => set('footfall', e.target.value)} placeholder="10000" />
          </div>
          <div className="field">
            <span className="label">Audience</span>
            <select className="select" value={f.audience} onChange={(e) => set('audience', e.target.value)}>
              <option value="B2B">B2B (trade)</option>
              <option value="B2C">Consumer (B2C)</option>
              <option value="B2B + B2C">Both</option>
            </select>
          </div>
          <div className="field span-2">
            <span className="label">Niches</span>
            <div className="chips">
              {EXPO_NICHES.map((n) => {
                const on = f.niches.includes(n);
                return <button type="button" key={n} className={`chip ${on ? 'on' : ''}`} onClick={() => set('niches', on ? f.niches.filter((x) => x !== n) : [...f.niches, n])}>{n}</button>;
              })}
            </div>
          </div>
          <div className="field">
            <span className="label">Organiser</span>
            <input className="input" value={f.organiser} onChange={(e) => set('organiser', e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Website</span>
            <input className="input" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </div>
          <div className="field span-2">
            <span className="label">About</span>
            <textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Your name *</span>
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
            {err.author && <span className="hint" style={{ color: 'var(--red)' }}>{err.author}</span>}
          </div>
        </div>
        <div className="row" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}><Save /> {saving ? 'Saving…' : 'Add event'}</button>
        </div>
      </form>
    </div>
  );
}
