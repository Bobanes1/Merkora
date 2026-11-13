import { LEVELS, levelOf, levelWeight, type Level } from './srs';
import type { Card, Review } from './store';
import { DAY, dayKey, startOfDay } from './util';

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

// ---------- deck table: courses and folders (statistics page) ----------
export type DeckStat = { deckId: string; name: string; cards: number; mastery: number; due: number; reviews: number; known: number };
export type StatTotals = { cards: number; mastery: number; due: number; reviews: number; correct: number | null };

/** Sum of several decks: cards, due and reviews added up, progress weighted by cards, "gewusst" over all reviews. */
export function groupTotals(rows: DeckStat[]): StatTotals {
  const cards = rows.reduce((a, r) => a + r.cards, 0);
  const reviews = rows.reduce((a, r) => a + r.reviews, 0);
  const known = rows.reduce((a, r) => a + r.known, 0);
  return {
    cards,
    mastery: cards ? Math.round(rows.reduce((a, r) => a + r.mastery * r.cards, 0) / cards) : 0,
    due: rows.reduce((a, r) => a + r.due, 0),
    reviews,
    correct: reviews ? Math.round((known / reviews) * 100) : null,
  };
}

export type StatFolder = { id: string; name: string; totals: StatTotals; decks: DeckStat[] };
export type StatCourse = { id: string; name: string; totals: StatTotals; folders: StatFolder[]; decks: DeckStat[] };
export type StatWorkspace = { id: string; name: string; courses: StatCourse[] };

/** Workspace → course → folder → deck in the library's order; empty courses and folders are left out. */
export function statsTree(
  d: {
    workspaces: { id: string; name: string }[];
    courses: { id: string; workspaceId: string; name: string; folders?: { id: string; name: string }[] }[];
    decks: { id: string; courseId: string; folderId?: string }[];
  },
  rows: DeckStat[],
): StatWorkspace[] {
  const byId = new Map(rows.map((r) => [r.deckId, r]));
  return d.workspaces
    .map((w) => ({
      id: w.id,
      name: w.name,
      courses: d.courses
        .filter((c) => c.workspaceId === w.id)
        .map((c) => {
          const decks = d.decks.filter((k) => k.courseId === c.id && byId.has(k.id));
          const folderIds = new Set((c.folders ?? []).map((f) => f.id));
          const folders = (c.folders ?? [])
            .map((f) => {
              const inside = decks.filter((k) => k.folderId === f.id).map((k) => byId.get(k.id)!);
              return { id: f.id, name: f.name, totals: groupTotals(inside), decks: inside };
            })
            .filter((f) => f.decks.length);
          const loose = decks.filter((k) => !k.folderId || !folderIds.has(k.folderId)).map((k) => byId.get(k.id)!);
          return { id: c.id, name: c.name, totals: groupTotals(decks.map((k) => byId.get(k.id)!)), folders, decks: loose };
        })
        .filter((c) => c.totals.cards > 0 || c.folders.length || c.decks.length),
    }))
    .filter((w) => w.courses.length);
}

// ---------- library: one course's key figures (tile and list row count the same) ----------
export type CourseSummary = { decks: number; folders: number; cards: number; mastery: number; due: number };

export function courseSummary(course: { id: string; folders?: unknown[] }, decks: { courseId: string; cards: Card[] }[], dueOf: (deck: { courseId: string; cards: Card[] }) => number): CourseSummary {
  const mine = decks.filter((d) => d.courseId === course.id);
  const cards = mine.flatMap((d) => d.cards);
  return { decks: mine.length, folders: course.folders?.length ?? 0, cards: cards.length, mastery: masteryPercent(cards), due: mine.reduce((a, d) => a + dueOf(d), 0) };
}

export type CourseSort = 'name' | 'cards' | 'mastery' | 'due';

/** Courses sorted by a column of the list view (name A–Z, numbers largest first; `asc` flips it). */
export function sortCourses<T extends { name: string; sum: CourseSummary }>(list: T[], by: CourseSort, asc = by === 'name'): T[] {
  const cmp = (a: T, b: T) => (by === 'name' ? a.name.localeCompare(b.name, 'de') : a.sum[by] - b.sum[by]) || a.name.localeCompare(b.name, 'de');
  return [...list].sort((a, b) => (asc ? cmp(a, b) : -cmp(a, b)));
}

// ---------- start page ----------
/** Cards learned per calendar day (YYYY-MM-DD); a card repeated on the same day counts once. */
export function studyDays(reviews: { cardId: string; deckId: string; at: number }[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const r of reviews) {
    const k = dayKey(r.at);
    let s = seen.get(k);
    if (!s) seen.set(k, (s = new Set()));
    s.add(r.deckId + '|' + r.cardId);
  }
  return new Map([...seen].map(([k, s]) => [k, s.size]));
}

export type DeckSort = 'due' | 'studied' | 'created';

/** Decks for "Meine Decks": most due first, last studied first (never studied last) or newest first; ties by name. */
export function sortDecks<T extends { id: string; name: string; createdAt: number; updatedAt?: number }>(
  decks: T[],
  by: DeckSort,
  reviews: { deckId: string; at: number }[],
  dueOf: (d: T) => number,
): T[] {
  const last = new Map<string, number>();
  for (const r of reviews) last.set(r.deckId, Math.max(last.get(r.deckId) ?? 0, r.at));
  const key = (d: T) => (by === 'due' ? dueOf(d) : by === 'studied' ? (last.get(d.id) ?? -1) : (d.updatedAt ?? d.createdAt));
  return [...decks].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name, 'de'));
}
