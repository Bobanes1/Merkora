/**
 * New cards are spread over the days (like Anki): per deck only a limited number of new cards
 * is due per day; cards already learned are always due when their time has come.
 * Pure functions – tested in scripts/test-srs.mts.
 */
import type { Srs } from './srs';
import { dayKey } from './util';

type WithSrs = { srs: Srs };

export const DEFAULT_NEW_PER_DAY = 20;

/** New cards of this deck that were learned for the first time today. */
export const introducedToday = (cards: WithSrs[], now = Date.now()) => {
  const today = dayKey(now);
  return cards.filter((c) => c.srs.introduced !== undefined && dayKey(c.srs.introduced) === today).length;
};

/** How many new cards may still be started today. */
export function newLeft(cards: WithSrs[], now: number, perDay: number, boost = 0): number {
  return Math.max(0, perDay + boost - introducedToday(cards, now));
}

/** Due cards: all learned cards whose time has come, plus at most `left` new cards (in deck order). */
export function pickDue<T extends WithSrs>(cards: T[], now: number, left: number): T[] {
  const learned = cards.filter((c) => c.srs.last !== undefined && c.srs.due <= now);
  const fresh = left > 0 ? cards.filter((c) => c.srs.last === undefined).slice(0, left) : [];
  return [...learned, ...fresh];
}

/** New cards that have never been studied. */
export const unseenCount = (cards: WithSrs[]) => cards.filter((c) => c.srs.last === undefined).length;

/**
 * Daily new cards for a whole course (like the parent deck limit in Anki): the course gets `perDay`
 * new cards, plus any extra a deck asked for today ("10 neue Karten"). Decks that asked for extra are
 * reserved first, the rest goes to the decks in course order. Returns how many new cards each deck may start today.
 */
export function planNewForCourse(
  decks: { id: string; cards: WithSrs[]; boost?: number }[],
  now: number,
  perDay: number,
): Map<string, number> {
  const plan = new Map<string, number>();
  const started = decks.reduce((n, d) => n + introducedToday(d.cards, now), 0);
  const extra = decks.reduce((n, d) => n + (d.boost ?? 0), 0);
  let left = Math.max(0, perDay + extra - started);
  // extra cards a deck asked for are reserved for that deck first (minus what it already started today)
  for (const d of decks) {
    if (!d.boost) continue;
    const take = Math.min(left, unseenCount(d.cards), Math.max(0, d.boost - introducedToday(d.cards, now)));
    plan.set(d.id, take);
    left -= take;
  }
  // the rest goes to the decks in course order
  for (const d of decks) {
    const has = plan.get(d.id) ?? 0;
    const take = Math.min(left, unseenCount(d.cards) - has);
    plan.set(d.id, has + take);
    left -= take;
  }
  return plan;
}
