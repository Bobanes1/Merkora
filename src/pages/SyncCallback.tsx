import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mascot } from '../components/Mascot';
import { dropboxFinish, syncNow } from '../lib/sync';

/** Dropbox sends the person back here after signing in. */
export default function SyncCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    dropboxFinish(new URLSearchParams(location.search))
      .then(() => {
        void syncNow();
        navigate('/settings?synced=1', { replace: true });
      })
      .catch((e) => setError((e as Error).message));
  }, [navigate]);
  return (
    <div className="page narrow sync-callback">
      <Mascot mood={error ? 'sad' : 'think'} size={110} side="top" say={error ? 'Das hat nicht geklappt.' : 'Ich verbinde mit Dropbox …'} />
      {error && (
        <>
          <div className="form-error" role="alert">
            {error}
          </div>
          <Link className="btn primary" to="/settings">
            Zurück zu den Einstellungen
          </Link>
        </>
      )}
    </div>
  );
}
