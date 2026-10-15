import { Star, BadgeCheck, MapPin } from 'lucide-react';
import { SERVICE_SHORT } from '../lib/constants';
import { initials, lowestSqftRate, rupees } from '../lib/format';
import { useStore } from '../state/store';
import { useOpenVendor } from '../state/drawer';

export function ServiceTags({ services = [], max = 3 }) {
  const shown = services.slice(0, max);
  return (
    <div className="tags">
      {shown.map((s) => (
        <span key={s} className={`tag ${s === 'Backlit / Light boards' ? 'tag-red' : ''}`}>
          {SERVICE_SHORT[s] || s}
        </span>
      ))}
      {services.length > max && <span className="tag">+{services.length - max}</span>}
    </div>
  );
}

export default function VendorRow({ v }) {
  const { toggleStar } = useStore();
  const open = useOpenVendor();
  const from = lowestSqftRate(v);
  const place = [v.area, v.city].filter(Boolean).join(', ');

  return (
    <div className="vrow" onClick={() => open(v.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(v.id)}>
      <div className="avatar">{initials(v.name) || '·'}</div>
      <div style={{ minWidth: 0 }}>
        <div className="vname">
          <span>{v.name}</span>
          {v.is_verified && <BadgeCheck size={16} color="#138a52" style={{ flexShrink: 0 }} />}
        </div>
        <div className="vplace">
          <MapPin size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
          {place || v.city}
          {v.location_precision === 'city' && <span className="soft"> · approx.</span>}
        </div>
      </div>
      <div className="col-services">
        <ServiceTags services={v.services} />
      </div>
      <div className="vphone col-phone">
        {v.phones?.[0] || <span className="soft">No phone</span>}
        {v.phones?.length > 1 && <small> +{v.phones.length - 1} more</small>}
      </div>
      <div className="price col-price">
        {from != null ? (
          <>
            <small>from </small>
            {rupees(from)}
            <small>/sq ft</small>
          </>
        ) : (
          <small>On request</small>
        )}
      </div>
      <button
        className={`icon-btn ${v.is_starred ? 'starred' : ''}`}
        aria-label={v.is_starred ? 'Unstar vendor' : 'Star vendor'}
        title={v.is_starred ? 'Starred — trusted by the team' : 'Star as trusted'}
        onClick={(e) => {
          e.stopPropagation();
          toggleStar(v);
        }}
      >
        <Star />
      </button>
    </div>
  );
}
