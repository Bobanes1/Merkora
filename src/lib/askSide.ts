/**
 * Which side of a card is asked: the term first (front → back), the definition first (back → front), or mixed.
 * Pure – tested in scripts/test-srs.mts.
 */
import { answerOnly } from './backSide';

export type AskSide = 'front' | 'back' | 'mixed';

export const ASK_SIDES: { id: AskSide; label: string; hint: string }[] = [
  { id: 'front', label: 'Begriff zuerst', hint: 'Vorderseite fragen, Rückseite ist die Antwort' },
  { id: 'back', label: 'Definition zuerst', hint: 'Rückseite fragen, die Vorderseite ist die Antwort' },
  { id: 'mixed', label: 'Gemischt', hint: 'Mal so, mal so – beide Richtungen üben' },
];

/** Small stable hash, so "mixed" keeps the same direction for a card during one round. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Is this card asked from its back (definition) this time? */
export function asksBack(side: AskSide | undefined, cardId: string, round = 0): boolean {
  if (side === 'back') return true;
  if (side === 'mixed') return hash(cardId + ':' + round) % 2 === 1;
  return false;
}

/** Question and answer of a card for the chosen direction (Anki backs that repeat the question show only the answer part). */
export function sidesFor(card: { front: string; back: string; html?: boolean }, back: boolean): { question: string; answer: string } {
  const answer = card.html ? answerOnly(card.front, card.back) : card.back;
  return back ? { question: answer, answer: card.front } : { question: card.front, answer };
}

/** Swapping term and definition in the editor: the answer part becomes the front, the front the back. */
export function swapSides(front: string, back: string, html: boolean): { front: string; back: string } {
  return { front: html ? answerOnly(front, back) : back, back: front };
}
