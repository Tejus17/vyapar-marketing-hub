import { NavLink, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, MapPinned, List, Star, Plus, Store, CalendarDays, Building2, KanbanSquare } from 'lucide-react';
import { VyaparLogo } from './Logo';

const SECTIONS = {
  vendors: {
    label: 'Vendors',
    icon: Store,
    home: '/',
    cta: { to: '/add', label: 'Add vendor' },
    links: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/near', label: 'Find near a shop', icon: MapPinned },
      { to: '/vendors', label: 'All vendors', icon: List },
      { to: '/starred', label: 'Starred', icon: Star },
    ],
  },
  expos: {
    label: 'Expos',
    icon: CalendarDays,
    home: '/expos',
    cta: { to: '/expos/add', label: 'Add event' },
    links: [
      { to: '/expos', label: 'Events', icon: CalendarDays, end: true },
      { to: '/expos/planner', label: 'Our plan', icon: KanbanSquare },
      { to: '/expos/venues', label: 'Venues', icon: Building2 },
    ],
  },
};

export const sectionFor = (pathname) => (pathname.startsWith('/expos') ? 'expos' : 'vendors');

export default function Header() {
  const { pathname } = useLocation();
  const active = sectionFor(pathname);
  const sec = SECTIONS[active];

  return (
    <>
      <div className="topstripe" />
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Vyapar Marketing Hub home">
            <VyaparLogo size={32} />
            <span className="brand-divider" />
            <span className="brand-product">
              <b>Marketing Hub</b>
              <span>Vendors · Expos</span>
            </span>
          </Link>
          <div className="section-switch" role="tablist" aria-label="Section">
            {Object.entries(SECTIONS).map(([key, s]) => (
              <Link key={key} to={s.home} role="tab" aria-selected={key === active} className={key === active ? 'on' : ''}>
                <s.icon /> {s.label}
              </Link>
            ))}
          </div>
          <Link to={sec.cta.to} className="btn btn-primary btn-sm header-cta">
            <Plus /> {sec.cta.label}
          </Link>
        </div>
        <div className="subnav-wrap">
          <nav className="nav subnav">
            {sec.links.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}
