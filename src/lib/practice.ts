/**
 * Practice sets („Aufgaben“): math tasks with hints and solution steps, Java programming tasks with tests,
 * and interactive labs. The AI describes them as JSON; Merkora checks numbers and formulas itself.
 * Pure – tested in scripts/test-srs.mts.
 */
import { compileExpr } from './plotExpr';
import { DIAGRAM_RULE, parseDiagram, type Diagram } from './diagram';
import { ACTIVE_TYPES, gapRight, niceStep, parseActive, type ActiveTask } from './tasks';
import { LANG_RULE, type Prompt } from './ai';
import { parseFormulaLab, parseProgram, parseScore, parseSketch, parseSyntax, parseTables, type FormulaLab, type Program, type Score, type Sentence, type Sketch, type Table } from './visuals';
import { FORMULA_RULE } from './ai';

export type AnswerSpec = { type: 'number' | 'fraction' | 'expr' | 'choice' | 'text'; value: string; tolerance?: number; options?: string[] };
export type MathProblem = { problem: string; answer: AnswerSpec; hints: string[]; steps: string[] };
export type JavaTest = { call: string; expected: string };
/** Languages of code tasks: Java (local JDK or online), JavaScript, Python (in the browser) and SQL (sample database). */
export type CodeLang = 'java' | 'javascript' | 'python' | 'sql';
export const CODE_LANG_LABEL: Record<CodeLang, string> = { java: 'Java', javascript: 'JavaScript', python: 'Python', sql: 'SQL' };
export type JavaProblem = { title: string; task: string; starter: string; tests: JavaTest[]; hints: string[]; solution: string; lang?: CodeLang; schema?: string };
export const toLang = (v: unknown): CodeLang => {
  const k = String(v ?? '').toLowerCase();
  return /^(js|javascript|node)/.test(k) ? 'javascript' : /^(py|python)/.test(k) ? 'python' : /^sql/.test(k) ? 'sql' : 'java';
};

export type LabSpec =
  | { type: 'coin'; p: number; ask?: string }
  | { type: 'dice'; dice: number; ask?: string }
  | { type: 'binomial'; n: number; p: number; ask?: string }
  | { type: 'normal'; mu: number; sigma: number; a: number; b: number; ask?: string }
  | { type: 'tree'; pA: number; pBA: number; pBnA: number; a?: string; b?: string; ask?: string }
  | { type: 'bayes'; prevalence: number; sensitivity: number; specificity: number; ask?: string }
  | { type: 'urn'; N: number; K: number; n: number; ask?: string }
  | { type: 'function'; expr: string; params: Record<string, number>; min: number; max: number; ask?: string }
  | { type: 'vectors'; matrix: [[number, number], [number, number]]; ask?: string }
  | FormulaLab;

export type ProblemProgress = {
  solved?: boolean;
  tries: number;
  hints: number;
  shown?: boolean;
  /** The last wrong answer as text (for „Warum falsch?“). */
  last?: string;
  /** Pip's explanation of that mistake (made once, kept). */
  mistake?: string;
  /** „Weiß nicht“ was pressed: the solution was shown and Pip explained the way. */
  dunno?: boolean;
  /** A follow-up task Pip added after a mistake (it gets no further follow-up of its own). Extra tasks never count against mastery. */
  extra?: boolean;
  /** A bonus task, one level harder (offered when it goes very well). */
  bonus?: boolean;
  /** Pip's counter-check found a mistake in this task and corrected it before it was solved. */
  fixed?: boolean;
  /** A role play: the conversation so far. */
  chat?: { me: boolean; text: string }[];
};

export type BiteChoice = { type?: 'choice'; q: string; options: string[]; correct: number; why?: string };
export type BiteTf = { type: 'tf'; statement: string; answer: boolean; why?: string };
export type BiteGap = { type: 'gap'; prompt: string; answer: string[]; placeholder?: string; why?: string };
export type BiteReveal = { type: 'reveal'; q: string; answer: string; why?: string };
export type BiteEstimate = { type: 'estimate'; q: string; min: number; max: number; step: number; unit: string; answer: number; tolerance: number; why?: string };
export type BiteCheck = BiteChoice | BiteTf | BiteGap | BiteReveal | BiteEstimate;

/** One bite of an explanation: a short text, maybe a picture (index in figures) and a quick interactive check. */
export type Bite = { title: string; text: string; figure?: number; check?: BiteCheck };

/** Lesson flow style: classic (bites → example → practice), discovery (try hook first → bites → practice), or sprint (brief overview → practice). */
export type LessonStyle = 'classic' | 'discovery' | 'sprint';

export type PracticeSet = {
  id: string;
  createdAt: number;
  kind: Domain;
  topic: string;
  intro: string;
  example?: { problem: string; steps: string[]; answer?: string; code?: string };
  /** Pictures for the explanation (Merkora draws them from a description, like card graphics). */
  figures?: { diagram: Diagram; caption?: string; narration?: string[] }[];
  /** Music: a sheet of music to look at and listen to. */
  score?: Score;
  /** Programming: a small example program to run and to follow step by step. */
  program?: Program;
  /** Law: who is who and who wants what from whom. */
  sketch?: Sketch;
  /** Languages: sentences with coloured parts, and tables (endings highlighted). */
  syntax?: Sentence[];
  tables?: Table[];
  /** The explanation in small bites, each with an optional quick check (skill lessons). */
  bites?: Bite[];
  /** Lesson flow style for guided skill lessons (default: classic). */
  style?: LessonStyle;
  /** Opening try-it-first hook for `discovery` lessons (a short intuition check before the explanation). */
  hook?: Bite;
  /** Where a guided lesson stands: try-first hook, understanding (bites), the example, or practising; and the bite last seen. */
  phase?: 'try' | 'learn' | 'example' | 'practice';
  /** The bonus task was offered already (once per set). */
  bonusAsked?: boolean;
  /** The counter-check ran: when, and how many tasks it corrected or removed. */
  checked?: { at: number; fixed: number; dropped: number };
  bite?: number;
  /** „Grundlagen“ before the explanation: what it is about, a picture in the head, the key terms (Markdown). */
  theory?: string;
  /** The explanation once more, even simpler („Einfacher erklären“). */
  simple?: { intro: string; example?: { problem: string; steps: string[]; answer?: string } };
  /** All tasks (new sets). */
  tasks?: Task[];
  /** Only in sets from v0.9.5 (see taskList). */
  math?: MathProblem[];
  java?: JavaProblem[];
  labs: LabSpec[];
  progress: ProblemProgress[];
};

// ---------- reading what the AI wrote ----------
const s = (v: unknown, max = 4000) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const arr = (v: unknown, max = 12) => (Array.isArray(v) ? v : []).map((x) => s(x, 2000)).filter(Boolean).slice(0, max);
const num = (v: unknown, d: number) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : d;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const LAB_TYPES = ['coin', 'dice', 'binomial', 'normal', 'tree', 'bayes', 'urn', 'function', 'vectors'] as const;

/** One lab, with safe values (missing or odd numbers get sensible defaults). Null for unknown types. */
export function parseLab(raw: unknown): LabSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ask = s(r.ask, 300) || undefined;
  const p01 = (v: unknown, d: number) => clamp(num(v, d), 0, 1);
  switch (String(r.type ?? '').toLowerCase()) {
    case 'coin':
    case 'muenze':
      return { type: 'coin', p: p01(r.p, 0.5), ask };
    case 'dice':
    case 'wuerfel':
      return { type: 'dice', dice: Math.round(clamp(num(r.dice, 2), 1, 4)), ask };
    case 'binomial':
      return { type: 'binomial', n: Math.round(clamp(num(r.n, 10), 1, 100)), p: p01(r.p, 0.5), ask };
    case 'normal': {
      const mu = num(r.mu, 0), sigma = clamp(num(r.sigma, 1), 0.01, 1e6);
      return { type: 'normal', mu, sigma, a: num(r.a, mu - sigma), b: num(r.b, mu + sigma), ask };
    }
    case 'tree':
      return { type: 'tree', pA: p01(r.pA, 0.5), pBA: p01(r.pBA, 0.5), pBnA: p01(r.pBnA, 0.5), a: s(r.a, 30) || undefined, b: s(r.b, 30) || undefined, ask };
    case 'bayes':
      return { type: 'bayes', prevalence: p01(r.prevalence, 0.01), sensitivity: p01(r.sensitivity, 0.9), specificity: p01(r.specificity, 0.9), ask };
    case 'urn': {
      const N = Math.round(clamp(num(r.N, 10), 2, 200));
      return { type: 'urn', N, K: Math.round(clamp(num(r.K, 3), 1, N - 1)), n: Math.round(clamp(num(r.n, 3), 1, N)), ask };
    }
    case 'function': {
      const params: Record<string, number> = {};
      const given = (r.params ?? {}) as Record<string, unknown>;
      const expr = s(r.expr, 120);
      // every parameter used in the formula gets a slider (missing start values: 1)
      for (const k of ['a', 'b', 'c']) if (k in given || new RegExp(`\\b${k}\\b`).test(expr)) params[k] = num(given[k], 1);
      if (!expr || !compileExpr(withParams(expr, params))) return null;
      const min = num(r.min, -5), max = num(r.max, 5);
      return { type: 'function', expr, params, min: Math.min(min, max - 0.1), max: Math.max(max, min + 0.1), ask };
    }
    case 'formula':
      return parseFormulaLab(r);
    case 'vectors': {
      const m = Array.isArray(r.matrix) ? (r.matrix as unknown[][]) : [];
      const v = (i: number, j: number, d: number) => num(m[i]?.[j], d);
      return { type: 'vectors', matrix: [[v(0, 0, 1), v(0, 1, 0)], [v(1, 0, 0), v(1, 1, 1)]], ask };
    }
  }
  return null;
}

/** A formula with parameters a, b, c filled in ("a*x^2+b" → "(2)*x^2+(1)"). */
export function withParams(expr: string, params: Record<string, number>): string {
  return expr.replace(/\b([abc])\b/g, (m, k: string) => (k in params ? `(${params[k]})` : m));
}

function parseAnswer(raw: unknown): AnswerSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const value = s(r.value, 500);
  const type = String(r.type ?? '').toLowerCase();
  if (!value) return null;
  if (type === 'choice') {
    const options = arr(r.options, 6);
    return options.length >= 2 ? { type: 'choice', value, options } : null;
  }
  if (type === 'expr') return compileExpr(value) ? { type: 'expr', value } : { type: 'text', value };
  if (type === 'number' || type === 'fraction') {
    if (parseNumber(value) === null) return { type: 'text', value };
    const tol = num(r.tolerance, NaN);
    return { type: type as 'number' | 'fraction', value, ...(Number.isFinite(tol) && tol > 0 ? { tolerance: tol } : {}) };
  }
  return { type: 'text', value };
}

/** Subjects of practice sets and skills. */
export type Domain = 'math' | 'java' | 'law' | 'music' | 'language' | 'general';
export const DOMAIN_LABEL: Record<Domain, string> = { math: 'Mathe', java: 'Programmieren', law: 'Recht', music: 'Musik', language: 'Sprache', general: 'Allgemein' };
export const toDomain = (v: unknown): Domain => {
  const k = String(v ?? '').toLowerCase();
  if (/java|program|code|informatik/.test(k)) return 'java';
  if (/law|recht|jura/.test(k)) return 'law';
  if (/music|musik/.test(k)) return 'music';
  if (/lang|sprach/.test(k)) return 'language';
  if (/math|stoch|statist|analys|algebra/.test(k)) return 'math';
  return k === 'general' || k === 'allgemein' ? 'general' : 'general';
};

/** One task of a set: calculate/answer, write code, or one of the active types (lib/tasks.ts). */
export type Task = (({ type: 'calc' } & MathProblem) | ({ type: 'code' } & JavaProblem) | ActiveTask) & {
  /** How hard: 1 = leicht, 2 = mittel, 3 = schwer (from the AI; the order adapts to it). */
  level?: number;
};

/** All tasks of a set (sets from v0.9.5 kept math/java lists). */
export function taskList(p: PracticeSet): Task[] {
  if (p.tasks) return p.tasks;
  return [...(p.math ?? []).map((m) => ({ type: 'calc' as const, ...m })), ...(p.java ?? []).map((j) => ({ type: 'code' as const, ...j }))];
}

function parseCode(o: Record<string, unknown>): ({ type: 'code' } & JavaProblem) | null {
  const tests = (Array.isArray(o.tests) ? o.tests : [])
    .map((t) => ({ call: s((t as Record<string, unknown>)?.call, 400), expected: s((t as Record<string, unknown>)?.expected, 400) }))
    .filter((t) => t.call && t.expected !== '')
    .slice(0, 8);
  const lang = toLang(o.lang ?? o.language);
  const p = {
    type: 'code' as const,
    title: s(o.title, 80),
    task: s(o.task ?? o.prompt),
    starter: s(o.starter, 6000) || (lang === 'sql' ? 'SELECT ' : ''),
    tests,
    hints: arr(o.hints, 5),
    solution: s(o.solution, 8000),
    ...(lang !== 'java' ? { lang } : {}),
    ...(lang === 'sql' ? { schema: s(o.schema, 8000) } : {}),
  };
  // SQL is checked against the sample solution on a sample database, the others with test calls
  if (lang === 'sql') return p.task && p.schema && p.solution ? p : null;
  return p.task && p.starter && p.tests.length ? p : null;
}

/** One task of any type from the AI's JSON. */
export function parseTask(raw: unknown): Task | null {
  const t = parseTaskOnly(raw);
  const lv = Number((raw as { level?: unknown } | null)?.level);
  return t && Number.isInteger(lv) && lv >= 1 && lv <= 3 ? { ...t, level: lv } : t;
}
function parseTaskOnly(raw: unknown): Task | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const type = String(o.type ?? '').toLowerCase();
  if (ACTIVE_TYPES.includes(type)) return parseActive(o);
  if (type === 'code' || (o.starter && o.tests) || (o.schema && o.solution)) return parseCode(o);
  const answer = parseAnswer(o.answer);
  const problem = s(o.problem ?? o.prompt ?? o.question);
  return problem && answer ? { type: 'calc', problem, answer, hints: arr(o.hints, 5), steps: arr(o.steps, 12) } : null;
}

/** Reads a practice set. Tasks that are not usable are left out. */
export function parsePractice(json: unknown, id: string, now: number): PracticeSet | null {
  const r = (json ?? {}) as Record<string, unknown>;
  const kind = toDomain(r.kind ?? r.domain);
  const ex = (r.example ?? null) as Record<string, unknown> | null;
  const example = ex ? { problem: s(ex.problem), steps: arr(ex.steps ?? ex.explain, 10), answer: s(ex.answer) || undefined, code: s(ex.code, 6000) || undefined } : undefined;
  const labs = (Array.isArray(r.labs) ? r.labs : []).map(parseLab).filter((l): l is LabSpec => !!l).slice(0, 4);
  const tasks = (Array.isArray(r.problems ?? r.tasks) ? ((r.problems ?? r.tasks) as unknown[]) : []).map(parseTask).filter((t): t is Task => !!t).slice(0, 15);
  if (!tasks.length) return null;
  const score = parseScore(r.score);
  const program = parseProgram(r.program);
  const sketch = parseSketch(r.sketch);
  const syntax = parseSyntax(r.syntax);
  const tables = parseTables(r.tables);
  const figures = parseFigures(r.figures);
  const bites = parseBites(r.bites, figures.length);
  const style: LessonStyle | undefined = r.style === 'discovery' || r.style === 'sprint' || r.style === 'classic' ? r.style : undefined;
  const hook = parseHook(r.hook, figures.length);
  const visuals = { ...(score ? { score } : {}), ...(program ? { program } : {}), ...(sketch ? { sketch } : {}), ...(syntax.length ? { syntax } : {}), ...(tables.length ? { tables } : {}) };
  return {
    id,
    createdAt: now,
    kind,
    topic: s(r.topic, 80) || 'Übung',
    intro: s(r.intro, 3000),
    ...visuals,
    ...(s(r.theory, 8000) ? { theory: s(r.theory, 8000) } : {}),
    ...(figures.length ? { figures } : {}),
    ...(bites.length ? { bites } : {}),
    ...(style ? { style } : {}),
    ...(hook ? { hook } : {}),
    ...(example?.problem ? { example } : {}),
    labs,
    tasks,
    progress: tasks.map(() => ({ tries: 0, hints: 0 })),
  };
}

/** One quick check on a bite (choice, true/false, gap, reveal, or estimate). Pure – tested. */
export function parseBiteCheck(raw: unknown): BiteCheck | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const type = String(c.type ?? '').toLowerCase();
  const why = s(c.why, 500);
  if (type === 'tf' || type === 'truefalse' || type === 'bool') {
    const statement = s(c.statement ?? c.q ?? c.question, 400);
    let answer: boolean | null = null;
    if (typeof c.answer === 'boolean') answer = c.answer;
    else if (typeof c.answer === 'string') {
      if (/^(true|wahr|stimmt|richtig|ja)$/i.test(c.answer.trim())) answer = true;
      else if (/^(false|falsch|irrtum|nein)$/i.test(c.answer.trim())) answer = false;
    }
    return statement && answer !== null ? { type: 'tf', statement, answer, ...(why ? { why } : {}) } : undefined;
  }
  if (type === 'gap' || type === 'cloze' || type === 'fill') {
    const prompt = s(c.prompt ?? c.q ?? c.question ?? c.text, 400);
    const answer = (Array.isArray(c.answer) ? arr(c.answer, 6) : arr([c.answer], 1)).map((x) => x.slice(0, 120));
    const placeholder = s(c.placeholder, 60);
    return prompt && answer.length ? { type: 'gap', prompt, answer, ...(placeholder ? { placeholder } : {}), ...(why ? { why } : {}) } : undefined;
  }
  if (type === 'reveal' || type === 'think' || type === 'flash') {
    const q = s(c.q ?? c.question ?? c.prompt, 400);
    const answer = s(c.answer ?? c.a ?? c.solution, 600);
    return q && answer ? { type: 'reveal', q, answer, ...(why ? { why } : {}) } : undefined;
  }
  if (type === 'estimate') {
    const q = s(c.q ?? c.question ?? c.prompt, 400);
    const lo = num(c.min, NaN), hi = num(c.max, NaN), answer = num(c.answer, NaN);
    if (!q || ![lo, hi, answer].every(Number.isFinite) || lo >= hi || answer < lo || answer > hi) return undefined;
    const span = hi - lo;
    const stepRaw = num(c.step, NaN);
    const tolRaw = num(c.tolerance, NaN);
    return {
      type: 'estimate',
      q,
      min: lo,
      max: hi,
      step: Number.isFinite(stepRaw) && stepRaw > 0 && stepRaw <= span / 4 ? stepRaw : niceStep(span),
      unit: s(c.unit, 20),
      answer,
      tolerance: Number.isFinite(tolRaw) && tolRaw > 0 ? Math.min(tolRaw, span / 4) : span / 15,
      ...(why ? { why } : {}),
    };
  }
  const options = arr(c.options, 4).map((o) => o.slice(0, 240));
  const q = s(c.q ?? c.question, 400);
  let correct = Number(c.correct);
  if (!Number.isInteger(correct) && typeof c.correct === 'string') correct = options.indexOf(c.correct.trim());
  return q && options.length >= 2 && Number.isInteger(correct) && correct >= 0 && correct < options.length
    ? { q, options, correct, ...(why ? { why } : {}) }
    : undefined;
}

/** Opening try-it-first hook for `discovery` lessons: requires a valid interactive check. */
function parseHook(raw: unknown, figures: number): Bite | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const check = parseBiteCheck(r.check ?? r);
  if (!check) return undefined;
  const text = s(r.text ?? r.body, 1500);
  const fig = r.figure === undefined || r.figure === null || r.figure === '' ? NaN : Number(r.figure);
  return { title: s(r.title, 90) || 'Erst mal schätzen & probieren', text, ...(Number.isInteger(fig) && fig >= 0 && fig < figures ? { figure: fig } : {}), check };
}

/** The bites of an explanation, with safe values: valid checks (choice, tf, gap, reveal, estimate), a picture only if it exists. Pure – tested. */
export function parseBites(raw: unknown, figures: number): Bite[] {
  if (!Array.isArray(raw)) return [];
  const out: Bite[] = [];
  for (const b of raw) {
    const r = (b ?? {}) as Record<string, unknown>;
    const text = s(r.text ?? r.body, 1500);
    if (!text) continue;
    const fig = r.figure === undefined || r.figure === null || r.figure === '' ? NaN : Number(r.figure);
    const check = parseBiteCheck(r.check);
    out.push({ title: s(r.title, 90), text, ...(Number.isInteger(fig) && fig >= 0 && fig < figures ? { figure: fig } : {}), ...(check ? { check } : {}) });
    if (out.length >= 6) break;
  }
  return out;
}

const normGap = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');

/** Checks a bite gap answer: normalized text match against any allowed answer, or numeric equality. Pure – tested. */
export function checkBiteGap(check: BiteGap, input: string): boolean {
  const given = normGap(input);
  if (!given) return false;
  // tolerant like the cloze gaps: ß/ss, ä/ae, singular/plural, a small typo
  if (gapRight(check.answer, input)) return true;
  for (const ans of check.answer) {
    if (normGap(ans) === given) return true;
    const wantNum = parseNumber(ans);
    const gotNum = parseNumber(input);
    if (wantNum !== null && gotNum !== null) {
      const tol = tolFor({ type: 'number', value: ans }, wantNum);
      if (Math.abs(gotNum - wantNum) <= tol) return true;
    }
  }
  return false;
}

/** The bites to show: the set's own, or – for older lessons – the „Grundlagen“ split at their headings, then the short explanation. Pure – tested. */
export function bitesFrom(set: Pick<PracticeSet, 'bites' | 'theory' | 'intro'>): Bite[] {
  if (set.bites?.length) return set.bites;
  const out: { title: string; lines: string[] }[] = [];
  for (const line of (set.theory ?? '').split('\n')) {
    const h = /^#{1,4}\s+(.*)$/.exec(line.trim());
    if (h) out.push({ title: h[1].trim(), lines: [] });
    else if (out.length) out[out.length - 1].lines.push(line);
    else out.push({ title: '', lines: [line] });
  }
  const bites: Bite[] = out.map((b) => ({ title: b.title, text: b.lines.join('\n').trim() })).filter((b) => b.text);
  if (set.intro?.trim()) bites.push({ title: bites.length ? 'Kurz gesagt' : '', text: set.intro.trim() });
  return bites;
}

// ---------- checking answers ----------
/** "0,2668", "26,68 %", "3/8", "-1.5e-3", "≈ 0,27" → number; null if it is no number. */
export function parseNumber(input: string): number | null {
  let t = input.trim().replace(/^[≈~=]\s*/, '').replace(/\s+/g, '').replace(/−/g, '-');
  const percent = t.endsWith('%');
  if (percent) t = t.slice(0, -1);
  // both separators: the last one is the decimal point ("1.234,5" / "1,234.5"); the same one several times:
  // thousands ("1.234.567"); a single separator is always the decimal point ("0,375", "2.5")
  const dots = (t.match(/\./g) ?? []).length, commas = (t.match(/,/g) ?? []).length;
  if (dots && commas) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (dots > 1) t = t.replace(/\./g, '');
  else if (commas > 1) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  let v: number;
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(t);
  if (frac) v = Number(frac[1]) / Number(frac[2]);
  else if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)) v = Number(t);
  else return null;
  if (!Number.isFinite(v)) return null;
  return percent ? v / 100 : v;
}

/** Do two formulas in x give the same values? (12 points; both must be valid at enough of them.) */
export function sameFormula(a: string, b: string): boolean {
  const f = compileExpr(a), g = compileExpr(b);
  if (!f || !g) return false;
  let checked = 0;
  for (let i = 0; i < 12; i++) {
    const x = -3.7 + i * 0.71;
    const u = f(x), v = g(x);
    if (!Number.isFinite(u) && !Number.isFinite(v)) continue;
    if (!Number.isFinite(u) || !Number.isFinite(v)) return false;
    if (Math.abs(u - v) > 1e-6 * Math.max(1, Math.abs(u), Math.abs(v))) return false;
    checked++;
  }
  return checked >= 6;
}

export type Check = 'right' | 'wrong' | 'invalid' | 'ai';

/** Checks an answer without AI where possible ("ai" = free text, the AI decides). */
export function checkAnswer(spec: AnswerSpec, input: string): Check {
  const given = input.trim();
  if (!given) return 'invalid';
  switch (spec.type) {
    case 'number':
    case 'fraction': {
      const want = parseNumber(spec.value);
      const got = parseNumber(given);
      if (want === null) return 'ai';
      if (got === null) return compileExpr(given) ? (Math.abs((compileExpr(given)!(0) ?? NaN) - want) <= tolFor(spec, want) ? 'right' : 'wrong') : 'invalid';
      return Math.abs(got - want) <= tolFor(spec, want) ? 'right' : 'wrong';
    }
    case 'expr':
      return compileExpr(given) ? (sameFormula(spec.value, given) ? 'right' : 'wrong') : 'invalid';
    case 'choice': {
      const idx = spec.options?.findIndex((o) => o.trim().toLowerCase() === given.toLowerCase()) ?? -1;
      const wantIdx = /^\d+$/.test(spec.value) ? Number(spec.value) : spec.options?.findIndex((o) => o.trim().toLowerCase() === spec.value.trim().toLowerCase()) ?? -1;
      const gotIdx = /^\d+$/.test(given) ? Number(given) : idx;
      return gotIdx === wantIdx ? 'right' : 'wrong';
    }
    case 'text':
      return 'ai';
  }
}

/** Allowed difference: the given tolerance, else half a unit of the last digit of the solution (at least 1e-9). */
function tolFor(spec: AnswerSpec, want: number): number {
  if (spec.tolerance) return spec.tolerance;
  // a fraction like 1/3 may be given rounded to 3 places; a whole number must be exact
  if (/\//.test(spec.value)) return 5e-4;
  if (!/[.,]\d/.test(spec.value)) return Math.max(1e-9, Math.abs(want) * 1e-9);
  const digits = (/[.,](\d+)/.exec(spec.value.replace(/\s*%$/, ''))?.[1].length ?? 0) + (/%\s*$/.test(spec.value) ? 2 : 0);
  return Math.max(1e-9, 0.5 * Math.pow(10, -digits), Math.abs(want) * 1e-9);
}

// ---------- asking the AI ----------
export type PracticeKind = 'auto' | Domain;

/** The JSON task types the AI may use – described once, chosen per subject. */
const TASK_TYPES = {
  calc: `{"type":"calc","problem":"…","answer":{"type":"number|fraction|expr|choice|text","value":"…","tolerance":0.001,"options":["…"]},"hints":["…"],"steps":["Lösungsweg"]} – rechnen/antworten; "number" (z. B. "0,2668" oder "26,68 %"), "fraction" ("3/8"), "expr" (Formel in x: + - * / ^ sqrt exp ln sin cos), "choice" (mit "options", value = richtige Option), "text" (frei, nur wenn nötig)`,
  multi: `{"type":"multi","prompt":"…","options":["…","…","…","…"],"correct":[0,2],"explain":"…"} – mehrere richtige Antworten`,
  order: `{"type":"order","prompt":"Bringe … in die richtige Reihenfolge","items":["Schritt 1","Schritt 2","Schritt 3"],"explain":"…"} – items in RICHTIGER Reihenfolge (Merkora mischt sie)`,
  classify: `{"type":"classify","prompt":"Ordne zu","groups":["Kategorie A","Kategorie B","Kategorie C"],"items":[{"text":"…","group":0},{"text":"…","group":1},{"text":"…","group":2}],"explain":"…"} – 2–4 Kategorien (gerne 3–4 statt immer nur 2), 4–10 Elemente`,
  cloze: `{"type":"cloze","prompt":"…","text":"Ein {{1}} ist … und {{2}} …","gaps":[["Antwort","Synonym"],["…"]],"explain":"…"} – Lücken {{1}}, {{2}} … mit erlaubten Antworten. Jede Lücke muss EINDEUTIG sein (der Satz lässt nur diesen Begriff offen); "gaps" enthält je Lücke ALLE richtigen Varianten (Synonyme, Ein-/Mehrzahl, genauere Fachbegriffe, ß/ss) – lieber eine klarere Lücke wählen als eine mehrdeutige`,
  case: `{"type":"case","law":"Schweizer Recht","facts":"Sachverhalt (realistisch, 6–14 Sätze)","question":"Aufgabe (z. B. Hat A gegen B einen Anspruch auf …? Prüfe im Gutachtenstil.)","norms":["Art. 641 ZGB – Eigentum: was der Artikel regelt, in einem Satz"],"rubric":[{"criterion":"Anspruchsgrundlage richtig benannt (Art. …)","points":2},{"criterion":"…","points":3}],"solution":"vollständige Musterlösung"} – Fallaufgabe, die man selbst ausformuliert. Der Sachverhalt enthält ALLE Angaben, die die Lösung braucht (wer, wann, Beträge, was vereinbart oder gesagt wurde, Beziehungen, Reihenfolge) – nichts, was man für die Lösung wissen muss, darf fehlen. Die Frage sagt genau, was zu prüfen ist (welcher Anspruch, wer gegen wen, Umfang). "law" = Rechtsordnung. "norms" = die einschlägigen Normen zum Nachschlagen (2–6, wie ein offenes Gesetzbuch in der Prüfung). Die Musterlösung erfüllt JEDES Kriterium des Schemas ausdrücklich und in dessen Reihenfolge; das Schema verlangt nichts, was nicht in der Musterlösung steht.`,
  code: `{"type":"code","lang":"java|javascript|python|sql","title":"…","task":"…","starter":"…","tests":[{"call":"…","expected":"…"}],"hints":["…"],"solution":"…"} – Programmieren; "lang" passend zum Thema (Standard java). Java: Klasse "Solution" ohne "public", statische Methoden, keine main, starter "class Solution {\\n    static int f(int[] a) {\\n        // dein Code\\n        return 0;\\n    }\\n}", call "Solution.f(new int[]{1,2})", expected wie String.valueOf / Arrays.toString ("[1, 2]"). JavaScript: Funktionen ("function f(a) { … }"), call "f([1,2])", expected wie JSON.stringify, Text ohne Anführungszeichen. Python: Funktionen ("def f(a):\\n    # dein Code\\n    pass"), call "f([1, 2])", expected wie repr() ("[1, 2]", Text ohne Anführungszeichen, True/False). tests 3–6 Aufrufe. SQL: statt tests "schema" (CREATE TABLE … ; INSERT … mit 5–15 Zeilen Beispieldaten, SQLite) und "solution" (die richtige Abfrage), starter "SELECT "; Merkora vergleicht die Ergebniszeilen`,
  music: `{"type":"music","prompt":"…","music":{"mode":"interval-ear","root":"C4","interval":"reine Quinte"}} – modes: "interval-ear" (Intervall hören: Prime … Oktave, z. B. "kleine Terz"), "chord-ear" (Akkord hören, "chord": Dur|Moll|vermindert|übermäßig|Dominantseptakkord|großer Septakkord|Moll-Septakkord|halbvermindert|verminderter Septakkord), "build-chord" (Akkord auf dem Klavier spielen, "root","chord"), "build-scale" (Tonleiter spielen, "scale": Dur|natürliches Moll|harmonisches Moll|melodisches Moll|dorisch|phrygisch|lydisch|mixolydisch|lokrisch|Dur-Pentatonik|Moll-Pentatonik), "name-note" (Note im Notensystem benennen, "note":"Fis4","clef":"treble|bass"), "rhythm" (Rhythmus klopfen, "beats":[1,0.5,0.5,1,1] in Vierteln, "tempo":80), "play-notes" (Noten vom Blatt spielen: "notes":["C4","E4","G4"] 1–6 Noten, "clef":"treble|bass"; Violinschlüssel C4–H5, Bassschlüssel C2–H3, alle innerhalb von zwei Oktaven). Deutsche Notennamen (H, B = H♭, Fis, Es …)`,
  estimate: `{"type":"estimate","prompt":"Schätze …","min":0,"max":100,"answer":37,"tolerance":3,"unit":"%","explain":"…"} – einen Wert per Schieberegler schätzen (Größenordnungen, Wahrscheinlichkeiten, Jahreszahlen); tolerance = Abweichung, die noch als richtig gilt`,
  label: `{"type":"label","prompt":"Beschrifte …","diagram":{"type":"flow","title":"…","steps":["…","…","…"]},"hide":[0,1,2]} – eine Grafik, deren Beschriftungen verdeckt und nummeriert werden; die Person ordnet die Begriffe zu. "hide": Nummern der Beschriftungen in Zeichenreihenfolge (ab 0), 3–5 Stück. Grafik-Formen wie bei "figures"`,
  sheet: `{"type":"sheet","prompt":"…","rows":[["Artikel","Menge","Preis","Summe"],["Äpfel","3","0,50",""],["Brot","1","2,40",""],["","","Gesamt",""]],"expect":{"D2":"=B2*C2","D3":"=B3*C3","D4":"=SUMME(D2:D3)"},"explain":"…"} – kleine Tabelle (höchstens 10 Zeilen × 6 Spalten); die Zellen aus "expect" füllt die Person mit Zahl oder Formel (=, Zellbezüge wie A1, + - * / ^, SUMME, MITTELWERT, MIN, MAX, ANZAHL mit Bereichen A1:A5, Argumente mit ;); Merkora vergleicht die berechneten Werte`,
  scenario: `{"type":"scenario","prompt":"…","start":"a","nodes":[{"id":"a","text":"Ausgangslage …","choices":[{"text":"…","next":"b","score":2,"feedback":"warum gut"},{"text":"…","next":"c","score":0,"feedback":"warum ungünstig"}]},{"id":"b","text":"…","choices":[{"text":"…","next":"ende1","score":2,"feedback":"…"}]},{"id":"ende1","text":"Ausgang …","choices":[]}]} – Entscheidungsgeschichte mit Folgen: 2–4 Entscheidungen tief, 2–3 Möglichkeiten je Knoten, score 0–2 pro Wahl, Enden ohne choices, keine Schleifen; realistisch, mit nachvollziehbarem Feedback`,
  roleplay: `{"type":"roleplay","prompt":"…","scenario":"Situation in 2–4 Sätzen","persona":"wer das Gegenüber ist und wie es sich verhält","goal":"was die Person im Gespräch erreichen soll","opening":"erster Satz des Gegenübers","turns":5,"rubric":[{"criterion":"…","points":2},{"criterion":"…","points":2}],"solution":"kurzes Beispiel für ein gutes Gespräch"} – Rollenspiel-Gespräch (Merkora spielt das Gegenüber), am Ende Bewertung nach Schema; für Gesprächsführung, Verhandeln, Beraten, Fremdsprache`,
};
const LABS_RULE = `"labs" (0–2, nur wenn sie zum Thema passen): {"type":"coin","p":0.5} · {"type":"dice","dice":2} · {"type":"binomial","n":10,"p":0.3} · {"type":"normal","mu":100,"sigma":15,"a":85,"b":115} · {"type":"tree","pA":0.3,"pBA":0.8,"pBnA":0.1,"a":"krank","b":"positiv"} · {"type":"bayes","prevalence":0.01,"sensitivity":0.95,"specificity":0.9} · {"type":"urn","N":10,"K":3,"n":4} · {"type":"function","expr":"a*x^2+b","params":{"a":1,"b":0},"min":-5,"max":5} · {"type":"vectors","matrix":[[1,1],[0,1]]}; jeweils mit "ask": eine Frage zum Ausprobieren.`;

/** Which task types fit which subject (most active ones first; classify last so it is not the default opener). */
export const DOMAIN_TASKS: Record<Domain, (keyof typeof TASK_TYPES)[]> = {
  math: ['calc', 'estimate', 'order', 'sheet', 'label', 'cloze', 'multi', 'classify'],
  java: ['code', 'cloze', 'order', 'calc', 'multi'],
  law: ['case', 'scenario', 'order', 'cloze', 'roleplay', 'multi', 'classify'],
  music: ['music', 'order', 'label', 'cloze', 'calc', 'multi', 'classify'],
  language: ['cloze', 'roleplay', 'scenario', 'order', 'calc', 'multi', 'classify'],
  general: ['scenario', 'order', 'cloze', 'estimate', 'label', 'calc', 'case', 'roleplay', 'sheet', 'multi', 'classify'],
};

/** The task rules for one subject (or all for "auto"). */
export function taskRules(kind: PracticeKind): string {
  const types = kind === 'auto' ? (Object.keys(TASK_TYPES) as (keyof typeof TASK_TYPES)[]) : DOMAIN_TASKS[kind];
  return `Aufgabentypen (mische mindestens 3–4 verschiedene Typen und setze nicht denselben Typ zweimal direkt hintereinander; der Lernende soll SELBST etwas tun – rechnen, schätzen, ordnen, Lücken füllen, entscheiden, beschriften, ausformulieren, spielen, programmieren; keine reinen Wissensfragen):\n${types.map((t) => '- ' + TASK_TYPES[t]).join('\n')}${kind === 'math' || kind === 'auto' ? '\n' + LABS_RULE : ''}`;
}

/** The common frame: explanation, worked example, then tasks that get harder. */
/** How explanations are written: simple, everyday example first, every technical term explained at once. */
export const PLAIN_RULE = `Erklärungen ("intro", "example", "hints") schreibst du EINFACH – so, dass jemand ohne Vorwissen sofort folgen kann:
- Kurze Sätze (höchstens etwa 15 Wörter), ein Gedanke pro Satz, Du-Form.
- Zuerst ein Alltagsbeispiel, dann erst der Fachbegriff. Jeden Fachbegriff sofort in Klammern erklären, z. B. "Erwartungswert (= was im Schnitt herauskommt)".
- Keine Formel ohne einen Satz, der in Worten sagt, was sie bedeutet; Variablen in Worten benennen ("n = Anzahl Versuche").
- "intro": 3–6 kurze Stichpunkte als Markdown-Liste ("- …"), kein langer Fließtext.
- "example.steps": jeder Schritt ein kurzer Satz plus warum ("weil …").
- Lieber zu einfach als zu schwer – die Tiefe kommt durch die Aufgaben.`;

/** Visual explanations per subject (optional fields next to "intro"). */
export const VISUAL_RULES: Record<Domain, string> = {
  music: `Notenblatt: Zeig Musik als Noten – Feld "score":{"clef":"treble|bass","key":"G-Dur","time":"4/4","items":[{"notes":["G4"],"dur":1,"label":"G"},{"notes":["C4","E4","G4"],"dur":2,"label":"C-Dur"}],"caption":"…"} (dur in Vierteln: 0.25, 0.5, 1, 1.5, 2, 3, 4; mehrere notes = Akkord; Violinschlüssel etwa C4–C6, Bassschlüssel etwa C2–E4; deutsche Notennamen). Bei Tonleitern, Akkorden, Intervallen, Rhythmen, Melodien praktisch immer.`,
  java: `Beispielprogramm: Gib der Erklärung ein kleines, vollständiges Programm (5–20 Zeilen), das man ausführen kann – Feld "program":{"lang":"java|javascript|python|sql","code":"…","output":"genaue Ausgabe","trace":[{"line":3,"vars":{"i":"0","summe":"0"},"note":"was in dieser Zeile passiert"}]} (Java: class Main mit main; SQL: zusätzlich "schema"). "trace": 4–12 Schritte durch den Ablauf, line = Zeilennummer ab 1, vars = Werte nach der Zeile.`,
  law: `Fallskizze: Zeig, wer beteiligt ist und wer was von wem will – Feld "sketch":{"parties":[{"id":"k","name":"K","role":"Käufer"},{"id":"v","name":"V","role":"Verkäufer"}],"links":[{"from":"k","to":"v","label":"Kaufvertrag § 433","kind":"vertrag"},{"from":"v","to":"k","label":"Zahlung 300 €?","kind":"anspruch"}],"question":"…"} (kind: vertrag | anspruch | uebereignung | sonstiges; 2–5 Personen). Das Prüfungsschema als "figures" (flow).`,
  language: `Sprache sichtbar machen: Felder "syntax":[{"sentence":"…","parts":[{"text":"Der Hund","role":"subjekt"},{"text":"beißt","role":"praedikat"},{"text":"den Mann","role":"akkobjekt"}],"translation":"…"}] (role: subjekt | praedikat | akkobjekt | datobjekt | adverbial | attribut | konjunktion | sonstiges) und "tables":[{"title":"Präsens von gehen","head":["Person","Form"],"rows":[["ich","geh[[e]]"],["du","geh[[st]]"]]}] – Endungen in [[…]] werden farbig.`,
  math: `Formel-Spielwiese: Wo eine Formel mehrere Größen verbindet, gib in "labs" {"type":"formula","title":"…","expr":"K*(1+p/100)^n","vars":[{"name":"K","label":"Startkapital","min":100,"max":10000,"step":100,"value":1000,"unit":"€"},{"name":"p","label":"Zins","min":0,"max":10,"step":0.5,"value":3,"unit":"%"},{"name":"n","label":"Jahre","min":0,"max":30,"step":1,"value":10}],"result":{"label":"Endkapital","unit":"€"},"plot":"n","ask":"Frage zum Ausprobieren"} (Namen 1–3 Buchstaben; Rechenzeichen + - * / ^, sqrt, exp, ln).`,
  general: '',
};
VISUAL_RULES.general = VISUAL_RULES.math.replace('Wo eine Formel', 'Nur wo eine Formel (Physik, Wirtschaft, Alltag)');

export function setFrame(kind: PracticeKind) {
  return `${PLAIN_RULE}
${kind === 'auto' ? '' : VISUAL_RULES[kind]}
Format: {"kind":"${kind === 'auto' ? 'math|java|law|music|language|general' : kind}","topic":"…","intro":"- Stichpunkt 1\\n- Stichpunkt 2 …","example":{"problem":"…","steps":["Schritt 1 …","Schritt 2 …"],"answer":"…","code":"(nur bei Programmieren)"},"problems":[…],"labs":[…]}
${taskRules(kind)}
Steigere die Schwierigkeit langsam: zuerst verstehen, dann anwenden, dann selbst lösen. Gib jeder Aufgabe "level": 1 (leicht), 2 (mittel) oder 3 (schwer) – Merkora passt die Reihenfolge daran an, wie es läuft; mische die Stufen, damit es zu jeder etwas gibt. Hinweise ("hints") helfen schrittweise, ohne die Lösung zu verraten.`;
}

/** „Einfacher erklären“: the explanation of a set once more, even simpler, with another everyday example. */
export function simplerPrompt(set: PracticeSet, level = ''): Prompt {
  return {
    system: `Du erklärst ein Thema noch einmal VIEL einfacher – für jemanden, dem die erste Erklärung zu schwer war${level ? ` (Niveau: ${level})` : ''}. ${LANG_RULE}
${PLAIN_RULE}
Nutze ein anderes, sehr anschauliches Alltagsbeispiel und einen Bild-Vergleich ("Stell dir vor …"). Dann ein ganz einfaches Beispiel mit kleinen Schritten.
Format: {"intro":"- …\\n- …","example":{"problem":"…","steps":["…"],"answer":"…"}}
Antworte ausschließlich mit gültigem JSON.`,
    user: `THEMA: ${set.topic}\n\nBISHERIGE ERKLÄRUNG:\n${set.intro}${set.example ? `\n\nBISHERIGES BEISPIEL:\n${set.example.problem}\n${set.example.steps.join('\n')}` : ''}`,
    maxTokens: 1800,
    json: true,
  };
}
export function parseSimpler(raw: unknown): PracticeSet['simple'] | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const intro = s(r.intro, 3000);
  if (!intro) return null;
  const ex = (r.example ?? null) as Record<string, unknown> | null;
  const example = ex && s(ex.problem) ? { problem: s(ex.problem), steps: arr(ex.steps, 10), answer: s(ex.answer) || undefined } : undefined;
  return { intro, ...(example ? { example } : {}) };
}

/** The instruction for a practice set from deck material. */
export function practicePrompt(material: string, kind: PracticeKind, count: number): Prompt {
  return {
    system: `Du bist ein geduldiger Tutor und erstellst Übungsaufgaben, mit denen man ein Thema wirklich versteht und anwendet. ${LANG_RULE}
${FORMULA_RULE}
${kind === 'auto' ? 'Entscheide nach dem Material, welches Fach es ist (kind).\n' : ''}${setFrame(kind)}
Erstelle ${count} Aufgaben zum Material. Antworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.`,
    user: material,
    maxTokens: Math.min(16000, 1500 + count * (kind === 'java' || kind === 'law' ? 900 : 600)),
    json: true,
  };
}

/** How far a set is done. */
/** Solved core tasks – extra tasks (follow-ups, bonus) never count against or for mastery. */
export const solvedCount = (p: PracticeSet) => taskList(p).filter((_, k) => p.progress[k]?.solved && !p.progress[k]?.extra).length;
/** Core tasks of a set (without the extra ones Pip added). */
export const problemCount = (p: PracticeSet) => taskList(p).filter((_, k) => !p.progress[k]?.extra).length;

/** Up to two pictures of an explanation: each either a diagram description or {diagram, caption}. Pure – tested. */
export function parseFigures(raw: unknown): { diagram: Diagram; caption?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { diagram: Diagram; caption?: string }[] = [];
  for (const f of raw) {
    const o = (f ?? {}) as Record<string, unknown>;
    const d = parseDiagram(o.diagram ?? o);
    if (!d) continue;
    const caption = s(o.caption ?? (o.diagram as Record<string, unknown> | undefined)?.caption, 200);
    const narration = arr(o.narration, 10).map((x) => x.slice(0, 200));
    out.push({ diagram: d, ...(caption ? { caption } : {}), ...(narration.length ? { narration } : {}) });
    if (out.length === 2) break;
  }
  return out;
}

/** Pictures for lessons: when and how (the shapes are the same as for card graphics). */
export const FIGURE_RULE = `Bilder: Gib der Erklärung ein Feld "figures" mit 0–2 Grafiken – wo Abläufe, Modelle, Gliederungen, Vergleiche, Zahlen oder Zusammenhänge erklärt werden (bei reinen Begriffen keine). Format: "figures":[{"caption":"ein Satz, was die Grafik zeigt","diagram":{"type":"flow","title":"…","steps":["…","…"]},"narration":["Satz zum 1. Kasten","Satz zum 2. Kasten"]}] – "narration" (bei Abläufen, Modellen, Zeitstrahlen, Hierarchien): je Kasten in Zeichenreihenfolge ein kurzer Satz, die Grafik baut sich damit Schritt für Schritt auf. Nur eine Beschreibung (kein SVG), Merkora zeichnet. Beschriftungen: Stichworte, höchstens 6 Wörter. ${DIAGRAM_RULE.slice(DIAGRAM_RULE.indexOf('Formen:'))}`;

// ---------- „Warum falsch?“ ----------
/** Pip explains a wrong answer simply and makes a similar, slightly easier task. */
export function mistakePrompt(set: PracticeSet, task: Task, answer: string, level = '', dunno = false): Prompt {
  const first = dunno
    ? `Jemand weiß bei einer Übungsaufgabe nicht weiter${level ? ` (Niveau: ${level})` : ''} und hat „Weiß nicht“ gedrückt. ${LANG_RULE}
${PLAIN_RULE}
1. "explain": Erkläre den Lösungsweg von Grund auf, Schritt für Schritt (Markdown, nummerierte kurze Schritte, höchstens 6): womit man anfängt, was man in jedem Schritt tut und warum. Ganz einfach, ermutigend – Nichtwissen ist völlig okay.`
    : `Jemand hat eine Übungsaufgabe falsch gelöst${level ? ` (Niveau: ${level})` : ''}. ${LANG_RULE}
${PLAIN_RULE}
1. "explain": Erkläre in 2–5 kurzen Sätzen (Markdown), wo genau der Denkfehler in der Antwort liegt, was richtig wäre und warum – freundlich, ohne Vorwurf. Zeig den richtigen Weg, nicht nur das Ergebnis.`;
  return {
    system: `Du bist ein geduldiger Tutor. ${first}
2. "similar": Eine etwas leichtere Übungsaufgabe zum SELBEN Punkt – aber in anderer Form, damit es nicht eintönig wird: anderes Beispiel oder anderer Kontext, andere Zahlen oder ein anderer Fall, und wenn es passt ein anderer Aufgabentyp aus der Liste (z. B. ordnen oder Lückentext statt rechnen). NICHT dieselbe Aufgabe mit neuen Zahlen.
${taskRules(set.kind)}
Format: {"explain":"…","similar":{…Aufgabe…}}. Antworte ausschließlich mit gültigem JSON.`,
    user: `THEMA: ${set.topic}\n\nAUFGABE (JSON):\n${JSON.stringify(task).slice(0, 6000)}\n\nANTWORT DER PERSON:\n${dunno ? '(Die Person weiß es nicht und hat keine Antwort gegeben.)' : answer.slice(0, 4000)}`,
    maxTokens: 2500,
    json: true,
  };
}
export function parseMistake(raw: unknown): { explain: string; similar: Task | null } | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const explain = s(r.explain, 3000);
  if (!explain) return null;
  return { explain, similar: r.similar ? parseTask(r.similar) : null };
}
/** How many tasks are settled: solved, or skipped with „Weiß nicht“ (the lesson is through when all are). */
export const settledCount = (p: PracticeSet) => taskList(p).filter((_, k) => !p.progress[k]?.extra && (p.progress[k]?.solved || p.progress[k]?.dunno)).length;

/** Solved at the first try, without hints, without looking at the solution. */
export const cleanSolve = (x?: ProblemProgress) => !!x?.solved && !x.hints && !x.shown && !x.dunno && x.tries <= 1;
/** It goes very well: at least 3 tasks done, all of them clean. */
export function goingWell(set: PracticeSet): boolean {
  const tried = set.progress.filter((x) => x.solved || x.tries > 0 || x.dunno || x.shown);
  return tried.length >= 3 && tried.every(cleanSolve);
}

/**
 * „Weiter“ with adapting difficulty: after a clean solve (and at least two clean ones) the next open task
 * that is harder; after a mistake, „Weiß nicht“ or several tries one that is not harder; otherwise in order.
 * Tasks without a level go in order. Null when nothing is open. Pure – tested.
 */
export function pickNext(set: PracticeSet, i: number): number | null {
  const tasks = taskList(set);
  const n = tasks.length;
  const open: number[] = [];
  for (let k = 1; k < n; k++) {
    const j = (i + k) % n;
    if (!set.progress[j]?.solved && !set.progress[j]?.dunno) open.push(j);
  }
  if (!open.length) return null;
  const cur = set.progress[i];
  const level = tasks[i]?.level;
  if (!level) return open[0];
  const clean = set.progress.filter(cleanSolve).length;
  const bad = !!cur && (!!cur.dunno || !!cur.shown || cur.tries > 1 || (!cur.solved && cur.tries > 0));
  if (cleanSolve(cur) && clean >= 2) return open.find((j) => (tasks[j].level ?? 0) > level) ?? open[0];
  if (bad) return open.find((j) => (tasks[j].level ?? 9) <= level) ?? open[0];
  return open[0];
}

/** When it goes very well: one bonus task, a level harder than the current one. */
export function harderPrompt(set: PracticeSet, task: Task, level = ''): Prompt {
  return {
    system: `Du bist ein Tutor. Die Person löst die Aufgaben dieser Lektion mühelos${level ? ` (Niveau: ${level})` : ''}. ${LANG_RULE}
Erstelle EINE Bonus-Aufgabe zum selben Thema, die eine Stufe schwerer ist: mehr Transfer, ein Schritt mehr oder eine knifflige Variante – fair lösbar, mit Hinweisen. Gern ein anderer Aufgabentyp aus der Liste.
${taskRules(set.kind)}
Format: {"task":{…Aufgabe…, "level":3}}. Antworte ausschließlich mit gültigem JSON.`,
    user: `THEMA: ${set.topic}\n\nZULETZT GELÖSTE AUFGABE (JSON):\n${JSON.stringify(task).slice(0, 5000)}`,
    maxTokens: 2500,
    json: true,
  };
}
export const parseHarder = (raw: unknown): Task | null => parseTask((raw as { task?: unknown } | null)?.task ?? raw);

/** The next task still open after task i (solved and skipped ones are passed over, round to the start); null when none is left. Pure – tested. */
export function nextOpen(set: PracticeSet, i: number): number | null {
  const n = taskList(set).length;
  for (let k = 1; k < n; k++) {
    const j = (i + k) % n;
    const p = set.progress[j];
    if (!p?.solved && !p?.dunno) return j;
  }
  return null;
}

/**
 * A follow-up task after a mistake – not straight after, but behind the next task (another topic in between
 * helps memory and keeps it varied); at the end if there is none. Marked as extra. Pure – tested.
 */
export function insertTaskLater(set: PracticeSet, i: number, task: Task, bonus = false): Pick<PracticeSet, 'tasks' | 'progress'> {
  const tasks = [...taskList(set)];
  const at = Math.min(i + 2, tasks.length);
  tasks.splice(at, 0, task);
  const progress = [...set.progress];
  progress.splice(at, 0, { tries: 0, hints: 0, extra: true, ...(bonus ? { bonus: true } : {}) });
  return { tasks, progress };
}

/** The set with a new task right after task `i` (and its fresh progress). */
export function insertTaskAfter(set: PracticeSet, i: number, task: Task): Pick<PracticeSet, 'tasks' | 'progress'> {
  const tasks = [...taskList(set)];
  tasks.splice(i + 1, 0, task);
  const progress = [...set.progress];
  progress.splice(i + 1, 0, { tries: 0, hints: 0 });
  return { tasks, progress };
}
