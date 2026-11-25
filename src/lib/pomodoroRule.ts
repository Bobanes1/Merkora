/** Pomodoro timer as a pure state machine (tested in scripts/test-srs.mts). */
export type Phase = 'work' | 'break';
export type Pomo = {
  phase: Phase;
  running: boolean;
  /** end of the current phase while running */
  endsAt: number;
  /** time left while paused (ms) */
  left: number;
  /** completed work phases today */
  rounds: number;
  /** true when the current break is the long break after every 4th work round */
  longBreak?: boolean;
};

export const MIN = 60_000;

export const initialPomo = (workMin: number): Pomo => ({ phase: 'work', running: false, endsAt: 0, left: workMin * MIN, rounds: 0 });

export const remaining = (p: Pomo, now: number) => (p.running ? Math.max(0, p.endsAt - now) : p.left);

export const start = (p: Pomo, now: number): Pomo => (p.running ? p : { ...p, running: true, endsAt: now + p.left });
export const pause = (p: Pomo, now: number): Pomo => (p.running ? { ...p, running: false, left: Math.max(0, p.endsAt - now) } : p);

/**
 * Moves to the next phase when the current one is over.
 * `studied` = work minutes finished by this step (to add to the study time).
 * Every 4th completed round optionally triggers a longer break (`longBreakMin`).
 */
export function tick(
  p: Pomo,
  now: number,
  workMin: number,
  breakMin: number,
  longBreakMin?: number,
  autoStart = false,
): { pomo: Pomo; ended?: Phase; studied: number } {
  if (!p.running || now < p.endsAt) return { pomo: p, studied: 0 };
  if (p.phase === 'work') {
    const nextRounds = p.rounds + 1;
    const isLong = !!longBreakMin && longBreakMin > breakMin && nextRounds % 4 === 0;
    const dur = isLong ? longBreakMin : breakMin;
    return {
      pomo: { phase: 'break', running: true, endsAt: now + dur * MIN, left: dur * MIN, rounds: nextRounds, ...(isLong ? { longBreak: true } : {}) },
      ended: 'work',
      studied: workMin,
    };
  }
  return {
    pomo: {
      phase: 'work',
      running: autoStart,
      endsAt: autoStart ? now + workMin * MIN : 0,
      left: workMin * MIN,
      rounds: p.rounds,
    },
    ended: 'break',
    studied: 0,
  };
}

/** Work minutes already spent in the current work phase (counted when it is reset early). */
export const workedSoFar = (p: Pomo, now: number, workMin: number) =>
  p.phase === 'work' ? Math.max(0, workMin * MIN - remaining(p, now)) / MIN : 0;
