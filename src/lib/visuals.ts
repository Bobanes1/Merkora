/**
 * Visual explanations for practice sets and skills: a sheet of music (music), an example program with a
 * step-by-step trace (programming), a case sketch (law), coloured sentence parts and tables (languages)
 * and a formula playground (maths and others). The AI describes them as JSON; Merkora draws them.
 * Pure – tested in scripts/test-srs.mts.
 */
import { compileExpr, sampleCurve } from './plotExpr';
import { midiOf, parseNote, staffStep, type Note } from './music';
import { toLang, type CodeLang } from './practice';

const s = (v: unknown, max = 400) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const arr = <T>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v as T[]).slice(0, max) : []);
const numOr = (v: unknown, d: number) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : d;
};

// ---------- sheet of music ----------
export type ScoreItem = { notes: string[]; dur: number; label?: string };
export type Score = { clef: 'treble' | 'bass'; key?: string; time?: string; items: ScoreItem[]; caption?: string };
const DURS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

export function parseScore(raw: unknown): Score | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const clef = s(r.clef) === 'bass' ? 'bass' : 'treble';
  const items = arr<Record<string, unknown>>(r.items ?? r.notes, 24)
    .map((it): ScoreItem | null => {
      const o = typeof it === 'string' ? { notes: [it] } : (it ?? {});
      const notes = (Array.isArray(o.notes) ? o.notes : [o.note ?? o.notes]).map((x) => s(x, 8)).filter((x) => {
        const n = parseNote(x);
        return !!n && staffStep(n, clef) >= -6 && staffStep(n, clef) <= 14;
      });
      const dur = numOr(o.dur ?? o.duration, 1);
      if (!notes.length) return null;
      return { notes: notes.slice(0, 4), dur: DURS.includes(dur) ? dur : 1, ...(s(o.label, 20) ? { label: s(o.label, 20) } : {}) };
    })
    .filter((x): x is ScoreItem => !!x);
  if (!items.length) return null;
  const time = /^\d{1,2}\/(2|4|8)$/.test(s(r.time)) ? s(r.time) : undefined;
  const key = keyFifths(s(r.key, 20)) !== null ? s(r.key, 20) : undefined;
  return { clef, items, ...(key ? { key } : {}), ...(time ? { time } : {}), ...(s(r.caption, 200) ? { caption: s(r.caption, 200) } : {}) };
}

const MAJOR: Record<string, number> = { c: 0, g: 1, d: 2, a: 3, e: 4, h: 5, fis: 6, cis: 7, f: -1, b: -2, es: -3, as: -4, des: -5, ges: -6, ces: -7 };
const MINOR: Record<string, number> = { a: 0, e: 1, h: 2, fis: 3, cis: 4, gis: 5, dis: 6, ais: 7, d: -1, g: -2, c: -3, f: -4, b: -5, es: -6, as: -7 };
/** "G-Dur" → 1, "F-Dur" → −1, "e-Moll" → 1, "d" → −1 (lower case = minor); null if unknown. */
export function keyFifths(key: string): number | null {
  const m = /^([A-Ha-h](?:is|es|s)?)(?:[\s-]*(dur|moll))?$/i.exec(key.trim());
  if (!m) return null;
  const minor = m[2] ? m[2].toLowerCase() === 'moll' : m[1][0] === m[1][0].toLowerCase();
  const name = m[1].toLowerCase();
  const v = (minor ? MINOR : MAJOR)[name];
  return v === undefined ? null : v;
}
/** The accidental the key gives a letter (C=0 … H=6): +1, −1 or 0. */
export function keyAccidental(fifths: number, letter: number): number {
  const sharps = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E H
  const flats = [6, 2, 5, 1, 4, 0, 3]; // H E A D G C F
  if (fifths > 0) return sharps.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return flats.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}
/** Staff steps of the key signature symbols (treble; bass is two steps lower). */
export function keySignatureSteps(fifths: number, clef: 'treble' | 'bass'): number[] {
  const sharp = [8, 5, 9, 6, 3, 7, 4];
  const flat = [4, 7, 3, 6, 2, 5, 1];
  const shift = clef === 'bass' ? -2 : 0;
  return (fifths >= 0 ? sharp.slice(0, fifths) : flat.slice(0, -fifths)).map((x) => x + shift);
}

export type ScoreLayout = {
  width: number;
  keySteps: number[];
  sharps: boolean;
  timeAt: number;
  items: { x: number; notes: { note: Note; step: number; acc: string }[]; dur: number; label?: string; midis: number[] }[];
  bars: number[];
};
/** Where everything goes: key signature, time, note columns (spacing by length), bar lines. */
export function layoutScore(sc: Score): ScoreLayout {
  const fifths = sc.key ? (keyFifths(sc.key) ?? 0) : 0;
  const keySteps = keySignatureSteps(fifths, sc.clef);
  let x = 52 + keySteps.length * 10;
  const timeAt = x + 6;
  if (sc.time) x += 28;
  x += 18;
  const [num, den] = (sc.time ?? '4/4').split('/').map(Number);
  const perBar = num * (4 / den);
  const bars: number[] = [];
  let beats = 0;
  const items = sc.items.map((it, k) => {
    const notes = it.notes.map((t) => {
      const note = parseNote(t)!;
      const want = keyAccidental(fifths, note.letter);
      const acc = note.acc === want ? '' : note.acc === 0 ? '♮' : note.acc > 0 ? '♯'.repeat(note.acc) : '♭'.repeat(-note.acc);
      return { note, step: staffStep(note, sc.clef), acc };
    });
    const extra = notes.some((n) => n.acc) ? 12 : 0;
    const item = { x: x + extra, notes, dur: it.dur, label: it.label, midis: notes.map((n) => midiOf(n.note)) };
    x += extra + 22 + Math.min(4, it.dur) * 9;
    beats += it.dur;
    if (sc.time && beats >= perBar - 1e-9 && k < sc.items.length - 1) {
      bars.push(x - 6);
      beats -= perBar;
      x += 8;
    }
    return item;
  });
  return { width: Math.max(220, x + 16), keySteps, sharps: fifths >= 0, timeAt, items, bars };
}

// ---------- example program ----------
export type TraceStep = { line: number; vars: Record<string, string>; note: string };
export type Program = { lang: CodeLang; code: string; output: string; trace: TraceStep[]; schema?: string };
export function parseProgram(raw: unknown): Program | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const code = s(r.code, 4000);
  if (!code) return null;
  const lines = code.split('\n').length;
  const trace = arr<Record<string, unknown>>(r.trace, 30)
    .map((t) => {
      const vars: Record<string, string> = {};
      for (const [k, v] of Object.entries((t?.vars ?? {}) as Record<string, unknown>).slice(0, 8)) if (s(k, 20)) vars[s(k, 20)] = typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60) ?? '';
      return { line: Math.round(numOr(t?.line, 0)), vars, note: s(t?.note, 300) };
    })
    .filter((t) => t.line >= 1 && t.line <= lines);
  const lang = toLang(r.lang ?? r.language);
  return { lang, code, output: s(r.output, 2000), trace, ...(lang === 'sql' && s(r.schema, 4000) ? { schema: s(r.schema, 4000) } : {}) };
}
/** Variables that changed compared with the step before (for highlighting). */
export function changedVars(trace: TraceStep[], k: number): string[] {
  const now = trace[k]?.vars ?? {};
  const before = k > 0 ? trace[k - 1].vars : {};
  return Object.keys(now).filter((v) => now[v] !== before[v]);
}

// ---------- case sketch ----------
export type SketchKind = 'vertrag' | 'anspruch' | 'uebereignung' | 'sonstiges';
export type Sketch = { parties: { id: string; name: string; role: string }[]; links: { from: string; to: string; label: string; kind: SketchKind }[]; question?: string };
export function parseSketch(raw: unknown): Sketch | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parties = arr<Record<string, unknown>>(r.parties ?? r.persons, 5)
    .map((p) => ({ id: s(p?.id ?? p?.name, 30), name: s(p?.name ?? p?.id, 40), role: s(p?.role, 60) }))
    .filter((p) => p.id && p.name);
  const ids = new Set(parties.map((p) => p.id));
  const kindOf = (v: unknown): SketchKind => {
    const k = s(v).toLowerCase();
    return /vertrag|contract/.test(k) ? 'vertrag' : /anspruch|claim/.test(k) ? 'anspruch' : /übereig|uebereig|eigentum|transfer/.test(k) ? 'uebereignung' : 'sonstiges';
  };
  const links = arr<Record<string, unknown>>(r.links, 8)
    .map((l) => ({ from: s(l?.from, 30), to: s(l?.to, 30), label: s(l?.label, 60), kind: kindOf(l?.kind) }))
    .filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
  if (parties.length < 2 || !links.length || ids.size !== parties.length) return null;
  return { parties, links, ...(s(r.question, 300) ? { question: s(r.question, 300) } : {}) };
}

// ---------- sentence parts, tables ----------
export const SYNTAX_ROLES = ['subjekt', 'praedikat', 'akkobjekt', 'datobjekt', 'adverbial', 'attribut', 'konjunktion', 'sonstiges'] as const;
export type SyntaxRole = (typeof SYNTAX_ROLES)[number];
export const ROLE_LABEL: Record<SyntaxRole, string> = {
  subjekt: 'Subjekt',
  praedikat: 'Prädikat',
  akkobjekt: 'Akkusativobjekt',
  datobjekt: 'Dativobjekt',
  adverbial: 'Adverbiale',
  attribut: 'Attribut',
  konjunktion: 'Konjunktion',
  sonstiges: 'sonstiges',
};
export type Sentence = { sentence: string; parts: { text: string; role: SyntaxRole }[]; translation?: string };
export type Table = { title: string; head: string[]; rows: string[][] };
export function roleOf(v: unknown): SyntaxRole {
  const k = s(v).toLowerCase().replace(/ä/g, 'ae');
  if (/subj/.test(k)) return 'subjekt';
  if (/praed|pred|verb/.test(k)) return 'praedikat';
  if (/dat/.test(k)) return 'datobjekt';
  if (/akk|acc|obj/.test(k)) return 'akkobjekt';
  if (/adv|umstand/.test(k)) return 'adverbial';
  if (/attr|adj/.test(k)) return 'attribut';
  if (/konj|conj/.test(k)) return 'konjunktion';
  return 'sonstiges';
}
export function parseSyntax(raw: unknown): Sentence[] {
  return arr<Record<string, unknown>>(raw, 4)
    .map((x) => ({
      sentence: s(x?.sentence, 300),
      parts: arr<Record<string, unknown>>(x?.parts, 14)
        .map((p) => ({ text: s(p?.text, 80), role: roleOf(p?.role) }))
        .filter((p) => p.text),
      ...(s(x?.translation, 300) ? { translation: s(x?.translation, 300) } : {}),
    }))
    .filter((x) => x.parts.length >= 2);
}
export function parseTables(raw: unknown): Table[] {
  return arr<Record<string, unknown>>(raw, 3)
    .map((t) => {
      const head = arr<unknown>(t?.head, 6).map((h) => s(h, 40));
      const rows = arr<unknown[]>(t?.rows, 10).map((r) => arr<unknown>(r, 6).map((c) => s(c, 80)));
      return { title: s(t?.title, 80), head, rows: rows.filter((r) => r.some(Boolean)) };
    })
    .filter((t) => t.rows.length >= 2);
}
/** "geh[[e]]" → [{text:'geh'}, {text:'e', mark:true}] – the marked part (an ending) is highlighted. */
export function markedParts(cell: string): { text: string; mark?: boolean }[] {
  return cell
    .split(/\[\[(.*?)\]\]/)
    .map((t, i) => (i % 2 ? { text: t, mark: true } : { text: t }))
    .filter((p) => p.text);
}

// ---------- formula playground ----------
export type FormulaVar = { name: string; label: string; min: number; max: number; step: number; value: number; unit: string };
export type FormulaLab = { type: 'formula'; title: string; expr: string; vars: FormulaVar[]; result: { label: string; unit: string }; plot?: string; ask?: string };
const FN_NAMES = new Set(['sin', 'cos', 'tan', 'exp', 'ln', 'log', 'sqrt', 'abs', 'pi', 'e', 'min', 'max', 'asin', 'acos', 'atan']);

/** The formula with the values put in (the plot variable as x). */
export function formulaWith(lab: Pick<FormulaLab, 'expr' | 'vars'>, values: Record<string, number>, plotVar?: string): string {
  const known = new Map(lab.vars.map((v) => [v.name, v]));
  return lab.expr.replace(/\b[A-Za-z]{1,3}\b/g, (w) => (!known.has(w) ? w : w === plotVar ? '(x)' : `(${values[w] ?? known.get(w)!.value})`));
}
export function formulaValue(lab: FormulaLab, values: Record<string, number>): number | null {
  const f = compileExpr(formulaWith(lab, values));
  const v = f ? f(0) : NaN;
  return Number.isFinite(v) ? v : null;
}
export function formulaCurve(lab: FormulaLab, values: Record<string, number>) {
  const v = lab.vars.find((x) => x.name === lab.plot);
  if (!v) return null;
  const f = compileExpr(formulaWith(lab, values, v.name));
  return f ? sampleCurve(f, v.min, v.max, 80) : null;
}
export function parseFormulaLab(raw: unknown): FormulaLab | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const expr = s(r.expr ?? r.formula, 160);
  const vars = arr<Record<string, unknown>>(r.vars, 4)
    .map((v) => {
      const min = numOr(v?.min, 0), max = numOr(v?.max, 10);
      const step = numOr(v?.step, (max - min) / 100);
      return { name: s(v?.name, 3), label: s(v?.label ?? v?.name, 40), min, max, step: step > 0 ? step : (max - min) / 100, value: Math.min(max, Math.max(min, numOr(v?.value, (min + max) / 2))), unit: s(v?.unit, 12) };
    })
    .filter((v) => /^[A-Za-z]{1,3}$/.test(v.name) && !FN_NAMES.has(v.name.toLowerCase()) && v.max > v.min);
  if (!expr || !vars.length || new Set(vars.map((v) => v.name)).size !== vars.length) return null;
  const res = (r.result ?? {}) as Record<string, unknown>;
  const lab: FormulaLab = {
    type: 'formula',
    title: s(r.title, 80) || 'Formel zum Ausprobieren',
    expr,
    vars,
    result: { label: s(res.label ?? r.resultLabel, 40) || 'Ergebnis', unit: s(res.unit, 12) },
    ...(vars.some((v) => v.name === s(r.plot)) ? { plot: s(r.plot) } : {}),
    ...(s(r.ask, 300) ? { ask: s(r.ask, 300) } : {}),
  };
  const init = Object.fromEntries(vars.map((v) => [v.name, v.value]));
  return formulaValue(lab, init) === null ? null : lab;
}
