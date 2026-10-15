import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { CalendarDays, KanbanSquare, Building2, Store, ChevronDown, LayoutDashboard, MapPinned, List, Star, Plus } from 'lucide-react';
import { VyaparLogo } from './Logo';

const VENDOR_LINKS = [
  { to: '/vendors/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/near', label: 'Find near a shop', icon: MapPinned },
  { to: '/vendors', label: 'All vendors', icon: List },
  { to: '/starred', label: 'Starred', icon: Star },
];
const VENDOR_PATHS = ['/vendors', '/near', '/starred', '/add', '/edit'];

export const sectionFor = (pathname) => (VENDOR_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? 'vendors' : 'expos');

function VendorsMenu({ active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="menu" ref={ref}>
      <button className={`menu-trigger ${active ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Store /> Vendors <ChevronDown style={{ width: 13, height: 13 }} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {VENDOR_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end role="menuitem">
              <Icon /> {label}
            </NavLink>
          ))}
          <hr />
          <NavLink to="/add" role="menuitem"><Plus /> Add a vendor</NavLink>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const inVendors = sectionFor(pathname) === 'vendors';
  return (
    <>
      <div className="topstripe" />
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Vyapar Marketing Hub home">
            <VyaparLogo size={28} />
            <span className="brand-divider" />
            <span className="brand-product">
              <b>Marketing Hub</b>
            </span>
          </Link>
          <nav className="mainnav" aria-label="Main">
            <span className="navgroup">Expos</span>
            <NavLink to="/" end className={({ isActive }) => (isActive || pathname === '/expos' ? 'active' : '')}>
              <CalendarDays /> Events
            </NavLink>
            <NavLink to="/expos/planner"><KanbanSquare /> Our plan</NavLink>
            <NavLink to="/expos/venues"><Building2 /> Venues</NavLink>
            <span className="navsep" />
            <VendorsMenu active={inVendors} />
          </nav>
          <Link to={inVendors ? '/add' : '/expos/add'} className="btn btn-primary btn-sm header-cta">
            <Plus /> {inVendors ? 'Add vendor' : 'Add event'}
          </Link>
        </div>
      </header>
    </>
  );
}
