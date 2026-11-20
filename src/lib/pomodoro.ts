/** Pomodoro timer state shared by the tools popup, /tools page and focus mode; finished work time counts as study time. */
import { useSyncExternalStore } from 'react';
import { notify } from './desktop';
import { initialPomo, MIN, pause, start, tick, workedSoFar, type Phase, type Pomo } from './pomodoroRule';
import { addStudyMinutes, getState, setSettings } from './store';

const settings = () => {
  const s = getState().data.settings;
  return { work: s.pomodoroWork || 25, brk: s.pomodoroBreak || 5 };
};

let pomo: Pomo = initialPomo(25);
let initialised = false;
let activeTodoId: string | null = null;
let customWorkMin: number | null = null;
let soundOn = true;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Pomo) => {
  pomo = p;
  emit();
};
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function currentWorkMin() {
  return customWorkMin ?? settings().work;
}

function playChime() {
  if (!soundOn || typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.001, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.14, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.38);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* ignore audio errors */
  }
}

function loop() {
  now = Date.now();
  const work = currentWorkMin();
  const { brk } = settings();
  const r = tick(pomo, now, work, brk);
  if (r.studied) addStudyMinutes(r.studied);
  if (r.ended === 'work') {
    playChime();
    void notify('Pause! ☕', `${work} Minuten geschafft – gönn dir ${brk} Minuten Pause.`);
  }
  if (r.ended === 'break') {
    playChime();
    void notify('Weiter geht’s 🌱', 'Die Pause ist vorbei. Starte die nächste Lernrunde, wenn du bereit bist.');
  }
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

function ensureInterval() {
  if (!timer) timer = setInterval(loop, 1000);
}

export const pomodoro = {
  start() {
    ensureInit();
    set(start(pomo, Date.now()));
    ensureInterval();
  },
  pause() {
    set(pause(pomo, Date.now()));
  },
  reset() {
    const t = Date.now();
    const work = currentWorkMin();
    const done = workedSoFar(pomo, t, work);
    if (pomo.running && done >= 1) addStudyMinutes(Math.round(done));
    const dur = pomo.phase === 'work' ? work : settings().brk;
    set({ phase: pomo.phase, running: false, endsAt: 0, left: dur * MIN, rounds: pomo.rounds });
  },
  setPhase(phase: Phase) {
    ensureInit();
    const t = Date.now();
    if (pomo.running && pomo.phase === 'work') {
      const done = workedSoFar(pomo, t, currentWorkMin());
      if (done >= 1) addStudyMinutes(Math.round(done));
    }
    const dur = phase === 'work' ? currentWorkMin() : settings().brk;
    set({ phase, running: false, endsAt: 0, left: dur * MIN, rounds: pomo.rounds });
  },
  setDurations(workMin: number, breakMin: number) {
    const w = Math.max(1, Math.min(180, Math.round(workMin)));
    const b = Math.max(1, Math.min(60, Math.round(breakMin)));
    customWorkMin = null;
    setSettings({ pomodoroWork: w, pomodoroBreak: b });
    if (!pomo.running) {
      const dur = pomo.phase === 'work' ? w : b;
      set({ ...pomo, left: dur * MIN });
    } else {
      emit();
    }
  },
  setActiveTodo(todoId: string | null) {
    activeTodoId = todoId;
    if (!todoId) customWorkMin = null;
    emit();
  },
  startForTodo(todoId: string, minutes?: number) {
    ensureInit();
    activeTodoId = todoId;
    const dur = minutes && minutes >= 1 ? Math.min(180, Math.round(minutes)) : settings().work;
    customWorkMin = minutes && minutes >= 1 ? dur : null;
    const t = Date.now();
    set({ phase: 'work', running: true, endsAt: t + dur * MIN, left: dur * MIN, rounds: pomo.rounds });
    ensureInterval();
  },
  setSound(on: boolean) {
    soundOn = on;
    emit();
  },
  getMeta: () => ({ activeTodoId, soundOn, workMin: currentWorkMin(), breakMin: settings().brk }),
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

let metaSnap: { activeTodoId: string | null; soundOn: boolean; workMin: number; breakMin: number } = {
  activeTodoId,
  soundOn,
  workMin: 25,
  breakMin: 5,
};
export function usePomodoroMeta() {
  ensureInit();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => {
      const next = pomodoro.getMeta();
      if (
        metaSnap.activeTodoId !== next.activeTodoId ||
        metaSnap.soundOn !== next.soundOn ||
        metaSnap.workMin !== next.workMin ||
        metaSnap.breakMin !== next.breakMin
      ) {
        metaSnap = next;
      }
      return metaSnap;
    },
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
