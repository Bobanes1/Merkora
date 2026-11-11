/**
 * "Automatisch": the AI makes as many cards as the material needs. For the prompt (and the cost estimate)
 * a rough guide value is used – about one card per 600 characters of learning material.
 * Pure – tested in scripts/test-srs.mts.
 */
export const AUTO_MIN = 5;
export const AUTO_MAX = 150;
/** The AI only sees this much material per request (see `cardsPrompt`). */
export const CARD_MATERIAL_LIMIT = 60000;

export function autoCardCount(chars: number): number {
  const used = Math.min(Math.max(0, chars), CARD_MATERIAL_LIMIT);
  return Math.max(AUTO_MIN, Math.min(AUTO_MAX, Math.round(used / 600)));
}
