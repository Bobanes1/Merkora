import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PALETTES, renderDiagram } from '../../lib/diagram';
import { useResolvedTheme } from '../../lib/theme';
import { playUi } from '../../lib/uiSound';
import { CardContent } from '../CardContent';
import { CodeEditor } from '../CodeEditor';
import { Confetti } from '../Mascot';
import { Markdown } from '../Markdown';
import { JavaSetup } from '../JavaSetup';
import { IconBulb, IconCheck, IconChevron, IconClose, IconDoc, IconHelp, IconPlay, IconPlus, IconSparkle, IconTarget } from '../Icons';
import { useLearnFocus } from '../../lib/learnFocus';
import { Lab } from '../labs/Labs';
import { completeJson, gradeAnswer } from '../../lib/ai';
import { openExternal } from '../../lib/desktop';
import { buildHarness, harnessOffset, localJava, mapErrors, parseResults, runJavaLocal, runJavaOnline, type RunResult, type TestResult } from '../../lib/javaRun';
import { bitesFrom, checkAnswer, insertTaskAfter, mistakePrompt, parseMistake, parseSimpler, simplerPrompt, DOMAIN_LABEL, problemCount, solvedCount, taskList, type Bite, type JavaProblem, type MathProblem, type PracticeSet, type ProblemProgress } from '../../lib/practice';
import { setSettings, useStore } from '../../lib/store';
import { CaseTaskView, ClassifyTaskView, ClozeTaskView, MultiTaskView, OrderTaskView } from './ActiveTasks';
import { MusicTaskView } from './MusicTask';
import { WebCodeTask } from './WebCodeTask';
import { BuildFigure, ProgramView, ScoreView, SketchView, SyntaxView, TablesView } from './Visuals';
import { EstimateTaskView, LabelTaskView, RoleplayTaskView, ScenarioTaskView, SheetTaskView } from './MoreTasks';

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
export type TaskCtx = { set: PracticeSet; i: number; prog: ProblemProgress; host: SetHost; onNext: () => void; isLast: boolean };

type Phase = 'learn' | 'example' | 'practice';
const READ_ALL_KEY = 'merkora.readAll';

/**
 * A practice set: explanation, worked example, labs, then the tasks one after another.
 * `guided` (skill lessons): step by step instead – understand in bites with a check question each,
 * then the example, then practise in focus mode. `focus`: focus mode for the tasks (stage tests, reviews).
 */
export function PracticeSetView({ set, host, head, onDone, guided, focus }: { set: PracticeSet; host: SetHost; head?: ReactNode; onDone?: ReactNode; guided?: boolean; focus?: boolean }) {
  const tasks = taskList(set);
  const n = problemCount(set);
  const firstOpen = set.progress.findIndex((p) => !p.solved);
  const [i, setI] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [steps, setSteps] = useState(0);
  const done = solvedCount(set);
  // confetti only when the last task is solved here, not when an already solved set is opened again
  const [startDone] = useState(done);
  const [readAll, setReadAll] = useState(() => {
    try {
      return localStorage.getItem(READ_ALL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const switchReadAll = (on: boolean) => {
    setReadAll(on);
    try {
      localStorage.setItem(READ_ALL_KEY, on ? '1' : '0');
    } catch {
      /* only for now */
    }
  };
  const bites = guided ? bitesFrom(set) : [];
  const hasExample = !!(set.example || set.figures?.length || set.score || set.sketch || set.syntax?.length || set.tables?.length || set.program || set.labs.length);
  const started = set.progress.some((p) => p.solved || p.tries > 0 || p.shown);
  const [phase, setPhaseState] = useState<Phase>(() => set.phase ?? (started || (!bites.length && !hasExample) ? 'practice' : bites.length ? 'learn' : 'example'));
  const g = !!guided && !readAll;
  const setPhase = (p: Phase) => {
    setPhaseState(p);
    host.updateSet?.({ phase: p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [focusOn, setFocus] = useLearnFocus((g && phase === 'practice') || (!guided && !!focus));
  const [sheet, setSheet] = useState(false);
  const t = tasks[i];
  const ctx: TaskCtx = { set, i, prog: set.progress[i] ?? { tries: 0, hints: 0 }, host, onNext: () => setI((x) => Math.min(n - 1, x + 1)), isLast: i >= n - 1 };

  // keys in focus mode: Enter = check / go on (Strg+Enter in text fields), ← → = other task, Esc = leave
  useEffect(() => {
    if (!focusOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      const typing = !!el.closest?.('textarea, [contenteditable="true"], .code-editor');
      const field = el.tagName === 'INPUT' || el.tagName === 'SELECT';
      if (e.key === 'Escape') {
        if (sheet) setSheet(false);
        else if (!document.querySelector('.modal-backdrop')) setFocus(false);
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (!typing && !field && el.tagName !== 'BUTTON' && el.tagName !== 'A'))) {
        const box = document.querySelector('.practice-tasks');
        const btn = box?.querySelector<HTMLButtonElement>('[data-primary]:not(:disabled)') ?? box?.querySelector<HTMLButtonElement>('.btn.primary:not(:disabled)');
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !typing && !field && !e.altKey && !e.ctrlKey && !e.metaKey && !sheet) {
        setI((x) => Math.max(0, Math.min(n - 1, x + (e.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusOn, sheet, n, setFocus]);

  const focusTools = (
    <div className="focus-tools">
      {g && (
        <button type="button" className="btn ghost sm" onClick={() => setSheet(true)}>
          <IconDoc size={14} /> Spickzettel
        </button>
      )}
      <button type="button" className="btn ghost sm" onClick={() => setFocus(!focusOn)} title={focusOn ? 'Seitenleiste wieder zeigen (Esc)' : 'Nur die Aufgabe zeigen'}>
        <IconTarget size={14} /> {focusOn ? 'Fokus beenden' : 'Fokus-Modus'}
      </button>
    </div>
  );

  const taskBox = (
    <section className="panel practice-tasks">
      <div className="practice-nav task-path" role="tablist" aria-label="Aufgaben">
        <div className="task-stations" style={{ ['--fill' as string]: `${n > 1 ? (Math.max(0, lastSolved(set, n)) / (n - 1)) * 100 : 0}%` }}>
          {Array.from({ length: n }, (_, k) => {
            const p = set.progress[k];
            const helped = !!p && (p.hints > 0 || !!p.shown || !!p.dunno || p.tries > 1);
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={k === i}
                className={(k === i ? 'on ' : '') + (p?.solved ? (helped ? 'done helped' : 'done') : '')}
                title={p?.solved ? (helped ? 'gelöst mit Hilfe' : 'gelöst ohne Hilfe') : `Aufgabe ${k + 1}`}
                onClick={() => setI(k)}
              >
                {p?.solved ? <IconCheck size={13} /> : k + 1}
              </button>
            );
          })}
        </div>
        <span className="muted small grow right">
          {done} von {n} gelöst
        </span>
        {!guided && focus && focusTools}
      </div>
      {t?.type === 'calc' && <CalcTask key={set.id + i} ctx={ctx} p={t} />}
        {t?.type === 'code' && (t.lang && t.lang !== 'java' ? <WebCodeTask key={set.id + i} ctx={ctx} p={t} /> : <CodeTask key={set.id + i} ctx={ctx} p={t} />)}
        {t?.type === 'order' && <OrderTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'classify' && <ClassifyTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'cloze' && <ClozeTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'multi' && <MultiTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'case' && <CaseTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'music' && <MusicTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'estimate' && <EstimateTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'label' && <LabelTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'sheet' && <SheetTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'scenario' && <ScenarioTaskView key={set.id + i} ctx={ctx} task={t} />}
        {t?.type === 'roleplay' && <RoleplayTaskView key={set.id + i} ctx={ctx} task={t} />}
        {done === n && (onDone ?? <p className="form-ok">Alle Aufgaben gelöst – stark!</p>)}
        {done === n && startDone < n && <Confetti count={50} />}
    </section>
  );

  const labs = set.labs.map((l, k) => <Lab key={k} spec={l} />);

  if (!g)
    return (
      <>
        <section className="panel">
          {head}
          <span className={'badge ' + set.kind}>{DOMAIN_LABEL[set.kind] ?? 'Übung'}</span>
          <h2>{set.topic}</h2>
          <Explanation set={set} host={host} steps={steps} setSteps={setSteps} />
          {guided && (
            <button type="button" className="link-btn small read-mode" onClick={() => switchReadAll(false)}>
              Lieber Schritt für Schritt lernen
            </button>
          )}
        </section>
        {labs}
        {taskBox}
      </>
    );

  const order: Phase[] = [...(bites.length ? (['learn'] as Phase[]) : []), ...(hasExample ? (['example'] as Phase[]) : []), 'practice'];
  const after = (p: Phase) => order[order.indexOf(p) + 1] ?? 'practice';
  return (
    <>
      <section className={'panel guided-head' + (phase === 'practice' ? ' slim' : '')}>
        {head}
        {phase !== 'practice' && (
          <>
            <span className={'badge ' + set.kind}>{DOMAIN_LABEL[set.kind] ?? 'Übung'}</span>
            <h2>{set.topic}</h2>
          </>
        )}
        <div className="phase-row">
          <ol className="phase-steps" aria-label="Ablauf der Lektion">
            {order.map((p, k) => (
              <li key={p} className={p === phase ? 'on' : order.indexOf(phase) > k ? 'done' : ''}>
                <button type="button" onClick={() => setPhase(p)} aria-current={p === phase ? 'step' : undefined}>
                  <span>{order.indexOf(phase) > k ? <IconCheck size={12} /> : k + 1}</span> {PHASE_LABEL[p]}
                </button>
              </li>
            ))}
          </ol>
          {phase === 'practice' ? (
            focusTools
          ) : (
            <button type="button" className="link-btn small" onClick={() => switchReadAll(true)}>
              Alles auf einmal zeigen
            </button>
          )}
        </div>
      </section>
      {phase === 'learn' && <BitesView set={set} bites={bites} host={host} onDone={() => setPhase(after('learn'))} />}
      {phase === 'example' && (
        <>
          <section className="panel">
            <Explanation set={set} host={host} steps={steps} setSteps={setSteps} hideText />
          </section>
          {labs}
          <div className="phase-next">
            <button type="button" className="btn primary" onClick={() => setPhase('practice')}>
              Jetzt selbst üben <IconChevron size={15} />
            </button>
          </div>
        </>
      )}
      {phase === 'practice' && taskBox}
      {sheet &&
        createPortal(
        <div className="cheat-backdrop" onClick={() => setSheet(false)}>
          <aside className="cheat-sheet" role="dialog" aria-label="Spickzettel" onClick={(e) => e.stopPropagation()}>
            <header>
              <b>Spickzettel</b>
              <button type="button" className="icon-btn" aria-label="Spickzettel schließen" onClick={() => setSheet(false)}>
                <IconClose size={18} />
              </button>
            </header>
            {bites.map((b, k) => (
              <div key={k} className="cheat-bite">
                {b.title && <h4>{b.title}</h4>}
                <div className="md">
                  <Markdown text={b.text} />
                </div>
              </div>
            ))}
            <Explanation set={set} host={host} steps={steps} setSteps={setSteps} hideText />
            {labs}
          </aside>
        </div>,
          document.body,
        )}
    </>
  );
}

const PHASE_LABEL: Record<Phase, string> = { learn: 'Verstehen', example: 'Beispiel', practice: 'Üben' };

/** Index of the last solved task (for the filled part of the line on the mini path); −1 if none. */
function lastSolved(set: PracticeSet, n: number) {
  for (let k = n - 1; k >= 0; k--) if (set.progress[k]?.solved) return k;
  return -1;
}

/** The explanation in bites: read a little, answer an easy question about it, go on. */
function BitesView({ set, bites, host, onDone }: { set: PracticeSet; bites: Bite[]; host: SetHost; onDone: () => void }) {
  const [k, setK] = useState(() => Math.max(0, Math.min(set.bite ?? 0, bites.length - 1)));
  const [pick, setPick] = useState<number | null>(null);
  const b = bites[k];
  const answered = !b?.check || pick === b.check.correct;
  const go = (to: number) => {
    setK(to);
    setPick(null);
    host.updateSet?.({ bite: to });
  };
  const next = () => (k < bites.length - 1 ? go(k + 1) : onDone());
  const choose = (j: number) => {
    if (!b?.check || answered) return;
    setPick(j);
    playUi(j === b.check.correct ? 'right' : 'wrong');
  };
  // keys: 1–4 answer the question, Enter goes on
  const keys = useRef({ next, choose, answered });
  keys.current = { next, choose, answered };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || el.closest?.('input, textarea, select, [contenteditable="true"], .lab, .cheat-sheet')) return;
      if (/^[1-4]$/.test(e.key)) keys.current.choose(Number(e.key) - 1);
      else if (e.key === 'Enter' && keys.current.answered && el.tagName !== 'BUTTON' && el.tagName !== 'A') {
        e.preventDefault();
        keys.current.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!b) return null;
  const fig = b.figure !== undefined ? set.figures?.[b.figure] : undefined;
  return (
    <section className="panel bite-card" key={k}>
      <div className="bite-dots">
        {bites.map((_, j) => (
          <button key={j} type="button" className={j === k ? 'on' : j < k ? 'done' : ''} onClick={() => go(j)} aria-label={`Häppchen ${j + 1}`} />
        ))}
        <span className="muted small">
          Häppchen {k + 1} von {bites.length}
        </span>
      </div>
      {b.title && <h3>{b.title}</h3>}
      <div className="md bite-text">
        <Markdown text={b.text} />
      </div>
      {fig && <Figures figures={[fig]} />}
      {b.check && (
        <div className="bite-check">
          <p>
            <b>Kurz gecheckt:</b> <CardContent text={b.check.q} className="inline" />
          </p>
          <div className="bite-options">
            {b.check.options.map((o, j) => (
              <button
                key={j}
                type="button"
                className={'btn outline bite-opt' + (j === pick ? (j === b.check!.correct ? ' right' : ' wrong') : answered && j === b.check!.correct ? ' right' : '')}
                disabled={answered && j !== b.check!.correct}
                onClick={() => choose(j)}
              >
                <kbd>{j + 1}</kbd> <CardContent text={o} className="inline" />
              </button>
            ))}
          </div>
          {pick !== null &&
            (answered ? (
              <p className="form-ok">
                <IconCheck size={15} /> Richtig! {b.check.why}
              </p>
            ) : (
              <p className="form-error">
                <IconClose size={15} /> Nicht ganz – lies das Häppchen nochmal und versuch es erneut.
              </p>
            ))}
        </div>
      )}
      <div className="row-gap bite-nav">
        {k > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => go(k - 1)}>
            ‹ Zurück
          </button>
        )}
        <span className="grow" />
        {!answered && (
          <button type="button" className="btn ghost sm" onClick={next}>
            Überspringen
          </button>
        )}
        <button type="button" className="btn primary" onClick={next} disabled={!answered}>
          {k < bites.length - 1 ? 'Weiter' : 'Verstanden'} <IconChevron size={15} />
        </button>
      </div>
    </section>
  );
}

/** The explanation and worked example – or the simpler version („Einfacher erklären“). */
function Explanation({ set, host, steps, setSteps, hideText }: { set: PracticeSet; host: SetHost; steps: number; setSteps: (f: (x: number) => number) => void; hideText?: boolean }) {
  const [original, setOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const simple = !original && set.simple;
  // guided lessons show the „Grundlagen“ and the short explanation as bites already
  const intro = simple ? set.simple!.intro : hideText ? '' : set.intro;
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
      {set.theory && !hideText && (
        <details className="practice-theory" open={!set.progress.some((p) => p.solved)}>
          <summary>
            <b>Grundlagen</b> <span className="muted small">zuerst verstehen – dann geht’s los</span>
          </summary>
          <div className="md">
            <Markdown text={set.theory} />
          </div>
        </details>
      )}
      {intro && (
        <div className="practice-intro">
          {simple && <span className="badge ok">einfacher erklärt</span>}
          <CardContent text={intro} />
        </div>
      )}
      {set.figures?.length ? <Figures figures={set.figures} /> : null}
      {set.score && <ScoreView score={set.score} />}
      {set.sketch && <SketchView sketch={set.sketch} />}
      {set.syntax?.length ? <SyntaxView sentences={set.syntax} /> : null}
      {set.tables?.length ? <TablesView tables={set.tables} /> : null}
      {set.program && <ProgramView program={set.program} />}
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
              <IconSparkle size={14} /> {busy ? 'Pip erklärt es einfacher …' : 'Einfacher erklären'}
            </button>
          )}
          {error && <span className="form-error small">{error}</span>}
        </div>
      )}
    </>
  );
}

/** „Prüfen“ – and once the answer is right, the same button takes you on to the next task. */
export function CheckButton({ ctx, right, onCheck, disabled, busy }: { ctx: TaskCtx; right: boolean; onCheck: () => void; disabled?: boolean; busy?: boolean }) {
  if (right)
    return ctx.isLast ? (
      <button type="button" className="btn primary" disabled>
        <IconCheck size={15} /> Gelöst
      </button>
    ) : (
      <button type="button" className="btn primary next-btn" data-primary onClick={ctx.onNext}>
        Weiter <IconChevron size={15} />
      </button>
    );
  return (
    <button type="button" className="btn primary" data-primary onClick={onCheck} disabled={disabled || busy}>
      {busy ? 'Wird geprüft …' : 'Prüfen'}
    </button>
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
          <IconBulb size={15} /> {used ? 'Noch ein Hinweis' : 'Hinweis'} ({used}/{hints.length})
        </button>
      )}
    </div>
  );
}

/** The row under every task: show solution, save as card, next task. */
export function TaskFooter({ ctx, solution, card, canShow, noNext }: { ctx: TaskCtx; solution?: ReactNode; card: () => [string, string, boolean?]; canShow?: boolean; noNext?: boolean }) {
  const [show, setShow] = useState(!!ctx.prog.shown);
  const [note, setNote] = useState('');
  const [why, setWhy] = useState<'' | 'busy' | string>('');
  // „Warum falsch?“: Pip explains the last wrong answer and adds a similar, easier task right after this one
  const canExplain = !ctx.prog.solved && !!ctx.prog.last && !ctx.prog.dunno && !!ctx.host.updateSet;
  const explain = async (dunno = false) => {
    const task = taskList(ctx.set)[ctx.i];
    if (!task || (!dunno && !ctx.prog.last)) return;
    setWhy('busy');
    try {
      const p = mistakePrompt(ctx.set, task, ctx.prog.last ?? '', ctx.host.level, dunno);
      const r = parseMistake(await completeJson(p.system, p.user, p.maxTokens));
      if (!r) throw new Error('Pip konnte gerade keine Erklärung schreiben. Bitte nochmal versuchen.');
      // one update for both, so the explanation is not overwritten by the older progress
      const mark = dunno ? { dunno: true, shown: true, last: '(weiß nicht)' } : {};
      if (r.similar && ctx.host.updateSet) {
        const next = insertTaskAfter(ctx.set, ctx.i, r.similar);
        next.progress[ctx.i] = { ...next.progress[ctx.i], ...mark, mistake: r.explain };
        ctx.host.updateSet(next);
      } else ctx.host.progress(ctx.i, { ...mark, mistake: r.explain });
      setWhy('');
    } catch (e) {
      setWhy((e as Error).message);
    }
  };
  // „Weiß nicht“: show the solution at once, Pip explains the way and adds a similar, easier task after this one
  const dunno = () => {
    setShow(true);
    ctx.host.progress(ctx.i, { dunno: true, shown: true, last: '(weiß nicht)' });
    if (ctx.host.updateSet) void explain(true);
  };
  return (
    <>
      {ctx.prog.mistake && !ctx.prog.solved && (
        <div className={'mistake-box' + (ctx.prog.dunno ? ' dunno' : '')}>
          <b>{ctx.prog.dunno ? 'So geht’s – Schritt für Schritt' : 'Warum es nicht gepasst hat'}</b>
          <Markdown text={ctx.prog.mistake} />
          {taskList(ctx.set).length > ctx.i + 1 && <small className="muted">Danach wartet eine ähnliche, etwas leichtere Aufgabe zum Üben.</small>}
        </div>
      )}
      <div className="row-gap">
        {!ctx.prog.solved && !ctx.prog.dunno && (
          <button type="button" className="btn ghost sm dunno-btn" onClick={dunno} disabled={why === 'busy'} title="Lösung ansehen – Pip erklärt den Weg und gibt dir eine ähnliche Aufgabe">
            <IconHelp size={14} /> Weiß nicht
          </button>
        )}
        {ctx.prog.dunno && why === 'busy' && <small className="muted">Pip erklärt dir den Lösungsweg …</small>}
        {canExplain && !ctx.prog.mistake && (
          <button type="button" className="btn outline sm" onClick={() => void explain()} disabled={why === 'busy'}>
            <IconSparkle size={14} /> {why === 'busy' ? 'Pip schaut es sich an …' : 'Warum falsch?'}
          </button>
        )}
        {why && why !== 'busy' && <small className="err-msg">{why}</small>}
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
        {ctx.prog.solved && !noNext && (
          <button type="button" className="btn outline sm" data-primary onClick={ctx.onNext}>
            Nächste Aufgabe ›
          </button>
        )}
        {ctx.prog.dunno && !ctx.prog.solved && !ctx.isLast && why !== 'busy' && (
          <button type="button" className="btn primary sm next-btn" data-primary onClick={ctx.onNext}>
            Weiter <IconChevron size={14} />
          </button>
        )}
      </div>
      {show && solution}
    </>
  );
}

/** Right / wrong message after checking. */
export function Verdict({ ok, text }: { ok: boolean | null; text?: string }) {
  // only for a fresh answer – not when an already solved task is opened again
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (ok !== null) playUi(ok ? 'right' : 'wrong');
  }, [ok]);
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
    host.progress(i, { tries: prog.tries + 1, ...(r === 'right' ? { solved: true } : { last: input, mistake: undefined }) });
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
              onKeyDown={(e) => e.key === 'Enter' && (result === 'right' ? ctx.isLast || ctx.onNext() : void check())}
              placeholder={p.answer.type === 'expr' ? 'Formel in x, z. B. 2*x+3' : p.answer.type === 'fraction' ? 'z. B. 3/8 oder 0,375' : 'Zahl, z. B. 0,27 oder 27 %'}
              inputMode={p.answer.type === 'expr' ? 'text' : 'decimal'}
            />
          )}
          <CheckButton ctx={ctx} right={result === 'right'} onCheck={() => void check()} disabled={!input.trim()} busy={busy} />
        </div>
      )}
      {p.answer.type === 'expr' && input.trim() && <CardContent text={`Vorschau: \\( ${input.replace(/\*/g, ' \\cdot ')} \\)`} className="muted small" />}
      {result === 'invalid' ? (
        <p className="form-error">Diese Eingabe kann Merkora nicht lesen – {p.answer.type === 'expr' ? 'schreibe die Formel mit x, * und ^.' : 'gib eine Zahl ein.'}</p>
      ) : (
        <Verdict ok={result === null ? null : result === 'right'} text={feedback + (result === 'wrong' && prog.tries >= 2 && prog.hints < p.hints.length ? ' Ein Hinweis hilft vielleicht.' : '')} />
      )}
      <Hints hints={p.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter noNext={p.answer.type !== 'choice'}
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
        const failed = pr.results.filter((x) => !x.ok).map((x) => `Test ${x.n}: erwartet ${p.tests[x.n - 1]?.expected ?? '?'}, bekommen ${x.got ?? x.error ?? '–'}`);
        host.progress(i, { tries: prog.tries + 1, ...(pr.results.every((x) => x.ok) ? { solved: true } : { last: `${code}\n\n${failed.join('\n')}`, mistake: undefined }) });
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
      {java === null && <JavaSetup compact onReady={(v) => (setJava(v), setAskOnline(null))} />}
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
            dort ausführen – nur den Code, keine Lerndaten. Schneller geht es mit Java direkt in Merkora (Knopf oben, nur am PC).
          </p>
          <div className="row-gap">
            <button type="button" className="btn primary sm" onClick={() => (setSettings({ onlineCodeOk: true }), setAskOnline(null), void exec(askOnline, true))}>
              Erlauben und ausführen
            </button>
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

/** The pictures of an explanation, drawn by Merkora from the AI's description (light or dark). */
function Figures({ figures }: { figures: NonNullable<PracticeSet['figures']> }) {
  return (
    <div className="practice-figures">
      {figures.map((f, k) => (
        <BuildFigure key={k} diagram={f.diagram} caption={f.caption} narration={f.narration} />
      ))}
    </div>
  );
}
