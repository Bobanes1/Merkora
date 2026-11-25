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
import { IconBulb, IconCheck, IconChevron, IconClose, IconHelp, IconPlay, IconPlus, IconSparkle, IconSpeaker, IconSpeakerOff, IconStar, IconTarget } from '../Icons';
import { useLearnFocus } from '../../lib/learnFocus';
import { Lab } from '../labs/Labs';
import { completeJson, gradeAnswer, hasKey } from '../../lib/ai';
import { speak, stopSpeaking, useCanSpeak } from '../../lib/speech';
import { biteSpeechParts } from '../../lib/speechText';
import { gapCheckPrompt, parseGapCheck } from '../../lib/tasks';
import { openExternal } from '../../lib/desktop';
import { buildHarness, harnessOffset, localJava, mapErrors, parseResults, runJavaLocal, runJavaOnline, type RunResult, type TestResult } from '../../lib/javaRun';
import { bitesFrom, checkAnswer, checkBiteGap, cleanSolve, goingWell, harderPrompt, insertTaskAfter, insertTaskLater, nextOpen, parseHarder, pickNext, settledCount, mistakePrompt, parseMistake, parseSimpler, parseSimplerBite, simplerBitePrompt, simplerPrompt, DOMAIN_LABEL, problemCount, solvedCount, taskList, type Bite, type BiteCheck, type JavaProblem, type MathProblem, type PracticeSet, type ProblemProgress } from '../../lib/practice';
import { setSettings, useStore } from '../../lib/store';
import { CaseTaskView, ClassifyTaskView, ClozeTaskView, MultiTaskView, OrderTaskView } from './ActiveTasks';
import { MusicTaskView } from './MusicTask';
import { WebCodeTask } from './WebCodeTask';
import { BuildFigure, ProgramView, ScoreView, SketchView, SyntaxView, TablesView } from './Visuals';
import { EstimateTaskView, LabelTaskView, RoleplayTaskView, ExplainTaskView, ScenarioTaskView, SheetTaskView } from './MoreTasks';

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
 * `guided` (skill lessons): always starts with theory – classic (bites → example → practice)
 * or sprint (compact multi-section overview → practice).
 * `focus`: focus mode for the tasks (stage tests, reviews).
 */
export function PracticeSetView({ set, host, head, onDone, guided, focus }: { set: PracticeSet; host: SetHost; head?: ReactNode; onDone?: ReactNode; guided?: boolean; focus?: boolean }) {
  const tasks = taskList(set);
  // n = core tasks (for „x von y gelöst“ and finishing); total = all, also extra tasks Pip added
  const n = problemCount(set);
  const total = tasks.length;
  const firstOpen = set.progress.findIndex((p) => !p.solved);
  const [i, setI] = useState(firstOpen < 0 ? 0 : firstOpen);
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
  const isSprint = !!guided && set.style === 'sprint';
  const hasExample = !!(set.example || set.figures?.length || set.score || set.sketch || set.syntax?.length || set.tables?.length || set.program || set.labs.length);
  const order: Phase[] = isSprint
    ? [...(bites.length || hasExample ? (['learn'] as Phase[]) : []), 'practice']
    : [...(bites.length ? (['learn'] as Phase[]) : []), ...(hasExample ? (['example'] as Phase[]) : []), 'practice'];
  const started = set.progress.some((p) => p.solved || p.tries > 0 || p.shown);
  const savedPhase = set.phase && set.phase !== 'try' ? set.phase : undefined;
  const [phase, setPhaseState] = useState<Phase>(() => (savedPhase && order.includes(savedPhase) ? savedPhase : started ? 'practice' : order[0] ?? 'practice'));
  const g = !!guided && !readAll;
  const setPhase = (p: Phase) => {
    setPhaseState(p);
    host.updateSet?.({ phase: p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [focusOn, setFocus] = useLearnFocus((g && phase === 'practice') || (!guided && !!focus));
  const [sheet, setSheet] = useState(false);
  const t = tasks[i];
  // „Weiter“: to the next task still open (passing solved and skipped ones); when none is left the lesson is through
  const settled = settledCount(set);
  const goNext = () => {
    // the difficulty adapts: after clean solves a harder task, after a mistake not a harder one
    const j = pickNext(set, i);
    if (j !== null) setI(j);
    else document.querySelector('.lesson-end-card, .practice-tasks > .form-ok')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const ctx: TaskCtx = { set, i, prog: set.progress[i] ?? { tries: 0, hints: 0 }, host, onNext: goNext, isLast: nextOpen(set, i) === null };

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
        setI((x) => Math.max(0, Math.min(total - 1, x + (e.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusOn, sheet, total, setFocus]);

  const focusTools = (
    <div className="focus-tools">
      {(g || bites.length > 0 || (set.figures?.length ?? 0) > 0) && (
        <button type="button" className="btn outline sm" onClick={() => setSheet(true)} title="Merksätze & Grafiken dieser Lektion kurz nachschauen">
          <IconBulb size={14} /> Theorie spicken
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
          {Array.from({ length: total }, (_, k) => {
            const p = set.progress[k];
            const helped = !!p && (p.hints > 0 || !!p.shown || !!p.dunno || p.tries > 1);
            const skipped = !!p?.dunno && !p.solved;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={k === i}
                className={(k === i ? 'on ' : '') + (p?.solved ? (helped ? 'done helped' : 'done') : skipped ? 'skipped' : '') + (p?.extra ? ' extra' : '') + (p?.bonus ? ' bonus' : '')}
                title={p?.solved ? (helped ? 'gelöst mit Hilfe' : 'gelöst ohne Hilfe') : skipped ? 'übersprungen – Lösung angesehen' : `Aufgabe ${k + 1}`}
                onClick={() => setI(k)}
              >
                {p?.solved ? <IconCheck size={13} /> : skipped ? '?' : k + 1}
              </button>
            );
          })}
        </div>
        <span className="muted small grow right">
          {t?.level ? (
            <span className={`task-level lv-${t.level}`} title={`Schwierigkeit: ${LEVEL_NAME[t.level]}`}>
              <i />
              <i />
              <i /> {LEVEL_NAME[t.level]}
            </span>
          ) : null}{' '}
          {done} von {n} gelöst
        </span>
        {!guided && focus && focusTools}
      </div>
      {set.progress[i]?.fixed && (
        <small className="task-fixed" title="Pip hat in dieser Aufgabe vor dem Lösen einen Fehler gefunden und ihn korrigiert">
          <IconCheck size={11} /> Von Pip geprüft und korrigiert
        </small>
      )}
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
        {t?.type === 'explain' && <ExplainTaskView key={set.id + i} ctx={ctx} task={t} />}
        {settled === n && (onDone ?? <p className="form-ok">{done === n ? 'Alle Aufgaben gelöst – stark!' : 'Alle Aufgaben durch.'}</p>)}
        {settled === n && startDone < n && <Confetti count={50} />}
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
          <Explanation set={set} host={host} />
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

  const after = (p: Phase) => order[order.indexOf(p) + 1] ?? 'practice';
  return (
    <>
      <section className={'panel guided-head' + (phase === 'practice' ? ' slim' : '')}>
        {head}
        {phase !== 'practice' && (
          <>
            <div className="guided-badges">
              <span className={'badge ' + set.kind}>{DOMAIN_LABEL[set.kind] ?? 'Übung'}</span>
              {isSprint && <span className="style-pill">Praxis-Sprint</span>}
            </div>
            <h2>{set.topic}</h2>
          </>
        )}
        <div className="phase-row">
          <ol className="phase-steps" aria-label="Ablauf der Lektion">
            {order.map((p, k) => (
              <li key={p} className={p === phase ? 'on' : order.indexOf(phase) > k ? 'done' : ''}>
                <button type="button" onClick={() => setPhase(p)} aria-current={p === phase ? 'step' : undefined}>
                  <span>{order.indexOf(phase) > k ? <IconCheck size={12} /> : k + 1}</span> {phaseLabel(p, isSprint)}
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
      {phase === 'learn' &&
        (isSprint ? (
          <SprintOverview set={set} bites={bites} host={host} hasExample={hasExample} labs={labs} onDone={() => setPhase('practice')} />
        ) : (
          <BitesView set={set} bites={bites} host={host} hasExample={hasExample} onDone={() => setPhase(after('learn'))} onSkip={() => setPhase('practice')} />
        ))}
      {phase === 'example' && (
        <>
          <div className="phase-skip">
            <button type="button" className="btn ghost sm" onClick={() => setPhase('practice')}>
              Weiter zu den Aufgaben <IconChevron size={14} />
            </button>
          </div>
          <section className="panel phase-panel">
            <Explanation set={set} host={host} hideText />
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
              <b>Spickzettel · Theorie auf einen Blick</b>
              <button type="button" className="icon-btn" aria-label="Spickzettel schließen" onClick={() => setSheet(false)}>
                <IconClose size={18} />
              </button>
            </header>
            {bites.some((b) => b.takeaway || b.pitfall) && (
              <div className="cheat-summary">
                <span className="bite-callout-head">Auf einen Blick</span>
                <ul>
                  {bites.map((b, k) =>
                    b.takeaway ? (
                      <li key={`t-${k}`}>
                        <CardContent text={b.takeaway} className="inline" />
                      </li>
                    ) : null,
                  )}
                  {bites.map((b, k) =>
                    b.pitfall ? (
                      <li key={`p-${k}`} className="cheat-pitfall">
                        <strong>Falle:</strong> <CardContent text={b.pitfall} className="inline" />
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
            )}
            {bites.map((b, k) => (
              <div key={k} className="cheat-bite">
                {b.title && <h4>{b.title}</h4>}
                <div className="md">
                  <Markdown text={b.text} />
                </div>
                <BiteCallouts bite={b} />
              </div>
            ))}
            <Explanation set={set} host={host} hideText />
            {labs}
          </aside>
        </div>,
          document.body,
        )}
    </>
  );
}

const LEVEL_NAME: Record<number, string> = { 1: 'leicht', 2: 'mittel', 3: 'schwer' };

const phaseLabel = (p: Phase, sprint: boolean) =>
  p === 'learn' ? (sprint ? 'Überblick' : 'Verstehen') : p === 'example' ? 'Beispiel' : 'Üben';

/** Index of the last solved task (for the filled part of the line on the mini path); −1 if none. */
function lastSolved(set: PracticeSet, n: number) {
  for (let k = n - 1; k >= 0; k--) if (set.progress[k]?.solved) return k;
  return -1;
}

type CheckActions = { pick?: (j: number) => void; primary?: () => void };

function formatEst(v: number, unit: string) {
  const num = Number.isInteger(v) ? v.toLocaleString('de-DE') : v.toLocaleString('de-DE', { maximumFractionDigits: 3 });
  if (!unit) return num;
  return unit === '%' || unit === '°' ? `${num}\u202f${unit}` : `${num} ${unit}`;
}

/** Interactive check inside a bite or discovery hook: choice, true/false, mini-gap, reveal, or slider estimate. */
function BiteCheckView({ check, done, onDone, hookMode, actions, onAccept }: { check: BiteCheck; done: boolean; onDone: () => void; hookMode?: boolean; actions: { current: CheckActions }; onAccept?: (answer: string) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [tfPick, setTfPick] = useState<boolean | null>(null);
  const [gapVal, setGapVal] = useState('');
  const [gapState, setGapState] = useState<'idle' | 'checking' | 'right' | 'wrong' | 'shown'>('idle');
  // an answer not in the list that Pip also counts (e.g. „Eiweiß“ for „Molekül“): why it is right
  const [gapNote, setGapNote] = useState('');
  const [revealed, setRevealed] = useState(false);
  const mid = check.type === 'estimate' ? Math.round(((check.min + check.max) / 2 - check.min) / check.step) * check.step + check.min : 0;
  const [estVal, setEstVal] = useState(mid);
  const [estDone, setEstDone] = useState(false);

  if (check.type === 'tf') {
    const choose = (val: boolean) => {
      if (tfPick !== null) return;
      setTfPick(val);
      const ok = val === check.answer;
      playUi(ok ? 'right' : 'wrong');
      onDone();
    };
    actions.current = { pick: (j) => (j === 0 ? choose(true) : j === 1 ? choose(false) : undefined) };
    const right = tfPick === check.answer;
    return (
      <div className="bite-check">
        <p>
          <b>Stimmt oder Irrtum?</b> <CardContent text={check.statement} className="inline" />
        </p>
        <div className="bite-tf-row">
          {[true, false].map((val, j) => (
            <button
              key={j}
              type="button"
              className={
                'btn outline bite-opt bite-tf-btn' +
                (tfPick !== null ? (val === check.answer ? ' right' : val === tfPick ? ' wrong' : '') : '')
              }
              disabled={tfPick !== null}
              onClick={() => choose(val)}
            >
              <kbd>{j + 1}</kbd> {val ? 'Stimmt' : 'Irrtum'}
            </button>
          ))}
        </div>
        {tfPick !== null &&
          (right ? (
            <p className="form-ok">
              <IconCheck size={15} /> Richtig! {check.why}
            </p>
          ) : (
            <p className={hookMode ? 'bite-reveal-note' : 'form-error'}>
              {!hookMode && <IconClose size={15} />} {check.answer ? 'Tatsächlich stimmt das.' : 'Das ist ein Irrtum.'} {check.why}
            </p>
          ))}
      </div>
    );
  }

  if (check.type === 'gap') {
    const submit = async (val = gapVal) => {
      if (!val.trim() || done || gapState === 'checking') return;
      let ok = checkBiteGap(check, val);
      // not in the list: Pip looks once more whether it is right in content too (only typed answers – tapped words are clear)
      if (!ok && hasKey() && !check.options) {
        setGapState('checking');
        try {
          const q = gapCheckPrompt(check.prompt, check.answer, gapVal.trim(), check.why);
          const r = parseGapCheck(await completeJson(q.system, q.user, 400));
          if (r.ok) {
            ok = true;
            setGapNote(r.note || 'Das passt inhaltlich auch.');
            onAccept?.(gapVal.trim());
          }
        } catch {
          /* no check possible: as before */
        }
      }
      if (ok) {
        setGapState('right');
        playUi('right');
        onDone();
      } else if (hookMode) {
        setGapState('shown');
        playUi('wrong');
        onDone();
      } else {
        setGapState('wrong');
        playUi('wrong');
      }
    };
    const show = () => {
      setGapState('shown');
      onDone();
    };
    actions.current = {};
    return (
      <div className="bite-check">
        <p>
          <b>{hookMode ? 'Dein Tipp:' : 'Kurz ergänzen:'}</b> <CardContent text={check.prompt} className="inline" />
        </p>
        {check.options ? (
          <div className="bite-gap-options">
            {check.options.map((o) => (
              <button
                key={o}
                type="button"
                className={'label-chip' + (gapVal === o ? (gapState === 'right' ? ' ok' : gapState === 'wrong' || gapState === 'shown' ? ' bad' : ' picked') : '')}
                disabled={done || gapState === 'checking'}
                onClick={() => {
                  setGapVal(o);
                  void submit(o);
                }}
              >
                {o}
              </button>
            ))}
            {gapState === 'wrong' && !done && (
              <button type="button" className="btn ghost sm" onClick={show}>
                Lösung zeigen
              </button>
            )}
          </div>
        ) : (
        <form
          className="bite-gap-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="text"
            className="input"
            value={gapVal}
            disabled={done}
            placeholder={check.placeholder || 'Antwort eingeben …'}
            onChange={(e) => {
              setGapVal(e.target.value);
              if (gapState === 'wrong') setGapState('idle');
            }}
          />
          {!done && (
            <button type="submit" className="btn primary sm" disabled={!gapVal.trim() || gapState === 'checking'}>
              {gapState === 'checking' ? 'Pip prüft …' : 'Prüfen'}
            </button>
          )}
          {gapState === 'wrong' && !done && (
            <button type="button" className="btn ghost sm" onClick={show}>
              Lösung zeigen
            </button>
          )}
        </form>
        )}
        {gapState === 'right' && (
          <p className="form-ok">
            <IconCheck size={15} /> Richtig!{' '}
            {gapNote ? (
              <>
                Pip zählt „{gapVal.trim()}“ auch: {gapNote} <span className="muted">(Hinterlegt war: {check.answer[0]})</span>
              </>
            ) : (
              check.why
            )}
          </p>
        )}
        {gapState === 'wrong' && (
          <p className="form-error">
            <IconClose size={15} /> Noch nicht ganz – versuch es nochmal oder schau dir die Lösung an.
          </p>
        )}
        {gapState === 'shown' && (
          <p className="bite-reveal-note">
            <b>Lösung:</b> {check.answer[0]}
            {check.why ? ` – ${check.why}` : ''}
          </p>
        )}
      </div>
    );
  }

  if (check.type === 'reveal') {
    const open = () => {
      if (revealed) return;
      setRevealed(true);
      onDone();
    };
    actions.current = { primary: open };
    return (
      <div className="bite-check">
        <p>
          <b>{hookMode ? 'Kurz überlegen:' : 'Kurz im Kopf beantworten:'}</b> <CardContent text={check.q} className="inline" />
        </p>
        {!revealed ? (
          <div>
            <button type="button" className="btn outline sm" onClick={open}>
              Antwort aufdecken
            </button>
          </div>
        ) : (
          <div className="bite-reveal-box">
            <CardContent text={check.answer} />
            {check.why && <p className="muted small">{check.why}</p>}
          </div>
        )}
      </div>
    );
  }

  if (check.type === 'estimate') {
    const submit = () => {
      if (estDone) return;
      setEstDone(true);
      const diff = Math.abs(estVal - check.answer);
      playUi(diff <= check.tolerance * 3 ? 'right' : 'wrong');
      onDone();
    };
    actions.current = { primary: submit };
    const span = check.max - check.min || 1;
    const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - check.min) / span) * 100))}%`;
    const diff = Math.abs(estVal - check.answer);
    const verdict = diff <= check.tolerance ? 'Volltreffer!' : diff <= check.tolerance * 3 ? 'Nah dran!' : 'Gute Schätzung – hier die Auflösung:';
    return (
      <div className="bite-check">
        <p>
          <b>{hookMode ? 'Was schätzt du?' : 'Kurz schätzen:'}</b> <CardContent text={check.q} className="inline" />
        </p>
        <div className="bite-est">
          <div className="bite-est-val">{formatEst(estVal, check.unit)}</div>
          <input
            type="range"
            min={check.min}
            max={check.max}
            step={check.step}
            value={estVal}
            disabled={estDone}
            onChange={(e) => setEstVal(Number(e.target.value))}
          />
          <div className="bite-est-bounds muted small">
            <span>{formatEst(check.min, check.unit)}</span>
            <span>{formatEst(check.max, check.unit)}</span>
          </div>
          {!estDone ? (
            <div>
              <button type="button" className="btn primary sm" onClick={submit}>
                Schätzen
              </button>
            </div>
          ) : (
            <>
              <div className="bite-est-scale" aria-hidden="true">
                <span className="bite-est-pin mine" style={{ left: pct(estVal) }} title="Deine Schätzung" />
                <span className="bite-est-pin truth" style={{ left: pct(check.answer) }} title="Richtiger Wert" />
              </div>
              <p className={diff <= check.tolerance * 3 ? 'form-ok' : 'bite-reveal-note'}>
                {diff <= check.tolerance * 3 && <IconCheck size={15} />} <b>{verdict}</b> Richtig ist <b>{formatEst(check.answer, check.unit)}</b>. {check.why}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Default: choice (backwards compatible with bites without `type`)
  const choose = (j: number) => {
    if (done || j < 0 || j >= check.options.length) return;
    setPick(j);
    const ok = j === check.correct;
    playUi(ok ? 'right' : 'wrong');
    if (ok || hookMode) onDone();
  };
  actions.current = { pick: choose };
  return (
    <div className="bite-check">
      <p>
        <b>{hookMode ? 'Was meinst du?' : 'Kurz gecheckt:'}</b> <CardContent text={check.q} className="inline" />
      </p>
      <div className="bite-options">
        {check.options.map((o, j) => (
          <button
            key={j}
            type="button"
            className={'btn outline bite-opt' + (j === pick ? (j === check.correct ? ' right' : ' wrong') : done && j === check.correct ? ' right' : '')}
            disabled={done && j !== check.correct}
            onClick={() => choose(j)}
          >
            <kbd>{j + 1}</kbd> <CardContent text={o} className="inline" />
          </button>
        ))}
      </div>
      {pick !== null &&
        (pick === check.correct ? (
          <p className="form-ok">
            <IconCheck size={15} /> Richtig! {check.why}
          </p>
        ) : hookMode ? (
          <p className="bite-reveal-note">
            <b>Auflösung:</b> {check.options[check.correct]}
            {check.why ? ` – ${check.why}` : ''}
          </p>
        ) : (
          <p className="form-error">
            <IconClose size={15} /> Nicht ganz – lies das Häppchen nochmal und versuch es erneut.
          </p>
        ))}
    </div>
  );
}

/** Visual highlight boxes inside a theory bite: everyday analogy, key takeaway, and typical pitfall. */
function BiteCallouts({ bite }: { bite: Bite }) {
  if (!bite.analogy && !bite.takeaway && !bite.pitfall) return null;
  return (
    <div className="bite-callouts">
      {bite.analogy && (
        <div className="bite-callout analogy">
          <span className="bite-callout-head">Alltagsbild</span>
          <CardContent text={bite.analogy} />
        </div>
      )}
      {bite.takeaway && (
        <div className="bite-callout takeaway">
          <span className="bite-callout-head">Merksatz</span>
          <CardContent text={bite.takeaway} />
        </div>
      )}
      {bite.pitfall && (
        <div className="bite-callout pitfall">
          <span className="bite-callout-head">Typische Falle</span>
          <CardContent text={bite.pitfall} />
        </div>
      )}
    </div>
  );
}

/** Compact overview card for `sprint` lessons: full explanation without intermediate checks + optional example, then straight to tasks. */
function SprintOverview({ set, bites, host, hasExample, labs, onDone }: { set: PracticeSet; bites: Bite[]; host: SetHost; hasExample: boolean; labs: ReactNode; onDone: () => void }) {
  const canSpeak = useCanSpeak();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(
      bites.flatMap((b) => biteSpeechParts(b)),
      () => setSpeaking(false),
    );
  };
  return (
    <>
      <section className="panel bite-card">
        <div className="bite-dots">
          <span className="muted small">Kompakt-Theorie · danach direkt üben</span>
          {canSpeak && (
            <button type="button" className={'btn sm bite-skip ' + (speaking ? 'primary' : 'ghost')} onClick={toggleSpeak}>
              {speaking ? <IconSpeakerOff size={14} /> : <IconSpeaker size={14} />} {speaking ? 'Stopp' : 'Anhören'}
            </button>
          )}
        </div>
        {bites.map((b, k) => (
          <div key={k} className="sprint-bite" style={{ animationDelay: `${Math.min(0.45, k * 0.09).toFixed(2)}s` }}>
            {b.title && <h3>{b.title}</h3>}
            <div className="md bite-text">
              <Markdown text={b.text} />
            </div>
            <BiteCallouts bite={b} />
            {b.figure !== undefined && set.figures?.[b.figure] && <Figures figures={[set.figures[b.figure]]} />}
          </div>
        ))}
        {hasExample && <Explanation set={set} host={host} hideText />}
      </section>
      {labs}
      <div className="phase-next">
        <button type="button" className="btn primary" onClick={onDone}>
          Jetzt selbst üben <IconChevron size={15} />
        </button>
      </div>
    </>
  );
}

/** The explanation in bites: read a little, listen or simplify on demand, interact with a varied quick check, go on. */
function BitesView({ set, bites, host, hasExample, onDone, onSkip }: { set: PracticeSet; bites: Bite[]; host: SetHost; hasExample: boolean; onDone: () => void; onSkip: () => void }) {
  const canSpeak = useCanSpeak();
  const [k, setK] = useState(() => Math.max(0, Math.min(set.bite ?? 0, bites.length - 1)));
  const [dir, setDir] = useState<'init' | 'next' | 'prev'>('init');
  const [done, setDone] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busySimple, setBusySimple] = useState(false);
  const [simpleErr, setSimpleErr] = useState('');
  const [localSimpler, setLocalSimpler] = useState<Record<number, string>>({});
  const [hideSimpler, setHideSimpler] = useState(false);
  const actions = useRef<CheckActions>({});
  const b = bites[k];
  const answered = !b?.check || done;
  useEffect(() => () => stopSpeaking(), []);
  const go = (to: number) => {
    stopSpeaking();
    setSpeaking(false);
    setSimpleErr('');
    setHideSimpler(false);
    setDir(to >= k ? 'next' : 'prev');
    setK(to);
    setDone(false);
    actions.current = {};
    host.updateSet?.({ bite: to });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => (k < bites.length - 1 ? go(k + 1) : (stopSpeaking(), setSpeaking(false), onDone()));
  // keys: 1–4 answer choice/tf checks, Enter reveals/submits or goes on
  const keys = useRef({ next, answered });
  keys.current = { next, answered };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || el.closest?.('input, textarea, select, [contenteditable="true"], .lab, .cheat-sheet')) return;
      if (/^[1-4]$/.test(e.key)) actions.current.pick?.(Number(e.key) - 1);
      else if (e.key === 'Enter' && el.tagName !== 'BUTTON' && el.tagName !== 'A') {
        e.preventDefault();
        if (keys.current.answered) keys.current.next();
        else actions.current.primary?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!b) return null;
  const fig = b.figure !== undefined ? set.figures?.[b.figure] : undefined;
  const simplerText = b.simpler ?? localSimpler[k];
  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(biteSpeechParts(b), () => setSpeaking(false));
  };
  const simplifyBite = async () => {
    setBusySimple(true);
    setSimpleErr('');
    try {
      const p = simplerBitePrompt(set.topic, b, host.level);
      const txt = parseSimplerBite(await completeJson(p.system, p.user, p.maxTokens));
      if (!txt) throw new Error('Die KI hat keine einfachere Erklärung geliefert. Bitte nochmal versuchen.');
      setLocalSimpler((cur) => ({ ...cur, [k]: txt }));
      setHideSimpler(false);
      if (set.bites?.[k] && host.updateSet) {
        host.updateSet({ bites: set.bites.map((x, j) => (j === k ? { ...x, simpler: txt } : x)) });
      }
    } catch (e) {
      setSimpleErr((e as Error).message);
    } finally {
      setBusySimple(false);
    }
  };
  return (
    <section className={`panel bite-card bite-anim${dir !== 'init' ? ` anim-${dir}` : ''}`} key={k}>
      <div className="bite-dots">
        {bites.map((_, j) => (
          <button key={j} type="button" className={j === k ? 'on' : j < k ? 'done' : ''} onClick={() => go(j)} aria-label={`Theorie ${j + 1}`} />
        ))}
        <span className="muted small">
          Theorie {k + 1} von {bites.length}
        </span>
        <button type="button" className="link-btn small bite-skip" onClick={() => (stopSpeaking(), onSkip())} title="Erklärung überspringen – direkt zu den Aufgaben">
          Kenn ich schon – direkt üben ›
        </button>
      </div>
      {b.title && <h3 className="bite-title">{b.title}</h3>}
      <div className="md bite-text">
        <Markdown text={b.text} />
      </div>
      <BiteCallouts bite={b} />
      {(canSpeak || hasKey() || simplerText) && (
        <div className="bite-tools">
          {canSpeak && (
            <button type="button" className={'btn sm ' + (speaking ? 'primary' : 'ghost')} onClick={toggleSpeak} title="Dieses Häppchen vorlesen lassen">
              {speaking ? <IconSpeakerOff size={14} /> : <IconSpeaker size={14} />} {speaking ? 'Stopp' : 'Anhören'}
            </button>
          )}
          {simplerText ? (
            <button type="button" className="btn ghost sm" onClick={() => setHideSimpler((h) => !h)}>
              <IconSparkle size={14} /> {hideSimpler ? 'Einfache Version zeigen' : 'Einfache Version ausblenden'}
            </button>
          ) : (
            hasKey() && (
              <button type="button" className="btn ghost sm" onClick={() => void simplifyBite()} disabled={busySimple} title="Genau diesen Abschnitt noch einfacher erklären lassen">
                <IconSparkle size={14} /> {busySimple ? 'Pip erklärt es einfacher …' : 'Noch einfacher'}
              </button>
            )
          )}
          {simpleErr && <span className="form-error small">{simpleErr}</span>}
        </div>
      )}
      {simplerText && !hideSimpler && (
        <div className="bite-callout simpler">
          <span className="bite-callout-head">Noch einfacher erklärt</span>
          <div className="md">
            <Markdown text={simplerText} />
          </div>
        </div>
      )}
      {fig && <Figures figures={[fig]} />}
      {b.check && (
        <BiteCheckView
          key={k}
          check={b.check}
          done={done}
          onDone={() => setDone(true)}
          actions={actions}
          onAccept={(ans) =>
            set.bites?.[k]?.check?.type === 'gap' &&
            host.updateSet?.({ bites: set.bites.map((x, j) => (j === k && x.check?.type === 'gap' ? { ...x, check: { ...x.check, answer: [...x.check.answer, ans] } } : x)) })
          }
        />
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
          {k < bites.length - 1 ? 'Weiter' : hasExample ? 'Weiter zum Beispiel' : 'Jetzt selbst üben'} <IconChevron size={15} />
        </button>
      </div>
    </section>
  );
}

const THINK_KEY = 'merkora.exampleThink';

/**
 * A worked example: the task, then every step and the result – shown at once, to read along.
 * Who wants to think first can switch on „Erst selbst überlegen“ (remembered): then one click shows the whole way.
 */
function WorkedExample({ example, code }: { example: NonNullable<PracticeSet['example']>; code?: string }) {
  const [think, setThinkState] = useState(() => {
    try {
      return localStorage.getItem(THINK_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const setThink = (on: boolean) => {
    setThinkState(on);
    setOpen(false);
    try {
      localStorage.setItem(THINK_KEY, on ? '1' : '0');
    } catch {
      /* only for now */
    }
  };
  const shown = !think || open;
  const hasWay = example.steps.length > 0 || !!example.answer;
  return (
    <div className="practice-example">
      <div className="example-head">
        <b>So geht's – ein Beispiel durchgerechnet</b>
        {hasWay && (
          <button type="button" className="link-btn small" onClick={() => setThink(!think)}>
            {think ? 'Lösungsweg gleich zeigen' : 'Erst selbst überlegen'}
          </button>
        )}
      </div>
      <small className="muted">{think && !open ? 'Überleg kurz selbst – dann schau nach, wie es geht.' : 'Lies mit, dann übst du es selbst.'}</small>
      <CardContent text={example.problem} />
      {code && <pre className="code" dangerouslySetInnerHTML={{ __html: esc(code) }} />}
      {hasWay &&
        (shown ? (
          <>
            {example.steps.map((s, k) => (
              <div key={k} className="practice-step" style={{ animationDelay: `${Math.min(0.65, 0.08 + k * 0.09).toFixed(2)}s` }}>
                <span>{k + 1}</span>
                <CardContent text={s} />
              </div>
            ))}
            {example.answer && (
              <p className="example-result" style={{ animationDelay: `${Math.min(0.75, 0.12 + example.steps.length * 0.09).toFixed(2)}s` }}>
                <b>Ergebnis:</b> <CardContent text={example.answer} className="inline" />
              </p>
            )}
          </>
        ) : (
          <button type="button" className="btn outline sm" onClick={() => setOpen(true)}>
            Lösung zeigen
          </button>
        ))}
    </div>
  );
}

/** The explanation and worked example – or the simpler version („Einfacher erklären“). */
function Explanation({ set, host, hideText }: { set: PracticeSet; host: SetHost; hideText?: boolean }) {
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
      {example && <WorkedExample example={example} code={code} />}
      {host.updateSet && (
        <div className="row-gap">
          {set.simple ? (
            <button type="button" className="btn ghost sm" onClick={() => setOriginal(!original)}>
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
      // one follow-up per task, placed a little later – none for a follow-up itself (no chains)
      if (r.similar && ctx.host.updateSet && !ctx.prog.extra) {
        const next = insertTaskLater(ctx.set, ctx.i, r.similar);
        next.progress[ctx.i] = { ...next.progress[ctx.i], ...mark, mistake: r.explain };
        ctx.host.updateSet(next);
      } else ctx.host.progress(ctx.i, { ...mark, mistake: r.explain });
      setWhy('');
    } catch (e) {
      setWhy((e as Error).message);
    }
  };
  // it goes very well and nothing harder is left: once per set a bonus task, one level harder
  const [bonus, setBonus] = useState<'' | 'busy' | string>('');
  const curLevel = taskList(ctx.set)[ctx.i]?.level ?? 2;
  const harderLeft = taskList(ctx.set).some((t, k) => !ctx.set.progress[k]?.solved && !ctx.set.progress[k]?.dunno && (t.level ?? 0) > curLevel);
  const canBonus = !!ctx.host.updateSet && cleanSolve(ctx.prog) && !ctx.prog.extra && !ctx.set.bonusAsked && goingWell(ctx.set) && !harderLeft;
  const addBonus = async () => {
    const task = taskList(ctx.set)[ctx.i];
    if (!task || !ctx.host.updateSet) return;
    setBonus('busy');
    try {
      const p = harderPrompt(ctx.set, task, ctx.host.level);
      const t = parseHarder(await completeJson(p.system, p.user, p.maxTokens));
      if (!t) throw new Error('Pip konnte gerade keine Bonus-Aufgabe erstellen.');
      const next = insertTaskAfter(ctx.set, ctx.i, { ...t, level: Math.min(3, (task.level ?? 2) + 1) });
      next.progress[ctx.i + 1] = { ...next.progress[ctx.i + 1], extra: true, bonus: true };
      ctx.host.updateSet({ ...next, bonusAsked: true });
      setBonus('');
    } catch (e) {
      setBonus((e as Error).message);
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
          {!ctx.prog.extra && <small className="muted">Etwas später wartet eine ähnliche Aufgabe in anderer Form zum Üben.</small>}
        </div>
      )}
      {canBonus && (
        <div className="bonus-offer">
          <span className="grow">
            <b>Läuft super!</b> Lust auf eine Bonus-Aufgabe, eine Stufe schwerer? Sie zählt nicht gegen dich.
          </span>
          <button type="button" className="btn outline sm" onClick={() => void addBonus()} disabled={bonus === 'busy'}>
            <IconStar size={14} /> {bonus === 'busy' ? 'Pip denkt sich etwas aus …' : 'Bonus-Aufgabe'}
          </button>
          <button type="button" className="link-btn small" onClick={() => ctx.host.updateSet?.({ bonusAsked: true })}>
            Nein danke
          </button>
          {bonus && bonus !== 'busy' && <small className="err-msg">{bonus}</small>}
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
        {ctx.prog.dunno && !ctx.prog.solved && (
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
