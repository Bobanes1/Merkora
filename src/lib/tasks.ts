/**
 * Active task types for practice sets and skills: put in order, sort into groups, fill gaps, several right
 * answers, case studies (graded by the AI with a scheme) and music tasks. Merkora checks all of them itself
 * except free text. Pure – tested in scripts/test-srs.mts.
 */
import type { MusicSpec } from './music';
import { parseMusic } from './music';

export type OrderTask = { type: 'order'; prompt: string; items: string[]; hints: string[]; explain?: string };
export type ClassifyTask = { type: 'classify'; prompt: string; groups: string[]; items: { text: string; group: number }[]; hints: string[]; explain?: string };
export type ClozeTask = { type: 'cloze'; prompt: string; text: string; gaps: string[][]; hints: string[]; explain?: string };
export type MultiTask = { type: 'multi'; prompt: string; options: string[]; correct: number[]; hints: string[]; explain?: string };
export type CaseTask = { type: 'case'; facts: string; question: string; rubric: { criterion: string; points: number }[]; solution: string; hints: string[] };
export type MusicTask = { type: 'music'; prompt: string; music: MusicSpec; hints: string[]; explain?: string };
export type ActiveTask = OrderTask | ClassifyTask | ClozeTask | MultiTask | CaseTask | MusicTask;

const s = (v: unknown, max = 4000) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const arr = (v: unknown, max = 12, len = 2000) => (Array.isArray(v) ? v : []).map((x) => s(x, len)).filter(Boolean).slice(0, max);

/** One active task from the AI's JSON; null if it is not usable. */
export function parseActive(raw: unknown): ActiveTask | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const hints = arr(r.hints, 5);
  const explain = s(r.explain ?? r.explanation, 2000) || undefined;
  const prompt = s(r.prompt ?? r.problem ?? r.task, 3000);
  switch (String(r.type ?? '').toLowerCase()) {
    case 'order': {
      const items = arr(r.items ?? r.steps, 10, 300);
      return items.length >= 3 && new Set(items).size === items.length ? { type: 'order', prompt: prompt || 'Bringe in die richtige Reihenfolge.', items, hints, explain } : null;
    }
    case 'classify': {
      const groups = arr(r.groups, 5, 80);
      const items = (Array.isArray(r.items) ? r.items : [])
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          const g = typeof o.group === 'number' ? o.group : groups.findIndex((x) => x.toLowerCase() === s(o.group).toLowerCase());
          return { text: s(o.text ?? o.item, 300), group: g };
        })
        .filter((it) => it.text && it.group >= 0 && it.group < groups.length)
        .slice(0, 12);
      return groups.length >= 2 && items.length >= 3 ? { type: 'classify', prompt: prompt || 'Ordne zu.', groups, items, hints, explain } : null;
    }
    case 'cloze': {
      const text = s(r.text, 4000);
      const gaps = (Array.isArray(r.gaps) ? r.gaps : []).map((g) => (Array.isArray(g) ? arr(g, 6, 120) : arr([g], 1, 120))).filter((g) => g.length);
      const marks = (text.match(/\{\{\d+\}\}/g) ?? []).length;
      return text && gaps.length && marks === gaps.length ? { type: 'cloze', prompt: prompt || 'Fülle die Lücken.', text, gaps, hints, explain } : null;
    }
    case 'multi': {
      const options = arr(r.options, 8, 300);
      const correct = (Array.isArray(r.correct) ? r.correct : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < options.length);
      return options.length >= 3 && correct.length ? { type: 'multi', prompt, options, correct: [...new Set(correct)].sort((a, b) => a - b), hints, explain } : null;
    }
    case 'case': {
      const facts = s(r.facts ?? r.sachverhalt, 6000);
      const question = s(r.question ?? r.task, 1500);
      const rubric = (Array.isArray(r.rubric) ? r.rubric : [])
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          const points = Math.round(Number(o.points ?? 1));
          return { criterion: s(o.criterion ?? o.name ?? c, 400), points: Number.isFinite(points) && points > 0 ? Math.min(points, 20) : 1 };
        })
        .filter((c) => c.criterion)
        .slice(0, 10);
      return facts && question && rubric.length >= 2 ? { type: 'case', facts, question, rubric, solution: s(r.solution, 8000), hints } : null;
    }
    case 'music': {
      const music = parseMusic(r.music ?? r);
      return music ? { type: 'music', prompt: prompt || '', music, hints, explain } : null;
    }
  }
  return null;
}

// ---------- checking ----------
/** Words of an answer, lower case, without punctuation (for tolerant comparison). */
export const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Is the order right? Returns per position whether it is in place. */
export function checkOrder(task: OrderTask, given: string[]) {
  const places = given.map((t, i) => t === task.items[i]);
  return { right: places.every(Boolean) && given.length === task.items.length, places };
}

/** Classification: per item whether the chosen group (index; -1 = none) is right. */
export function checkClassify(task: ClassifyTask, chosen: number[]) {
  const items = task.items.map((it, i) => chosen[i] === it.group);
  return { right: items.every(Boolean), items };
}

/** One gap: right if it matches one of the allowed answers (tolerant: case, ß/ss, punctuation, small typo in long words). */
export function gapRight(allowed: string[], given: string): boolean {
  const g = norm(given);
  if (!g) return false;
  return allowed.some((a) => {
    const w = norm(a);
    if (w === g) return true;
    // one typo is fine in words of 6+ letters
    return w.length >= 6 && Math.abs(w.length - g.length) <= 1 && editDistance(w, g) <= 1;
  });
}
export function checkCloze(task: ClozeTask, given: string[]) {
  const gaps = task.gaps.map((allowed, i) => gapRight(allowed, given[i] ?? ''));
  return { right: gaps.every(Boolean), gaps };
}

export function checkMulti(task: MultiTask, chosen: number[]) {
  const set = new Set(chosen);
  return { right: set.size === task.correct.length && task.correct.every((i) => set.has(i)) };
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** The parts of a cloze text: plain text and gap numbers ("Ein {{1}} ist …" → ["Ein ", 0, " ist …"]). */
export function clozeParts(text: string): (string | number)[] {
  return text.split(/\{\{(\d+)\}\}/).map((p, i) => (i % 2 ? Number(p) - 1 : p));
}

/** A random order that is not already the right one (stable for one seed). */
export function shuffled<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let x = seed || 1;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.length > 1 && a.every((v, i) => v === items[i])) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

// ---------- case studies: grading by the AI ----------
export type CaseGrade = { criteria: { criterion: string; points: number; max: number; feedback: string }[]; total: number; max: number; summary: string };

/** The AI's grading, checked against the scheme (points never above the maximum). */
export function parseCaseGrade(task: CaseTask, raw: unknown): CaseGrade {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.criteria) ? (r.criteria as Record<string, unknown>[]) : [];
  const criteria = task.rubric.map((c, i) => {
    const g = list[i] ?? {};
    const p = Number(g.points);
    return { criterion: c.criterion, max: c.points, points: Number.isFinite(p) ? Math.max(0, Math.min(c.points, Math.round(p * 2) / 2)) : 0, feedback: s(g.feedback, 800) };
  });
  const total = criteria.reduce((n, c) => n + c.points, 0);
  const max = criteria.reduce((n, c) => n + c.max, 0);
  return { criteria, total, max, summary: s(r.summary, 1200) };
}

/** The instruction for grading a case solution. */
export function caseGradePrompt(task: CaseTask, answer: string, lang: string) {
  return {
    system: `Du bewertest die Lösung eines Lernenden zu einer Fallaufgabe fair, genau und ermutigend. ${lang}
Bewerte jedes Kriterium des Bewertungsschemas einzeln (halbe Punkte erlaubt). "feedback": 1–2 Sätze, was erfüllt ist oder fehlt. "summary": 2–3 Sätze Gesamteindruck mit dem wichtigsten nächsten Schritt.
Format: {"criteria":[{"points":2,"feedback":"…"}],"summary":"…"} – genau so viele Einträge wie Kriterien, in derselben Reihenfolge.`,
    user: `SACHVERHALT:\n${task.facts}\n\nAUFGABE:\n${task.question}\n\nBEWERTUNGSSCHEMA:\n${task.rubric.map((c, i) => `${i + 1}. ${c.criterion} (max. ${c.points} P.)`).join('\n')}\n\nMUSTERLÖSUNG (nur für dich):\n${task.solution}\n\nLÖSUNG DES LERNENDEN:\n${answer || '(leer)'}`,
  };
}
