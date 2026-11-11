/**
 * Share a deck with friends as a small file (.merkora): the cards, optionally the mock exam
 * (so everyone writes the same exam) and the sender's grade to compare with. No server needed.
 * The learning progress is never included. Pure parts are tested in scripts/test-srs.mts.
 */
import type { Deck, MockExam } from './store';

export type SharedExam = Pick<MockExam, 'title' | 'instructions' | 'level' | 'detail' | 'minutes' | 'scale' | 'questions'>;
export type SharePack = {
  format: 'merkora-share';
  v: 1;
  from: string;
  at: number;
  deck: {
    name: string;
    source: string;
    cards: { front: string; back: string; html?: boolean; tags?: string[]; styleId?: string; cardClass?: string }[];
    styles?: Record<string, string>;
  };
  exam?: SharedExam;
  /** The sender's result in that exam. */
  result?: { grade: string; percent: number; passed: boolean; scale: string };
};

export const SHARE_EXT = '.merkora';

export function buildShare(deck: Deck, from: string, o: { exam: boolean; result: boolean }, now = Date.now()): SharePack {
  const ex = deck.mockExam;
  const hasExam = !!ex && ex.questions.length > 0;
  return {
    format: 'merkora-share',
    v: 1,
    from: from.trim() || 'Jemand',
    at: now,
    deck: {
      name: deck.name,
      source: deck.source,
      cards: deck.cards.map((c) => ({
        front: c.front,
        back: c.back,
        ...(c.html ? { html: true } : {}),
        ...(c.tags?.length ? { tags: c.tags } : {}),
        ...(c.styleId ? { styleId: c.styleId } : {}),
        ...(c.cardClass ? { cardClass: c.cardClass } : {}),
      })),
      ...(deck.styles ? { styles: deck.styles } : {}),
    },
    ...(o.exam && hasExam
      ? {
          exam: {
            title: ex!.title,
            instructions: ex!.instructions,
            level: ex!.level,
            detail: ex!.detail,
            minutes: ex!.minutes,
            scale: ex!.scale,
            questions: ex!.questions,
          },
        }
      : {}),
    ...(o.exam && o.result && hasExam && ex!.result
      ? { result: { grade: ex!.result.grade, percent: ex!.result.percent, passed: ex!.result.passed, scale: ex!.scale } }
      : {}),
  };
}

/** Reads a shared file; throws a readable message if it is not one. */
export function parseShare(text: string): SharePack {
  let raw: Partial<SharePack>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine Merkora-Datei.');
  }
  if (raw?.format !== 'merkora-share' || !raw.deck || !Array.isArray(raw.deck.cards)) throw new Error('Die Datei ist keine Merkora-Datei.');
  const cards = raw.deck.cards.filter((c) => c && typeof c.front === 'string' && typeof c.back === 'string');
  const exam = raw.exam && Array.isArray(raw.exam.questions) && raw.exam.questions.length ? raw.exam : undefined;
  if (!cards.length && !exam) throw new Error('In der Datei sind keine Karten.');
  return {
    format: 'merkora-share',
    v: 1,
    from: String(raw.from || 'Jemand').slice(0, 60),
    at: Number(raw.at) || Date.now(),
    deck: { name: String(raw.deck.name || 'Geteiltes Deck').slice(0, 120), source: String(raw.deck.source ?? ''), cards, styles: raw.deck.styles },
    ...(exam ? { exam } : {}),
    ...(exam && raw.result ? { result: raw.result } : {}),
  };
}

/** Who did better in the same exam (by percent – works across grading scales). */
export function compareResult(mine: number, theirs: number): 'better' | 'same' | 'worse' {
  return mine > theirs ? 'better' : mine < theirs ? 'worse' : 'same';
}
