import { useSyncExternalStore } from 'react';
import { setFullscreen } from '../lib/desktop';
import { fmtClock, pomodoro, usePomodoro } from '../lib/pomodoro';
import { remaining } from '../lib/pomodoroRule';
import { IconClose, IconPause, IconPlay, IconRefresh } from './Icons';

/** Pomodoro timer: 25 min learning, 5 min break (adjustable in the settings). */
export function Pomodoro({ big }: { big?: boolean }) {
  const p = usePomodoro();
  const left = remaining(p, Date.now());
  const label = p.phase === 'work' ? 'Lernzeit' : 'Pause';
  return (
    <div className={`pomodoro ${big ? 'big' : ''} ${p.phase} ${p.running ? 'running' : ''}`} aria-label={`Pomodoro: ${label} ${fmtClock(left)}`}>
      <span className="pomo-label">
        {label}
        {p.rounds > 0 && <small> · {p.rounds}× geschafft</small>}
      </span>
      <b className="pomo-clock">{fmtClock(left)}</b>
      <span className="pomo-btns">
        {p.running ? (
          <button type="button" className="icon-btn" aria-label="Pausieren" onClick={pomodoro.pause}>
            <IconPause size={16} />
          </button>
        ) : (
          <button type="button" className="icon-btn" aria-label="Starten" onClick={pomodoro.start}>
            <IconPlay size={14} />
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Zurücksetzen" onClick={pomodoro.reset}>
          <IconRefresh size={15} />
        </button>
      </span>
    </div>
  );
}

// ---------- focus mode ----------
let focus = false;
const focusListeners = new Set<() => void>();
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) setFocus(false);
};
export function setFocus(on: boolean) {
  if (focus === on) return;
  focus = on;
  document.documentElement.classList.toggle('focus-mode', on);
  void setFullscreen(on);
  if (on) window.addEventListener('keydown', onKey);
  else window.removeEventListener('keydown', onKey);
  focusListeners.forEach((l) => l());
}
export const useFocus = () =>
  useSyncExternalStore(
    (l) => {
      focusListeners.add(l);
      return () => {
        focusListeners.delete(l);
      };
    },
    () => focus,
  );

/** Bar shown in focus mode: timer and exit. */
export function FocusBar() {
  const on = useFocus();
  if (!on) return null;
  return (
    <div className="focus-bar">
      <Pomodoro big />
      <button type="button" className="btn ghost sm" onClick={() => setFocus(false)}>
        <IconClose size={14} /> Fokus beenden <kbd>Esc</kbd>
      </button>
    </div>
  );
}

export function FocusButton() {
  const on = useFocus();
  return (
    <button type="button" className="btn ghost sm" onClick={() => setFocus(!on)} title="Vollbild ohne Ablenkung, mit Pomodoro-Timer">
      {on ? 'Fokus beenden' : 'Fokusmodus'}
    </button>
  );
}
