/** Learning path ("Lernpfad"): the deck split into small levels, with review chests and a final test. */
import { cardBackText, cardFrontText, cardHasMedia } from './content';
import type { Rating } from './srs';
import type { Card, Data, Deck } from './store';
import { DAY, dayKey, startOfDay } from './util';

export const CARDS_PER_LESSON = 6;
export const LESSONS_PER_UNIT = 4;

export type NodeKind = 'lesson' | 'review' | 'final';
export type PathNode = { key: string; kind: NodeKind; unit: number; title: string; cardIds: string[] };
export type Unit = { index: number; title: string; nodes: PathNode[] };

export function buildPath(deck: Deck): Unit[] {
  const cards = deck.cards;
  const lessons: Card[][] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_LESSON) lessons.push(cards.slice(i, i + CARDS_PER_LESSON));
  const units: Unit[] = [];
  for (let u = 0; u * LESSONS_PER_UNIT < lessons.length; u++) {
    const group = lessons.slice(u * LESSONS_PER_UNIT, (u + 1) * LESSONS_PER_UNIT);
    const first = u * LESSONS_PER_UNIT * CARDS_PER_LESSON + 1;
    const last = first - 1 + group.reduce((a, g) => a + g.length, 0);
    const nodes: PathNode[] = group.map((g, k) => {
      const n = u * LESSONS_PER_UNIT + k;
      return { key: `l${n}`, kind: 'lesson', unit: u, title: `Level ${n + 1}`, cardIds: g.map((c) => c.id) };
    });
    if (group.length >= 2)
      nodes.push({ key: `r${u}`, kind: 'review', unit: u, title: `Schatztruhe ${u + 1}`, cardIds: group.flat().map((c) => c.id) });
    units.push({ index: u, title: `Abschnitt ${u + 1} · Karten ${first}–${last}`, nodes });
  }
  if (cards.length >= 4 && units.length) {
    units[units.length - 1].nodes.push({
      key: 'final',
      kind: 'final',
      unit: units.length - 1,
      title: 'Abschlusstest',
      cardIds: cards.map((c) => c.id),
    });
  }
  return units;
}

export const flatNodes = (units: Unit[]) => units.flatMap((u) => u.nodes);

export type NodeState = 'done' | 'current' | 'open' | 'locked';

/** Each node opens once the one before it has at least one star. */
export function nodeStates(deck: Deck, nodes: PathNode[]): Record<string, NodeState> {
  const out: Record<string, NodeState> = {};
  let unlocked = true;
  let currentSet = false;
  for (const n of nodes) {
    const stars = deck.path?.[n.key]?.stars ?? 0;
    if (!unlocked) out[n.key] = 'locked';
    else if (stars > 0) out[n.key] = 'done';
    else if (!currentSet) {
      out[n.key] = 'current';
      currentSet = true;
    } else out[n.key] = 'open';
    if (stars === 0) unlocked = false;
  }
  return out;
}

export function pathProgress(deck: Deck) {
  const nodes = flatNodes(buildPath(deck));
  const done = nodes.filter((n) => (deck.path?.[n.key]?.stars ?? 0) > 0).length;
  const stars = nodes.reduce((a, n) => a + (deck.path?.[n.key]?.stars ?? 0), 0);
  return { total: nodes.length, done, stars, maxStars: nodes.length * 3 };
}

// ---------- exercises ----------
export type Exercise =
  | { type: 'mc'; cardId: string; prompt: Card; reverse: boolean; options: string[]; answer: number }
  | { type: 'flip'; cardId: string; prompt: Card };

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const clip = (s: string, n = 180) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Builds the exercises for one node: multiple choice where possible, otherwise "flip and check". */
export function buildExercises(deck: Deck, node: PathNode): Exercise[] {
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  let ids = node.cardIds.filter((id) => byId.has(id));
  if (node.kind === 'review') ids = shuffle(ids).slice(0, 10);
  if (node.kind === 'final') ids = shuffle(ids).slice(0, 15);
  const pool = deck.cards.filter((c) => !cardHasMedia(c));
  return ids.map((id, i) => {
    const card = byId.get(id)!;
    const back = cardBackText(card);
    const front = cardFrontText(card);
    const reverse = i % 3 === 2 && front.length > 0 && front.length <= 120;
    const right = reverse ? front : back;
    const others = shuffle(pool.filter((c) => c.id !== id))
      .map((c) => (reverse ? cardFrontText(c) : cardBackText(c)))
      .filter((t, k, arr) => t && t !== right && arr.indexOf(t) === k)
      .slice(0, 3);
    if (cardHasMedia(card) || !right || right.length > 260 || others.length < 3) return { type: 'flip', cardId: id, prompt: card };
    const options = shuffle([right, ...others]).map((o) => clip(o));
    return { type: 'mc', cardId: id, prompt: card, reverse, options, answer: options.indexOf(clip(right)) };
  });
}

/**
 * XP for an answer in the learning path, with the same four answers as when learning:
 * "Nochmal" nothing, "Schwer" a little, "Gut" and "Einfach" more; a second try only a bit. A streak adds 2.
 */
export function answerXp(rating: Rating, firstTry: boolean, combo: number): number {
  if (rating === 1) return 0;
  const base = firstTry ? (rating === 2 ? 6 : rating === 3 ? 10 : 12) : 3;
  return base + (combo >= 2 ? 2 : 0);
}

export function starsFor(firstTryCorrect: number, total: number) {
  const r = total ? firstTryCorrect / total : 0;
  return r >= 0.95 ? 3 : r >= 0.7 ? 2 : 1;
}

// ---------- XP, player level and streak ----------
export const totalXp = (d: Data) => Object.values(d.game.xpByDay).reduce((a, n) => a + n, 0);
export const xpToday = (d: Data) => d.game.xpByDay[dayKey(Date.now())] ?? 0;

/** Level 1 needs 0 XP, each next level needs 50 XP more than the one before (100, 150, 200 …). */
export function playerLevel(xp: number) {
  let level = 1;
  let need = 100;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need += 50;
  }
  return { level, into: rest, need };
}

/** Days in a row with at least some XP (today counts once you've earned XP today). */
export function xpStreak(d: Data, now = Date.now()) {
  const has = (t: number) => (d.game.xpByDay[dayKey(t)] ?? 0) > 0;
  let day = startOfDay(now);
  if (!has(day)) day -= DAY;
  let n = 0;
  while (has(day)) {
    n++;
    day -= DAY;
  }
  return n;
}

export function lastDays(d: Data, n: number, now = Date.now()) {
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => {
    const t = today - (n - 1 - i) * DAY;
    return { t, xp: d.game.xpByDay[dayKey(t)] ?? 0 };
  });
}
