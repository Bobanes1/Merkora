import { LEVELS, levelOf, levelWeight, type Level } from './srs';
import type { Card, Review } from './store';
import { DAY, startOfDay } from './util';

export function levelCounts(cards: Card[]) {
  const counts: Record<Level, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  cards.forEach((c) => counts[levelOf(c.srs)]++);
  return counts;
}

export function masteryPercent(cards: Card[]) {
  if (!cards.length) return 0;
  const sum = cards.reduce((a, c) => a + levelWeight[levelOf(c.srs)], 0);
  return Math.round((sum / cards.length) * 100);
}

export function streak(reviews: Review[], now = Date.now()) {
  const days = new Set(reviews.map((r) => startOfDay(r.at)));
  let day = startOfDay(now);
  if (!days.has(day)) day -= DAY;
  let n = 0;
  while (days.has(day)) {
    n++;
    day -= DAY;
  }
  return n;
}

export function perDay(reviews: Review[], days: number, now = Date.now()) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const d = today - (days - 1 - i) * DAY;
    return { day: d, count: reviews.filter((r) => startOfDay(r.at) === d).length };
  });
}

export { LEVELS };
