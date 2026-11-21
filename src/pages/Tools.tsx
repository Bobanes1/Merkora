import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CodeEditor } from '../components/CodeEditor';
import { IconChecklist, IconPlay, IconPopout, IconSparkle, IconTimer } from '../components/Icons';
import { Lab, LAB_DEFAULTS, LAB_TITLES } from '../components/labs/Labs';
import { Piano } from '../components/practice/MusicTask';
import { PomodoroTool } from '../components/tools/PomodoroTool';
import { WorkPlanner } from '../components/tools/WorkPlanner';
import { buildHarness, localJava, runJavaLocal, runJavaOnline } from '../lib/javaRun';
import { setSettings } from '../lib/store';
import { toolWindows } from '../lib/toolWindows';

type Tab = 'plan' | 'todos' | 'pomodoro' | 'labs' | 'piano' | 'java';

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Arbeitsplanung' },
  { id: 'pomodoro', label: 'Pomodoro-Timer' },
  { id: 'labs', label: 'Mathe-Labore' },
  { id: 'piano', label: 'Klavier' },
  { id: 'java', label: 'Java-Spielwiese' },
];

/**
 * Merkora Tools: central home for Arbeitsplanung, To-do-Liste, Pomodoro-Timer
 * and the interactive learning tools (Mathe-Labore, Klavier, Java-Spielwiese).
 */
export default function Tools() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  // the to-do list has its own page now
  if ((raw as string) === 'todos') return <Navigate to="/todos" replace />;
  const tab: Tab = raw && TABS.some((t) => t.id === raw) ? raw : 'plan';
  const setTab = (id: Tab) => setParams({ tab: id }, { replace: true });

  return (
    <div className="page tools-page">
      <div className="page-head">
        <div>
          <h1>Merkora Tools</h1>
          <p className="muted">Arbeitsplanung, Fokus-Timer, To-dos und Werkzeuge zum freien Ausprobieren – alles an einem Ort.</p>
        </div>
        <div className="row-gap">
          <button type="button" className="btn outline sm" onClick={() => toolWindows.open('pomodoro')}>
            <IconTimer size={15} /> Pomodoro-Popup
          </button>
          <Link to="/todos" className="btn outline sm">
            <IconChecklist size={15} /> To-do-Liste
          </Link>
        </div>
      </div>

      <div className="seg wrap tools-tabs" role="tablist" aria-label="Tools-Bereiche">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'plan' && <WorkPlanner />}

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

const PCN = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];
function FreePiano() {
  const [notes, setNotes] = useState<number[]>([]);
  return (
    <div className="tool">
      <Piano onPlay={(m) => setNotes((n) => [...n.slice(-11), m])} />
      <p className="muted small">Gespielt: {notes.length ? notes.map((m) => PCN[m % 12] + Math.floor(m / 12 - 1)).join(' · ') : '–'}</p>
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
          setOut('Auf diesem Gerät gibt es kein Java. Mit „Online ausführen“ schickt Merkora nur den Code an wandbox.org.');
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
