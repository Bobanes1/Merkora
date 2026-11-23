/**
 * How long AI requests usually take – measured on this device – so a wait shows honest progress:
 * steps that fit the request, a bar that follows the usual duration, and a calm note when it takes longer.
 * The answer comes in one piece (no streaming), so the progress is an estimate from earlier runs.
 * The pure parts are tested in scripts/test-srs.mts.
 */
export type AiKind = 'lesson' | 'test' | 'review' | 'questions' | 'proposal' | 'placement' | 'mini' | 'project' | 'sheet' | 'check' | 'next';

/** Rough times (s) until there are own measurements. */
const DEFAULT_SECONDS: Record<AiKind, number> = { lesson: 45, test: 40, review: 30, questions: 12, proposal: 25, placement: 25, mini: 15, project: 25, sheet: 25, check: 20, next: 10 };

/** What Pip does meanwhile – one line per step, shown one after another. */
export const AI_STEPS: Record<AiKind, string[]> = {
  lesson: ['Thema einordnen', 'Erklärung in Häppchen schreiben', 'Beispiel durchrechnen', 'Aufgaben erstellen', 'Alles zusammensetzen'],
  test: ['Lektionen der Stufe durchgehen', 'Aufgaben quer durch die Stufe erstellen', 'Schwierigkeit abstimmen'],
  review: ['Gelerntes sammeln', 'Aufgaben mischen', 'Schwierigkeit abstimmen'],
  questions: ['Dein Ziel verstehen', 'Passende Fragen formulieren'],
  proposal: ['Antworten auswerten', 'Stufen festlegen', 'Lektionen planen'],
  placement: ['Niveaustufen anschauen', 'Aufgaben von leicht bis schwer erstellen'],
  mini: ['Thema eingrenzen', 'Drei kurze Lektionen planen'],
  project: ['Stufe überblicken', 'Projektidee ausarbeiten', 'Bewertung festlegen'],
  sheet: ['Stufe durchgehen', 'Das Wichtigste verdichten'],
  check: ['Lösungen nachrechnen', 'Angaben prüfen'],
  next: ['Passende Anschluss-Skills suchen'],
};

/** Which kind of request a task key of skillRun is (id:questions, id:test:x, id:lessonId …). Pure – tested. */
export function kindOfKey(key: string): AiKind {
  const part = key.split(':')[1] ?? '';
  if (['questions', 'placement', 'proposal', 'mini', 'review', 'project', 'sheet', 'check', 'next', 'test'].includes(part)) return part as AiKind;
  if (part === 'revise') return 'proposal';
  return 'lesson';
}

const STORE = 'merkora.aiTimes';
function load(): Partial<Record<AiKind, number[]>> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

/** Remembers how long a request took (the last 8 per kind). */
export function recordAiTime(kind: AiKind, ms: number) {
  if (!(ms > 500 && ms < 15 * 60_000)) return;
  try {
    const all = load();
    all[kind] = [...(all[kind] ?? []), Math.round(ms / 100) / 10].slice(-8);
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* only an estimate then */
  }
}

/** The usual duration (s): the median of the own measurements, else a rough default. Pure apart from the stored times. */
export function typicalAiSeconds(kind: AiKind, times = load()[kind] ?? []): number {
  if (times.length < 2) return DEFAULT_SECONDS[kind];
  const t = [...times].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return Math.max(3, t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2);
}

/**
 * Share of the bar (0–0.95): fast at first, slower towards the end – at the usual duration about 70 %,
 * at twice that about 90 %; it never claims to be done before the answer is there. Pure – tested.
 */
export function aiProgress(elapsedS: number, typicalS: number): number {
  return Math.min(0.95, 1 - Math.exp((-1.2 * Math.max(0, elapsedS)) / Math.max(1, typicalS)));
}

/** The step that is running at this share (the last step stays until the answer is there). Pure – tested. */
export const aiStep = (share: number, steps: number) => Math.max(0, Math.min(steps - 1, Math.floor((share / 0.95) * steps)));
