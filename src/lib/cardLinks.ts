/**
 * Problem cards ("leeches") and reversed twin cards. Pure (no storage) – tested in scripts/test-srs.mts.
 */
import { answerOnly } from './backSide';
import { newSrs } from './srs';
import type { Card } from './store';

/** Forgotten this often after having known it: the card itself probably needs work. */
export const LEECH = 4;
export const isLeech = (c: Pick<Card, 'srs'>) => (c.srs.lapses ?? 0) >= LEECH;

/** Would this rating turn the card into a problem card right now? */
export const becomesLeech = (before: Pick<Card, 'srs'>, after: Pick<Card, 'srs'>) => !isLeech(before) && isLeech(after);

/**
 * Cards that can also be asked the other way round: not image occlusions (the masks only work one way)
 * and not imported Anki cards with their own layout (their templates are not symmetric), and not twins themselves.
 */
export const canReverse = (c: Card) => !c.reverseOf && !c.styleId && !/class="io-wrap"/.test(c.front + c.back);

/** The contents of the twin of `c`: answer as question, question as answer. */
export function twinContent(c: Card): Pick<Card, 'front' | 'back' | 'html'> {
  return { front: c.html ? answerOnly(c.front, c.back) : c.back, back: c.front, ...(c.html ? { html: true } : {}) };
}

/** A new twin card for `c` (own learning state, starts as a new card). */
export function makeTwin(c: Card, id: string, now = Date.now()): Card {
  return { id, ...twinContent(c), ...(c.tags?.length ? { tags: c.tags } : {}), reverseOf: c.id, createdAt: now, srs: newSrs(now) };
}

/** Twin and original due in the same round: the one that comes second moves to the end (no answer seen just before). */
export function spreadTwins(ids: string[], cards: Pick<Card, 'id' | 'reverseOf'>[]): string[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const partner = (id: string) => {
    const c = byId.get(id);
    if (c?.reverseOf) return c.reverseOf;
    return cards.find((x) => x.reverseOf === id)?.id;
  };
  const seen = new Set<string>();
  const first: string[] = [];
  const later: string[] = [];
  for (const id of ids) {
    const p = partner(id);
    (p && seen.has(p) ? later : first).push(id);
    seen.add(id);
  }
  return [...first, ...later];
}
