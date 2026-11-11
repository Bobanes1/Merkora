/**
 * FSRS (Free Spaced Repetition Scheduler, version 5 – the algorithm in Anki 23.10+).
 * Every card has a memory "stability" S (days until the recall chance drops to 90 %) and a
 * "difficulty" D (1–10). After each answer both are updated; the next interval is chosen so that
 * the chance to still know the card matches the desired retention. Pure – tested in scripts/test-srs.mts.
 */
import type { Rating } from './srs';

/** Default FSRS-5 parameters (trained on millions of Anki reviews). */
export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
  0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clampD = (d: number) => Math.min(10, Math.max(1, d));
const clampS = (s: number) => Math.min(36500, Math.max(0.01, s));

export type MemoryState = { s: number; d: number };

/** Chance to recall after `days` with stability `s`. */
export const retrievability = (days: number, s: number) => Math.pow(1 + (FACTOR * days) / s, DECAY);

/** Interval in days for which the recall chance falls to `retention`. */
export const fsrsInterval = (s: number, retention: number) => (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);

const initD = (g: Rating) => W[4] - Math.exp(W[5] * (g - 1)) + 1;

export function initState(g: Rating): MemoryState {
  return { s: clampS(W[g - 1]), d: clampD(initD(g)) };
}

function nextD(d: number, g: Rating) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clampD(W[7] * initD(4) + (1 - W[7]) * damped);
}

/** New memory state after answering `g` when `days` have passed since the last review. */
export function nextState(m: MemoryState, days: number, g: Rating): MemoryState {
  const d = nextD(m.d, g);
  if (days < 1) {
    // same-day review (learning steps)
    return { s: clampS(m.s * Math.exp(W[17] * (g - 3 + W[18]))), d };
  }
  const r = retrievability(days, m.s);
  if (g === 1) {
    const forget = W[11] * Math.pow(m.d, -W[12]) * (Math.pow(m.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
    return { s: clampS(Math.min(forget, m.s)), d };
  }
  const bonus = g === 2 ? W[15] : g === 4 ? W[16] : 1;
  const s = m.s * (Math.exp(W[8]) * (11 - m.d) * Math.pow(m.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * bonus + 1);
  return { s: clampS(s), d };
}

/** Memory state for a card that was learned with the classic scheduler before FSRS was switched on. */
export function stateFromClassic(interval: number, ease: number): MemoryState {
  return { s: clampS(Math.max(0.5, interval)), d: clampD(5 + (2.5 - ease) * 4) };
}
