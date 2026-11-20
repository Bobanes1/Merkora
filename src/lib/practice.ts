/**
 * Practice sets („Aufgaben“): math tasks with hints and solution steps, Java programming tasks with tests,
 * and interactive labs. The AI describes them as JSON; Merkora checks numbers and formulas itself.
 * Pure – tested in scripts/test-srs.mts.
 */
import { compileExpr } from './plotExpr';
import { LANG_RULE, type Prompt } from './ai';
import { FORMULA_RULE } from './ai';

export type AnswerSpec = { type: 'number' | 'fraction' | 'expr' | 'choice' | 'text'; value: string; tolerance?: number; options?: string[] };
export type MathProblem = { problem: string; answer: AnswerSpec; hints: string[]; steps: string[] };
export type JavaTest = { call: string; expected: string };
export type JavaProblem = { title: string; task: string; starter: string; tests: JavaTest[]; hints: string[]; solution: string };

export type LabSpec =
  | { type: 'coin'; p: number; ask?: string }
  | { type: 'dice'; dice: number; ask?: string }
  | { type: 'binomial'; n: number; p: number; ask?: string }
  | { type: 'normal'; mu: number; sigma: number; a: number; b: number; ask?: string }
  | { type: 'tree'; pA: number; pBA: number; pBnA: number; a?: string; b?: string; ask?: string }
  | { type: 'bayes'; prevalence: number; sensitivity: number; specificity: number; ask?: string }
  | { type: 'urn'; N: number; K: number; n: number; ask?: string }
  | { type: 'function'; expr: string; params: Record<string, number>; min: number; max: number; ask?: string }
  | { type: 'vectors'; matrix: [[number, number], [number, number]]; ask?: string };

export type ProblemProgress = { solved?: boolean; tries: number; hints: number; shown?: boolean };

export type PracticeSet = {
  id: string;
  createdAt: number;
  kind: 'math' | 'java';
  topic: string;
  intro: string;
  example?: { problem: string; steps: string[]; answer?: string; code?: string };
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

/** Reads a practice set. Problems without a task, answer or tests are left out. */
export function parsePractice(json: unknown, id: string, now: number): PracticeSet | null {
  const r = (json ?? {}) as Record<string, unknown>;
  const kind = String(r.kind ?? '').toLowerCase() === 'java' ? 'java' : 'math';
  const ex = (r.example ?? null) as Record<string, unknown> | null;
  const example = ex ? { problem: s(ex.problem), steps: arr(ex.steps ?? ex.explain, 10), answer: s(ex.answer) || undefined, code: s(ex.code, 6000) || undefined } : undefined;
  const labs = (Array.isArray(r.labs) ? r.labs : []).map(parseLab).filter((l): l is LabSpec => !!l).slice(0, 4);
  const base = { id, createdAt: now, kind, topic: s(r.topic, 80) || 'Übung', intro: s(r.intro, 3000), ...(example?.problem ? { example } : {}), labs } as const;
  if (kind === 'java') {
    const java = (Array.isArray(r.problems) ? r.problems : [])
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const tests = (Array.isArray(o.tests) ? o.tests : [])
          .map((t) => ({ call: s((t as Record<string, unknown>)?.call, 400), expected: s((t as Record<string, unknown>)?.expected, 400) }))
          .filter((t) => t.call && t.expected !== '')
          .slice(0, 8);
        return { title: s(o.title, 80), task: s(o.task), starter: s(o.starter, 6000), tests, hints: arr(o.hints, 5), solution: s(o.solution, 8000) };
      })
      .filter((p) => p.task && p.starter && p.tests.length)
      .slice(0, 15);
    return java.length ? { ...base, kind: 'java', java, progress: java.map(() => ({ tries: 0, hints: 0 })) } : null;
  }
  const math = (Array.isArray(r.problems) ? r.problems : [])
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { problem: s(o.problem), answer: parseAnswer(o.answer), hints: arr(o.hints, 5), steps: arr(o.steps, 12) };
    })
    .filter((p): p is MathProblem => !!p.problem && !!p.answer)
    .slice(0, 15);
  return math.length ? { ...base, kind: 'math', math, progress: math.map(() => ({ tries: 0, hints: 0 })) } : null;
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
export type PracticeKind = 'auto' | 'math' | 'java';

/** The instruction for a practice set. */
export function practicePrompt(material: string, kind: PracticeKind, count: number): Prompt {
  const math = `Für Mathematik (jedes Gebiet: Analysis, Algebra, Stochastik, lineare Algebra …):
{"kind":"math","topic":"…","intro":"kurze, anschauliche Erklärung des Kerngedankens (3–6 Sätze)","example":{"problem":"…","steps":["Schritt 1 …","Schritt 2 …"],"answer":"…"},
"problems":[{"problem":"Aufgabe","answer":{"type":"number|fraction|expr|choice|text","value":"…","tolerance":0.001,"options":["…"]},"hints":["kleiner Tipp","größerer Tipp"],"steps":["Lösungsweg Schritt für Schritt"]}],
"labs":[{"type":"…", …}]}
- answer.type: "number" (Zahl, z. B. "0,2668" oder "26,68 %"), "fraction" ("3/8"), "expr" (Formel in x, z. B. "2*x+3" – nur + - * / ^ Klammern sqrt exp ln sin cos), "choice" (mit "options", value = richtige Option), "text" (nur wenn nichts anderes geht).
- Steigere die Schwierigkeit langsam: zuerst Verständnis, dann Rechnen, dann Anwenden.
- labs (0–2, nur wenn sie zum Thema passen): {"type":"coin","p":0.5} · {"type":"dice","dice":2} · {"type":"binomial","n":10,"p":0.3} · {"type":"normal","mu":100,"sigma":15,"a":85,"b":115} · {"type":"tree","pA":0.3,"pBA":0.8,"pBnA":0.1,"a":"krank","b":"positiv"} · {"type":"bayes","prevalence":0.01,"sensitivity":0.95,"specificity":0.9} · {"type":"urn","N":10,"K":3,"n":4} · {"type":"function","expr":"a*x^2+b","params":{"a":1,"b":0},"min":-5,"max":5} · {"type":"vectors","matrix":[[1,1],[0,1]]}; jeweils mit "ask": eine Frage zum Ausprobieren.`;
  const java = `Für Programmieren in Java:
{"kind":"java","topic":"…","intro":"kurze Erklärung des Konzepts","example":{"problem":"…","code":"…Java-Code…","steps":["Erklärung Zeile für Zeile"]},
"problems":[{"title":"…","task":"klare Aufgabenstellung","starter":"class Solution {\\n    static int summe(int[] a) {\\n        // dein Code\\n        return 0;\\n    }\\n}","tests":[{"call":"Solution.summe(new int[]{1,2,3})","expected":"6"}],"hints":["…","…"],"solution":"vollständige Lösung"}]}
- starter: Klasse "Solution" (ohne "public") mit statischen Methoden und leerem Rumpf; keine main-Methode, kein package, nur java.util-Importe falls nötig.
- tests: 3–6 Java-Ausdrücke, die die Methode aufrufen; expected = das erwartete Ergebnis wie String.valueOf es ausgibt (Arrays wie Arrays.toString: "[1, 2, 3]", Strings ohne Anführungszeichen, Wahrheitswerte true/false). Prüfe Randfälle (leeres Array, 0, negative Zahlen).
- Steigere die Schwierigkeit langsam.`;
  const which = kind === 'math' ? math : kind === 'java' ? java : `Entscheide nach dem Material: Mathematik oder Programmieren (Java).\n\n${math}\n\n${java}`;
  return {
    system: `Du bist ein geduldiger Tutor und erstellst Übungsaufgaben, mit denen man ein Thema wirklich versteht. ${LANG_RULE}
${FORMULA_RULE}
${which}
Erstelle ${count} Aufgaben zum Material. Antworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.`,
    user: material,
    maxTokens: Math.min(16000, 1500 + count * (kind === 'java' ? 900 : 600)),
    json: true,
  };
}

/** How far a set is done. */
export const solvedCount = (p: PracticeSet) => p.progress.filter((x) => x.solved).length;
export const problemCount = (p: PracticeSet) => (p.kind === 'java' ? p.java?.length : p.math?.length) ?? 0;
