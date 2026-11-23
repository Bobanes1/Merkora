import { APP_VERSION } from '../config';
import { ANDROID_DOWNLOAD } from '../lib/desktop';
import { checkApkUpdate, downloadApkInBrowser, hideApkNotice, installApkUpdate, useApkUpdate, type ApkState } from '../lib/androidUpdate';
import { IconClose, IconDownload } from './Icons';

const busy = (u: ApkState) => u.status === 'downloading';

function Body({ u }: { u: ApkState }) {
  if (u.status === 'downloading')
    return (
      <>
        <b>Update wird heruntergeladen … {Math.round((u.progress ?? 0) * 100)} %</b>
        <span className="bar">
          <i style={{ width: `${Math.round((u.progress ?? 0.03) * 100)}%` }} />
        </span>
      </>
    );
  if (u.status === 'installing')
    return (
      <>
        <b>Installieren …</b>
        <small>Tippe im Android-Fenster auf „Installieren“. Dein Lernstand bleibt erhalten. Kein Fenster? Tippe auf „Nochmal“.</small>
      </>
    );
  if (u.status === 'ready')
    return u.retried ? (
      <>
        <b>Version {u.version} ist noch nicht installiert</b>
        <small>Tippe auf „Installieren“ und im Android-Fenster nochmal auf „Installieren“. Zeigt Android einen Fehler, lade die Version über „Im Browser laden“ und tippe die Datei an – dein Lernstand bleibt erhalten.</small>
      </>
    ) : (
      <>
        <b>Version {u.version} ist bereit</b>
        <small>Schon heruntergeladen – tippe auf „Installieren“ und bestätige im Android-Fenster.</small>
      </>
    );
  if (u.status === 'permission')
    return (
      <>
        <b>Einmal erlauben</b>
        <small>Android fragt einmal, ob Merkora Updates installieren darf: „Aus dieser Quelle zulassen“ einschalten und zurück zu Merkora – die Installation startet dann von selbst.</small>
      </>
    );
  return (
    <>
      <b>Neue Version {u.version} verfügbar</b>
      <small>Du nutzt {APP_VERSION}.</small>
      {u.status === 'error' && <small className="update-error">{u.error}</small>}
    </>
  );
}

/** Android: banner at the top when a newer version exists – update with one tap. */
export function ApkUpdateNotice() {
  const u = useApkUpdate();
  const show = ['available', 'downloading', 'installing', 'ready', 'permission'].includes(u.status) || (u.status === 'error' && !!u.version);
  if (!show || (u.hidden && !busy(u))) return null;
  return (
    <div className="update-notice" role="status">
      <IconDownload size={18} />
      <div className="grow">
        <Body u={u} />
      </div>
      {!busy(u) && (
        <>
          <button type="button" className="btn primary sm" onClick={() => void installApkUpdate()}>
            {u.status === 'error' ? 'Nochmal versuchen' : u.status === 'installing' ? 'Nochmal' : u.status === 'permission' || u.status === 'ready' ? 'Installieren' : 'Jetzt aktualisieren'}
          </button>
          {(u.status === 'error' || u.retried) && (
            <button type="button" className="btn ghost sm" onClick={() => void downloadApkInBrowser()} title="Lädt die neue Version im Browser – danach die Datei antippen">
              Im Browser laden
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Später" title="Später" onClick={hideApkNotice}>
            <IconClose size={16} />
          </button>
        </>
      )}
    </div>
  );
}

/** Settings › Über die App on Android: look for updates by hand. */
export function ApkUpdatePanel() {
  const u = useApkUpdate();
  return (
    <section className="panel">
      <h2>Updates</h2>
      <p className="muted">
        Version {APP_VERSION}. Merkora sucht beim Start nach neuen Versionen und installiert sie auf Wunsch – dein Lernstand bleibt erhalten.
      </p>
      <div className="row-gap">
        {u.status === 'available' || u.status === 'ready' || u.status === 'installing' || u.status === 'permission' || (u.status === 'error' && u.version) ? (
          <button type="button" className="btn primary" onClick={() => void installApkUpdate()}>
            Version {u.version} installieren
          </button>
        ) : (
          <button type="button" className="btn outline" onClick={() => void checkApkUpdate(true)} disabled={u.status === 'checking' || busy(u)}>
            {u.status === 'checking' ? 'Wird gesucht …' : 'Nach Updates suchen'}
          </button>
        )}
      </div>
      {u.status === 'none' && <p className="form-ok">Du hast die neueste Version.</p>}
      {u.status === 'error' && <p className="form-error">{u.error}</p>}
      <p className="muted small">
        Klappt es nicht?{' '}
        <a href={ANDROID_DOWNLOAD} target="_blank" rel="noreferrer">
          Neueste Version auf GitHub
        </a>
      </p>
    </section>
  );
}
