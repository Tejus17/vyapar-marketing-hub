import { MapPin, Users, Building2 } from 'lucide-react';
import { dateRange, dayBadge, daysUntil, compact } from '../lib/format';
import { statusMeta, bestFootfall } from '../state/expos';
import { useExpoDrawers } from '../state/drawer';

export function FootfallPill({ e, long = false }) {
  const f = bestFootfall(e);
  if (f == null) return <span className="tag tag-muted">Footfall unknown</span>;
  const team = e.team_footfall != null;
  return (
    <span className={`tag ${f >= 10000 ? 'tag-green' : 'tag-amber'}`} title={team ? 'Counted by our team' : e.footfall_text || 'Organiser claim'}>
      <Users /> {compact(f)} visitors{long ? (team ? ' · our count' : ' · organiser claim') : ''}
    </span>
  );
}

export function StatusTag({ status }) {
  if (!status || status === 'new') return null;
  const m = statusMeta(status);
  return <span className={`tag ${m.tone}`}>{m.label}</span>;
}

export default function EventRow({ e }) {
  const { openEvent } = useExpoDrawers();
  const b = dayBadge(e.start_date);
  const d = daysUntil(e.start_date);
  const soon = e.end_date && d >= 0 && d <= 45;
  const tbc = !e.end_date; // only the month is known
  return (
    <div className="erow" role="button" tabIndex={0} onClick={() => openEvent(e.id)} onKeyDown={(k) => k.key === 'Enter' && openEvent(e.id)}>
      <div className={`datebox ${e.end_date && daysUntil(e.end_date) < 0 ? 'past' : ''}`}>
        <b>{tbc ? b.mon : b.day}</b>
        <span>{tbc ? 'TBC' : b.mon}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="vname">
          <span>{e.name}</span>
          <StatusTag status={e.team_status} />
          {e.country === 'UAE' && <span className="tag">UAE</span>}
        </div>
        <div className="vplace">
          <MapPin size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
          {e.venue_name ? `${e.venue_name}, ` : ''}
          {e.city}
          <span className="soft"> · {dateRange(e.start_date, e.end_date)}</span>
        </div>
        <div className="tags" style={{ marginTop: 7 }}>
          {(e.niches || []).slice(0, 3).map((n) => (
            <span key={n} className="tag">{n}</span>
          ))}
          {e.niches?.length > 3 && <span className="tag">+{e.niches.length - 3}</span>}
        </div>
      </div>
      <div className="erow-side">
        <FootfallPill e={e} />
        {e.audience && <span className="hint">{e.audience}</span>}
        {e.exhibitors ? (
          <span className="hint">
            <Building2 size={12} style={{ verticalAlign: -1 }} /> {compact(e.exhibitors)} exhibitors
          </span>
        ) : null}
        {soon && <span className="hint" style={{ color: 'var(--red)', fontWeight: 600 }}>{d === 0 ? 'Today' : `in ${d} days`}</span>}
      </div>
    </div>
  );
}
