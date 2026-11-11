import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ManagePrivacy, PrivacyText } from '../components/Consent';
import { IconDownload, IconEye, IconEyeOff, IconUpload } from '../components/Icons';
import { ConfirmModal } from '../components/Modal';
import { PROVIDERS, listModels, testConnection } from '../lib/ai';
import { desktop, getState, isDesktop, replaceAll, resetAll, setApiKey, setChatKey, setPrivacy, setSettings, useStore, type Data, type Provider } from '../lib/store';
import { download } from '../lib/util';
import { APP_VERSION } from '../config';
import { SyncPanel } from '../components/SyncPanel';
import { BackupsPanel, RemindersPanel } from '../components/SettingsExtras';
import { checkForUpdate, installUpdate, useUpdate } from '../lib/update';

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];

export default function Settings() {
  const settings = useStore((s) => s.data.settings);
  const apiKey = useStore((s) => s.apiKey);
  const privacy = useStore((s) => s.privacy);
  const [key, setKey] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [manage, setManage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const info = PROVIDERS[settings.provider];

  useEffect(() => {
    document.title = 'Einstellungen – Merkora';
  }, []);
  useEffect(() => {
    setKey(apiKey);
  }, [apiKey]);

  const saveKey = () => {
    setApiKey(key);
    setStatus({ ok: true, text: key.trim() ? 'Key gespeichert.' : 'Key entfernt.' });
  };

  const test = async () => {
    setApiKey(key);
    setBusy('test');
    setStatus(null);
    try {
      await testConnection();
      setStatus({ ok: true, text: `Verbindung zu ${info.short} funktioniert.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  const loadModels = async () => {
    setApiKey(key);
    setBusy('models');
    setStatus(null);
    try {
      const m = await listModels();
      setModels(m);
      setStatus({ ok: true, text: `${m.length} Modelle gefunden.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as Data;
      const v = (d as { version?: number }).version;
      if ((v !== 1 && v !== 2) || !Array.isArray(d.decks)) throw new Error('Unbekanntes Format');
      if (!replaceAll(d)) throw new Error('Unbekanntes Format');
      setStatus({ ok: true, text: `Import erfolgreich: ${d.decks.length} Decks.` });
    } catch (e) {
      setStatus({ ok: false, text: `Import fehlgeschlagen: ${(e as Error).message}` });
    }
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Einstellungen</h1>
      </header>

      <section className="panel">
        <h2>KI für Inhalte</h2>
        <p className="muted">
          Dieses Modell erstellt Karteikarten, Zusammenfassungen, Quiz, Podcasts, Grafiken und den Lernpfad. Für den Chat kannst du weiter unten ein anderes Modell wählen. Anfragen gehen direkt von deinem Gerät an den Anbieter.{' '}
          <Link to="/forgot-password" className="small-link">
            Wo bekomme ich einen Key?
          </Link>
        </p>
        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="s-provider">
              Anbieter
            </label>
            <select
              id="s-provider"
              className="input"
              value={settings.provider}
              onChange={(e) => {
                setSettings({ provider: e.target.value as Provider, model: '', baseUrl: '' });
                setModels([]);
                setStatus(null);
              }}
            >
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="s-model">
              Modell
            </label>
            <div className="input-row">
              <input
                id="s-model"
                className="input"
                list="model-list"
                placeholder={info.defaultModel}
                value={settings.model}
                onChange={(e) => setSettings({ model: e.target.value })}
              />
              <button type="button" className="btn outline sm" onClick={loadModels} disabled={!!busy}>
                {busy === 'models' ? '…' : 'Laden'}
              </button>
            </div>
            <datalist id="model-list">
              {(models.length ? models : info.models).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>
        <label className="field-label" htmlFor="s-key">
          API-Key
        </label>
        <div className="input-row">
          <div className="input-wrap grow">
            <input
              id="s-key"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder={`Dein Key (${info.keyHint})`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="button" className="eye" aria-label={show ? 'Key verbergen' : 'Key anzeigen'} onClick={() => setShow(!show)}>
              {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
          <button type="button" className="btn primary" onClick={saveKey}>
            Speichern
          </button>
        </div>
        {(settings.provider === 'custom' || settings.provider === 'openrouter') && (
          <>
            <label className="field-label" htmlFor="s-base">
              Server-Adresse
            </label>
            <input
              id="s-base"
              className="input"
              placeholder={info.baseUrl}
              value={settings.baseUrl}
              onChange={(e) => setSettings({ baseUrl: e.target.value })}
            />
          </>
        )}
        {settings.provider === 'anthropic' && (
          <label className="check-row">
            <input type="checkbox" checked={settings.claudeBatch} onChange={(e) => setSettings({ claudeBatch: e.target.checked })} />
            <span>
              Größere Aufgaben (Zusammenfassung, Quiz, Podcast, Karten) als Claude-Hintergrundauftrag senden – läuft weiter, auch wenn du das
              Fenster schließt, dauert aber meist ein paar Minuten und kostet nur die Hälfte.
            </span>
          </label>
        )}
        <label className="check-row">
          <input type="checkbox" checked={privacy.keepKey} onChange={(e) => setPrivacy({ keepKey: e.target.checked, consent: privacy.consent === 'unset' ? 'custom' : privacy.consent })} />
          <span>Key auf diesem Gerät merken (sonst nur bis zum Schließen des Tabs)</span>
        </label>
        <div className="row-gap">
          <button type="button" className="btn outline" onClick={test} disabled={!!busy}>
            {busy === 'test' ? 'Wird geprüft …' : 'Verbindung testen'}
          </button>
          {apiKey && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setApiKey('');
                setKey('');
                setStatus({ ok: true, text: 'Key gelöscht.' });
              }}
            >
              Key löschen
            </button>
          )}
        </div>
        {status && <div className={status.ok ? 'form-ok' : 'form-error'}>{status.text}</div>}
      </section>

      <ChatModelPanel />

      <RemindersPanel />

      <section className="panel">
        <h2>Podcast-Stimmen</h2>
        <p className="muted">Mit OpenAI werden natürliche Stimmen genutzt, sonst die Sprachausgabe deines Browsers.</p>
        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="v-a">
              Stimme Lena
            </label>
            <select id="v-a" className="input" value={settings.ttsVoiceA} onChange={(e) => setSettings({ ttsVoiceA: e.target.value })}>
              {OPENAI_VOICES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="v-b">
              Stimme Tom
            </label>
            <select id="v-b" className="input" value={settings.ttsVoiceB} onChange={(e) => setSettings({ ttsVoiceB: e.target.value })}>
              {OPENAI_VOICES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <SyncPanel />

      <section className="panel">
        <h2>Darstellung</h2>
        <div className="seg" role="radiogroup" aria-label="Farbschema">
          {(
            [
              ['system', 'Wie das System'],
              ['light', 'Hell'],
              ['dark', 'Dunkel'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={(settings.theme ?? 'system') === v}
              className={`seg-btn ${(settings.theme ?? 'system') === v ? 'on' : ''}`}
              onClick={() => setSettings({ theme: v })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={settings.animations} onChange={(e) => setSettings({ animations: e.target.checked })} />
          <span>Pip, Flo und die Animationen beim Lernen anzeigen (Konfetti, Sterne, Karten-Drehungen).</span>
        </label>
      </section>

      <section className="panel">
        <h2>Deine Daten</h2>
        <PrivacyText />
        <p className="muted small">
          Dein Lernstand wird automatisch gespeichert – kurz nach jeder Änderung und spätestens alle 30 Sekunden.
          {isDesktop && ' Zusätzlich legt die App eine Speicherdatei und jeden Tag eine Sicherungskopie (die letzten 14 Tage) an.'}
        </p>
        {isDesktop && (
          <button type="button" className="btn ghost sm" onClick={() => desktop?.openDataFolder()}>
            Speicherordner öffnen
          </button>
        )}
        <div className="row-gap">
          <button type="button" className="btn outline" onClick={() => setManage(true)}>
            Datenschutz-Auswahl ändern
          </button>
          <button type="button" className="btn outline" onClick={() => download(`merkora-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getState().data, null, 2))}>
            <IconDownload size={16} /> Sicherung herunterladen
          </button>
          <button type="button" className="btn outline" onClick={() => fileRef.current?.click()}>
            <IconUpload size={16} /> Sicherung laden
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>
            Alles zurücksetzen
          </button>
        </div>
      </section>
      {isDesktop && (
        <section className="panel">
          <BackupsPanel />
        </section>
      )}
      {isDesktop && <UpdatePanel />}
      <p className="muted small version-line">Merkora Version {APP_VERSION}</p>
      {manage && <ManagePrivacy onClose={() => setManage(false)} />}
      {confirmReset && (
        <ConfirmModal
          title="Alles zurücksetzen?"
          text="Alle Decks, Karten, dein Fortschritt und dein API-Key werden von diesem Gerät gelöscht. Lade vorher eine Sicherung herunter, wenn du sie behalten willst."
          confirm="Alles löschen"
          onClose={() => setConfirmReset(false)}
          onConfirm={resetAll}
        />
      )}
    </div>
  );
}

/** A separate (e.g. faster or cheaper) model for talking with the learner: tutor chat, explanations, grading. */
function ChatModelPanel() {
  const settings = useStore((s) => s.data.settings);
  const chatKey = useStore((s) => s.chatKey);
  const mainKey = useStore((s) => s.apiKey);
  const [key, setKey] = useState(chatKey);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setKey(chatKey);
  }, [chatKey]);
  const p = settings.chatProvider;
  const info = PROVIDERS[p];
  const sameProvider = p === settings.provider;

  const test = async () => {
    setChatKey(key);
    setBusy('test');
    setStatus(null);
    try {
      await testConnection('chat');
      setStatus({ ok: true, text: `Chat-Modell über ${info.short} funktioniert.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };
  const loadModels = async () => {
    setChatKey(key);
    setBusy('models');
    setStatus(null);
    try {
      const m = await listModels('chat');
      setModels(m);
      setStatus({ ok: true, text: `${m.length} Modelle gefunden.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="panel">
      <h2>KI für den Chat</h2>
      <p className="muted">Für Gespräche mit Pip, Erklärungen zu Karten und das Bewerten getippter Antworten.</p>
      <label className="check-row">
        <input type="checkbox" checked={settings.chatSeparate} onChange={(e) => setSettings({ chatSeparate: e.target.checked })} />
        <span>
          <b>Anderes Modell für den Chat verwenden</b> – z. B. ein schnelles, günstiges Modell zum Plaudern und ein starkes für die
          Inhalte. {settings.chatSeparate ? '' : 'Gerade nutzt der Chat dasselbe Modell wie die Inhalte.'}
        </span>
      </label>
      {settings.chatSeparate && (
        <>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="c-provider">
                Anbieter
              </label>
              <select
                id="c-provider"
                className="input"
                value={p}
                onChange={(e) => {
                  setSettings({ chatProvider: e.target.value as Provider, chatModel: '', chatBaseUrl: '' });
                  setModels([]);
                  setStatus(null);
                }}
              >
                {(Object.keys(PROVIDERS) as Provider[]).map((x) => (
                  <option key={x} value={x}>
                    {PROVIDERS[x].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="c-model">
                Modell
              </label>
              <div className="input-row">
                <input
                  id="c-model"
                  className="input"
                  list="chat-model-list"
                  placeholder={info.defaultModel}
                  value={settings.chatModel}
                  onChange={(e) => setSettings({ chatModel: e.target.value })}
                />
                <button type="button" className="btn outline sm" onClick={loadModels} disabled={!!busy}>
                  {busy === 'models' ? '…' : 'Laden'}
                </button>
              </div>
              <datalist id="chat-model-list">
                {(models.length ? models : info.models).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
          <label className="field-label" htmlFor="c-key">
            API-Key für den Chat {sameProvider && mainKey ? '(leer lassen = Key von oben verwenden)' : ''}
          </label>
          <div className="input-row">
            <div className="input-wrap grow">
              <input
                id="c-key"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder={`Key (${info.keyHint})`}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <button type="button" className="eye" aria-label={show ? 'Key verbergen' : 'Key anzeigen'} onClick={() => setShow(!show)}>
                {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setChatKey(key);
                setStatus({ ok: true, text: key.trim() ? 'Chat-Key gespeichert.' : 'Chat-Key entfernt.' });
              }}
            >
              Speichern
            </button>
          </div>
          {(p === 'custom' || p === 'openrouter') && (
            <>
              <label className="field-label" htmlFor="c-base">
                Server-Adresse
              </label>
              <input
                id="c-base"
                className="input"
                placeholder={info.baseUrl}
                value={settings.chatBaseUrl}
                onChange={(e) => setSettings({ chatBaseUrl: e.target.value })}
              />
            </>
          )}
          {!key.trim() && !(sameProvider && mainKey) && p !== 'custom' && (
            <p className="muted small">
              Ohne Key funktioniert der Chat nicht – bitte einen Key eintragen.
            </p>
          )}
          <div className="row-gap">
            <button type="button" className="btn outline" onClick={test} disabled={!!busy}>
              {busy === 'test' ? 'Wird geprüft …' : 'Chat-Verbindung testen'}
            </button>
          </div>
          {status && <div className={status.ok ? 'form-ok' : 'form-error'}>{status.text}</div>}
        </>
      )}
    </section>
  );
}
/** Version and updates of the desktop app. */
function UpdatePanel() {
  const u = useUpdate();
  const busy = u.status === 'checking' || u.status === 'downloading' || u.status === 'installing';
  return (
    <section className="panel">
      <h2>Updates</h2>
      <p className="muted">
        Merkora sucht beim Start und alle paar Stunden nach einer neuen Version und zeigt dann oben einen Hinweis. Installiert wird erst,
        wenn du es bestätigst.
      </p>
      <div className="row-gap">
        <button type="button" className="btn outline" onClick={() => void checkForUpdate(true)} disabled={busy}>
          {u.status === 'checking' ? 'Wird gesucht …' : 'Nach Updates suchen'}
        </button>
        {u.status === 'available' && (
          <button type="button" className="btn primary" onClick={() => void installUpdate()}>
            Version {u.version} installieren
          </button>
        )}
      </div>
      {u.status === 'none' && <div className="form-ok">Du hast die neueste Version ({APP_VERSION}).</div>}
      {u.status === 'available' && <div className="form-ok">Version {u.version} ist verfügbar.</div>}
      {(u.status === 'downloading' || u.status === 'installing') && <div className="form-ok">Update läuft – Merkora startet gleich neu.</div>}
      {u.status === 'error' && <div className="form-error">{u.error}</div>}
    </section>
  );
}
