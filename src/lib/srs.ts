import { DAY } from './util';

export type Srs = {
  ease: number;
  /** Interval in days (can be a fraction, e.g. 0.5 = 12 hours). */
  interval: number;
  reps: number;
  lapses: number;
  due: number;
  last?: number;
  /** Index of the current learning step while the card is (re)learning; undefined once it is in normal review. */
  step?: number;
  /** Interval to return to after relearning a forgotten card. */
  lapseIvl?: number;
  /** When the card was studied for the first time (counts against the daily limit of new cards). */
  introduced?: number;
};

export type Rating = 1 | 2 | 3 | 4;

export const RATINGS: { value: Rating; label: string; key: string; cls: string }[] = [
  { value: 1, label: 'Nochmal', key: '1', cls: 'again' },
  { value: 2, label: 'Schwer', key: '2', cls: 'hard' },
  { value: 3, label: 'Gut', key: '3', cls: 'good' },
  { value: 4, label: 'Einfach', key: '4', cls: 'easy' },
];

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
/** Learning steps for new cards: 1 min → 10 min → 1 h, then the card graduates to 1 day. */
export const LEARN_STEPS = [1 * MIN, 10 * MIN, 1 * HOUR];
/** Relearning steps for forgotten cards. */
export const RELEARN_STEPS = [10 * MIN, 1 * HOUR];

const GRADUATE_GOOD = 1; // days
const GRADUATE_EASY = 3; // days
/** "Schwer" on a young review card: come back after half a day instead of a full day or more. */
const HARD_YOUNG = 0.5; // days

export const newSrs = (now = Date.now()): Srs => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now });

/** A card is in (re)learning while it is new or has an open learning step. */
export const isLearning = (s: Srs) => s.step !== undefined || !(s.interval > 0);

const roundIvl = (d: number) => (d < 1 ? Math.round(d * 24) / 24 : Math.round(d));

/**
 * Scheduling with learning steps (like Anki):
 * - New cards: Nochmal 1 Min. · Schwer 6 Min. · Gut 10 Min. → 1 Std. → 1 Tag · Einfach 3 Tage.
 * - Forgotten cards are relearned after 10 Min. and 1 Std.
 * - Review cards: Schwer on young cards (< 3 days) → 12 Std., otherwise ×1.2; Gut ×ease; Einfach ×ease×1.3.
 */
export function schedule(s: Srs, rating: Rating, now = Date.now()): Srs {
  let { ease, reps, lapses } = s;

  if (isLearning(s)) {
    const relearn = s.lapseIvl !== undefined;
    const steps = relearn ? RELEARN_STEPS : LEARN_STEPS;
    const step = Math.min(s.step ?? 0, steps.length - 1);
    const graduate = (days: number): Srs => ({
      ease,
      interval: days,
      reps: reps + 1,
      lapses,
      due: now + days * DAY,
      last: now,
    });
    if (rating === 1) return { ...s, ease, lapses, step: 0, due: now + steps[0], last: now };
    if (rating === 2) {
      // Repeat the step; on the first step use the middle between the first two steps (1 & 10 Min. → ~6 Min.).
      const delay = step === 0 && steps.length > 1 ? Math.round((steps[0] + steps[1]) / 2 / MIN) * MIN : steps[step];
      return { ...s, step, due: now + delay, last: now };
    }
    if (rating === 3) {
      if (step + 1 < steps.length) return { ...s, step: step + 1, due: now + steps[step + 1], last: now };
      return graduate(relearn ? Math.max(GRADUATE_GOOD, s.lapseIvl ?? GRADUATE_GOOD) : GRADUATE_GOOD);
    }
    ease = ease + (relearn ? 0 : 0.15);
    return graduate(relearn ? Math.max(GRADUATE_EASY, (s.lapseIvl ?? 1) * 1.5) : GRADUATE_EASY);
  }

  // Normal review
  const ivl = Math.max(s.interval, 0.5);
  if (rating === 1) {
    return {
      ease: Math.max(1.3, ease - 0.2),
      interval: 0,
      reps,
      lapses: lapses + 1,
      due: now + RELEARN_STEPS[0],
      last: now,
      step: 0,
      lapseIvl: roundIvl(Math.max(1, ivl * 0.3)),
    };
  }
  const hard = ivl < 3 ? HARD_YOUNG : roundIvl(ivl * 1.2);
  const good = roundIvl(Math.max(hard + 1, ivl * ease));
  const easy = roundIvl(Math.max(good + 1, ivl * ease * 1.3));
  const interval = rating === 2 ? hard : rating === 3 ? good : easy;
  if (rating === 2) ease = Math.max(1.3, ease - 0.15);
  if (rating === 4) ease = ease + 0.15;
  return { ease, interval, reps: reps + 1, lapses, due: now + interval * DAY, last: now };
}

export function formatDelay(ms: number): string {
  const mins = Math.round(ms / MIN);
  if (mins < 60) return `${Math.max(1, mins)} Min.`;
  const hrs = Math.round(ms / HOUR);
  if (hrs < 24) return `${hrs} Std.`;
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} T.`;
  if (days < 365) return `${Math.round(days / 30)} Mon.`;
  return `${(days / 365).toFixed(1).replace('.', ',')} J.`;
}

export function previewInterval(s: Srs, rating: Rating): string {
  const now = Date.now();
  return formatDelay(schedule(s, rating, now).due - now);
}

export type Level = 'new' | 'learning' | 'familiar' | 'mastered';

export const LEVELS: { id: Level; label: string; color: string; hint: string }[] = [
  { id: 'new', label: 'Neu', color: '#d9d9d9', hint: 'Noch nie gelernt' },
  { id: 'learning', label: 'Lernend', color: '#f2b84b', hint: 'Gerade erst gesehen oder vergessen' },
  { id: 'familiar', label: 'Vertraut', color: '#32bdb9', hint: 'Sitzt schon ganz gut' },
  { id: 'mastered', label: 'Gemeistert', color: '#09817e', hint: 'Intervall von 21 Tagen oder mehr' },
];

export function levelOf(s: Srs): Level {
  if (!s.last) return 'new';
  if (s.step !== undefined || s.reps <= 1 || s.interval < 3) return 'learning';
  if (s.interval < 21) return 'familiar';
  return 'mastered';
}

export const levelWeight: Record<Level, number> = { new: 0, learning: 0.25, familiar: 0.6, mastered: 1 };

/** Learning state of a card in Anki (raw values from the collection). */
export type AnkiProgress = { kind: number; due: number; ivl: number; factor: number; reps: number; lapses: number; suspended?: boolean };

/**
 * Turns Anki's learning state into Merkora's: review cards keep interval, ease and due day
 * (Anki counts due days from the collection's creation `crt`); cards in (re)learning restart at the first step.
 */
export function ankiToSrs(p: AnkiProgress, crt: number, now = Date.now()): Srs {
  const ease = Math.max(1.3, (p.factor || 2500) / 1000);
  if (p.kind === 2) {
    const interval = Math.max(1, p.ivl);
    const due = crt > 0 ? (crt + p.due * 86400) * 1000 : now;
    return { ease, interval, reps: Math.max(1, p.reps), lapses: p.lapses, due, last: Math.min(now, due - interval * DAY) };
  }
  return {
    ease,
    interval: 0,
    reps: p.reps,
    lapses: p.lapses,
    due: now,
    last: now,
    step: 0,
    ...(p.kind === 3 ? { lapseIvl: Math.max(1, p.ivl) } : {}),
  };
}
