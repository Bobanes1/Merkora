import { useState } from 'react';
import { SoundsTool } from '../components/tools/SoundsTool';
import { JavaSetup } from '../components/JavaSetup';
import { useSearchParams } from 'react-router-dom';
import { CodeEditor } from '../components/CodeEditor';
import { IconCalendar, IconChart, IconHeadphones, IconChecklist, IconChevronDown, IconCode, IconMusic, IconPlay, IconPopout, IconSparkle, IconTimer } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { usePhone } from '../lib/phone';
import CalendarPage from './Calendar';
import { Lab, LAB_DEFAULTS, LAB_TITLES } from '../components/labs/Labs';
import { Piano } from '../components/practice/MusicTask';
import { PomodoroTool } from '../components/tools/PomodoroTool';
import { WorkPlanner } from '../components/tools/WorkPlanner';
import Todos from './Todos';
import { buildHarness, localJava, runJavaLocal, runJavaOnline } from '../lib/javaRun';
import { setSettings } from '../lib/store';
import { toolWindows } from '../lib/toolWindows';

type Tab = 'plan' | 'todos' | 'exams' | 'pomodoro' | 'sounds' | 'labs' | 'piano' | 'java';

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'plan', label: 'Arbeitsplanung', icon: IconSparkle },
  { id: 'todos', label: 'To-do-Liste', icon: IconChecklist },
  { id: 'exams', label: 'Prüfungen', icon: IconCalendar },
  { id: 'pomodoro', label: 'Pomodoro-Timer', icon: IconTimer },
  { id: 'sounds', label: 'Klänge', icon: IconHeadphones },
  { id: 'labs', label: 'Mathe-Labore', icon: IconChart },
  { id: 'piano', label: 'Klavier', icon: IconMusic },
  { id: 'java', label: 'Java-Spielwiese', icon: IconCode },
];

/** Phone: the areas as a dropdown (a button with the current area; the list opens as a sheet). */
function ToolPicker({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const cur = TABS.find((t) => t.id === tab)!;
  return (
    <>
      <button type="button" className={`tools-picker mode-${cur.id}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="tools-picker-icon">
          <cur.icon size={18} />
        </span>
        <span className="grow">
          <small>Bereich</small>
          <b>{cur.label}</b>
        </span>
        <IconChevronDown size={18} />
      </button>
      {open && (
        <Sheet title="Merkora Tools" onClose={() => setOpen(false)}>
          <div className="sheet-list" role="listbox" aria-label="Bereich wählen">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="option" aria-selected={t.id === tab} className={`mode-${t.id} ${t.id === tab ? 'on' : ''}`} onClick={() => (setTab(t.id), setOpen(false))}>
                <t.icon size={20} /> {t.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/**
 * Merkora Tools: central home for Arbeitsplanung, To-do-Liste, Pomodoro-Timer
 * and the interactive learning tools (Mathe-Labore, Klavier, Java-Spielwiese).
 */
export default function Tools() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.some((t) => t.id === raw) ? raw : 'plan';
  const setTab = (id: Tab) => setParams({ tab: id }, { replace: true });
  const phone = usePhone();

  return (
    <div className="page tools-page" data-mode={tab}>
      <div className="page-head">
        <div>
          <h1>Merkora Tools</h1>
          <p className="muted">Arbeitsplanung, To-dos, Prüfungen, Fokus-Timer und Werkzeuge zum freien Ausprobieren – alles an einem Ort.</p>
        </div>
      </div>

      {phone ? (
        <ToolPicker tab={tab} setTab={setTab} />
      ) : (
        <div className="seg wrap tools-tabs" role="tablist" aria-label="Tools-Bereiche">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`mode-${t.id} ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'plan' && <WorkPlanner />}

      {tab === 'todos' && <Todos embedded />}

      {tab === 'exams' && <CalendarPage embedded />}

      {tab === 'sounds' && <SoundsTool />}

      {tab === 'pomodoro' && (
        <section className="panel tools-pomo-panel">
          <div className="panel-head">
            <div>
              <h2>Pomodoro-Timer</h2>
              <p className="muted small">Abgeschlossene Lernrunden zählen automatisch zu deiner Lernzeit.</p>
            </div>
            <button type="button" className="btn outline sm" onClick={() => toolWindows.open('pomodoro')}>
              <IconPopout size={14} /> Als Popup öffnen
            </button>
          </div>
          <PomodoroTool />
        </section>
      )}

      {tab === 'labs' && (
        <section className="panel">
          <h2>Mathe-Labore</h2>
          <p className="muted small">Interaktive Simulationen mit Schiebereglern – ohne KI.</p>
          <LabPicker />
        </section>
      )}

      {tab === 'piano' && (
        <section className="panel">
          <h2>Klavier</h2>
          <p className="muted small">Freies Ausprobieren mit eigenem Synthesizer – ohne KI.</p>
          <FreePiano />
        </section>
      )}

      {tab === 'java' && (
        <section className="panel">
          <h2>Java-Spielwiese</h2>
          <p className="muted small">Schreibe kleinen Java-Code und führe ihn lokal oder online aus.</p>
          <JavaPlayground />
        </section>
      )}
    </div>
  );
}

function LabPicker() {
  const [i, setI] = useState(0);
  return (
    <div className="tool">
      <div className="chips">
        {LAB_DEFAULTS.map((l, k) => (
          <button key={l.type} type="button" className={'chip' + (k === i ? ' on' : '')} onClick={() => setI(k)}>
            {LAB_TITLES[l.type]}
          </button>
        ))}
      </div>
      <Lab key={i} spec={LAB_DEFAULTS[i]} />
    </div>
  );
}

function FreePiano() {
  return (
    <div className="tool">
      <Piano />
    </div>
  );
}

const STARTER = `class Solution {
    public static void main(String[] args) {
        System.out.println("Hallo Merkora!");
    }
}`;
function JavaPlayground() {
  const [code, setCode] = useState(STARTER);
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const run = async () => {
    setBusy(true);
    setOut('');
    try {
      const src = buildHarness(code, []);
      let r = (await localJava()) ? await runJavaLocal(src) : 'no-java';
      if (r === 'no-java') {
        if (!online) {
          setOut('Auf diesem Gerät gibt es noch kein Java. Installiere es oben mit einem Klick – oder nutze „Online ausführen“ (dann schickt Merkora nur den Code an wandbox.org).');
          return;
        }
        r = await runJavaOnline(src);
      }
      setOut((r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() || '(keine Ausgabe)');
    } catch (e) {
      setOut((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tool">
      <JavaSetup />
      <CodeEditor value={code} onChange={setCode} />
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
          <IconPlay size={14} /> {busy ? 'Läuft …' : 'Ausführen'}
        </button>
        <label className="check-row">
          <input type="checkbox" checked={online} onChange={(e) => (setOnline(e.target.checked), e.target.checked && setSettings({ onlineCodeOk: true }))} /> Online ausführen (wandbox.org), wenn kein Java da ist
        </label>
      </div>
      {out && (
        <div className="code-output">
          <pre>{out}</pre>
        </div>
      )}
    </div>
  );
}
