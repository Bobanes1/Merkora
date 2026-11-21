import { useEffect, useState } from 'react';
import { CardContent } from '../CardContent';
import { CodeEditor } from '../CodeEditor';
import { IconCheck, IconClose, IconPlay } from '../Icons';
import { pythonLoaded, runJs, runPython, runSql, sameRows, sqlOrdered, testResults, type SqlTable, type WebRun } from '../../lib/codeRun';
import { CODE_LANG_LABEL, type JavaProblem } from '../../lib/practice';
import { Hints, TaskFooter, type TaskCtx } from './PracticeSetView';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const draftKey = (setId: string, i: number) => `merkora.code.${setId}.${i}`;

function Table({ t }: { t: SqlTable }) {
  if (!t.columns.length) return <p className="muted small">Keine Ergebniszeilen.</p>;
  return (
    <div className="sql-result">
      <table>
        <thead>
          <tr>
            {t.columns.map((c, k) => (
              <th key={k}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.slice(0, 50).map((r, k) => (
            <tr key={k}>
              {r.map((v, j) => (
                <td key={j}>{v === null ? <i className="muted">NULL</i> : String(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.rows.length > 50 && <small className="muted">… und {t.rows.length - 50} weitere Zeilen</small>}
    </div>
  );
}

/** Code tasks in JavaScript, Python or SQL – run right in Merkora, without installing anything. */
export function WebCodeTask({ ctx, p }: { ctx: TaskCtx; p: JavaProblem }) {
  const { set, i, prog, host } = ctx;
  const lang = p.lang ?? 'javascript';
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem(draftKey(set.id, i)) ?? p.starter;
    } catch {
      return p.starter;
    }
  });
  const [running, setRunning] = useState<'' | 'run' | 'test' | 'load'>('');
  const [results, setResults] = useState<{ n: number; ok: boolean; got?: string; error?: string }[] | null>(null);
  const [out, setOut] = useState<{ text: string; error?: string } | null>(null);
  const [sql, setSql] = useState<{ mine?: SqlTable; ok?: boolean } | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(set.id, i), code);
    } catch {
      /* no storage */
    }
  }, [code, set.id, i]);

  const run = async (calls: string[]): Promise<WebRun> => {
    if (lang === 'python') {
      if (!pythonLoaded()) setRunning('load');
      const r = await runPython(code, calls);
      return r;
    }
    return runJs(code, calls);
  };

  const exec = async (mode: 'run' | 'test') => {
    setRunning(mode);
    setOut(null);
    try {
      if (lang === 'sql') {
        const mine = await runSql(p.schema ?? '', code);
        if ('error' in mine) {
          setSql(null);
          setOut({ text: '', error: mine.error });
          if (mode === 'test') host.progress(i, { tries: prog.tries + 1, last: `${code}\n\nFehler: ${mine.error}`, mistake: undefined });
          return;
        }
        if (mode === 'run') {
          setSql({ mine });
          return;
        }
        const want = await runSql(p.schema ?? '', p.solution);
        const ok = !('error' in want) && sameRows(mine, want, sqlOrdered(p.solution));
        setSql({ mine, ok });
        host.progress(i, { tries: prog.tries + 1, ...(ok ? { solved: true } : { last: `${code}\n\n(${mine.rows.length} Zeilen, ${mine.columns.length} Spalten)`, mistake: undefined }) });
        return;
      }
      const r = await run(mode === 'test' ? p.tests.map((t) => t.call) : []);
      if (r.timedOut) {
        setOut({ text: '', error: 'Das Programm hat zu lange gebraucht (Endlosschleife?) und wurde gestoppt.' });
        return;
      }
      if (r.compileError) {
        setResults(null);
        setOut({ text: r.logs, error: r.compileError });
        if (mode === 'test') host.progress(i, { tries: prog.tries + 1, last: `${code}\n\nFehler: ${r.compileError}`, mistake: undefined });
        return;
      }
      setOut({ text: r.logs });
      if (mode === 'test') {
        const res = testResults(p.tests, r);
        setResults(res);
        const failed = res.filter((x) => !x.ok).map((x) => `Test ${x.n}: erwartet ${p.tests[x.n - 1]?.expected ?? '?'}, bekommen ${x.got ?? x.error ?? '–'}`);
        host.progress(i, { tries: prog.tries + 1, ...(res.every((x) => x.ok) ? { solved: true } : { last: `${code}\n\n${failed.join('\n')}`, mistake: undefined }) });
      }
    } catch (e) {
      setOut({ text: '', error: (e as Error).message });
    } finally {
      setRunning('');
    }
  };
  const passed = results?.filter((r) => r.ok).length ?? 0;
  const testLabel = lang === 'sql' ? 'Prüfen' : `Testen (${p.tests.length})`;

  return (
    <div className="practice-task">
      <h3>
        {p.title} <span className="badge">{CODE_LANG_LABEL[lang]}</span>
      </h3>
      <CardContent text={p.task} className="practice-problem" />
      {lang === 'sql' && p.schema && (
        <details className="sql-schema">
          <summary>Beispieldatenbank ansehen</summary>
          <pre className="code" dangerouslySetInnerHTML={{ __html: esc(p.schema) }} />
        </details>
      )}
      <CodeEditor value={code} onChange={setCode} label={`Code für ${p.title}`} lang={lang} />
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={() => void exec('test')} disabled={!!running}>
          <IconCheck size={15} /> {running === 'test' ? 'Wird geprüft …' : testLabel}
        </button>
        <button type="button" className="btn outline" onClick={() => void exec('run')} disabled={!!running}>
          <IconPlay size={14} /> {running === 'run' ? 'Läuft …' : 'Ausführen'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setCode(p.starter)} disabled={!!running}>
          Zurücksetzen
        </button>
        <span className="muted small">
          {running === 'load' ? 'Python wird geladen (beim ersten Mal ca. 10 MB) …' : lang === 'python' ? 'läuft in Merkora (Python beim ersten Mal aus dem Internet)' : 'läuft direkt in Merkora'}
        </span>
      </div>
      {results && (
        <ul className="test-list">
          {results.map((r, k) => (
            <li key={k} className={r.ok ? 'ok' : 'bad'}>
              {r.ok ? <IconCheck size={14} /> : <IconClose size={14} />}
              <code>{p.tests[k].call}</code>
              {r.ok ? (
                <span className="muted"> = {p.tests[k].expected}</span>
              ) : r.got !== undefined ? (
                <span>
                  {' '}
                  erwartet <code>{p.tests[k].expected}</code>, erhalten <code>{r.got}</code>
                </span>
              ) : (
                <span> {r.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {results && (passed === results.length ? <p className="form-ok">Alle Tests bestanden!</p> : <p className="muted small">{passed} von {results.length} Tests bestanden.</p>)}
      {sql?.mine && <Table t={sql.mine} />}
      {sql?.ok === true && <p className="form-ok">Richtig – genau das gesuchte Ergebnis!</p>}
      {sql?.ok === false && <p className="muted small">Das Ergebnis stimmt noch nicht (Spalten, Zeilen{sqlOrdered(p.solution) ? ' oder Reihenfolge' : ''}).</p>}
      {out && (out.text || out.error) && (
        <div className="code-output">
          {out.text && <pre>{out.text}</pre>}
          {out.error && <pre className="err">{out.error}</pre>}
        </div>
      )}
      <Hints hints={p.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        ctx={ctx}
        canShow={prog.tries >= 2 || !!prog.solved}
        solution={p.solution ? <pre className="code" dangerouslySetInnerHTML={{ __html: esc(p.solution) }} /> : undefined}
        card={() => [`<b>${esc(p.title)}</b><br>${esc(p.task)}`, `<pre class="code"><code>${esc(p.solution || code)}</code></pre>`, true]}
      />
    </div>
  );
}
