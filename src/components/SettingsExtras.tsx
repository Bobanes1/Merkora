import { useEffect, useState } from 'react';
import {
  autostartEnabled,
  backupNow,
  getBackupDir,
  isDesktop,
  listBackups,
  notify,
  pickFolder,
  readBackup,
  setAutostart,
  setBackupDir,
  type BackupInfo,
} from '../lib/desktop';
import { flush, replaceAll, setSettings, useStore } from '../lib/store';
import { ConfirmModal } from './Modal';

/** Daily reminder, tray, autostart and the Pomodoro lengths. */
export function RemindersPanel() {
  const s = useStore((x) => x.data.settings);
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void autostartEnabled().then(setAuto);
  }, []);

  const toggleAuto = async (on: boolean) => {
    try {
      await setAutostart(on);
      setAuto(on);
      setMsg({ ok: true, text: on ? 'Merkora startet ab jetzt mit dem System (im Infobereich).' : 'Autostart ist aus.' });
    } catch (e) {
      setMsg({ ok: false, text: `Autostart konnte nicht geändert werden: ${(e as Error)?.message ?? e}` });
    }
  };

  return (
    <section className="panel">
      <h2>Erinnerungen & Lernzeit</h2>
      <label className="check-row">
        <input type="checkbox" checked={s.reminderOn} onChange={(e) => setSettings({ reminderOn: e.target.checked })} />
        <span>
          <b>Tägliche Lern-Erinnerung</b> als Systemmeldung, wenn Karten fällig sind
        </span>
      </label>
      {s.reminderOn && (
        <div className="input-row reminder-time">
          <label className="field-label" htmlFor="rem-time">
            Uhrzeit
          </label>
          <input id="rem-time" type="time" className="input" value={s.reminderTime} onChange={(e) => setSettings({ reminderTime: e.target.value || '18:00' })} />
          <button
            type="button"
            className="btn ghost sm"
            onClick={async () =>
              setMsg(
                (await notify('Merkora', 'So sieht deine Lern-Erinnerung aus 🌱'))
                  ? { ok: true, text: 'Test-Meldung gesendet.' }
                  : { ok: false, text: 'Meldungen sind blockiert – erlaube sie in den Systemeinstellungen.' },
              )
            }
          >
            Testen
          </button>
        </div>
      )}
      {isDesktop && (
        <>
          <label className="check-row">
            <input type="checkbox" checked={s.trayOnClose} onChange={(e) => setSettings({ trayOnClose: e.target.checked })} />
            <span>
              <b>Beim Schließen im Infobereich weiterlaufen</b> – damit Erinnerungen auch kommen, wenn das Fenster zu ist. Beenden dann über
              das Merkora-Symbol › „Beenden“.
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={auto} onChange={(e) => void toggleAuto(e.target.checked)} />
            <span>
              <b>Mit dem Computer starten</b> (wartet unauffällig im Infobereich)
            </span>
          </label>
        </>
      )}
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="pomo-work">
            Pomodoro: Lernphase (Minuten)
          </label>
          <input
            id="pomo-work"
            type="number"
            min={5}
            max={120}
            className="input"
            value={s.pomodoroWork}
            onChange={(e) => setSettings({ pomodoroWork: Math.min(120, Math.max(5, Number(e.target.value) || 25)) })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="pomo-break">
            Pause (Minuten)
          </label>
          <input
            id="pomo-break"
            type="number"
            min={1}
            max={60}
            className="input"
            value={s.pomodoroBreak}
            onChange={(e) => setSettings({ pomodoroBreak: Math.min(60, Math.max(1, Number(e.target.value) || 5)) })}
          />
        </div>
      </div>
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'}>{msg.text}</div>}
    </section>
  );
}

const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Own backup folder (e.g. OneDrive), back up now, restore. */
export function BackupsPanel() {
  const [dir, setDir] = useState<string | null>(null);
  const [list, setList] = useState<BackupInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [restore, setRestore] = useState<BackupInfo | null>(null);
  const [showAll, setShowAll] = useState(false);
  const refresh = async () => {
    setDir(await getBackupDir().catch(() => null));
    setList(await listBackups().catch(() => []));
  };
  useEffect(() => {
    void refresh();
  }, []);
  const run = async (fn: () => Promise<string | void>) => {
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) });
    }
  };
  const shown = showAll ? list : list.slice(0, 6);

  return (
    <div className="backups">
      <h3>Sicherungen</h3>
      <p className="muted small">
        Merkora sichert jeden Tag automatisch (14 Tage lang).{' '}
        {dir ? (
          <>
            Zusätzlich in: <b>{dir}</b>
          </>
        ) : (
          'Wähle zusätzlich einen eigenen Ordner, z. B. in OneDrive oder auf einem USB-Stick.'
        )}
      </p>
      <div className="row-gap">
        <button
          type="button"
          className="btn outline sm"
          onClick={() =>
            void run(async () => {
              const d = await pickFolder();
              if (!d) return;
              await setBackupDir(d);
              await flush();
              await backupNow();
              return `Sicherungen werden ab jetzt auch in „${d}“ gespeichert.`;
            })
          }
        >
          {dir ? 'Anderen Ordner wählen' : 'Eigenen Sicherungsordner wählen'}
        </button>
        {dir && (
          <button type="button" className="btn ghost sm" onClick={() => void run(async () => (await setBackupDir(null), 'Eigener Ordner wird nicht mehr benutzt.'))}>
            Eigenen Ordner entfernen
          </button>
        )}
        <button
          type="button"
          className="btn outline sm"
          onClick={() => void run(async () => (await flush(), `Gesichert: ${await backupNow()}`))}
        >
          Jetzt sichern
        </button>
      </div>
      {list.length > 0 && (
        <ul className="backup-list">
          {shown.map((b) => (
            <li key={b.path}>
              <span>
                {new Date(b.modified).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
                <small className="muted">
                  {' '}
                  · {fmtSize(b.size)} · {b.place}
                  {b.name.includes('manuell') ? ' · von Hand' : ''}
                </small>
              </span>
              <button type="button" className="btn ghost sm" onClick={() => setRestore(b)}>
                Wiederherstellen
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Weniger anzeigen' : `Alle ${list.length} Sicherungen anzeigen`}
        </button>
      )}
      {msg && <div className={msg.ok ? 'form-ok' : 'form-error'}>{msg.text}</div>}
      {restore && (
        <ConfirmModal
          title="Sicherung wiederherstellen?"
          text={`Dein Lernstand wird durch die Sicherung vom ${new Date(restore.modified).toLocaleString('de-DE')} ersetzt. Der jetzige Stand wird vorher automatisch gesichert.`}
          confirm="Wiederherstellen"
          onClose={() => setRestore(null)}
          onConfirm={() =>
            void run(async () => {
              await flush();
              await backupNow();
              const text = await readBackup(restore.path);
              if (!replaceAll(JSON.parse(text))) throw new Error('Die Sicherung konnte nicht gelesen werden.');
              await flush();
              return 'Sicherung wiederhergestellt. Der vorherige Stand liegt als „von Hand“-Sicherung bereit.';
            })
          }
        />
      )}
    </div>
  );
}

/** How many new cards per deck and day. */
export function LearningPanel() {
  const perDay = useStore((x) => x.data.settings.newPerDay ?? 20);
  const fsrs = useStore((x) => !!x.data.settings.fsrs);
  const retention = useStore((x) => x.data.settings.retention ?? 0.9);
  return (
    <section className="panel">
      <h2>Lernen</h2>
      <label className="field-label" htmlFor="new-per-day">
        Neue Karten pro Tag und Kurs
      </label>
      <div className="input-row new-per-day">
        <input
          id="new-per-day"
          type="number"
          min={0}
          max={500}
          className="input"
          value={perDay}
          onChange={(e) => setSettings({ newPerDay: Math.min(500, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
        />
        <div className="row-gap">
          {[10, 20, 30, 50].map((n) => (
            <button key={n} type="button" className={`tag ${perDay === n ? 'on' : ''}`} onClick={() => setSettings({ newPerDay: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        Neue Karten werden auf die Tage verteilt, statt alle auf einmal fällig zu werden. Alle Decks eines Kurses teilen sich diese Zahl
        (der Reihe nach), so wie Unterdecks in Anki. Wiederholungen bereits gelernter Karten kommen immer dazu. Willst du an einem Tag mehr, gibt es beim Lernen den Knopf „10 neue Karten“. Für Decks mit Prüfungstermin plant der
        Kalender zusätzlich, was bis zur Prüfung nötig ist.
      </p>
      <h3 className="settings-sub">Planung der Wiederholungen</h3>
      <div className="row-gap" role="radiogroup" aria-label="Planung">
        <button type="button" role="radio" aria-checked={!fsrs} className={`tag ${!fsrs ? 'on' : ''}`} onClick={() => setSettings({ fsrs: false })}>
          Klassisch
        </button>
        <button type="button" role="radio" aria-checked={fsrs} className={`tag ${fsrs ? 'on' : ''}`} onClick={() => setSettings({ fsrs: true })}>
          FSRS (empfohlen)
        </button>
      </div>
      <p className="muted small">
        {fsrs
          ? 'FSRS ist der moderne Algorithmus aus Anki: Er schätzt für jede Karte, wie gut du sie im Gedächtnis hast, und plant so, dass du bei gleichem Behalten meist 20–30 % weniger wiederholen musst. Bereits gelernte Karten werden übernommen.'
          : 'Feste Faktoren wie im alten Anki: Gut verlängert den Abstand ungefähr um das 2,5-Fache.'}
      </p>
      {fsrs && (
        <>
          <label className="field-label" htmlFor="retention">
            Gewünschte Behaltensquote
          </label>
          <select id="retention" className="input" value={retention} onChange={(e) => setSettings({ retention: Number(e.target.value) })}>
            <option value={0.8}>80 % – am wenigsten Wiederholungen</option>
            <option value={0.85}>85 %</option>
            <option value={0.9}>90 % – Standard</option>
            <option value={0.95}>95 % – kurz vor Prüfungen, viele Wiederholungen</option>
          </select>
        </>
      )}
    </section>
  );
}

/** Show estimated AI tokens/costs before a task – and an own price (e.g. for a local server). */
export function CostSettings() {
  const s = useStore((x) => x.data.settings);
  const on = s.showCosts ?? true;
  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return v.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n;
  };
  return (
    <div className="cost-settings">
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => setSettings({ showCosts: e.target.checked })} />
        <span>
          <b>Geschätzte Tokens und Kosten anzeigen</b> – vor jeder KI-Aufgabe (Karten, Zusammenfassung, Quiz, Probeprüfung, Tutor)
        </span>
      </label>
      {on && (
        <details className="cost-price" open={s.priceIn !== undefined || s.priceOut !== undefined}>
          <summary>Eigener Preis (optional)</summary>
          <p className="muted small">
            Für einen eigenen Server, unbekannte Modelle oder wenn sich Preise geändert haben – in US-$ pro 1 Million Tokens. Leer lassen, um
            die eingebaute Preisliste (bei OpenRouter: aktuelle Preise) zu nutzen.
          </p>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="price-in">
                Eingabe ($ / 1 Mio.)
              </label>
              <input id="price-in" className="input" inputMode="decimal" defaultValue={s.priceIn ?? ''} placeholder="z. B. 0,15" onBlur={(e) => setSettings({ priceIn: num(e.target.value) })} />
            </div>
            <div>
              <label className="field-label" htmlFor="price-out">
                Ausgabe ($ / 1 Mio.)
              </label>
              <input id="price-out" className="input" inputMode="decimal" defaultValue={s.priceOut ?? ''} placeholder="z. B. 0,60" onBlur={(e) => setSettings({ priceOut: num(e.target.value) })} />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

/** Models and figures from PDF slides on AI cards – can be switched off. */
export function SlideFigureSettings() {
  const on = useStore((x) => x.data.settings.slideFigures ?? true);
  return (
    <label className="check-row">
      <input type="checkbox" checked={on} onChange={(e) => setSettings({ slideFigures: e.target.checked })} />
      <span>
        <b>Modelle und Abbildungen aus PDF-Folien übernehmen</b> – bei „Mit KI erstellen“ erkennt Merkora Folien mit Abbildungen, und
        die KI kann ein Bild der passenden Folie an eine Karte hängen. Es werden keine Bilder an die KI geschickt.
      </span>
    </label>
  );
}
