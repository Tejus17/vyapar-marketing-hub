import { CalendarDays, RefreshCw } from 'lucide-react';
import { useExpos } from '../state/expos';

/** Loading / one-time setup / error screen for the Expos section. */
export default function ExposGate() {
  const { status, error, load } = useExpos();
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="page" style={{ paddingTop: 120 }}>
        <div className="spinner" />
        <p className="sub" style={{ textAlign: 'center', marginTop: 14 }}>Loading expos…</p>
      </div>
    );
  }
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="card card-pad" style={{ marginTop: 40 }}>
        <div className="empty-icon" style={{ margin: 0 }}><CalendarDays /></div>
        <h2 className="h2" style={{ marginTop: 16 }}>{status === 'setup' ? 'One-time setup for Expos' : 'Couldn’t load expos'}</h2>
        {status === 'setup' ? (
          <ol className="steps">
            <li>Open Supabase → <b>SQL Editor</b> → <b>New query</b>.</li>
            <li>Paste everything from <span className="code">supabase/expos.sql</span> and click <b>Run</b>.</li>
            <li>Come back and press <b>Check again</b>.</li>
          </ol>
        ) : (
          <p className="sub">{error?.message}</p>
        )}
        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={load}><RefreshCw /> Check again</button>
      </div>
    </div>
  );
}
