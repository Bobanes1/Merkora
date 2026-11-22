/**
 * "Automatisch": the AI first lists the topics of the material (like the outline of a summary), then makes
 * cards for exactly those – so the number follows the content. Merkora checks that every topic got a card
 * (`uncovered`) and asks once more for the missing ones. A ceiling per part (`maxCardsFor`) is only a safety net.
 * After long material (several parts) a last step sorts out duplicates (`applyCuration`).
 * Pure – tested in scripts/test-srs.mts.
 */

/** The AI reads this much material per request (see `cardsPrompt`; longer material is split into parts). */
export const CARD_MATERIAL_LIMIT = 60000;

/** Safety net: at most this many cards for a part of this length (about one per 1500 characters, 6–40). */
export function maxCardsFor(chars: number): number {
  return Math.max(6, Math.min(40, Math.round(Math.max(0, chars) / 1500)));
}

/** What the AI is told when it decides the number itself: topics first, then a card for each of them. */
export function autoCardInstruction(chars = CARD_MATERIAL_LIMIT): string {
  return (
    'Gehe vor wie bei einer guten Zusammenfassung: Liste zuerst in "topics" ALLE wichtigen Themen dieses Materials auf – ' +
    'Konzepte, Definitionen, Modelle, Theorien, zentrale Zusammenhänge, typische Prüfungsfragen; je Thema ein kurzer Name, nichts Organisatorisches (Termine, Agenda, Folientitel, Literaturlisten). ' +
    'Erstelle dann zu JEDEM Thema mindestens eine Karte, mit der man es wirklich versteht, und gib bei jeder Karte die Nummer ihres Themas an ("topic", ab 1). ' +
    'Nur große Themen bekommen 2–3 Karten. Fasse Zusammengehörendes auf einer Karte zusammen; lass Detailfakten ohne Lernwert, einzelne Beispiele und Dopplungen weg. ' +
    `Qualität vor Menge – höchstens ${maxCardsFor(chars)} Karten für dieses Material.`
  );
}

/** Rough span of cards the AI might make – only for showing the expected costs as a range. */
export function cardRange(chars: number): { low: number; high: number } {
  const used = Math.min(Math.max(0, chars), CARD_MATERIAL_LIMIT);
  const high = maxCardsFor(used);
  return { low: Math.min(high, Math.max(2, Math.round(used / 4000))), high };
}

/** Topics (numbered from 1) that no card names. Invalid topic numbers on cards count for nothing. */
export function uncovered(topics: string[], hits: unknown[]): string[] {
  const got = new Set(hits.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= topics.length));
  return topics.filter((_, k) => !got.has(k + 1));
}

/**
 * Sorting out after long material: the AI names cards (numbers from 1) that are duplicates, too small-grained
 * or unimportant. Only valid numbers count, and at most 40 % of the cards go. Returns the indexes to remove.
 */
export function applyCuration(total: number, drop: unknown): number[] {
  const max = Math.floor(total * 0.4);
  const ids = (Array.isArray(drop) ? drop : [])
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= total)
    .map((x) => x - 1);
  return [...new Set(ids)].slice(0, max);
}
