import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconCalendar,
  IconChart,
  IconChecklist,
  IconChevronDown,
  IconCode,
  IconGrid,
  IconHeadphones,
  IconHeart,
  IconImage,
  IconMusic,
  IconNote,
  IconPopout,
  IconSparkle,
  IconTarget,
  IconTimer,
} from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { Lab, LAB_DEFAULTS, LAB_TITLES } from '../components/labs/Labs';
import { BreathingTool } from '../components/tools/BreathingTool';
import { CalculatorTool } from '../components/tools/CalculatorTool';
import { CodePlaygroundTool } from '../components/tools/CodePlaygroundTool';
import { PeriodicTableTool } from '../components/tools/PeriodicTableTool';
import { PianoTool } from '../components/tools/PianoTool';
import { PomodoroTool } from '../components/tools/PomodoroTool';
import { ScratchpadTool } from '../components/tools/ScratchpadTool';
import { SoundsTool } from '../components/tools/SoundsTool';
import { VisualLibraryTool } from '../components/tools/VisualLibraryTool';
import { WorkPlanner } from '../components/tools/WorkPlanner';
import { useAmbient } from '../lib/ambient';
import { VISUAL_PRESETS } from '../lib/visualPresets';
import { usePhone } from '../lib/phone';
import { fmtClock, usePomodoro } from '../lib/pomodoro';
import { remaining } from '../lib/pomodoroRule';
import { useStore } from '../lib/store';
import { toolWindows, type ToolWindowId } from '../lib/toolWindows';
import { DAY, dayKey } from '../lib/util';
import CalendarPage from './Calendar';
import Todos from './Todos';

type Tab =
  | 'todos'
  | 'plan'
  | 'exams'
  | 'pomodoro'
  | 'sounds'
  | 'notes'
  | 'breath'
  | 'visuals'
  | 'code'
  | 'calc'
  | 'labs'
  | 'periodic'
  | 'piano';

type TabGroup = 'focus' | 'subject';

type TabDef = {
  id: Tab;
  group: TabGroup;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
};

const TABS: TabDef[] = [
  { id: 'todos', group: 'focus', label: 'To-do-Liste', icon: IconChecklist },
  { id: 'plan', group: 'focus', label: 'Arbeitsplanung', icon: IconSparkle },
  { id: 'exams', group: 'focus', label: 'Prüfungen', icon: IconCalendar },
  { id: 'pomodoro', group: 'focus', label: 'Pomodoro-Timer', icon: IconTimer },
  { id: 'sounds', group: 'focus', label: 'Klänge', icon: IconHeadphones },
  { id: 'notes', group: 'focus', label: 'Notizblock', icon: IconNote },
  { id: 'breath', group: 'focus', label: 'Atem-Reset', icon: IconHeart },
  { id: 'visuals', group: 'subject', label: 'Grafiken', icon: IconImage },
  { id: 'code', group: 'subject', label: 'Code-Spielwiese', icon: IconCode },
  { id: 'calc', group: 'subject', label: 'Rechner', icon: IconTarget },
  { id: 'labs', group: 'subject', label: 'Mathe-Labore', icon: IconChart },
  { id: 'periodic', group: 'subject', label: 'Periodensystem', icon: IconGrid },
  { id: 'piano', group: 'subject', label: 'Klavier', icon: IconMusic },
];

const GROUPS: { id: TabGroup; label: string }[] = [
  { id: 'focus', label: 'Planen & Fokus' },
  { id: 'subject', label: 'Fach-Werkzeuge' },
];

const QUICK_POPUPS: { id: ToolWindowId; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'pomodoro', label: 'Pomodoro', icon: IconTimer },
  { id: 'todos', label: 'To-dos', icon: IconChecklist },
  { id: 'sounds', label: 'Klänge', icon: IconHeadphones },
  { id: 'notes', label: 'Notizen', icon: IconNote },
  { id: 'calc', label: 'Rechner', icon: IconTarget },
];

/** Phone: grouped area picker sheet with live badges. */
function ToolPicker({ tab, setTab, badges }: { tab: Tab; setTab: (t: Tab) => void; badges: Partial<Record<Tab, string>> }) {
  const [open, setOpen] = useState(false);
  const cur = TABS.find((t) => t.id === tab)!;
  return (
    <>
      <button type="button" className={`tools-picker mode-${cur.id}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="tools-picker-icon">
          <cur.icon size={18} />
        </span>
        <span className="grow">
          <small>{GROUPS.find((g) => g.id === cur.group)?.label}</small>
          <b>{cur.label}</b>
        </span>
        {badges[cur.id] && <span className="tab-badge">{badges[cur.id]}</span>}
        <IconChevronDown size={18} />
      </button>
      {open && (
        <Sheet title="Merkora Tools" onClose={() => setOpen(false)}>
          <div className="sheet-list" role="listbox" aria-label="Bereich wählen">
            {GROUPS.map((g) => (
              <div key={g.id} className="sheet-group">
                <small className="muted sheet-group-label">{g.label}</small>
                {TABS.filter((t) => t.group === g.id).map((t) => (
                  <button key={t.id} type="button" role="option" aria-selected={t.id === tab} className={`mode-${t.id} ${t.id === tab ? 'on' : ''}`} onClick={() => (setTab(t.id), setOpen(false))}>
                    <t.icon size={19} /> <span className="grow">{t.label}</span>
                    {badges[t.id] && <span className="tab-badge">{badges[t.id]}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/**
 * Merkora Tools: central hub for planning, focus & subject tools – all working offline.
 */
export default function Tools() {
  const [params, setParams] = useSearchParams();
  const rawParam = params.get('tab');
  // keep legacy ?tab=java working smoothly
  const mapped = rawParam === 'java' ? 'code' : rawParam;
  const tab: Tab = mapped && TABS.some((t) => t.id === mapped) ? (mapped as Tab) : 'todos';
  const setTab = (id: Tab) => setParams({ tab: id }, { replace: true });
  const phone = usePhone();

  const data = useStore((s) => s.data);
  const pomo = usePomodoro();
  const amb = useAmbient();

  const now = Date.now();
  const today = dayKey(now);
  const openToday = (data.todos ?? []).filter((t) => !t.doneAt && t.due && t.due <= today).length;
  const openAll = (data.todos ?? []).filter((t) => !t.doneAt).length;
  const nextExamDays = (() => {
    const upcoming = (data.exams ?? [])
      .map((e) => Math.ceil((new Date(e.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / DAY))
      .filter((d) => d >= 0)
      .sort((a, b) => a - b);
    return upcoming.length ? upcoming[0] : null;
  })();
  const soundCount = Object.keys(amb.playing).length;

  const badges: Partial<Record<Tab, string>> = {
    ...(openToday > 0 ? { todos: String(openToday) } : openAll > 0 ? { todos: String(openAll) } : {}),
    ...(pomo.running ? { pomodoro: fmtClock(remaining(pomo, now)) } : {}),
    ...(soundCount > 0 ? { sounds: amb.paused ? '⏸' : '●' } : {}),
    ...(nextExamDays !== null ? { exams: nextExamDays === 0 ? 'Heute' : `${nextExamDays} T` } : {}),
    visuals: String(VISUAL_PRESETS.length),
  };

  return (
    <div className="page tools-page" data-mode={tab}>
      <div className="page-head">
        <div>
          <h1>Merkora Tools</h1>
          <p className="muted">Planen, fokussieren, rechnen, programmieren, forschen &amp; verstehen – alles direkt offline in Merkora.</p>
        </div>
        {!phone && (
          <div className="tools-popups-bar" aria-label="Als schwebendes Popup öffnen">
            <small className="muted">Popups:</small>
            {QUICK_POPUPS.map((w) => (
              <button key={w.id} type="button" className="btn ghost sm" title={`${w.label} als Popup öffnen`} onClick={() => toolWindows.toggle(w.id)}>
                <w.icon size={13} /> {w.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {phone ? (
        <ToolPicker tab={tab} setTab={setTab} badges={badges} />
      ) : (
        <div className="tools-groups" role="tablist" aria-label="Tools-Bereiche">
          {GROUPS.map((g) => (
            <div key={g.id} className="tools-group">
              <small className="tools-group-label">{g.label}</small>
              <div className="seg wrap tools-tabs">
                {TABS.filter((t) => t.group === g.id).map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`mode-${t.id} ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                    <t.icon size={14} />
                    <span>{t.label}</span>
                    {badges[t.id] && <span className={`tab-badge ${t.id === 'sounds' && !amb.paused ? 'live' : ''}`}>{badges[t.id]}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'todos' && <Todos embedded />}

      {tab === 'plan' && <WorkPlanner />}

      {tab === 'exams' && <CalendarPage embedded />}

      {tab === 'pomodoro' && (
        <section className="panel tools-pomo-panel">
          <div className="panel-head">
            <div>
              <h2>Pomodoro-Timer</h2>
              <p className="muted small">Abgeschlossene Lernrunden zählen automatisch zu deiner Lernzeit – jede 4. Runde startet eine lange Pause.</p>
            </div>
            <button type="button" className="btn outline sm" onClick={() => toolWindows.open('pomodoro')}>
              <IconPopout size={14} /> Als Popup öffnen
            </button>
          </div>
          <PomodoroTool />
        </section>
      )}

      {tab === 'sounds' && <SoundsTool />}

      {tab === 'notes' && (
        <section className="panel">
          <ScratchpadTool />
        </section>
      )}

      {tab === 'breath' && (
        <section className="panel">
          <BreathingTool />
        </section>
      )}

      {tab === 'visuals' && <VisualLibraryTool />}

      {tab === 'code' && <CodePlaygroundTool />}

      {tab === 'calc' && (
        <section className="panel">
          <CalculatorTool />
        </section>
      )}

      {tab === 'labs' && (
        <section className="panel">
          <h2>Mathe-Labore</h2>
          <p className="muted small">Interaktive Simulationen mit Schiebereglern &amp; Vergleichsfunktion – ohne KI.</p>
          <LabPicker />
        </section>
      )}

      {tab === 'periodic' && <PeriodicTableTool />}

      {tab === 'piano' && <PianoTool />}
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
