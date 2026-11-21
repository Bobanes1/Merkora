/**
 * Practice sets („Aufgaben“): math tasks with hints and solution steps, Java programming tasks with tests,
 * and interactive labs. The AI describes them as JSON; Merkora checks numbers and formulas itself.
 * Pure – tested in scripts/test-srs.mts.
 */
import { compileExpr } from './plotExpr';
import { DIAGRAM_RULE, parseDiagram, type Diagram } from './diagram';
import { parseActive, type ActiveTask } from './tasks';
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

export type ProblemProgress = {
  solved?: boolean;
  tries: number;
  hints: number;
  shown?: boolean;
  /** The last wrong answer as text (for „Warum falsch?“). */
  last?: string;
  /** Pip's explanation of that mistake (made once, kept). */
  mistake?: string;
};

export type PracticeSet = {
  id: string;
  createdAt: number;
  kind: Domain;
  topic: string;
  intro: string;
  example?: { problem: string; steps: string[]; answer?: string; code?: string };
  /** Pictures for the explanation (Merkora draws them from a description, like card graphics). */
  figures?: { diagram: Diagram; caption?: string }[];
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
export type Task = ({ type: 'calc' } & MathProblem) | ({ type: 'code' } & JavaProblem) | ActiveTask;

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
  const p = { type: 'code' as const, title: s(o.title, 80), task: s(o.task ?? o.prompt), starter: s(o.starter, 6000), tests, hints: arr(o.hints, 5), solution: s(o.solution, 8000) };
  return p.task && p.starter && p.tests.length ? p : null;
}

/** One task of any type from the AI's JSON. */
export function parseTask(raw: unknown): Task | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const type = String(o.type ?? '').toLowerCase();
  if (['order', 'classify', 'cloze', 'multi', 'case', 'music'].includes(type)) return parseActive(o);
  if (type === 'code' || (o.starter && o.tests)) return parseCode(o);
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
  return { id, createdAt: now, kind, topic: s(r.topic, 80) || 'Übung', intro: s(r.intro, 3000), ...(s(r.theory, 8000) ? { theory: s(r.theory, 8000) } : {}), ...(parseFigures(r.figures).length ? { figures: parseFigures(r.figures) } : {}), ...(example?.problem ? { example } : {}), labs, tasks, progress: tasks.map(() => ({ tries: 0, hints: 0 })) };
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
  classify: `{"type":"classify","prompt":"Ordne zu","groups":["Gruppe A","Gruppe B"],"items":[{"text":"…","group":0},{"text":"…","group":1}],"explain":"…"} – 4–10 Elemente`,
  cloze: `{"type":"cloze","prompt":"…","text":"Ein {{1}} ist … und {{2}} …","gaps":[["Antwort","Synonym"],["…"]],"explain":"…"} – Lücken {{1}}, {{2}} … mit erlaubten Antworten`,
  case: `{"type":"case","facts":"Sachverhalt (realistisch, 4–10 Sätze)","question":"Aufgabe (z. B. Hat A gegen B einen Anspruch auf …?)","rubric":[{"criterion":"Anspruchsgrundlage richtig benannt (§ …)","points":2},{"criterion":"…","points":3}],"solution":"vollständige Musterlösung"} – Fallaufgabe, die man selbst ausformuliert`,
  code: `{"type":"code","title":"…","task":"…","starter":"class Solution {\\n    static int f(int[] a) {\\n        // dein Code\\n        return 0;\\n    }\\n}","tests":[{"call":"Solution.f(new int[]{1,2})","expected":"3"}],"hints":["…"],"solution":"…"} – Java: Klasse "Solution" ohne "public", statische Methoden, keine main; tests 3–6 Aufrufe, expected wie String.valueOf / Arrays.toString ("[1, 2]")`,
  music: `{"type":"music","prompt":"…","music":{"mode":"interval-ear","root":"C4","interval":"reine Quinte"}} – modes: "interval-ear" (Intervall hören: Prime … Oktave, z. B. "kleine Terz"), "chord-ear" (Akkord hören, "chord": Dur|Moll|vermindert|übermäßig|Dominantseptakkord|großer Septakkord|Moll-Septakkord|halbvermindert|verminderter Septakkord), "build-chord" (Akkord auf dem Klavier spielen, "root","chord"), "build-scale" (Tonleiter spielen, "scale": Dur|natürliches Moll|harmonisches Moll|melodisches Moll|dorisch|phrygisch|lydisch|mixolydisch|lokrisch|Dur-Pentatonik|Moll-Pentatonik), "name-note" (Note im Notensystem benennen, "note":"Fis4","clef":"treble|bass"), "rhythm" (Rhythmus klopfen, "beats":[1,0.5,0.5,1,1] in Vierteln, "tempo":80). Deutsche Notennamen (H, B = H♭, Fis, Es …)`,
};
const LABS_RULE = `"labs" (0–2, nur wenn sie zum Thema passen): {"type":"coin","p":0.5} · {"type":"dice","dice":2} · {"type":"binomial","n":10,"p":0.3} · {"type":"normal","mu":100,"sigma":15,"a":85,"b":115} · {"type":"tree","pA":0.3,"pBA":0.8,"pBnA":0.1,"a":"krank","b":"positiv"} · {"type":"bayes","prevalence":0.01,"sensitivity":0.95,"specificity":0.9} · {"type":"urn","N":10,"K":3,"n":4} · {"type":"function","expr":"a*x^2+b","params":{"a":1,"b":0},"min":-5,"max":5} · {"type":"vectors","matrix":[[1,1],[0,1]]}; jeweils mit "ask": eine Frage zum Ausprobieren.`;

/** Which task types fit which subject (most active ones first). */
export const DOMAIN_TASKS: Record<Domain, (keyof typeof TASK_TYPES)[]> = {
  math: ['calc', 'order', 'multi', 'classify'],
  java: ['code', 'cloze', 'order', 'calc', 'multi'],
  law: ['case', 'classify', 'order', 'cloze', 'multi'],
  music: ['music', 'calc', 'classify', 'cloze', 'multi'],
  language: ['cloze', 'classify', 'order', 'calc', 'multi'],
  general: ['calc', 'order', 'classify', 'cloze', 'multi', 'case'],
};

/** The task rules for one subject (or all for "auto"). */
export function taskRules(kind: PracticeKind): string {
  const types = kind === 'auto' ? (Object.keys(TASK_TYPES) as (keyof typeof TASK_TYPES)[]) : DOMAIN_TASKS[kind];
  return `Aufgabentypen (mische mehrere, der Lernende soll SELBST etwas tun – rechnen, ordnen, zuordnen, ausformulieren, spielen, programmieren; keine reinen Wissensfragen):\n${types.map((t) => '- ' + TASK_TYPES[t]).join('\n')}${kind === 'math' || kind === 'auto' ? '\n' + LABS_RULE : ''}`;
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

export function setFrame(kind: PracticeKind) {
  return `${PLAIN_RULE}
Format: {"kind":"${kind === 'auto' ? 'math|java|law|music|language|general' : kind}","topic":"…","intro":"- Stichpunkt 1\\n- Stichpunkt 2 …","example":{"problem":"…","steps":["Schritt 1 …","Schritt 2 …"],"answer":"…","code":"(nur bei Programmieren)"},"problems":[…],"labs":[…]}
${taskRules(kind)}
Steigere die Schwierigkeit langsam: zuerst verstehen, dann anwenden, dann selbst lösen. Hinweise ("hints") helfen schrittweise, ohne die Lösung zu verraten.`;
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
export const solvedCount = (p: PracticeSet) => p.progress.filter((x) => x.solved).length;
export const problemCount = (p: PracticeSet) => taskList(p).length;

/** Up to two pictures of an explanation: each either a diagram description or {diagram, caption}. Pure – tested. */
export function parseFigures(raw: unknown): { diagram: Diagram; caption?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { diagram: Diagram; caption?: string }[] = [];
  for (const f of raw) {
    const o = (f ?? {}) as Record<string, unknown>;
    const d = parseDiagram(o.diagram ?? o);
    if (!d) continue;
    const caption = s(o.caption ?? (o.diagram as Record<string, unknown> | undefined)?.caption, 200);
    out.push({ diagram: d, ...(caption ? { caption } : {}) });
    if (out.length === 2) break;
  }
  return out;
}

/** Pictures for lessons: when and how (the shapes are the same as for card graphics). */
export const FIGURE_RULE = `Bilder: Gib der Erklärung ein Feld "figures" mit 0–2 Grafiken – wo Abläufe, Modelle, Gliederungen, Vergleiche, Zahlen oder Zusammenhänge erklärt werden (bei reinen Begriffen keine). Format: "figures":[{"caption":"ein Satz, was die Grafik zeigt","diagram":{"type":"flow","title":"…","steps":["…","…"]}}]. Nur eine Beschreibung (kein SVG), Merkora zeichnet. Beschriftungen: Stichworte, höchstens 6 Wörter. ${DIAGRAM_RULE.slice(DIAGRAM_RULE.indexOf('Formen:'))}`;

// ---------- „Warum falsch?“ ----------
/** Pip explains a wrong answer simply and makes a similar, slightly easier task. */
export function mistakePrompt(set: PracticeSet, task: Task, answer: string, level = ''): Prompt {
  return {
    system: `Du bist ein geduldiger Tutor. Jemand hat eine Übungsaufgabe falsch gelöst${level ? ` (Niveau: ${level})` : ''}. ${LANG_RULE}
${PLAIN_RULE}
1. "explain": Erkläre in 2–5 kurzen Sätzen (Markdown), wo genau der Denkfehler in der Antwort liegt, was richtig wäre und warum – freundlich, ohne Vorwurf. Zeig den richtigen Weg, nicht nur das Ergebnis.
2. "similar": Eine ähnliche, etwas leichtere Aufgabe zum selben Punkt, genau im selben Format wie die Aufgabe (gleicher "type").
${taskRules(set.kind)}
Format: {"explain":"…","similar":{…Aufgabe…}}. Antworte ausschließlich mit gültigem JSON.`,
    user: `THEMA: ${set.topic}\n\nAUFGABE (JSON):\n${JSON.stringify(task).slice(0, 6000)}\n\nANTWORT DER PERSON:\n${answer.slice(0, 4000)}`,
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
/** The set with a new task right after task `i` (and its fresh progress). */
export function insertTaskAfter(set: PracticeSet, i: number, task: Task): Pick<PracticeSet, 'tasks' | 'progress'> {
  const tasks = [...taskList(set)];
  tasks.splice(i + 1, 0, task);
  const progress = [...set.progress];
  progress.splice(i + 1, 0, { tries: 0, hints: 0 });
  return { tasks, progress };
}
