import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header, { sectionFor } from './components/Header';
import VendorDrawer from './components/VendorDrawer';
import EventDrawer from './components/EventDrawer';
import VenueDrawer from './components/VenueDrawer';
import SetupNotice from './components/SetupNotice';
import Overview from './pages/Overview';
import NearShop from './pages/NearShop';
import Vendors from './pages/Vendors';
import Starred from './pages/Starred';
import VendorForm from './pages/VendorForm';
import ExpoEvents from './pages/ExpoEvents';
import ExpoPlanner from './pages/ExpoPlanner';
import ExpoVenues from './pages/ExpoVenues';
import ExpoAdd from './pages/ExpoAdd';
import { useStore } from './state/store';
import { DrawerContext, ExpoDrawerContext } from './state/drawer';

export default function App() {
  const { status, toast } = useStore();
  const [vendorId, setVendorId] = useState(null);
  const [eventId, setEventId] = useState(null);
  const [venueId, setVenueId] = useState(null);

  // Close panels on page change, unless the navigation asks to open one.
  const location = useLocation();
  useEffect(() => {
    setVendorId(location.state?.openVendor ?? null);
    setEventId(location.state?.openEvent ?? null);
    setVenueId(null);
  }, [location.pathname, location.state]);

  const expoDrawers = useMemo(() => ({ openEvent: setEventId, openVenue: setVenueId }), []);
  const inExpos = sectionFor(location.pathname) === 'expos';

  return (
    <DrawerContext.Provider value={setVendorId}>
      <ExpoDrawerContext.Provider value={expoDrawers}>
        <Header />
        {!inExpos && (status === 'setup' || status === 'error') ? (
          <SetupNotice />
        ) : !inExpos && status === 'loading' ? (
          <div className="page" style={{ paddingTop: 120 }}>
            <div className="spinner" />
            <p className="sub" style={{ textAlign: 'center', marginTop: 14 }}>Loading vendors…</p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<ExpoEvents />} />
            <Route path="/vendors/overview" element={<Overview />} />
            <Route path="/near" element={<NearShop />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/starred" element={<Starred />} />
            <Route path="/add" element={<VendorForm />} />
            <Route path="/edit/:id" element={<VendorForm />} />
            <Route path="/expos" element={<ExpoEvents />} />
            <Route path="/expos/planner" element={<ExpoPlanner />} />
            <Route path="/expos/venues" element={<ExpoVenues />} />
            <Route path="/expos/add" element={<ExpoAdd />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
        {venueId && <VenueDrawer id={venueId} onClose={() => setVenueId(null)} />}
        {eventId && <EventDrawer id={eventId} onClose={() => setEventId(null)} />}
        {vendorId && <VendorDrawer id={vendorId} onClose={() => setVendorId(null)} />}
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'error' : ''}`} role="status">
            {toast.text}
          </div>
        )}
        <footer className="footer">Vyapar · Marketing Hub — internal tool for Shop-in-Shop branding and expos</footer>
      </ExpoDrawerContext.Provider>
    </DrawerContext.Provider>
  );
}
