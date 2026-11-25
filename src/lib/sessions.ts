/**
 * Study rounds over several decks (a folder or a whole course).
 * Pure – tested in scripts/test-srs.mts.
 */
import { pickDue } from './newCards';
import type { Srs } from './srs';

type SrsCard = { id: string; srs: Srs; suspended?: boolean };
type DeckLike<C extends SrsCard> = { id: string; cards: C[] };
export type GroupItem = { deckId: string; cardId: string };

/**
 * Due cards of all decks, earliest first: learned cards whose time has come
 * plus each deck's share of new cards for today (`left`, as in the learning tab).
 */
export function dueAcross<D extends DeckLike<SrsCard>>(decks: D[], left: (deck: D) => number, now = Date.now()): GroupItem[] {
  return decks
    .flatMap((d, di) => pickDue(d.cards, now, left(d)).map((c, ci) => ({ deckId: d.id, cardId: c.id, due: c.srs.due, di, ci })))
    .sort((a, b) => a.due - b.due || a.di - b.di || a.ci - b.ci)
    .map(({ deckId, cardId }) => ({ deckId, cardId }));
}

/** All active (non-suspended) cards of the decks, shuffled (practice without moving the schedule). */
export function allAcross<C extends SrsCard>(decks: DeckLike<C>[], rnd = Math.random): GroupItem[] {
  const items = decks.flatMap((d) => d.cards.filter((c) => !c.suspended).map((c) => ({ deckId: d.id, cardId: c.id })));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
