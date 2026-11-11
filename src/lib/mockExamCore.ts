/** Pure parts of the mock exam (levels, grading scales, parsing) – tested in scripts/test-srs.mts. */
import type { MockExam, MockQuestion } from './store';
import { uid } from './util';

export const EDU_LEVELS = [
  { id: 'sek1', label: 'Sekundarstufe I', hint: 'Oberstufe / Realschule, ca. 12–15 Jahre' },
  { id: 'gym', label: 'Gymnasium / Matura / Abitur', hint: 'Sekundarstufe II' },
  { id: 'beruf', label: 'Berufsschule / Lehre / BMS', hint: 'Berufsfachschule, Berufsmaturität' },
  { id: 'hf', label: 'Höhere Fachschule / Fachhochschule', hint: 'praxisnahe Hochschule' },
  { id: 'bachelor', label: 'Universität – Bachelor', hint: '' },
  { id: 'master', label: 'Universität – Master', hint: '' },
  { id: 'weiter', label: 'Weiterbildung / Zertifikat', hint: 'z. B. CAS, Fachausweis, Sprachzertifikat' },
] as const;
export type EduLevel = (typeof EDU_LEVELS)[number]['id'];
export const levelLabel = (id: string) => EDU_LEVELS.find((l) => l.id === id)?.label ?? id;

export type GradeScale = 'ch' | 'de' | 'at' | 'pct';
export const GRADE_SCALES: { id: GradeScale; label: string }[] = [
  { id: 'ch', label: 'Schweiz (6 = beste, 4 = genügend)' },
  { id: 'de', label: 'Deutschland (1,0 = beste, 4,0 = bestanden)' },
  { id: 'at', label: 'Österreich (1 = Sehr gut, 4 = Genügend)' },
  { id: 'pct', label: 'Nur Prozent' },
];

/** Grade for a share of points (0–1). Pure – tested in scripts/test-srs.mts. */
export function gradeFor(share: number, scale: GradeScale): { grade: string; passed: boolean } {
  const p = Math.max(0, Math.min(1, share));
  const pct = Math.round(p * 100);
  switch (scale) {
    case 'ch': {
      const g = Math.round((1 + 5 * p) * 4) / 4; // quarter grades
      return { grade: g.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''), passed: g >= 4 };
    }
    case 'de': {
      const bands: [number, string][] = [
        [95, '1,0'], [90, '1,3'], [85, '1,7'], [80, '2,0'], [75, '2,3'], [70, '2,7'], [65, '3,0'], [60, '3,3'], [55, '3,7'], [50, '4,0'],
      ];
      const hit = bands.find(([min]) => pct >= min);
      return { grade: hit ? hit[1] : '5,0', passed: !!hit };
    }
    case 'at': {
      const bands: [number, string][] = [[89, '1 (Sehr gut)'], [76, '2 (Gut)'], [63, '3 (Befriedigend)'], [50, '4 (Genügend)']];
      const hit = bands.find(([min]) => pct >= min);
      return { grade: hit ? hit[1] : '5 (Nicht genügend)', passed: !!hit };
    }
    default:
      return { grade: `${pct} %`, passed: pct >= 50 };
  }
}

/** Points for a multiple-choice task: all or nothing. */
export const mcPoints = (q: MockQuestion, answer: unknown) => (q.type === 'mc' && answer === q.answer ? q.points : 0);

/** How many tasks fit into the time (about 1 point per minute, like real exams). */
export const tasksFor = (minutes: number) => Math.max(5, Math.min(24, Math.round(minutes / 4.5)));

const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };

/**
 * Keeps exam texts plain: sub-task labels are written as "a)", "b)", "c)" (only a closing bracket),
 * and symbols that some models or fonts make out of "(c)" / "(r)" (© / ®) are turned back into labels.
 * Brackets in normal text, e.g. "(z. B.)", "(2014)" or a lone "Copyright (c) 2024", stay as they are.
 */
export function cleanExamText(input: string): string {
  let s = String(input ?? '').replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c);
  const label = /(^|[\s:;,])\(([a-hA-H])\)(?=\s)/gm;
  const letters = new Set([...s.matchAll(label)].map((m) => m[2].toLowerCase()));
  const listLike = letters.size >= 2 || /(^|[\s:;,])[a-h]\)\s/m.test(s);
  // "(a) …" at the start of a line is always a label; elsewhere only when the text lists several parts
  s = s.replace(label, (all, pre: string, l: string) => {
    const lineStart = pre === '' || pre === '\n';
    return lineStart || listLike ? `${pre}${l.toLowerCase()})` : all;
  });
  const symbolList = listLike || /(^|\n)\s*[a-h]\)\s/.test(s);
  s = s.replace(/(^|[\s:;,])([©®])(?=\s)/gm, (all, pre: string, sym: string) => {
    const lineStart = pre === '' || pre === '\n';
    return lineStart || symbolList ? `${pre}${sym === '©' ? 'c' : 'r'})` : all;
  });
  return s.trim();
}

export type RawExam = { title?: string; instructions?: string; questions?: Partial<MockQuestion & { answer: number }>[] };
export function parseExam(raw: RawExam): Pick<MockExam, 'title' | 'instructions' | 'questions'> {
  const questions: MockQuestion[] = (raw.questions ?? [])
    .filter((q) => q && q.question && (q.type !== 'mc' || (Array.isArray(q.options) && q.options.length >= 2)))
    .map((q) => {
      const type = q.type === 'mc' || q.type === 'open' ? q.type : 'short';
      const points = Math.max(1, Math.min(20, Math.round(Number(q.points) || (type === 'open' ? 6 : type === 'mc' ? 1 : 3))));
      return {
        id: uid(),
        type,
        question: cleanExamText(q.question!),
        ...(type === 'mc'
          ? { options: q.options!.map((o) => cleanExamText(String(o))), answer: Math.max(0, Math.min(q.options!.length - 1, Number(q.answer) || 0)) }
          : {}),
        points,
        solution: cleanExamText(q.solution ?? ''),
        criteria: cleanExamText(q.criteria ?? ''),
      };
    });
  if (questions.length < 3) throw new Error('Die KI hat keine vollständige Prüfung geliefert. Bitte versuche es noch einmal.');
  return { title: cleanExamText(raw.title || 'Probeprüfung'), instructions: cleanExamText(raw.instructions || ''), questions };
}


/** Time left in ms; the clock stands still while the exam is paused. */
export function timeLeft(ex: Pick<MockExam, 'minutes' | 'startedAt' | 'pausedAt' | 'pausedMs'>, now: number) {
  const until = ex.pausedAt ?? now;
  return ex.minutes * 60_000 - (until - (ex.startedAt ?? now) - (ex.pausedMs ?? 0));
}

/** Flashcards for the tasks where points were lost: question on the front, model solution on the back. */
export function mistakeCards(ex: Pick<MockExam, 'questions' | 'result'>): { front: string; back: string }[] {
  if (!ex.result) return [];
  return ex.questions
    .filter((q) => (ex.result!.perQuestion[q.id]?.points ?? 0) < q.points)
    .map((q) => {
      if (q.type === 'mc') {
        const right = q.options?.[q.answer ?? 0] ?? '';
        return { front: q.question, back: right + (q.solution ? `\n\n${q.solution}` : '') };
      }
      return { front: q.question, back: q.solution || q.criteria || '' };
    })
    .filter((c) => c.front.trim() && c.back.trim());
}

const STOP = new Set(
  'aber alle also andere auch dass dein deine denen dessen diese dieser dieses durch eine einem einen einer eines gegen haben hatte immer jeder jedoch kann keine können machen mehr nach nicht noch oder ohne sein seine sich sind sowie über unter warum welche welcher werden wenn wird wurde zwischen erkläre erläutere beschreibe nenne beispiel beispiels anhand aufgabe which where about their there these those would could should'.split(
    ' ',
  ),
);
const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 5 && !STOP.has(w)),
  );

/** Existing cards that share at least two key words with a missed task (to repeat them today). */
export function relatedCardIds(questions: { question: string; solution: string }[], cards: { id: string; front: string; back: string }[], limit = 25) {
  const scored = cards
    .map((c) => {
      const cw = words(`${c.front} ${c.back}`);
      let best = 0;
      for (const q of questions) {
        let n = 0;
        for (const w of words(`${q.question} ${q.solution}`)) if (cw.has(w)) n++;
        best = Math.max(best, n);
      }
      return { id: c.id, best };
    })
    .filter((x) => x.best >= 2)
    .sort((a, b) => b.best - a.best);
  return scored.slice(0, limit).map((x) => x.id);
}
