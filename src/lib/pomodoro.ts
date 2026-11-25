/** Pomodoro timer state shared by the tools popup, /tools page and focus mode; finished work time counts as study time. */
import { useSyncExternalStore } from 'react';
import { ambientState, pauseAll, playMix, PRESETS as AMBIENT_PRESETS, resumeAll } from './ambient';
import { notify } from './desktop';
import { initialPomo, MIN, pause, start, tick, workedSoFar, type Phase, type Pomo } from './pomodoroRule';
import { addStudyMinutes, getState, setSettings } from './store';
import { dayKey } from './util';

const TODAY_KEY = 'merkora.pomo.today';
function loadTodayRounds(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(TODAY_KEY) ?? 'null') as { day?: string; rounds?: number } | null;
    return raw && raw.day === dayKey(Date.now()) && Number.isFinite(raw.rounds) ? Math.max(0, Math.round(raw.rounds!)) : 0;
  } catch {
    return 0;
  }
}
function saveTodayRounds(rounds: number) {
  try {
    localStorage.setItem(TODAY_KEY, JSON.stringify({ day: dayKey(Date.now()), rounds }));
  } catch {
    /* ignore */
  }
}

const settings = () => {
  const s = getState().data.settings;
  return {
    work: s.pomodoroWork || 25,
    brk: s.pomodoroBreak || 5,
    longBrk: s.pomodoroLongBreak ?? 15,
    goal: s.pomodoroGoal ?? 4,
    autoStart: !!s.pomodoroAutoStart,
    autoSound: !!s.pomodoroAutoSound,
  };
};

let pomo: Pomo = initialPomo(25);
let initialised = false;
let activeTodoId: string | null = null;
let customWorkMin: number | null = null;
// the end chime: on unless switched off in the settings
const soundIsOn = () => getState().data.settings.pomodoroSound !== false;

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

function syncAmbient(phase: Phase, running: boolean) {
  if (!settings().autoSound) return;
  const amb = ambientState();
  const hasAny = Object.keys(amb.playing).length > 0;
  if (running && phase === 'work') {
    if (hasAny && amb.paused) resumeAll();
    else if (!hasAny && AMBIENT_PRESETS.length) playMix(AMBIENT_PRESETS[0].mix);
  } else if (hasAny && !amb.paused) {
    pauseAll();
  }
}

/**
 * One audio context, made (and resumed) on a click – start, sound on. An audio context made only when the
 * round ends, without a click, stays muted in browsers and the app window; that is why the chime was silent.
 */
let audio: AudioContext | null = null;
function unlockAudio() {
  if (typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no audio */
  }
}

function playChime(force = false) {
  if ((!force && !soundIsOn()) || typeof window === 'undefined') return;
  try {
    unlockAudio();
    const ctx = audio;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.02;
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
  } catch {
    /* ignore audio errors */
  }
}

function loop() {
  now = Date.now();
  const work = currentWorkMin();
  const { brk, longBrk, autoStart } = settings();
  const r = tick(pomo, now, work, brk, longBrk, autoStart);
  if (r.studied) addStudyMinutes(r.studied);
  if (r.ended === 'work') {
    saveTodayRounds(r.pomo.rounds);
    playChime();
    syncAmbient('break', true);
    const dur = r.pomo.longBreak ? longBrk : brk;
    void notify(r.pomo.longBreak ? 'Lange Pause! 🌟' : 'Pause! ☕', `${work} Minuten geschafft – gönn dir ${dur} Minuten Pause.`);
  }
  if (r.ended === 'break') {
    playChime();
    if (autoStart) syncAmbient('work', true);
    void notify('Weiter geht’s 🌱', autoStart ? 'Die nächste Fokus-Runde läuft bereits.' : 'Die Pause ist vorbei. Starte die nächste Lernrunde, wenn du bereit bist.');
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
  pomo = { ...initialPomo(settings().work), rounds: loadTodayRounds() };
}

function ensureInterval() {
  if (!timer) timer = setInterval(loop, 1000);
}

export const pomodoro = {
  start() {
    ensureInit();
    unlockAudio();
    const next = start(pomo, Date.now());
    set(next);
    syncAmbient(next.phase, true);
    ensureInterval();
  },
  pause() {
    const next = pause(pomo, Date.now());
    set(next);
    syncAmbient(next.phase, false);
  },
  reset() {
    const t = Date.now();
    const work = currentWorkMin();
    const done = workedSoFar(pomo, t, work);
    if (pomo.running && done >= 1) addStudyMinutes(Math.round(done));
    const dur = pomo.phase === 'work' ? work : pomo.longBreak ? settings().longBrk : settings().brk;
    set({ phase: pomo.phase, running: false, endsAt: 0, left: dur * MIN, rounds: pomo.rounds });
    syncAmbient(pomo.phase, false);
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
    syncAmbient(phase, false);
  },
  setDurations(workMin: number, breakMin: number, longBreakMin?: number) {
    const w = Math.max(1, Math.min(180, Math.round(workMin)));
    const b = Math.max(1, Math.min(60, Math.round(breakMin)));
    const lb = longBreakMin !== undefined ? Math.max(b, Math.min(60, Math.round(longBreakMin))) : settings().longBrk;
    customWorkMin = null;
    setSettings({ pomodoroWork: w, pomodoroBreak: b, pomodoroLongBreak: lb });
    if (!pomo.running) {
      const dur = pomo.phase === 'work' ? w : pomo.longBreak ? lb : b;
      set({ ...pomo, left: dur * MIN });
    } else {
      emit();
    }
  },
  setGoal(goal: number) {
    setSettings({ pomodoroGoal: Math.max(1, Math.min(16, Math.round(goal))) });
    emit();
  },
  setAutoStart(on: boolean) {
    setSettings({ pomodoroAutoStart: on });
    emit();
  },
  setAutoSound(on: boolean) {
    setSettings({ pomodoroAutoSound: on });
    if (on && pomo.running && pomo.phase === 'work') syncAmbient('work', true);
    emit();
  },
  setActiveTodo(todoId: string | null) {
    activeTodoId = todoId;
    if (!todoId) customWorkMin = null;
    emit();
  },
  startForTodo(todoId: string | null, minutes?: number) {
    ensureInit();
    unlockAudio();
    activeTodoId = todoId;
    const dur = minutes && minutes >= 1 ? Math.min(180, Math.round(minutes)) : settings().work;
    customWorkMin = minutes && minutes >= 1 ? dur : null;
    const t = Date.now();
    set({ phase: 'work', running: true, endsAt: t + dur * MIN, left: dur * MIN, rounds: pomo.rounds });
    syncAmbient('work', true);
    ensureInterval();
  },
  /** Switches the end chime on or off (kept in the settings) – switching on plays it once, so you hear it works. */
  setSound(on: boolean) {
    setSettings({ pomodoroSound: on ? undefined : false });
    if (on) playChime(true);
    emit();
  },
  getMeta: () => {
    const s = settings();
    return {
      activeTodoId,
      soundOn: soundIsOn(),
      workMin: currentWorkMin(),
      breakMin: s.brk,
      longBreakMin: s.longBrk,
      goal: s.goal,
      autoStart: s.autoStart,
      autoSound: s.autoSound,
    };
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

type PomoMeta = ReturnType<typeof pomodoro.getMeta>;
let metaSnap: PomoMeta = {
  activeTodoId,
  soundOn: true,
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  goal: 4,
  autoStart: false,
  autoSound: false,
};
export function usePomodoroMeta(): PomoMeta {
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
        metaSnap.breakMin !== next.breakMin ||
        metaSnap.longBreakMin !== next.longBreakMin ||
        metaSnap.goal !== next.goal ||
        metaSnap.autoStart !== next.autoStart ||
        metaSnap.autoSound !== next.autoSound
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
