import { useEffect, useState, type ReactNode } from 'react';
import { CardContent } from '../CardContent';
import { CodeEditor } from '../CodeEditor';
import { IconCheck, IconClose, IconPlay, IconPlus } from '../Icons';
import { Lab } from '../labs/Labs';
import { completeJson, gradeAnswer } from '../../lib/ai';
import { openExternal } from '../../lib/desktop';
import { buildHarness, harnessOffset, localJava, mapErrors, parseResults, runJavaLocal, runJavaOnline, type RunResult, type TestResult } from '../../lib/javaRun';
import { checkAnswer, parseSimpler, simplerPrompt, DOMAIN_LABEL, problemCount, solvedCount, taskList, type JavaProblem, type MathProblem, type PracticeSet, type ProblemProgress } from '../../lib/practice';
import { setSettings, useStore } from '../../lib/store';
import { CaseTaskView, ClassifyTaskView, ClozeTaskView, MultiTaskView, OrderTaskView } from './ActiveTasks';
import { MusicTaskView } from './MusicTask';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** What a set view needs from its owner (a deck or a skill). */
export type SetHost = {
  /** Saves the progress of task i. */
  progress: (i: number, patch: Partial<ProblemProgress>) => void;
  /** Saves a task as a flashcard (front/back, HTML or plain). Returns a short note to show. */
  saveCard: (front: string, back: string, html?: boolean) => string;
  /** Changes the set itself (e.g. stores the simpler explanation). */
  updateSet?: (patch: Partial<PracticeSet>) => void;
  /** Education level of the person (for simpler explanations). */
  level?: string;
};

/** Shared by all task views: progress of this task, saving it, going on. */
export type TaskCtx = { set: PracticeSet; i: number; prog: ProblemProgress; host: SetHost; onNext: () => void };

/** A practice set: explanation, worked example, labs, then the tasks one after another. */
export function PracticeSetView({ set, host, head, onDone }: { set: PracticeSet; host: SetHost; head?: ReactNode; onDone?: ReactNode }) {
  const tasks = taskList(set);
  const n = problemCount(set);
  const firstOpen = set.progress.findIndex((p) => !p.solved);
  const [i, setI] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [steps, setSteps] = useState(0);
  const done = solvedCount(set);
  const t = tasks[i];
  const ctx: TaskCtx = { set, i, prog: set.progress[i] ?? { tries: 0, hints: 0 }, host, onNext: () => setI((x) => Math.min(n - 1, x + 1)) };
  return (
    <>
      <section className="panel">
        {head}
        <span className={'badge ' + set.kind}>{DOMAIN_LABEL[set.kind] ?? 'Übung'}</span>
        <h2>{set.topic}</h2>
        <Explanation set={set} host={host} steps={steps} setSteps={setSteps} />
      </section>
      {set.labs.map((l, k) => (
        <Lab key={k} spec={l} />
      ))}
      <section className="panel">
        <div className="practice-nav" role="tablist" aria-label="Aufgaben">
          {Array.from({ length: n }, (_, k) => (
            <button key={k} type="button" role="tab" aria-selected={k === i} className={(k === i ? 'on ' : '') + (set.progress[k]?.solved ? 'done' : '')} onClick={() => setI(k)}>
              {set.progress[k]?.solved ? <IconCheck size={13} /> : k + 1}
            </button>
          ))}
          <span className="muted small grow right">
            {done} von {n} gelöst
          </span>
        </div>
        {t?.type === 'calc' && <CalcTask key={set.id + i} ctx={ctx} p={t} />}
        {t?.type === 'code' && <CodeTask key={set.id + i} ctx={ctx} p={t} />}
        {t?.type === 'order' && <OrderTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'classify' && <ClassifyTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'cloze' && <ClozeTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'multi' && <MultiTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'case' && <CaseTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'music' && <MusicTaskView key={set.id + i} ctx={ctx} task={t} />}
        {done === n && (onDone ?? <p className="form-ok">Alle Aufgaben gelöst – stark!</p>)}
      </section>
    </>
  );
}

/** The explanation and worked example – or the simpler version („Einfacher erklären“). */
function Explanation({ set, host, steps, setSteps }: { set: PracticeSet; host: SetHost; steps: number; setSteps: (f: (x: number) => number) => void }) {
  const [original, setOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const simple = !original && set.simple;
  const intro = simple ? set.simple!.intro : set.intro;
  const example = simple ? set.simple!.example : set.example;
  const code = !simple ? set.example?.code : undefined;
  const simplify = async () => {
    setBusy(true);
    setError('');
    try {
      const p = simplerPrompt(set, host.level);
      const r = parseSimpler(await completeJson(p.system, p.user, p.maxTokens));
      if (!r) throw new Error('Die KI hat keine einfachere Erklärung geliefert. Bitte nochmal versuchen.');
      host.updateSet?.({ simple: r });
      setOriginal(false);
      setSteps(() => 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {intro && (
        <div className="practice-intro">
          {simple && <span className="badge ok">einfacher erklärt</span>}
          <CardContent text={intro} />
        </div>
      )}
      {example && (
        <div className="practice-example">
          <b>Beispiel</b>
          <CardContent text={example.problem} />
          {code && <pre className="code" dangerouslySetInnerHTML={{ __html: esc(code) }} />}
          {example.steps.slice(0, steps).map((s, k) => (
            <div key={k} className="practice-step">
              <span>{k + 1}</span>
              <CardContent text={s} />
            </div>
          ))}
          {steps < example.steps.length ? (
            <button type="button" className="btn outline sm" onClick={() => setSteps((x) => x + 1)}>
              {steps ? 'Nächster Schritt' : 'Lösungsweg zeigen'} ({steps}/{example.steps.length})
            </button>
          ) : (
            example.answer && (
              <p>
                <b>Ergebnis:</b> <CardContent text={example.answer} className="inline" />
              </p>
            )
          )}
        </div>
      )}
      {host.updateSet && (
        <div className="row-gap">
          {set.simple ? (
            <button type="button" className="btn ghost sm" onClick={() => (setOriginal(!original), setSteps(() => 0))}>
              {original ? 'Einfache Erklärung zeigen' : 'Original zeigen'}
            </button>
          ) : (
            <button type="button" className="btn outline sm" onClick={() => void simplify()} disabled={busy}>
              {busy ? 'Pip erklärt es einfacher …' : '🙂 Einfacher erklären'}
            </button>
          )}
          {error && <span className="form-error small">{error}</span>}
        </div>
      )}
    </>
  );
}

export function Hints({ hints, used, onMore }: { hints: string[]; used: number; onMore: () => void }) {
  if (!hints.length) return null;
  return (
    <div className="practice-hints">
      {hints.slice(0, used).map((h, k) => (
        <div key={k} className="practice-hint">
          <b>Hinweis {k + 1}:</b> <CardContent text={h} className="inline" />
        </div>
      ))}
      {used < hints.length && (
        <button type="button" className="btn ghost sm" onClick={onMore}>
          💡 {used ? 'Noch ein Hinweis' : 'Hinweis'} ({used}/{hints.length})
        </button>
      )}
    </div>
  );
}

/** The row under every task: show solution, save as card, next task. */
export function TaskFooter({ ctx, solution, card, canShow }: { ctx: TaskCtx; solution?: ReactNode; card: () => [string, string, boolean?]; canShow?: boolean }) {
  const [show, setShow] = useState(!!ctx.prog.shown);
  const [note, setNote] = useState('');
  return (
    <>
      <div className="row-gap">
        {solution && (canShow ?? (ctx.prog.tries >= 1 || ctx.prog.solved)) && (
          <button type="button" className="btn ghost sm" onClick={() => (setShow(!show), ctx.host.progress(ctx.i, { shown: true }))}>
            {show ? 'Lösung ausblenden' : 'Lösung zeigen'}
          </button>
        )}
        <button
          type="button"
          className="btn ghost sm"
          disabled={!!note}
          onClick={() => {
            const [f, b, h] = card();
            setNote(ctx.host.saveCard(f, b, h));
          }}
        >
          <IconPlus size={14} /> {note || 'Als Karte speichern'}
        </button>
        {ctx.prog.solved && (
          <button type="button" className="btn outline sm" onClick={ctx.onNext}>
            Nächste Aufgabe ›
          </button>
        )}
      </div>
      {show && solution}
    </>
  );
}

/** Right / wrong message after checking. */
export function Verdict({ ok, text }: { ok: boolean | null; text?: string }) {
  if (ok === null) return null;
  return ok ? (
    <p className="form-ok">
      <IconCheck size={15} /> Richtig! {text}
    </p>
  ) : (
    <p className="form-error">
      <IconClose size={15} /> Noch nicht. {text}
    </p>
  );
}

function CalcTask({ ctx, p }: { ctx: TaskCtx; p: MathProblem }) {
  const { prog, host, i } = ctx;
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'right' | 'wrong' | 'invalid' | null>(prog.solved ? 'right' : null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async (value = input) => {
    let r = checkAnswer(p.answer, value);
    setFeedback('');
    if (r === 'ai') {
      setBusy(true);
      try {
        const g = await gradeAnswer(p.problem, p.answer.value, value);
        r = g.score >= 3 ? 'right' : 'wrong';
        setFeedback(g.feedback);
      } catch (e) {
        setFeedback((e as Error).message);
        r = 'invalid';
      } finally {
        setBusy(false);
      }
    }
    if (r === 'invalid' && p.answer.type !== 'text') {
      setResult('invalid');
      return;
    }
    setResult(r as 'right' | 'wrong');
    host.progress(i, { tries: prog.tries + 1, ...(r === 'right' ? { solved: true } : {}) });
  };

  return (
    <div className="practice-task">
      <CardContent text={p.problem} className="practice-problem" />
      {p.answer.type === 'choice' ? (
        <div className="practice-choices">
          {p.answer.options!.map((o) => (
            <button key={o} type="button" className="btn outline" onClick={() => (setInput(o), void check(o))} disabled={busy}>
              <CardContent text={o} className="inline" />
            </button>
          ))}
        </div>
      ) : (
        <div className="input-row">
          {p.answer.type === 'text' ? (
            <textarea className="input" rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Deine Antwort" />
          ) : (
            <input
              className="input"
              value={input}
              onChange={(e) => (setInput(e.target.value), setResult(null))}
              onKeyDown={(e) => e.key === 'Enter' && void check()}
              placeholder={p.answer.type === 'expr' ? 'Formel in x, z. B. 2*x+3' : p.answer.type === 'fraction' ? 'z. B. 3/8 oder 0,375' : 'Zahl, z. B. 0,27 oder 27 %'}
              inputMode={p.answer.type === 'expr' ? 'text' : 'decimal'}
            />
          )}
          <button type="button" className="btn primary" onClick={() => void check()} disabled={busy || !input.trim()}>
            {busy ? 'Wird geprüft …' : 'Prüfen'}
          </button>
        </div>
      )}
      {p.answer.type === 'expr' && input.trim() && <CardContent text={`Vorschau: \\( ${input.replace(/\*/g, ' \\cdot ')} \\)`} className="muted small" />}
      {result === 'invalid' ? (
        <p className="form-error">Diese Eingabe kann Merkora nicht lesen – {p.answer.type === 'expr' ? 'schreibe die Formel mit x, * und ^.' : 'gib eine Zahl ein.'}</p>
      ) : (
        <Verdict ok={result === null ? null : result === 'right'} text={feedback + (result === 'wrong' && prog.tries >= 2 && prog.hints < p.hints.length ? ' Ein Hinweis hilft vielleicht.' : '')} />
      )}
      <Hints hints={p.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        ctx={ctx}
        solution={
          <ol className="practice-steps">
            {p.steps.map((s, k) => (
              <li key={k}>
                <CardContent text={s} />
              </li>
            ))}
            <li className="answer">
              <b>Ergebnis:</b> <CardContent text={p.answer.value} className="inline" />
            </li>
          </ol>
        }
        card={() => [p.problem, `${p.answer.value}${p.steps.length ? '\n\nLösungsweg:\n' + p.steps.map((s, k) => `${k + 1}. ${s}`).join('\n') : ''}`]}
      />
    </div>
  );
}

const draftKey = (set: PracticeSet, i: number) => `merkora.code.${set.id}.${i}`;
function loadDraft(set: PracticeSet, i: number, fallback: string) {
  try {
    return localStorage.getItem(draftKey(set, i)) ?? fallback;
  } catch {
    return fallback;
  }
}

function CodeTask({ ctx, p }: { ctx: TaskCtx; p: JavaProblem }) {
  const { set, i, prog, host } = ctx;
  const [code, setCode] = useState(() => loadDraft(set, i, p.starter));
  const [running, setRunning] = useState<'' | 'run' | 'test'>('');
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [out, setOut] = useState<{ text: string; error?: string; via?: RunResult['via'] } | null>(null);
  const [askOnline, setAskOnline] = useState<'run' | 'test' | null>(null);
  const onlineOk = useStore((s) => !!s.data.settings.onlineCodeOk);
  const [java, setJava] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void localJava().then(setJava);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(set, i), code);
    } catch {
      /* no storage */
    }
  }, [code, set, i]);

  const exec = async (mode: 'run' | 'test', online: boolean) => {
    const tests = mode === 'test' ? p.tests : [];
    if (mode === 'run' && !/\bstatic\s+void\s+main\s*\(/.test(code)) {
      setOut({ text: '', error: 'Zum Ausführen braucht deine Klasse Solution eine Methode „public static void main(String[] args)“. Mit „Testen“ prüft Merkora deine Methoden direkt.' });
      return;
    }
    const src = buildHarness(code, tests);
    setRunning(mode);
    setOut(null);
    try {
      let r: RunResult | 'no-java' = online ? await runJavaOnline(src) : await runJavaLocal(src);
      if (r === 'no-java') {
        setJava(null);
        if (!onlineOk) {
          setAskOnline(mode);
          return;
        }
        r = await runJavaOnline(src);
      }
      const offset = harnessOffset(tests);
      if (r.compileError) {
        setResults(null);
        setOut({ text: '', error: 'Dein Code lässt sich nicht übersetzen:\n' + mapErrors(r.stderr, offset), via: r.via });
      } else if (r.timedOut) {
        setOut({ text: r.stdout, error: 'Das Programm hat zu lange gebraucht (Endlosschleife?) und wurde gestoppt.', via: r.via });
      } else if (mode === 'test') {
        const pr = parseResults(r.stdout, p.tests);
        setResults(pr.results);
        setOut({ text: pr.output, error: r.stderr.trim() ? mapErrors(r.stderr, offset) : undefined, via: r.via });
        host.progress(i, { tries: prog.tries + 1, ...(pr.results.every((x) => x.ok) ? { solved: true } : {}) });
      } else {
        setOut({ text: r.stdout, error: r.stderr.trim() ? mapErrors(r.stderr, offset) : undefined, via: r.via });
      }
    } catch (e) {
      setOut({ text: '', error: (e as Error).message });
    } finally {
      setRunning('');
    }
  };
  const go = (mode: 'run' | 'test') => {
    if (java === null && !onlineOk) {
      setAskOnline(mode);
      return;
    }
    void exec(mode, java === null);
  };
  const passed = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="practice-task">
      <h3>{p.title}</h3>
      <CardContent text={p.task} className="practice-problem" />
      <CodeEditor value={code} onChange={setCode} label={`Code für ${p.title}`} />
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={() => go('test')} disabled={!!running}>
          <IconCheck size={15} /> {running === 'test' ? 'Wird getestet …' : `Testen (${p.tests.length})`}
        </button>
        <button type="button" className="btn outline" onClick={() => go('run')} disabled={!!running}>
          <IconPlay size={14} /> {running === 'run' ? 'Läuft …' : 'Ausführen'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setCode(p.starter)} disabled={!!running}>
          Zurücksetzen
        </button>
        <span className="muted small">{java ? `Java ${java} auf diesem PC` : java === null ? (onlineOk ? 'läuft online (wandbox.org)' : 'kein Java auf diesem Gerät') : ''}</span>
      </div>
      {askOnline && (
        <div className="practice-consent">
          <p>
            <b>Code online ausführen?</b> Auf diesem Gerät gibt es kein Java. Merkora kann deinen Code an den kostenlosen Dienst <b>wandbox.org</b> schicken und
            dort ausführen – nur den Code, keine Lerndaten.
          </p>
          <div className="row-gap">
            <button type="button" className="btn primary sm" onClick={() => (setSettings({ onlineCodeOk: true }), setAskOnline(null), void exec(askOnline, true))}>
              Erlauben und ausführen
            </button>
            {java !== undefined && (
              <button type="button" className="btn outline sm" onClick={() => openExternal('https://adoptium.net/de/temurin/releases/')}>
                Java kostenlos installieren
              </button>
            )}
            <button type="button" className="btn ghost sm" onClick={() => setAskOnline(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
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
      {out && (out.text || out.error) && (
        <div className="code-output">
          {out.text && <pre>{out.text}</pre>}
          {out.error && <pre className="err">{out.error}</pre>}
          {out.via === 'online' && <small className="muted">ausgeführt bei wandbox.org</small>}
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
