/**
 * Active task types for practice sets and skills: put in order, sort into groups, fill gaps, several right
 * answers, case studies (graded by the AI with a scheme) and music tasks. Merkora checks all of them itself
 * except free text. Pure – tested in scripts/test-srs.mts.
 */
import type { MusicSpec } from './music';
import { parseMusic } from './music';
import { diagramLabels, parseDiagram, type Diagram } from './diagram';
import { cellPos, evalSheet, isErr, type CellValue } from './sheet';

export type OrderTask = { type: 'order'; prompt: string; items: string[]; hints: string[]; explain?: string };
export type ClassifyTask = { type: 'classify'; prompt: string; groups: string[]; items: { text: string; group: number }[]; hints: string[]; explain?: string };
export type ClozeTask = { type: 'cloze'; prompt: string; text: string; gaps: string[][]; hints: string[]; explain?: string };
export type MultiTask = { type: 'multi'; prompt: string; options: string[]; correct: number[]; hints: string[]; explain?: string };
export type CaseTask = {
  type: 'case';
  facts: string;
  question: string;
  rubric: { criterion: string; points: number }[];
  solution: string;
  hints: string[];
  /** Law: which legal system („Schweizer Recht“) and the relevant articles to look up (open book). */
  law?: string;
  norms?: string[];
};
export type MusicTask = { type: 'music'; prompt: string; music: MusicSpec; hints: string[]; explain?: string };
/** Guess a value with a slider; points by how close you are. */
export type EstimateTask = { type: 'estimate'; prompt: string; min: number; max: number; step: number; unit: string; answer: number; tolerance: number; hints: string[]; explain?: string };
/** A graphic with numbered covered labels: choose the right term for each number. */
export type LabelTask = { type: 'label'; prompt: string; diagram: Diagram; hide: number[]; labels: string[]; hints: string[]; explain?: string };
/** A small spreadsheet: fill the empty cells (numbers or formulas); checked by the computed values. */
export type SheetTask = { type: 'sheet'; prompt: string; rows: string[][]; expect: Record<string, string>; hints: string[]; explain?: string };
/** A branching story: choices with consequences; points per choice. */
export type ScenarioNode = { id: string; text: string; choices: { text: string; next?: string; score: number; feedback: string }[] };
export type ScenarioTask = { type: 'scenario'; prompt: string; start: string; nodes: ScenarioNode[]; hints: string[]; explain?: string };
/** A conversation with an AI character; graded with a scheme at the end. */
export type RoleplayTask = { type: 'roleplay'; prompt: string; scenario: string; persona: string; goal: string; opening: string; turns: number; rubric: { criterion: string; points: number }[]; solution: string; hints: string[] };
/** „Erklär es mir“ (Feynman): explain a concept in your own words; the AI checks the key points. */
export type ExplainTask = { type: 'explain'; prompt: string; concept: string; audience?: string; keyPoints: { criterion: string; points: number }[]; solution: string; hints: string[] };
export type ActiveTask = OrderTask | ClassifyTask | ClozeTask | MultiTask | CaseTask | MusicTask | EstimateTask | LabelTask | SheetTask | ScenarioTask | RoleplayTask | ExplainTask;
export const ACTIVE_TYPES = ['order', 'classify', 'cloze', 'multi', 'case', 'music', 'estimate', 'label', 'sheet', 'scenario', 'roleplay', 'explain'];

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
      const law = s(r.law ?? r.rechtsordnung, 40);
      const norms = arr(r.norms ?? r.normen, 8, 300);
      return facts && question && rubric.length >= 2
        ? { type: 'case', facts, question, rubric, solution: s(r.solution, 8000), hints, ...(law ? { law } : {}), ...(norms.length ? { norms } : {}) }
        : null;
    }
    case 'explain': {
      const concept = s(r.concept ?? r.term ?? r.begriff, 200);
      const keyPoints = (Array.isArray(r.keyPoints ?? r.keypoints ?? r.rubric) ? ((r.keyPoints ?? r.keypoints ?? r.rubric) as unknown[]) : [])
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          const points = Math.round(Number(o.points ?? 2));
          return { criterion: s(typeof c === 'string' ? c : o.criterion ?? o.point ?? o.text, 300), points: Number.isFinite(points) && points > 0 ? Math.min(points, 10) : 2 };
        })
        .filter((c) => c.criterion)
        .slice(0, 6);
      const solution = s(r.solution ?? r.sample, 3000);
      const audience = s(r.audience, 120) || undefined;
      return concept && keyPoints.length >= 2 && solution
        ? { type: 'explain', prompt: prompt || `Erkläre „${concept}“ in eigenen Worten.`, concept, ...(audience ? { audience } : {}), keyPoints, solution, hints }
        : null;
    }
    case 'music': {
      const music = parseMusic(r.music ?? r);
      return music ? { type: 'music', prompt: prompt || '', music, hints, explain } : null;
    }
    case 'estimate': {
      const n = (v: unknown) => {
        const x = Number(String(v ?? '').replace(',', '.'));
        return Number.isFinite(x) ? x : NaN;
      };
      const answer = n(r.answer), lo = n(r.min), hi = n(r.max);
      if (![answer, lo, hi].every(Number.isFinite) || lo >= hi || answer < lo || answer > hi || !prompt) return null;
      const span = hi - lo;
      const tol = n(r.tolerance);
      const step = n(r.step);
      return {
        type: 'estimate',
        prompt,
        min: lo,
        max: hi,
        step: Number.isFinite(step) && step > 0 && step <= span / 4 ? step : niceStep(span),
        unit: s(r.unit, 20),
        answer,
        tolerance: Number.isFinite(tol) && tol > 0 ? Math.min(tol, span / 4) : span / 20,
        hints,
        explain,
      };
    }
    case 'label': {
      const diagram = parseDiagram(r.diagram);
      if (!diagram) return null;
      const all = diagramLabels(diagram);
      const want = (Array.isArray(r.hide) ? r.hide : []).map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < all.length);
      const hide = [...new Set(want.length ? want : all.map((_, k) => k))].slice(0, 6);
      return hide.length >= 2 ? { type: 'label', prompt: prompt || 'Beschrifte die Grafik.', diagram, hide, labels: hide.map((k) => all[k]), hints, explain } : null;
    }
    case 'sheet': {
      const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, 10).map((row) => (Array.isArray(row) ? row : []).slice(0, 6).map((c) => s(c, 120)));
      const width = Math.max(0, ...rows.map((x) => x.length));
      rows.forEach((x) => {
        while (x.length < width) x.push('');
      });
      const expect: Record<string, string> = {};
      for (const [k, v] of Object.entries((r.expect ?? {}) as Record<string, unknown>)) {
        const pos = cellPos(k);
        if (pos && pos[0] < width && pos[1] < rows.length && s(v, 200)) expect[k.toUpperCase()] = s(v, 200);
      }
      if (!rows.length || !Object.keys(expect).length || !prompt) return null;
      // the cells to fill start empty; the expected solution must compute without errors
      for (const k of Object.keys(expect)) rows[cellPos(k)![1]][cellPos(k)![0]] = '';
      const solved = evalSheet(fillSheet(rows, expect));
      if (Object.keys(expect).some((k) => isErr(solved[cellPos(k)![1]][cellPos(k)![0]]))) return null;
      return { type: 'sheet', prompt, rows, expect, hints, explain };
    }
    case 'scenario': {
      const nodes: ScenarioNode[] = (Array.isArray(r.nodes) ? r.nodes : [])
        .slice(0, 20)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            id: s(o.id, 40),
            text: s(o.text, 1500),
            choices: (Array.isArray(o.choices) ? o.choices : [])
              .slice(0, 4)
              .map((c) => {
                const q = (c ?? {}) as Record<string, unknown>;
                const score = Math.round(Number(q.score ?? 0));
                return { text: s(q.text, 300), next: s(q.next, 40) || undefined, score: Number.isFinite(score) ? Math.max(0, Math.min(2, score)) : 0, feedback: s(q.feedback, 600) };
              })
              .filter((c) => c.text),
          };
        })
        .filter((n) => n.id && n.text);
      const start = s(r.start, 40) || nodes[0]?.id || '';
      const task: ScenarioTask = { type: 'scenario', prompt: prompt || 'Entscheide dich – jede Wahl hat Folgen.', start, nodes, hints, explain };
      return scenarioOk(task) ? task : null;
    }
    case 'roleplay': {
      const rubric = (Array.isArray(r.rubric) ? r.rubric : [])
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          const points = Math.round(Number(o.points ?? 1));
          return { criterion: s(o.criterion ?? o.name ?? c, 400), points: Number.isFinite(points) && points > 0 ? Math.min(points, 10) : 1 };
        })
        .filter((c) => c.criterion)
        .slice(0, 6);
      const scenario = s(r.scenario ?? r.facts, 2000);
      const persona = s(r.persona ?? r.role, 600);
      const goal = s(r.goal ?? r.question, 600);
      const opening = s(r.opening, 800);
      const turns = Math.round(Number(r.turns ?? 5));
      return scenario && persona && goal && opening && rubric.length >= 2
        ? { type: 'roleplay', prompt: prompt || 'Führe das Gespräch.', scenario, persona, goal, opening, turns: Number.isFinite(turns) ? Math.max(3, Math.min(8, turns)) : 5, rubric, solution: s(r.solution, 3000), hints }
        : null;
    }
  }
  return null;
}


/** A pleasant slider step for a range (…, 0.1, 0.5, 1, 5, 10, …) – about 100–200 steps. */
export function niceStep(span: number): number {
  const raw = span / 150;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

// ---------- estimate ----------
export function checkEstimate(task: EstimateTask, value: number): 'right' | 'close' | 'far' {
  const d = Math.abs(value - task.answer);
  return d <= task.tolerance + 1e-9 ? 'right' : d <= 3 * task.tolerance ? 'close' : 'far';
}

// ---------- label ----------
export function checkLabels(task: LabelTask, given: string[]) {
  const places = task.labels.map((l, i) => !!given[i] && norm(given[i]) === norm(l));
  return { right: places.every(Boolean), places };
}

// ---------- sheet ----------
/** The rows with the given entries put into their cells. */
export function fillSheet(rows: string[][], entries: Record<string, string>): string[][] {
  const out = rows.map((r) => [...r]);
  for (const [k, v] of Object.entries(entries)) {
    const pos = cellPos(k);
    if (pos && out[pos[1]] && pos[0] < out[pos[1]].length) out[pos[1]][pos[0]] = v;
  }
  return out;
}
const sameValue = (a: CellValue, b: CellValue) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-6) : !isErr(a) && !isErr(b) && norm(String(a)) === norm(String(b));
/** Per cell to fill: does what you typed compute to the same value as the solution? */
export function checkSheet(task: SheetTask, given: Record<string, string>) {
  const mine = evalSheet(fillSheet(task.rows, given));
  const want = evalSheet(fillSheet(task.rows, task.expect));
  const cells: Record<string, boolean> = {};
  for (const k of Object.keys(task.expect)) {
    const [c, r] = cellPos(k)!;
    cells[k] = !!given[k]?.trim() && sameValue(mine[r][c], want[r][c]);
  }
  return { right: Object.values(cells).every(Boolean), cells, values: mine };
}

// ---------- scenario ----------
/** Usable: start exists, every "next" exists, no loops, at most 6 decisions deep, at least 2 decisions. */
export function scenarioOk(t: ScenarioTask): boolean {
  const byId = new Map(t.nodes.map((n) => [n.id, n]));
  if (!byId.has(t.start) || byId.size !== t.nodes.length) return false;
  let decisions = 0;
  const walk = (id: string, path: string[]): boolean => {
    if (path.includes(id) || path.length > 6) return false;
    const n = byId.get(id);
    if (!n) return false;
    if (n.choices.length) decisions++;
    return n.choices.every((c) => !c.next || walk(c.next, [...path, id]));
  };
  return walk(t.start, []) && decisions >= 2;
}
/** The most points one can get on the best way through. */
export function scenarioMax(t: ScenarioTask, id = t.start): number {
  const n = t.nodes.find((x) => x.id === id);
  if (!n || !n.choices.length) return 0;
  return Math.max(...n.choices.map((c) => c.score + (c.next ? scenarioMax(t, c.next) : 0)));
}
/** Points of a way through (choice indices from the start), and whether the end is reached. */
export function scenarioWalk(t: ScenarioTask, picks: number[]) {
  let id: string | undefined = t.start;
  let score = 0;
  const steps: { node: ScenarioNode; choice: ScenarioNode['choices'][number] }[] = [];
  for (const k of picks) {
    const n = t.nodes.find((x) => x.id === id);
    const c = n?.choices[k];
    if (!n || !c) break;
    steps.push({ node: n, choice: c });
    score += c.score;
    id = c.next;
  }
  const here = id ? t.nodes.find((x) => x.id === id) : undefined;
  return { score, steps, here, done: !here || !here.choices.length };
}
export const scenarioPassed = (t: ScenarioTask, score: number) => score >= 0.7 * Math.max(1, scenarioMax(t));

// ---------- role play ----------
export type ChatLine = { me: boolean; text: string };
/** The AI character answers (in its role, short, without breaking character). */
export function roleplayReplyPrompt(t: RoleplayTask, chat: ChatLine[], lang: string) {
  return {
    system: `Du spielst in einer Übung eine Rolle: ${t.persona}. ${lang}
Situation: ${t.scenario}
Bleib immer in der Rolle, antworte natürlich und kurz (1–4 Sätze), reagiere auf das, was die Person sagt, und mach es ihr nicht zu leicht, aber fair. Verrate nicht, wie bewertet wird.
Format: {"reply":"…"}`,
    user: chat.map((l) => (l.me ? 'LERNENDE PERSON: ' : 'DU: ') + l.text).join('\n'),
  };
}
/** A role play is graded like a case: the conversation is the material, the goal the task. */
export function roleplayAsCase(t: RoleplayTask, chat: ChatLine[]): CaseTask {
  return {
    type: 'case',
    facts: `${t.scenario}\n\nROLLE DES GEGENÜBERS: ${t.persona}\n\nGESPRÄCH:\n${chat.map((l) => (l.me ? 'Lernende Person: ' : 'Gegenüber: ') + l.text).join('\n')}`,
    question: `Ziel der lernenden Person: ${t.goal}. Bewerte NUR die Beiträge der lernenden Person.`,
    rubric: t.rubric,
    solution: t.solution || '(keine Musterlösung – bewerte nach dem Schema)',
    hints: [],
  };
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

/** Umlauts written out (ae/oe/ue) count like ä/ö/ü. */
const plain = (t: string) => norm(t).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
/** The same word in singular and plural („Eiweiß/Eiweiße“, „Zelle/Zellen“, „Antigen/Antigene“). */
function sameWord(a: string, b: string): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s) && ['e', 'n', 'en', 's', 'es', 'er', 'nen'].includes(l.slice(s.length));
}

/** One gap: right if it matches one of the allowed answers (tolerant: case, ß/ss, ä/ae, punctuation, singular/plural, small typo in long words). */
export function gapRight(allowed: string[], given: string): boolean {
  const g = plain(given);
  if (!g) return false;
  return allowed.some((a) => {
    const w = plain(a);
    if (w === g || sameWord(w, g)) return true;
    // one typo is fine in words of 6+ letters
    return w.length >= 6 && Math.abs(w.length - g.length) <= 1 && editDistance(w, g) <= 1;
  });
}

/**
 * The AI looks once more when a gap answer is not in the list: is it right in content too (synonym, more
 * precise or equivalent term)? Strict – merely related answers stay wrong.
 */
export function gapCheckPrompt(sentence: string, allowed: string[], given: string, why = '') {
  return {
    system: `Du prüfst eine Lückenantwort fair, aber streng. Antwort RICHTIG ("ok": true) nur, wenn sie inhaltlich korrekt in die Lücke passt: ein Synonym, ein genauerer oder gleichwertiger Fachbegriff oder eine andere korrekte Schreibweise. Nur verwandt, zu allgemein, halb richtig oder falsch → "ok": false. Tippfehler sind egal.
Format: {"ok":true,"note":"ein kurzer Satz, warum"}`,
    user: `SATZ MIT LÜCKE: ${sentence}\nHINTERLEGTE LÖSUNG(EN): ${allowed.join(' | ')}${why ? `\nERKLÄRUNG: ${why}` : ''}\nANTWORT DER PERSON: ${given}`,
  };
}
export function parseGapCheck(raw: unknown): { ok: boolean; note: string } {
  const r = (raw ?? {}) as { ok?: unknown; note?: unknown };
  return { ok: r.ok === true, note: s(r.note, 300) };
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
/** Words with their counts (normalised: case, punctuation, ß). */
function wordCounts(t: string) {
  const m = new Map<string, number>();
  for (const w of norm(t).split(' ').filter(Boolean)) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}
/** An explanation is graded like a case: the key points are the scheme, the sample explanation the solution. Pure – tested. */
export function explainAsCase(t: ExplainTask): CaseTask {
  return {
    type: 'case',
    facts: `Die lernende Person soll den Begriff „${t.concept}“ in eigenen Worten erklären${t.audience ? ` – für: ${t.audience}` : ' – so, dass jemand ohne Vorwissen es versteht'}.`,
    question: `${t.prompt}
Bewerte, ob jeder Kernpunkt in eigenen Worten verständlich und richtig erklärt ist. Fachbegriffe allein oder auswendig gelernte Definitionen ohne Erklärung reichen nicht; ein gutes eigenes Beispiel zählt positiv. Sachliche Fehler kosten Punkte.`,
    rubric: t.keyPoints,
    solution: t.solution,
    hints: [],
  };
}

/**
 * Is the answer (nearly) the sample solution itself? At least 90 % of its words are there and the answer
 * is not much longer – then it gets full points without asking the AI. Pure – tested.
 */
export function matchesSolution(answer: string, solution: string): boolean {
  const want = wordCounts(solution), got = wordCounts(answer);
  const total = [...want.values()].reduce((a, b) => a + b, 0);
  const given = [...got.values()].reduce((a, b) => a + b, 0);
  if (total < 15 || !given || given > total * 1.3) return false;
  let hit = 0;
  for (const [w, n] of want) hit += Math.min(n, got.get(w) ?? 0);
  return hit / total >= 0.9;
}

/** Full points on every criterion – for an answer that is the sample solution. */
export function fullGrade(task: CaseTask): CaseGrade {
  const criteria = task.rubric.map((c) => ({ criterion: c.criterion, points: c.points, max: c.points, feedback: 'Erfüllt – entspricht der Musterlösung.' }));
  const max = criteria.reduce((n, c) => n + c.max, 0);
  return { criteria, total: max, max, summary: 'Deine Lösung entspricht der Musterlösung – volle Punktzahl.' };
}
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
Bewerte jedes Kriterium des Bewertungsschemas einzeln (halbe Punkte erlaubt).
MASSSTAB: Bewerte den INHALT, nicht Wortlaut oder Form. Die Musterlösung ist eine Lösung mit voller Punktzahl: Was inhaltlich der Musterlösung entspricht, bekommt in jedem Kriterium die volle Punktzahl. Andere Formulierungen, ein anderer sinnvoller Aufbau oder andere vertretbare Begründungen sind genauso richtig. Ziehe nur ab, was das Kriterium verlangt und in der Lösung fehlt oder falsch ist – nie für Dinge, die auch die Musterlösung nicht enthält. "feedback": 1–2 Sätze, was erfüllt ist oder fehlt. "summary": 2–3 Sätze Gesamteindruck mit dem wichtigsten nächsten Schritt.
Format: {"criteria":[{"points":2,"feedback":"…"}],"summary":"…"} – genau so viele Einträge wie Kriterien, in derselben Reihenfolge.`,
    user: `SACHVERHALT:\n${task.facts}\n\nAUFGABE:\n${task.question}\n\nBEWERTUNGSSCHEMA:\n${task.rubric.map((c, i) => `${i + 1}. ${c.criterion} (max. ${c.points} P.)`).join('\n')}\n\nMUSTERLÖSUNG (nur für dich):\n${task.solution}\n\nLÖSUNG DES LERNENDEN:\n${answer || '(leer)'}`,
  };
}

/**
 * Where a dragged item lands: the place whose box the pointer is over; above the list → first place,
 * below it → last place, in a gap → the item just below the gap. Pure – tested.
 */
export function dropIndex(rects: { top: number; bottom: number }[], y: number): number {
  if (!rects.length) return 0;
  if (y < rects[0].top) return 0;
  for (let k = 0; k < rects.length; k++) if (y <= rects[k].bottom) return k;
  return rects.length - 1;
}

/**
 * Smooth dragging: the place of the dragged item = how many of the other items have their middle above
 * the dragged item's middle (`mids` in list order, without the dragged one). Pure – tested.
 */
export function slotFor(mids: number[], center: number): number {
  let n = 0;
  for (const m of mids) if (m < center) n++;
  return n;
}
