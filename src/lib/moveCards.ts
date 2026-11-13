/**
 * Moving cards to another deck. Pure (no storage) – tested in scripts/test-srs.mts.
 *
 * A moved card gets a new id in the target deck and its old id is marked deleted: synced copies on other
 * devices then drop it from the old deck instead of bringing it back. Learning state and review history move along.
 */
import type { Card, Deck, Review } from './store';

export type MoveResult = { decks: Deck[]; reviews: Review[]; gone: string[]; moved: number };

export function moveCardsIn(decks: Deck[], reviews: Review[], fromId: string, cardIds: string[], toId: string, newId: () => string, now = Date.now()): MoveResult {
  const from = decks.find((d) => d.id === fromId);
  const to = decks.find((d) => d.id === toId);
  if (!from || !to || fromId === toId) return { decks, reviews, gone: [], moved: 0 };
  const pick = new Set(cardIds);
  const moving = from.cards.filter((c) => pick.has(c.id));
  if (!moving.length) return { decks, reviews, gone: [], moved: 0 };
  const ids = new Map(moving.map((c) => [c.id, newId()]));
  // Anki look (note type CSS) goes along, so the cards still look the same in the new deck
  const styles = { ...(to.styles ?? {}) };
  for (const c of moving) if (c.styleId && from.styles?.[c.styleId] && !styles[c.styleId]) styles[c.styleId] = from.styles[c.styleId];
  const moved: Card[] = moving.map((c) => ({ ...c, id: ids.get(c.id)!, updatedAt: now }));
  return {
    decks: decks.map((d) =>
      d.id === fromId
        ? { ...d, cards: d.cards.filter((c) => !pick.has(c.id)), updatedAt: now }
        : d.id === toId
          ? { ...d, cards: [...d.cards, ...moved], ...(Object.keys(styles).length ? { styles } : {}), updatedAt: now }
          : d,
    ),
    reviews: reviews.map((r) => (r.deckId === fromId && ids.has(r.cardId) ? { ...r, deckId: toId, cardId: ids.get(r.cardId)! } : r)),
    gone: [...ids.keys()],
    moved: moving.length,
  };
}
