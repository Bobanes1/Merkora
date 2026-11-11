/** Pomodoro timer state shared by the sidebar widget and focus mode; finished work time counts as study time. */
import { useSyncExternalStore } from 'react';
import { notify } from './desktop';
import { initialPomo, pause, start, tick, workedSoFar, type Pomo } from './pomodoroRule';
import { addStudyMinutes, getState } from './store';

const settings = () => {
  const s = getState().data.settings;
  return { work: s.pomodoroWork || 25, brk: s.pomodoroBreak || 5 };
};

let pomo: Pomo = initialPomo(25);
let initialised = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Pomo) => {
  pomo = p;
  emit();
};
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function loop() {
  now = Date.now();
  const { work, brk } = settings();
  const r = tick(pomo, now, work, brk);
  if (r.studied) addStudyMinutes(r.studied);
  if (r.ended === 'work') void notify('Pause! ☕', `${work} Minuten geschafft – gönn dir ${brk} Minuten Pause.`);
  if (r.ended === 'break') void notify('Weiter geht’s 🌱', 'Die Pause ist vorbei. Starte die nächste Lernrunde, wenn du bereit bist.');
  // a new object each second so the displays redraw the clock
  set(r.pomo !== pomo ? r.pomo : { ...pomo });
  if (!pomo.running && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function ensureInit() {
  if (initialised) return;
  initialised = true;
  pomo = initialPomo(settings().work);
}

export const pomodoro = {
  start() {
    ensureInit();
    set(start(pomo, Date.now()));
    if (!timer) timer = setInterval(loop, 1000);
  },
  pause() {
    set(pause(pomo, Date.now()));
  },
  reset() {
    const t = Date.now();
    const done = workedSoFar(pomo, t, settings().work);
    if (pomo.running && done >= 1) addStudyMinutes(Math.round(done));
    set({ ...initialPomo(settings().work), rounds: pomo.rounds });
  },
  /** Running in a work phase – then the learning views don't count time themselves. */
  isStudying: () => pomo.running && pomo.phase === 'work',
};

export function usePomodoro() {
  ensureInit();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => pomo,
  );
}

export const clockNow = () => now;
export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Study time while learning without Pomodoro: time between answers (max. 2 min per card). */
let lastAnswer = 0;
export function countAnswerTime() {
  const t = Date.now();
  if (lastAnswer && !pomodoro.isStudying()) addStudyMinutes(Math.min(2 * 60_000, t - lastAnswer) / 60_000);
  lastAnswer = t;
}
