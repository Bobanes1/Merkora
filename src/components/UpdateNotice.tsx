import { APP_VERSION } from '../config';
import { hideUpdateNotice, installUpdate, useUpdate } from '../lib/update';
import { IconClose, IconDownload } from './Icons';

/** Notice in the app when a newer Merkora version is available – update with one click. */
export function UpdateNotice() {
  const u = useUpdate();
  const busy = u.status === 'downloading' || u.status === 'installing';
  if (!(u.status === 'available' || busy || (u.status === 'error' && u.version)) || (u.hidden && !busy)) return null;
  return (
    <div className="update-notice" role="status">
      <IconDownload size={18} />
      <div className="grow">
        {busy ? (
          <>
            <b>{u.status === 'installing' ? 'Update wird installiert …' : 'Update wird heruntergeladen …'}</b>
            <span className="bar">
              <i style={{ width: `${Math.round((u.progress ?? 0.05) * 100)}%` }} />
            </span>
            <small>Merkora startet danach neu. Dein Lernstand ist gespeichert.</small>
          </>
        ) : (
          <>
            <b>Neue Version {u.version} verfügbar</b>
            <small>
              Du nutzt {APP_VERSION}.{u.notes ? ` ${firstLine(u.notes)}` : ''}
            </small>
            {u.status === 'error' && <small className="update-error">{u.error}</small>}
          </>
        )}
      </div>
      {!busy && (
        <>
          <button type="button" className="btn primary sm" onClick={() => void installUpdate()}>
            {u.status === 'error' ? 'Nochmal versuchen' : 'Jetzt aktualisieren'}
          </button>
          <button type="button" className="icon-btn" aria-label="Später" title="Später" onClick={hideUpdateNotice}>
            <IconClose size={16} />
          </button>
        </>
      )}
    </div>
  );
}

const firstLine = (s: string) => {
  const l = s.split('\n').map((x) => x.replace(/[*#>`]/g, '').trim()).find(Boolean) ?? '';
  return l.length > 120 ? l.slice(0, 120) + '…' : l;
};
