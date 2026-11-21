/**
 * Running code tasks in other languages, right in Merkora:
 * JavaScript in a web worker (stopped after a few seconds), Python with Pyodide in a worker (loaded once
 * from the internet, then cached by the browser), SQL with sql.js on a fresh sample database.
 * The comparison helpers are pure – tested in scripts/test-srs.mts.
 */
import type { JavaTest } from './practice';

export type CallResult = { ok: boolean; v?: string; error?: string };
export type WebRun = { compileError?: string; results: CallResult[]; logs: string; timedOut?: boolean };

/** Output compared tolerantly: spaces, quote style and quotes around plain text do not matter. */
export function normOut(t: string): string {
  return t
    .trim()
    .replace(/\s+/g, '')
    .replace(/"/g, "'")
    .replace(/^'(.*)'$/s, '$1');
}
export const sameOut = (expected: string, got: string) => normOut(expected) === normOut(got);

/** Test results in the shape the Java view uses. */
export function testResults(tests: JavaTest[], run: WebRun) {
  return tests.map((t, k) => {
    const r = run.results[k];
    if (!r) return { n: k + 1, ok: false, error: 'nicht ausgeführt' };
    if (!r.ok) return { n: k + 1, ok: false, error: r.error };
    return { n: k + 1, ok: sameOut(t.expected, r.v ?? ''), got: r.v };
  });
}

// ---------- JavaScript ----------
const JS_WORKER = `
const fmt = (v) => typeof v === 'string' ? v : v === undefined ? 'undefined' : typeof v === 'function' ? '[Funktion]' : JSON.stringify(v);
self.onmessage = (e) => {
  const { code, calls } = e.data;
  const logs = [];
  const log = (...a) => logs.push(a.map(fmt).join(' '));
  const con = { log, error: log, warn: log, info: log };
  let thunks;
  try {
    thunks = new Function('console', code + '\\n;return [' + calls.map((c) => '() => (' + c + ')').join(',') + '];')(con);
  } catch (err) {
    postMessage({ compileError: String((err && err.message) || err), results: [], logs: logs.join('\\n') });
    return;
  }
  const results = thunks.map((t) => {
    try { return { ok: true, v: fmt(t()) }; } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  });
  postMessage({ results, logs: logs.join('\\n') });
};`;

function runWorker(src: string, job: unknown, ms: number): Promise<WebRun> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    const done = (r: WebRun) => {
      clearTimeout(timer);
      w.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done({ results: [], logs: '', timedOut: true }), ms);
    w.onmessage = (e) => done(e.data as WebRun);
    w.onerror = (e) => (e.preventDefault(), done({ compileError: e.message || 'Fehler beim Ausführen', results: [], logs: '' }));
    w.postMessage(job);
  });
}

export const runJs = (code: string, calls: string[]) => runWorker(JS_WORKER, { code, calls }, 3000);

// ---------- Python (Pyodide) ----------
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const PY_WORKER = `
importScripts('${PYODIDE}pyodide.js');
let py = null;
loadPyodide({ indexURL: '${PYODIDE}' }).then((p) => { py = p; postMessage({ ready: true }); }, (err) => postMessage({ loadError: String((err && err.message) || err) }));
const last = (m) => { const lines = String(m).trim().split('\\n'); return lines[lines.length - 1]; };
self.onmessage = (e) => {
  const { code, calls } = e.data;
  let out = '';
  py.setStdout({ batched: (s) => { out += s + '\\n'; } });
  py.setStderr({ batched: (s) => { out += s + '\\n'; } });
  const ns = py.globals.get('dict')();
  try {
    py.runPython(code, { globals: ns });
  } catch (err) {
    postMessage({ compileError: last(err.message), results: [], logs: out });
    return;
  }
  const results = calls.map((c) => {
    try { return { ok: true, v: String(py.runPython('repr(' + c + ')', { globals: ns })) }; } catch (err) { return { ok: false, error: last(err.message) }; }
  });
  postMessage({ results, logs: out });
};`;

let pyWorker: Worker | null = null;
let pyReady: Promise<void> | null = null;
/** Loads Python once (about 10 MB from jsdelivr the first time, then from the browser cache). */
function python(): Promise<Worker> {
  if (pyWorker && pyReady) return pyReady.then(() => pyWorker!);
  const url = URL.createObjectURL(new Blob([PY_WORKER], { type: 'text/javascript' }));
  const w = new Worker(url);
  pyWorker = w;
  pyReady = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Python konnte nicht geladen werden (keine Internetverbindung?).')), 90_000);
    w.onmessage = (e) => {
      if (e.data?.ready) (clearTimeout(t), resolve());
      else if (e.data?.loadError) (clearTimeout(t), reject(new Error('Python konnte nicht geladen werden: ' + e.data.loadError)));
    };
    w.onerror = (e) => (e.preventDefault(), clearTimeout(t), reject(new Error('Python konnte nicht geladen werden (keine Internetverbindung?).')));
  }).catch((e) => {
    pyWorker?.terminate();
    pyWorker = null;
    pyReady = null;
    throw e;
  });
  return pyReady.then(() => w);
}
export const pythonLoaded = () => !!pyWorker && !!pyReady;

export async function runPython(code: string, calls: string[]): Promise<WebRun> {
  const w = await python();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // an endless loop: throw the interpreter away, the next run loads it again (from the cache)
      w.terminate();
      pyWorker = null;
      pyReady = null;
      resolve({ results: [], logs: '', timedOut: true });
    }, 8000);
    w.onmessage = (e) => {
      if (e.data?.ready) return;
      clearTimeout(timer);
      resolve(e.data as WebRun);
    };
    w.postMessage({ code, calls });
  });
}

// ---------- SQL (sql.js, SQLite) ----------
export type SqlTable = { columns: string[]; rows: (string | number | null)[][] };
let sqlLib: Promise<import('sql.js').SqlJsStatic> | null = null;
function sqlJs() {
  sqlLib ??= Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]).then(([{ default: init }, { default: wasmUrl }]) => init({ locateFile: () => wasmUrl }));
  return sqlLib;
}
/** Runs a query on a fresh database built from the schema; the last statement's result is returned. */
export async function runSql(schema: string, query: string): Promise<SqlTable | { error: string }> {
  const SQL = await sqlJs();
  const db = new SQL.Database();
  try {
    db.exec(schema);
  } catch (e) {
    db.close();
    return { error: 'Beispieldatenbank: ' + (e as Error).message };
  }
  try {
    const res = db.exec(query);
    const last = res[res.length - 1];
    return last ? { columns: last.columns, rows: last.values as (string | number | null)[][] } : { columns: [], rows: [] };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    db.close();
  }
}
const cell = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : v);
/** Same result? Same number of columns and the same rows – in the same order only if the solution sorts. */
export function sameRows(mine: SqlTable, want: SqlTable, ordered: boolean): boolean {
  if (mine.columns.length !== want.columns.length || mine.rows.length !== want.rows.length) return false;
  const a = mine.rows.map((r) => r.map(cell).join('\u0001'));
  const b = want.rows.map((r) => r.map(cell).join('\u0001'));
  if (!ordered) {
    a.sort();
    b.sort();
  }
  return a.every((x, i) => x === b[i]);
}
export const sqlOrdered = (solution: string) => /\border\s+by\b/i.test(solution);
