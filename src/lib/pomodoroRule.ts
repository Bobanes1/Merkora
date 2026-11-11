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
};

export const MIN = 60_000;

export const initialPomo = (workMin: number): Pomo => ({ phase: 'work', running: false, endsAt: 0, left: workMin * MIN, rounds: 0 });

export const remaining = (p: Pomo, now: number) => (p.running ? Math.max(0, p.endsAt - now) : p.left);

export const start = (p: Pomo, now: number): Pomo => (p.running ? p : { ...p, running: true, endsAt: now + p.left });
export const pause = (p: Pomo, now: number): Pomo => (p.running ? { ...p, running: false, left: Math.max(0, p.endsAt - now) } : p);

/**
 * Moves to the next phase when the current one is over.
 * `studied` = work minutes finished by this step (to add to the study time).
 */
export function tick(p: Pomo, now: number, workMin: number, breakMin: number): { pomo: Pomo; ended?: Phase; studied: number } {
  if (!p.running || now < p.endsAt) return { pomo: p, studied: 0 };
  if (p.phase === 'work') {
    return {
      pomo: { phase: 'break', running: true, endsAt: now + breakMin * MIN, left: breakMin * MIN, rounds: p.rounds + 1 },
      ended: 'work',
      studied: workMin,
    };
  }
  return { pomo: { ...p, phase: 'work', running: false, endsAt: 0, left: workMin * MIN }, ended: 'break', studied: 0 };
}

/** Work minutes already spent in the current work phase (counted when it is reset early). */
export const workedSoFar = (p: Pomo, now: number, workMin: number) =>
  p.phase === 'work' ? Math.max(0, workMin * MIN - remaining(p, now)) / MIN : 0;
