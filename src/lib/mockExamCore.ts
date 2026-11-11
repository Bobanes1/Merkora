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
        question: String(q.question).trim(),
        ...(type === 'mc'
          ? { options: q.options!.map(String), answer: Math.max(0, Math.min(q.options!.length - 1, Number(q.answer) || 0)) }
          : {}),
        points,
        solution: String(q.solution ?? '').trim(),
        criteria: String(q.criteria ?? '').trim(),
      };
    });
  if (questions.length < 3) throw new Error('Die KI hat keine vollständige Prüfung geliefert. Bitte versuche es noch einmal.');
  return { title: String(raw.title || 'Probeprüfung').trim(), instructions: String(raw.instructions || '').trim(), questions };
}

