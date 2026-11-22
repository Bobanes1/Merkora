/**
 * "Automatisch": the AI first lists the topics of the material (like the outline of a summary), then makes
 * cards for exactly those – so the number follows the content. Merkora checks that every topic got a card
 * (`uncovered`) and asks once more for the missing ones. A ceiling per part (`maxCardsFor`) is only a safety net.
 * After long material (several parts) a last step sorts out duplicates (`applyCuration`).
 * Pure – tested in scripts/test-srs.mts.
 */

/** The AI reads this much material per request (see `cardsPrompt`; longer material is split into parts). */
export const CARD_MATERIAL_LIMIT = 60000;

/** How thorough „Automatisch“ is: the core (main topics, one card each) or also important details. */
export type CardDensity = 'compact' | 'thorough';

/** Safety net: at most this many cards for a part of this length – compact about one per 3500 characters (4–15), thorough one per 1500 (6–40). */
export function maxCardsFor(chars: number, density: CardDensity = 'compact'): number {
  const c = Math.max(0, chars);
  return density === 'compact' ? Math.max(4, Math.min(15, Math.round(c / 3500))) : Math.max(6, Math.min(40, Math.round(c / 1500)));
}

/** What the AI is told when it decides the number itself: topics first, then a card for each of them. */
export function autoCardInstruction(chars = CARD_MATERIAL_LIMIT, density: CardDensity = 'compact'): string {
  if (density === 'compact')
    return (
      'Gehe vor wie bei einer guten Zusammenfassung: Liste zuerst in "topics" die HAUPTTHEMEN dieses Materials auf – auf Kapitel- oder Abschnittsebene, etwa 4–12 Stück. ' +
      'Details, Beispiele, Aufzählungen und Einzelfakten gehören zu ihrem Hauptthema und sind KEINE eigenen Themen. Nichts Organisatorisches (Termine, Agenda, Folientitel, Literaturlisten). ' +
      'Erstelle dann zu jedem Hauptthema genau eine Karte, mit der man es wirklich versteht (nur wirklich zentrale Themen bekommen eine zweite), und gib bei jeder Karte die Nummer ihres Themas an ("topic", ab 1). ' +
      'Auch wenn das Material schon eine Zusammenfassung ist: nicht jeden Satz zu einer Karte machen – nur das, was man für das Verständnis wirklich lernen muss. ' +
      `Qualität vor Menge – höchstens ${maxCardsFor(chars, density)} Karten für dieses Material.`
    );
  return (
    'Gehe vor wie bei einer guten Zusammenfassung: Liste zuerst in "topics" ALLE wichtigen Themen dieses Materials auf – ' +
    'Konzepte, Definitionen, Modelle, Theorien, zentrale Zusammenhänge, typische Prüfungsfragen; je Thema ein kurzer Name, nichts Organisatorisches (Termine, Agenda, Folientitel, Literaturlisten). ' +
    'Erstelle dann zu JEDEM Thema mindestens eine Karte, mit der man es wirklich versteht, und gib bei jeder Karte die Nummer ihres Themas an ("topic", ab 1). ' +
    'Nur große Themen bekommen 2–3 Karten. Fasse Zusammengehörendes auf einer Karte zusammen; lass Detailfakten ohne Lernwert, einzelne Beispiele und Dopplungen weg. ' +
    `Qualität vor Menge – höchstens ${maxCardsFor(chars, density)} Karten für dieses Material.`
  );
}

/** Rough span of cards the AI might make – only for showing the expected costs as a range. */
export function cardRange(chars: number, density: CardDensity = 'compact'): { low: number; high: number } {
  const used = Math.min(Math.max(0, chars), CARD_MATERIAL_LIMIT);
  const high = maxCardsFor(used, density);
  return { low: Math.min(high, Math.max(2, Math.round(used / (density === 'compact' ? 8000 : 4000)))), high };
}

/**
 * When to sort out at the end: with several parts always from 12 cards (duplicates across parts), with one part
 * when clearly more cards came than the material's limit allows. Pure – tested.
 */
export function shouldCurate(made: number, partLengths: number[], density: CardDensity = 'compact'): boolean {
  if (partLengths.length > 1) return made >= 12;
  const limit = partLengths.reduce((n, len) => n + maxCardsFor(len, density), 0);
  return made >= 8 && made > Math.ceil(limit * 1.3);
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
