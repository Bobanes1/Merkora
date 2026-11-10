import { useState } from 'react';
import { disconnect, dropboxConnect, googleConnect, redirectUri, setConf, syncNow, useSync, type SyncProvider } from '../lib/sync';
import { IconRefresh } from './Icons';

const fmt = (t?: number) => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie');

/** Settings section: connect Dropbox or Google Drive and keep the learning data in sync between devices. */
export function SyncPanel() {
  const { conf, status } = useSync();
  const [pick, setPick] = useState<SyncProvider>(conf.provider ?? 'dropbox');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const origin = location.origin;
  const copy = (t: string) => {
    void navigator.clipboard?.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (conf.provider)
    return (
      <section className="panel sync-panel">
        <h2>Online-Synchronisation</h2>
        <div className={`sync-status ${status.state}`}>
          <span className="sync-dot" />
          <span className="grow">
            <b>{conf.provider === 'dropbox' ? 'Dropbox' : 'Google Drive'} verbunden</b>
            <small>
              {status.text} · zuletzt: {fmt(status.at ?? conf.lastSync)}
            </small>
          </span>
        </div>
        <div className="row-gap">
          {status.state === 'login' ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => run(async () => (conf.provider === 'dropbox' ? dropboxConnect() : (await googleConnect(''), void syncNow())))}
            >
              Neu anmelden
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => void syncNow()} disabled={status.state === 'syncing'}>
              <IconRefresh size={15} /> {status.state === 'syncing' ? 'Wird synchronisiert …' : 'Jetzt synchronisieren'}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={disconnect}>
            Trennen
          </button>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={conf.auto} onChange={(e) => setConf({ auto: e.target.checked })} />
          <span>Automatisch synchronisieren (beim Öffnen und kurz nach jeder Änderung)</span>
        </label>
        <p className="muted small">
          Gespeichert werden Decks, Karten, Bilder, Lernfortschritt, XP und Lernpfad – nicht dein API-Key. Auf einem anderen Gerät verbindest du
          dasselbe Konto, dann werden beide Stände zusammengeführt.
        </p>
        {error && <div className="form-error">{error}</div>}
      </section>
    );

  return (
    <section className="panel sync-panel">
      <h2>Online-Synchronisation</h2>
      <p className="muted">Sichere deinen Lernstand in deinem eigenen Cloud-Speicher und lerne auf mehreren Geräten weiter.</p>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={pick === 'dropbox'} className={pick === 'dropbox' ? 'on' : ''} onClick={() => setPick('dropbox')}>
          Dropbox (empfohlen)
        </button>
        <button type="button" role="tab" aria-selected={pick === 'gdrive'} className={pick === 'gdrive' ? 'on' : ''} onClick={() => setPick('gdrive')}>
          Google Drive
        </button>
      </div>
      {pick === 'dropbox' ? (
        <>
          <ol className="steps">
            <li>
              Öffne{' '}
              <a href="https://www.dropbox.com/developers/apps/create" target="_blank" rel="noreferrer">
                dropbox.com/developers/apps
              </a>{' '}
              → „Scoped access“ → „App folder“ → beliebiger Name (z. B. „Merkora-Sync“) → „Create app“.
            </li>
            <li>Reiter „Permissions“: Haken bei <b>files.content.write</b> und <b>files.content.read</b> → „Submit“.</li>
            <li>
              Reiter „Settings“ → „OAuth 2 / Redirect URIs“: diese Adresse eintragen und „Add“:{' '}
              <button type="button" className="code-copy" onClick={() => copy(redirectUri())}>
                {redirectUri()} {copied ? '✓' : '⧉'}
              </button>
            </li>
            <li>Den „App key“ von dort kopieren und hier einfügen:</li>
          </ol>
          <div className="input-row">
            <input
              className="input"
              placeholder="App key (z. B. a1b2c3d4e5f6g7h)"
              value={conf.dropboxAppKey}
              onChange={(e) => setConf({ dropboxAppKey: e.target.value.trim() })}
              aria-label="Dropbox App key"
            />
            <button type="button" className="btn primary" disabled={!conf.dropboxAppKey} onClick={() => run(dropboxConnect)}>
              Mit Dropbox verbinden
            </button>
          </div>
          <p className="muted small">Einmalig, dauert etwa 2 Minuten. Danach bleibt die Verbindung bestehen, bis du sie trennst.</p>
        </>
      ) : (
        <>
          <ol className="steps">
            <li>
              Öffne die{' '}
              <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                Google Cloud Console
              </a>{' '}
              und lege ein Projekt an. Unter „APIs & Dienste → Bibliothek“ die <b>Google Drive API</b> aktivieren.
            </li>
            <li>„OAuth-Zustimmungsbildschirm“: Typ „Extern“, App-Name eintragen, dich selbst als Testnutzer hinzufügen.</li>
            <li>
              „Anmeldedaten → OAuth-Client-ID → Webanwendung“, unter „Autorisierte JavaScript-Quellen“ eintragen:{' '}
              <button type="button" className="code-copy" onClick={() => copy(origin)}>
                {origin} {copied ? '✓' : '⧉'}
              </button>
            </li>
            <li>Die Client-ID kopieren und hier einfügen:</li>
          </ol>
          <div className="input-row">
            <input
              className="input"
              placeholder="…apps.googleusercontent.com"
              value={conf.googleClientId}
              onChange={(e) => setConf({ googleClientId: e.target.value.trim() })}
              aria-label="Google Client-ID"
            />
            <button type="button" className="btn primary" disabled={!conf.googleClientId} onClick={() => run(async () => (await googleConnect('consent'), void syncNow()))}>
              Mit Google verbinden
            </button>
          </div>
          <p className="muted small">Google meldet dich aus Sicherheitsgründen nach einer Stunde ab; dann reicht ein Klick auf „Neu anmelden“.</p>
        </>
      )}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
