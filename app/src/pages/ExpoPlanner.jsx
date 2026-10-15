import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, KanbanSquare } from 'lucide-react';
import { useExpos } from '../state/expos';
import { useExpoDrawers } from '../state/drawer';
import { dateRange, daysUntil } from '../lib/format';
import { FootfallPill } from '../components/EventRow';
import ExposGate from '../components/ExposGate';

const COLS = [
  { key: 'considering', title: 'Considering', hint: 'Being evaluated' },
  { key: 'selected', title: 'Selected', hint: 'We want a stall here' },
  { key: 'going', title: 'Going', hint: 'Booked or confirmed' },
  { key: 'went', title: 'Went', hint: 'Add how it went' },
];

export default function ExpoPlanner() {
  const { events, status, fetchNotes } = useExpos();
  const { openEvent } = useExpoDrawers();
  const [noteCount, setNoteCount] = useState({});
  const [showPast, setShowPast] = useState(false);

  const planned = useMemo(() => events.filter((e) => COLS.some((c) => c.key === e.team_status)), [events]);
  const ids = planned.map((e) => e.id).join(',');
  useEffect(() => {
    if (!planned.length) return;
    fetchNotes(planned.map((e) => e.id)).then((all) => {
      const c = {};
      for (const n of all) c[n.event_id] = (c[n.event_id] || 0) + 1;
      setNoteCount(c);
    });
  }, [ids]); // eslint-disable-line

  if (status !== 'ready') return <ExposGate />;
  const visible = (e) => e.team_status === 'went' || showPast || daysUntil(e.end_date || e.start_date) >= 0;

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="page-head">
        <div>
          <h1 className="h2">Our expo plan</h1>
          <p className="sub">Events the team is considering, has selected, booked or attended. Change the status from the events list or any event.</p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past ones too
        </label>
      </div>
      {planned.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon"><KanbanSquare /></div>
          <h3>Nothing planned yet</h3>
          <p>Set an event to Considering, Selected, Going or Went from the events list — it lands here for the whole team.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>Browse events</Link>
        </div>
      ) : (
        <div className="kanban">
          {COLS.map((c) => {
            const rows = planned
              .filter((e) => e.team_status === c.key && visible(e))
              .sort((a, b) => (c.key === 'went' ? (b.start_date || '').localeCompare(a.start_date || '') : (a.start_date || '').localeCompare(b.start_date || '')));
            return (
              <div className="kcol" key={c.key}>
                <h3>{c.title} <span className="tag">{rows.length}</span></h3>
                {rows.length === 0 && <p className="hint">{c.hint}</p>}
                {rows.map((e) => (
                  <div className="kcard" key={e.id} onClick={() => openEvent(e.id)}>
                    <b style={{ display: 'block', fontSize: 14 }}>{e.name}</b>
                    <div className="hint">{dateRange(e.start_date, e.end_date)} · {e.city}</div>
                    <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                      <FootfallPill e={e} />
                      {noteCount[e.id] ? <span className="tag"><MessageSquareText /> {noteCount[e.id]}</span> : null}
                    </div>
                    {e.status_by && <div className="hint" style={{ marginTop: 6 }}>by {e.status_by}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
