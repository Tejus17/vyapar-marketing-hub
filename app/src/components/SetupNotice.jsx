import { Database, RefreshCw } from 'lucide-react';
import { useStore } from '../state/store';

export default function SetupNotice() {
  const { status, error, load } = useStore();
  const isSetup = status === 'setup';
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="card card-pad" style={{ marginTop: 40 }}>
        <div className="empty-icon" style={{ margin: 0 }}>
          <Database />
        </div>
        <h2 className="h2" style={{ marginTop: 16 }}>
          {isSetup ? 'One-time database setup needed' : 'Couldn’t reach the database'}
        </h2>
        {isSetup ? (
          <ol className="steps">
            <li>Open your Supabase project → <b>SQL Editor</b> → <b>New query</b>.</li>
            <li>
              Paste everything from <span className="code">supabase/schema.sql</span> in this project and click <b>Run</b>.
            </li>
            <li>Come back here and press <b>Check again</b>.</li>
          </ol>
        ) : (
          <p className="sub">{error?.message || 'Unknown error.'}</p>
        )}
        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={load}>
          <RefreshCw /> Check again
        </button>
      </div>
    </div>
  );
}
