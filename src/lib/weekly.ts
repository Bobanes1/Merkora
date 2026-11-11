/**
 * Weekly review ("Wochenrückblick"): the last 7 days compared with the 7 days before, and which
 * decks made the biggest jump in mastery (from a small daily snapshot of the mastery per deck).
 */
import { masteryPercent, streak } from './stats';
import type { Data } from './store';
import { DAY, dayKey, startOfDay } from './util';

export type WeekDeck = { id: string; name: string; from: number; to: number };
export type WeekReview = {
  reviews: number;
  prevReviews: number;
  activeDays: number;
  minutes: number;
  correct: number | null;
  newLearned: number;
  streak: number;
  decks: WeekDeck[];
  busiestDay: { day: number; n: number } | null;
};

/** Mastery per deck, saved once a day (kept for 15 days). */
export function masterySnapshot(d: Pick<Data, 'decks'>): Record<string, number> {
  return Object.fromEntries(d.decks.filter((x) => x.cards.length).map((x) => [x.id, masteryPercent(x.cards)]));
}
export function withSnapshot(snaps: Record<string, Record<string, number>> | undefined, day: string, snap: Record<string, number>, now: number) {
  const keep = dayKey(now - 15 * DAY);
  const out: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(snaps ?? {})) if (k >= keep) out[k] = v;
  out[day] = snap;
  return out;
}

export function weekReview(d: Pick<Data, 'decks' | 'reviews' | 'game'>, now = Date.now()): WeekReview {
  const from = startOfDay(now) - 6 * DAY;
  const week = d.reviews.filter((r) => r.at >= from);
  const prev = d.reviews.filter((r) => r.at >= from - 7 * DAY && r.at < from);
  const perDay = new Map<number, number>();
  for (const r of week) perDay.set(startOfDay(r.at), (perDay.get(startOfDay(r.at)) ?? 0) + 1);
  let busiest: WeekReview['busiestDay'] = null;
  for (const [day, n] of perDay) if (!busiest || n > busiest.n) busiest = { day, n };
  let minutes = 0;
  for (let i = 0; i < 7; i++) minutes += d.game.minutesByDay?.[dayKey(from + i * DAY)] ?? 0;
  const newLearned = d.decks.reduce((n, x) => n + x.cards.filter((c) => c.srs.introduced !== undefined && c.srs.introduced >= from).length, 0);

  // mastery then (oldest snapshot of the last 7 days) and now
  const snaps = d.game.masterySnaps ?? {};
  const oldKey = Object.keys(snaps)
    .filter((k) => k >= dayKey(from - DAY))
    .sort()[0];
  const before = oldKey ? snaps[oldKey] : {};
  const decks = d.decks
    .filter((x) => x.cards.length && before[x.id] !== undefined)
    .map((x) => ({ id: x.id, name: x.name, from: before[x.id], to: masteryPercent(x.cards) }))
    .filter((x) => x.to !== x.from)
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, 4);

  return {
    reviews: week.length,
    prevReviews: prev.length,
    activeDays: perDay.size,
    minutes: Math.round(minutes),
    correct: week.length ? Math.round((week.filter((r) => r.rating >= 3).length / week.length) * 100) : null,
    newLearned,
    streak: streak(d.reviews, now),
    decks,
    busiestDay: busiest,
  };
}

/** The review shows up on Sunday and Monday, once per week (key = that Sunday). */
export function reviewWeekKey(now = Date.now()): string | null {
  const wd = new Date(now).getDay();
  if (wd === 0) return dayKey(now);
  if (wd === 1) return dayKey(now - DAY);
  return null;
}
