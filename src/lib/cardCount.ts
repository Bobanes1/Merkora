/**
 * "Automatisch": the AI decides itself how many cards the material needs – no guide number is sent.
 * The instruction asks for every exam-relevant concept exactly once and nothing else.
 * `cardRange` is only used for the cost estimate shown beforehand (never sent to the AI).
 * Pure – tested in scripts/test-srs.mts.
 */

/** The AI reads this much material per request (see `cardsPrompt`; longer material is split into parts). */
export const CARD_MATERIAL_LIMIT = 60000;

/** What the AI is told when it decides the number itself. Contains no number on purpose. */
export function autoCardInstruction(): string {
  return (
    'Entscheide selbst, wie viele Karteikarten nötig sind, damit man mit ihnen eine Prüfung zu diesem Stoff gut bestehen kann. ' +
    'Jedes prüfungsrelevante Konzept (Definitionen, Modelle, Theorien, Zusammenhänge, wichtige Autorinnen und Autoren oder Studien, typische Prüfungsfragen) bekommt genau eine Karte – nicht mehr. ' +
    'Lass Organisatorisches (Termine, Agenda, Folientitel, Literaturlisten, Wiederholungsfolien), Beispiele ohne eigenen Lernwert und Dopplungen weg. ' +
    'Lieber wenige gute Karten als viele oberflächliche – aber lass nichts Prüfungsrelevantes aus.'
  );
}

/** Rough span of cards the AI might make – only for showing the expected costs as a range. */
export function cardRange(chars: number): { low: number; high: number } {
  const used = Math.min(Math.max(0, chars), CARD_MATERIAL_LIMIT);
  return { low: Math.max(2, Math.round(used / 10000)), high: Math.max(5, Math.round(used / 2500)) };
}
