import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ManagePrivacy, PrivacyText } from '../components/Consent';
import { IconDownload, IconEye, IconEyeOff, IconUpload } from '../components/Icons';
import { ConfirmModal } from '../components/Modal';
import { PROVIDERS, listModels, testConnection } from '../lib/ai';
import { desktop, getState, isAndroid, isDesktop, replaceAll, resetAll, setApiKey, setChatKey, setPrivacy, setSettings, useStore, type Data, type Provider } from '../lib/store';
import { download } from '../lib/util';
import { APP_VERSION, SECOND_MODEL, SLIDE_FIGURES } from '../config';
import { SyncPanel } from '../components/SyncPanel';
import { ApkUpdatePanel } from '../components/ApkUpdate';
import { BackupsPanel, BoldSettings, CostSettings, GoalSettings, LearningPanel, RemindersPanel, SlideFigureSettings } from '../components/SettingsExtras';

const AREAS = [
  { id: 'ki', label: 'KI' },
  { id: 'lernen', label: 'Lernen' },
  { id: 'darstellung', label: 'Darstellung' },
  { id: 'daten', label: 'Daten & Sync' },
  { id: 'app', label: 'Über die App' },
] as const;

/** Tabs for the areas (left, or on top on small windows) plus a search over all settings. */
function SettingsNav({ tab, setTab, query, setQuery }: { tab: string; setTab: (t: string) => void; query: string; setQuery: (q: string) => void }) {
  const location = useLocation();
  // a link like /settings#lernen opens that tab
  useEffect(() => {
    const h = location.hash.slice(1);
    if (AREAS.some((a) => a.id === h)) setTab(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);
  return (
    <nav className="settings-nav" aria-label="Bereiche der Einstellungen">
      <input
        type="search"
        className="input settings-search"
        placeholder="Einstellung suchen …"
        aria-label="Einstellungen durchsuchen"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="settings-tabs" role="tablist">
        {AREAS.map((a) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            role="tab"
            aria-selected={!query && tab === a.id}
            className={!query && tab === a.id ? 'on' : ''}
            onClick={(e) => {
              e.preventDefault();
              setQuery('');
              setTab(a.id);
              window.history.replaceState(null, '', `#${a.id}`);
            }}
          >
            {a.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** Hides the panels that don't contain the search words (data attribute only – React's own markup stays untouched). */
function useSettingsSearch(query: string, deps: unknown[]) {
  useEffect(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const body = document.querySelector('.settings-body');
    if (!body) return;
    let hits = 0;
    body.querySelectorAll<HTMLElement>('.settings-area').forEach((area) => {
      let areaHits = 0;
      area.querySelectorAll<HTMLElement>(':scope > section, :scope > .panel, :scope > div:not(.settings-area-title)').forEach((p) => {
        const hit = !words.length || words.every((w) => (p.textContent ?? '').toLowerCase().includes(w));
        p.toggleAttribute('data-miss', !hit);
        if (hit) areaHits++;
      });
      area.toggleAttribute('data-miss', words.length > 0 && areaHits === 0);
      hits += areaHits;
    });
    body.toggleAttribute('data-nohits', words.length > 0 && hits === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ...deps]);
}
import { checkForUpdate, installUpdate, useUpdate } from '../lib/update';



export default function Settings() {
  const settings = useStore((s) => s.data.settings);
  const apiKey = useStore((s) => s.apiKey);
  const privacy = useStore((s) => s.privacy);
  const [tab, setTab] = useState<string>(() => (AREAS.some((a) => a.id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : AREAS[0].id));
  const [query, setQuery] = useState('');
  useSettingsSearch(query, [tab, settings]);
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
    <div className="page settings-page">
      <header className="page-head">
        <div className="page-title">
          <h1>Einstellungen</h1>
          <p className="page-intro">Lernen, KI, Darstellung, Sync und Daten – alles, was du an Merkora anpassen kannst.</p>
        </div>
      </header>
      <div className="settings-layout">
      <SettingsNav tab={tab} setTab={setTab} query={query} setQuery={setQuery} />
      <div className="settings-body" data-tab={query.trim() ? '' : tab}>
      <p className="settings-nohits muted">Keine Einstellung gefunden – versuch ein anderes Wort.</p>
      <div id="ki" className="settings-area">
      <h2 className="settings-area-title">KI</h2>
      <section className="panel">
        <h2>{SECOND_MODEL ? 'KI für Inhalte' : 'KI'}</h2>
        <p className="muted">
          {SECOND_MODEL
            ? 'Dieses Modell erstellt Karteikarten, Zusammenfassungen, Quiz, Grafiken und den Lernpfad. Für den Chat kannst du weiter unten ein anderes Modell wählen.'
            : 'Dieses Modell macht alles: Karteikarten, Zusammenfassungen, Quiz, Probeprüfungen, Lernpfad, Tutor-Chat und Erklärungen.'}{' '}
          Anfragen gehen direkt von deinem Gerät an den Anbieter.{' '}
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
              Größere Aufgaben (Zusammenfassung, Quiz, Karten) als Claude-Hintergrundauftrag senden – läuft weiter, auch wenn du das
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
        <BoldSettings />
        <CostSettings />
        {SLIDE_FIGURES && <SlideFigureSettings />}
      </section>

      {SECOND_MODEL && <ChatModelPanel />}
      </div>

      <div id="lernen" className="settings-area">
      <h2 className="settings-area-title">Lernen</h2>
      <LearningPanel />
      <GoalSettings />
      <RemindersPanel />
      </div>

      <div id="darstellung" className="settings-area">
      <h2 className="settings-area-title">Darstellung</h2>
      <section className="panel">
        <h2>Farbschema und Animationen</h2>
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
          <span>Verspielte Effekte: Pip, Flo, Konfetti, Sterne, hüpfende Knöpfe, Karten-Drehungen und weiche Übergänge.</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.glass !== false} onChange={(e) => setSettings({ glass: e.target.checked })} />
          <span>Glas-Optik: Seitenleiste, Leisten und Fenster leicht durchscheinend.</span>
        </label>
      </section>
      </div>

      <div id="daten" className="settings-area">
      <h2 className="settings-area-title">Daten & Sync</h2>
      <SyncPanel />

      <section className="panel">
        <h2>Deine Daten</h2>
        <PrivacyText />
        <p className="muted small">
          Dein Lernstand wird automatisch gespeichert – kurz nach jeder Änderung und spätestens alle 30 Sekunden.
          {isDesktop && ' Zusätzlich legt die App eine Speicherdatei und jeden Tag eine Sicherungskopie (die letzten 14 Tage) an.'}
        </p>
        {isDesktop && !isAndroid && (
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
      </div>

      <div id="app" className="settings-area">
      <h2 className="settings-area-title">Über die App</h2>
      {isAndroid ? (
        <ApkUpdatePanel />
      ) : (
        isDesktop && <UpdatePanel />
      )}
      <section className="panel">
        <h2>Einführung</h2>
        <p className="muted">Pip zeigt dir in vier kurzen Schritten, wie Merkora funktioniert.</p>
        <button type="button" className="btn outline" onClick={() => setSettings({ tourDone: false })}>
          Einführung nochmal ansehen
        </button>
      </section>
      <p className="muted small version-line">Merkora Version {APP_VERSION}</p>
      </div>
      </div>
      </div>
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
