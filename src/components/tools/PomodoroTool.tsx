import { useState } from 'react';
import { fmtClock, pomodoro, usePomodoro, usePomodoroMeta } from '../../lib/pomodoro';
import { MIN, remaining } from '../../lib/pomodoroRule';
import { toggleTodo, useStore } from '../../lib/store';
import { IconCheck, IconHeadphones, IconMore, IconPause, IconPlay, IconRefresh, IconSkip, IconSpeaker, IconSpeakerOff } from '../Icons';
import { BreathingTool } from './BreathingTool';

const PRESETS = [
  { label: '15 / 3', work: 15, brk: 3 },
  { label: '25 / 5', work: 25, brk: 5 },
  { label: '50 / 10', work: 50, brk: 10 },
];

const BREAK_TIPS = [
  'Blick für 20 Sekunden aus dem Fenster in die Ferne – entspannt die Augen.',
  'Kurz aufstehen, Schultern kreisen lassen und ein großes Glas Wasser trinken.',
  'Kein Handy-Scrollen – dein Gehirn festigt gerade still das Gelernte.',
  '3 tiefe Atemzüge bis in den Bauch – bringt sofort neue Energie.',
];

/**
 * Redesigned Pomodoro Timer for the Merkora Tools area & floating popup window.
 */
export function PomodoroTool({ compact = false, skip = true }: { compact?: boolean; skip?: boolean }) {
  const p = usePomodoro();
  const meta = usePomodoroMeta();
  const todos = useStore((s) => s.data.todos ?? []);
  const openTodos = todos.filter((t) => !t.doneAt);
  const activeTodo = meta.activeTodoId ? todos.find((t) => t.id === meta.activeTodoId) : undefined;

  const [editDur, setEditDur] = useState(false);
  // compact (pop-up window): only ring and buttons; tasks and durations folded away
  const [more, setMore] = useState(false);
  const [showBreath, setShowBreath] = useState(false);
  const showExtras = !compact || more;
  const [workIn, setWorkIn] = useState(String(meta.workMin));
  const [brkIn, setBrkIn] = useState(String(meta.breakMin));
  const [longIn, setLongIn] = useState(String(meta.longBreakMin));
  const [goalIn, setGoalIn] = useState(String(meta.goal));

  const left = remaining(p, Date.now());
  const breakDur = p.longBreak ? meta.longBreakMin : meta.breakMin;
  const totalMs = (p.phase === 'work' ? meta.workMin : breakDur) * MIN;
  const pct = totalMs > 0 ? Math.max(0, Math.min(1, 1 - left / totalMs)) : 0;

  const size = compact ? 112 : 196;
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;

  const applyCustom = () => {
    const w = Number(workIn);
    const b = Number(brkIn);
    const lb = Number(longIn);
    const g = Number(goalIn);
    if (w >= 1 && b >= 1) pomodoro.setDurations(w, b, lb >= b ? lb : undefined);
    if (g >= 1) pomodoro.setGoal(g);
    setEditDur(false);
  };

  const goalPct = Math.min(100, Math.round((p.rounds / Math.max(1, meta.goal)) * 100));
  const breakTip = BREAK_TIPS[p.rounds % BREAK_TIPS.length];

  return (
    <div className={`pomo-tool ${p.phase} ${p.running ? 'running' : ''} ${compact ? 'compact' : ''}`}>
      {!compact && (
      <div className="pomo-phase-tabs" role="tablist" aria-label="Pomodoro-Phase">
        <button
          type="button"
          role="tab"
          aria-selected={p.phase === 'work'}
          className={p.phase === 'work' ? 'on' : ''}
          onClick={() => pomodoro.setPhase('work')}
        >
          Lernzeit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={p.phase === 'break'}
          className={p.phase === 'break' ? 'on' : ''}
          onClick={() => pomodoro.setPhase('break')}
        >
          {p.longBreak ? 'Lange Pause' : 'Pause'}
        </button>
      </div>
      )}

      {!compact && (
        <div className="pomo-goal" title={`Tagesziel: ${meta.goal} Fokus-Runden (jede 4. Runde löst eine lange Pause aus)`}>
          <div className="pomo-goal-head">
            <small className="muted">Tagesziel heute</small>
            <small>
              <b>{p.rounds} / {meta.goal}</b> Runden {p.rounds >= meta.goal ? '· Erreicht!' : ''}
            </small>
          </div>
          <div className="pomo-goal-bar" aria-hidden="true">
            <i style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      )}

      <div className="pomo-ring-wrap">
        <svg className="pomo-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle className="pomo-ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={compact ? 6 : 8} fill="none" />
          <circle
            className="pomo-ring-fg"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={compact ? 6 : 8}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="pomo-ring-center">
          <b className="pomo-big-clock">{fmtClock(left)}</b>
          <small className="muted">
            {p.phase === 'work' ? 'Fokus' : p.longBreak ? 'Lange Pause' : 'Kurze Pause'}
            {p.rounds > 0 ? ` · ${p.rounds}×` : ''}
          </small>
        </div>
      </div>

      <div className="pomo-controls">
        {p.running ? (
          <button type="button" className="btn primary" onClick={pomodoro.pause} aria-label="Pausieren" title="Pausieren">
            <IconPause size={15} />{compact ? '' : ' Pausieren'}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={pomodoro.start} aria-label="Starten" title="Starten">
            <IconPlay size={14} />{compact ? '' : ' Starten'}
          </button>
        )}
        {compact && skip && (
          <button type="button" className="btn ghost" aria-label={p.phase === 'work' ? 'Zur Pause wechseln' : 'Zur Lernzeit wechseln'} title={p.phase === 'work' ? 'Pause' : 'Lernzeit'} onClick={() => pomodoro.setPhase(p.phase === 'work' ? 'break' : 'work')}>
            <IconSkip size={15} />
          </button>
        )}
        <button type="button" className="btn ghost" aria-label="Zurücksetzen" title="Zurücksetzen" onClick={pomodoro.reset}>
          <IconRefresh size={15} />
        </button>
        <button
          type="button"
          className={`btn ghost pomo-sound ${meta.soundOn ? 'on' : 'off'}`}
          aria-pressed={meta.soundOn}
          aria-label={meta.soundOn ? 'Ton am Ende ist an – ausschalten' : 'Ton am Ende ist aus – einschalten'}
          title={meta.soundOn ? 'Ton am Ende: an (klicken zum Ausschalten)' : 'Ton am Ende: aus (klicken zum Einschalten)'}
          onClick={() => pomodoro.setSound(!meta.soundOn)}
        >
          {meta.soundOn ? <IconSpeaker size={15} /> : <IconSpeakerOff size={15} />}
          {!compact && (meta.soundOn ? ' Ton an' : ' Ton aus')}
        </button>
        {compact && (
          <button type="button" className={more ? 'btn ghost on' : 'btn ghost'} aria-expanded={more} aria-label="Mehr" title="Aufgabe und Dauer" onClick={() => setMore((v) => !v)}>
            <IconMore size={15} />
          </button>
        )}
      </div>

      {!compact && p.phase === 'break' && (
        <div className="pomo-break-tip">
          <div className="pomo-break-tip-head">
            <small><b>Pausen-Impuls:</b> {breakTip}</small>
            <button type="button" className={'chip' + (showBreath ? ' on' : '')} onClick={() => setShowBreath((v) => !v)}>
              {showBreath ? 'Atemübung ausblenden' : '60-Sek.-Atemübung'}
            </button>
          </div>
          {showBreath && <BreathingTool compact />}
        </div>
      )}

      {showExtras && (activeTodo && !activeTodo.doneAt ? (
        <div className="pomo-active-task">
          <button
            type="button"
            className="todo-check"
            aria-label="Aufgabe erledigt"
            title="Als erledigt abhaken"
            onClick={() => {
              toggleTodo(activeTodo.id);
              pomodoro.setActiveTodo(null);
            }}
          >
            <IconCheck size={12} />
          </button>
          <div className="pomo-active-task-info">
            <small className="muted">Aktive Aufgabe</small>
            <b>{activeTodo.text}</b>
          </div>
          <button type="button" className="icon-btn sm" aria-label="Aufgabe lösen" onClick={() => pomodoro.setActiveTodo(null)}>
            ×
          </button>
        </div>
      ) : (
        openTodos.length > 0 && (
          <div className="pomo-task-pick">
            <select
              className="input"
              aria-label="Aufgabe für diese Runde wählen"
              value=""
              onChange={(e) => {
                const t = openTodos.find((x) => x.id === e.target.value);
                if (t) pomodoro.startForTodo(t.id, t.minutes);
              }}
            >
              <option value="">Aufgabe verknüpfen …</option>
              {openTodos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.text}
                  {t.minutes ? ` (${t.minutes} Min.)` : ''}
                </option>
              ))}
            </select>
          </div>
        )
      ))}

      {showExtras && (
      <div className="pomo-presets">
        {PRESETS.map((pr) => (
          <button
            key={pr.label}
            type="button"
            className={`chip ${meta.workMin === pr.work && meta.breakMin === pr.brk ? 'active' : ''}`}
            onClick={() => pomodoro.setDurations(pr.work, pr.brk)}
          >
            {pr.label}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${editDur ? 'active' : ''}`}
          onClick={() => {
            setWorkIn(String(meta.workMin));
            setBrkIn(String(meta.breakMin));
            setLongIn(String(meta.longBreakMin));
            setGoalIn(String(meta.goal));
            setEditDur((v) => !v);
          }}
        >
          Eigene
        </button>
      </div>
      )}

      {showExtras && (
        <div className="pomo-toggles">
          <button
            type="button"
            className={`chip ${meta.autoSound ? 'on' : ''}`}
            aria-pressed={meta.autoSound}
            title="Startet Hintergrundklänge automatisch in der Fokus-Phase und pausiert sie in der Pause"
            onClick={() => pomodoro.setAutoSound(!meta.autoSound)}
          >
            <IconHeadphones size={12} /> Klänge koppeln {meta.autoSound ? 'an' : 'aus'}
          </button>
          <button
            type="button"
            className={`chip ${meta.autoStart ? 'on' : ''}`}
            aria-pressed={meta.autoStart}
            title="Startet nach Ende der Pause automatisch die nächste Lernrunde"
            onClick={() => pomodoro.setAutoStart(!meta.autoStart)}
          >
            Auto-Start {meta.autoStart ? 'an' : 'aus'}
          </button>
        </div>
      )}

      {showExtras && editDur && (
        <div className="pomo-custom">
          <label>
            <span>Lernen</span>
            <input type="number" min={1} max={180} className="input" value={workIn} onChange={(e) => setWorkIn(e.target.value)} />
          </label>
          <label>
            <span>Pause</span>
            <input type="number" min={1} max={60} className="input" value={brkIn} onChange={(e) => setBrkIn(e.target.value)} />
          </label>
          <label>
            <span>Lange Pause (4×)</span>
            <input type="number" min={1} max={60} className="input" value={longIn} onChange={(e) => setLongIn(e.target.value)} />
          </label>
          <label>
            <span>Tagesziel</span>
            <input type="number" min={1} max={16} className="input" value={goalIn} onChange={(e) => setGoalIn(e.target.value)} />
          </label>
          <button type="button" className="btn primary sm" onClick={applyCustom}>
            Übernehmen
          </button>
        </div>
      )}
    </div>
  );
}
