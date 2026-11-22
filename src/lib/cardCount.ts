/**
 * "Automatisch": the AI decides itself how many cards the material needs – fewer, good cards rather than many.
 * It gets an upper limit per part (`maxCardsFor`) – a ceiling, not a target. After long material (several
 * parts) a last step sorts out duplicates and unimportant cards (`applyCuration`).
 * Pure – tested in scripts/test-srs.mts.
 */

/** The AI reads this much material per request (see `cardsPrompt`; longer material is split into parts). */
export const CARD_MATERIAL_LIMIT = 60000;

/** At most this many cards for a part of this length: about one per 2500 characters, 4–20. */
export function maxCardsFor(chars: number): number {
  return Math.max(4, Math.min(20, Math.round(Math.max(0, chars) / 2500)));
}

/** What the AI is told when it decides the number itself: quality first, with a ceiling for this part. */
export function autoCardInstruction(chars = CARD_MATERIAL_LIMIT): string {
  return (
    'Entscheide selbst, wie viele Karteikarten nötig sind, damit man mit ihnen eine Prüfung zu diesem Stoff gut bestehen kann. ' +
    'Jedes wichtige Konzept (Definitionen, Modelle, Theorien, zentrale Zusammenhänge, typische Prüfungsfragen) bekommt genau eine Karte – nicht mehr. ' +
    'Fasse Zusammengehörendes auf einer Karte zusammen, statt es auf mehrere kleine Karten zu verteilen. ' +
    'Lass Organisatorisches (Termine, Agenda, Folientitel, Literaturlisten, Wiederholungsfolien), Detailfakten und Zahlen ohne eigenen Lernwert, einzelne Beispiele, Aufzählungsdetails und Dopplungen weg. ' +
    `Qualität vor Menge: höchstens ${maxCardsFor(chars)} Karten für dieses Material – weniger, wenn der Stoff es hergibt.`
  );
}

/** Rough span of cards the AI might make – only for showing the expected costs as a range. */
export function cardRange(chars: number): { low: number; high: number } {
  const used = Math.min(Math.max(0, chars), CARD_MATERIAL_LIMIT);
  const high = maxCardsFor(used);
  return { low: Math.min(high, Math.max(2, Math.round(used / 10000))), high };
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
