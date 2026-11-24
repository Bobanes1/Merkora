import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { CardContent } from '../CardContent';
import { completeJson, LANG_RULE } from '../../lib/ai';
import { PALETTES, renderDiagram } from '../../lib/diagram';
import { cellName, isErr, showValue } from '../../lib/sheet';
import {
  caseGradePrompt,
  checkEstimate,
  checkLabels,
  checkSheet,
  explainAsCase,
  parseCaseGrade,
  roleplayAsCase,
  roleplayReplyPrompt,
  scenarioMax,
  scenarioPassed,
  scenarioWalk,
  shuffled,
  type CaseGrade,
  type ChatLine,
  type EstimateTask,
  type ExplainTask,
  type LabelTask,
  type RoleplayTask,
  type ScenarioTask,
  type SheetTask,
} from '../../lib/tasks';
import { useResolvedTheme } from '../../lib/theme';
import { IconSend } from '../Icons';
import { CheckButton, Hints, TaskFooter, Verdict, type TaskCtx } from './PracticeSetView';

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const num = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const pts = (n: number) => String(n).replace('.', ',');
const Explain = ({ text }: { text?: string }) => (text ? <CardContent text={text} className="practice-explain" /> : null);
const hintsOf = (ctx: TaskCtx, hints: string[]) => <Hints hints={hints} used={ctx.prog.hints} onMore={() => ctx.host.progress(ctx.i, { hints: ctx.prog.hints + 1 })} />;

/** Points per criterion of an AI grading (case, role play). */
export function GradeBox({ grade }: { grade: CaseGrade }) {
  return (
    <div className="case-grade">
      <p>
        <b>
          {pts(grade.total)} von {pts(grade.max)} Punkten
        </b>{' '}
        · {grade.summary}
      </p>
      <ul>
        {grade.criteria.map((c, k) => (
          <li key={k} className={c.points >= c.max ? 'ok' : c.points > 0 ? 'part' : 'bad'}>
            <span className="case-points">
              {pts(c.points)}/{pts(c.max)}
            </span>
            <span>
              <b>{c.criterion}</b>
              {c.feedback && <> – {c.feedback}</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- estimate ----------
export function EstimateTaskView({ ctx, task }: { ctx: TaskCtx; task: EstimateTask }) {
  const { prog, host, i } = ctx;
  const [value, setValue] = useState(() => (prog.solved ? task.answer : Math.round((task.min + task.max) / 2 / task.step) * task.step));
  const [result, setResult] = useState<'right' | 'close' | 'far' | null>(prog.solved ? 'right' : null);
  const check = () => {
    const r = checkEstimate(task, value);
    setResult(r);
    host.progress(i, { tries: prog.tries + 1, ...(r === 'right' ? { solved: true } : { last: `geschätzt: ${num(value)} ${task.unit}`.trim(), mistake: undefined }) });
  };
  const at = (v: number) => `${((v - task.min) / (task.max - task.min)) * 100}%`;
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <div className="estimate">
        <output className="estimate-value">
          {num(value)}
          {task.unit && <small> {task.unit}</small>}
        </output>
        <div className="estimate-track">
          <input
            type="range"
            min={task.min}
            max={task.max}
            step={task.step}
            value={value}
            onChange={(e) => (setValue(Number(e.target.value)), result !== 'right' && setResult(null))}
            disabled={result === 'right'}
            aria-label="Dein Schätzwert"
          />
          {result === 'right' && (
            <span className="estimate-answer" style={{ left: at(task.answer) }} title={`Richtig: ${num(task.answer)} ${task.unit}`}>
              <i />
            </span>
          )}
        </div>
        <div className="estimate-scale">
          <small>
            {num(task.min)} {task.unit}
          </small>
          <small>
            {num(task.max)} {task.unit}
          </small>
        </div>
      </div>
      <div className="row-gap">
        <CheckButton ctx={ctx} right={result === 'right'} onCheck={check} />
      </div>
      <Verdict
        ok={result === null ? null : result === 'right'}
        text={result === 'close' ? `Nah dran – etwas ${value > task.answer ? 'zu hoch' : 'zu niedrig'}.` : result === 'far' ? `Noch weit weg – deutlich ${value > task.answer ? 'zu hoch' : 'zu niedrig'}.` : ''}
      />
      {result === 'right' && (
        <p className="muted small">
          Richtig: {num(task.answer)} {task.unit}
        </p>
      )}
      {result === 'right' && <Explain text={task.explain} />}
      {hintsOf(ctx, task.hints)}
      <TaskFooter noNext ctx={ctx} solution={<p className="practice-steps">{`${num(task.answer)} ${task.unit}`}</p>} card={() => [task.prompt, `${num(task.answer)} ${task.unit}${task.explain ? '\n\n' + task.explain : ''}`]} />
    </div>
  );
}

// ---------- label a graphic ----------
export function LabelTaskView({ ctx, task }: { ctx: TaskCtx; task: LabelTask }) {
  const { prog, host, i } = ctx;
  const theme = useResolvedTheme();
  const terms = useMemo(() => shuffled(task.labels, seedOf(ctx.set.id) + i), [task, ctx.set.id, i]);
  const [given, setGiven] = useState<string[]>(() => (prog.solved ? task.labels : task.labels.map(() => '')));
  const [marks, setMarks] = useState<boolean[] | null>(prog.solved ? task.labels.map(() => true) : null);
  const right = !!marks && marks.every(Boolean);
  // drag & drop: a term is dragged (ghost under the pointer) or picked by a tap/keyboard and then put on a box
  const [pick, setPick] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ term: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);
  const svg = useMemo(
    () => renderDiagram(task.diagram, PALETTES[theme], right ? undefined : { hideMany: task.hide, filled: given, marks: marks ?? undefined }),
    [task, theme, right, given, marks],
  );
  const bank = terms.filter((t) => !given.includes(t));
  /** Puts a term on box k; one already there goes to where the term came from (or back to the bank). */
  const place = (term: string, k: number) => {
    setGiven((g) => {
      const n = [...g];
      const from = n.indexOf(term);
      const prev = n[k];
      if (from >= 0) n[from] = prev && from !== k ? prev : '';
      n[k] = term;
      return n;
    });
    setMarks(null);
    setPick(null);
  };
  const unplace = (k: number) => (setGiven((g) => g.map((x, j) => (j === k ? '' : x))), setMarks(null));
  const slotAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-slot]');
    return el && boxRef.current?.contains(el) ? Number(el.getAttribute('data-slot')) : null;
  };
  /** Dragging with mouse or finger (pointer events); a short tap is left to the click (pick / send back). */
  const startDrag = (e: ReactPointerEvent, term: string, from?: number) => {
    if (right || e.button > 0) return;
    const sx = e.clientX,
      sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      setDrag({ term, x: ev.clientX, y: ev.clientY });
      setOver(slotAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) {
        const k = slotAt(ev.clientX, ev.clientY);
        if (k !== null) place(term, k);
        else if (from !== undefined) unplace(from);
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 50);
      }
      setDrag(null);
      setOver(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // a box: drag its term away, or (tap) put the picked term on it / send its term back
  const slotOf = (t: EventTarget | null) => {
    const el = (t as Element | null)?.closest?.('[data-slot]');
    return el ? Number(el.getAttribute('data-slot')) : null;
  };
  const onBoxDown = (e: ReactPointerEvent) => {
    const k = slotOf(e.target);
    if (k !== null && given[k]) startDrag(e, given[k], k);
  };
  const tapSlot = (k: number) => {
    if (right || justDragged.current) return;
    if (pick) place(pick, k);
    else if (given[k]) unplace(k);
  };
  // highlight the box under the dragged term
  useEffect(() => {
    boxRef.current?.querySelectorAll('[data-slot]').forEach((n) => n.toggleAttribute('data-over', Number(n.getAttribute('data-slot')) === over));
  }, [over, svg]);
  // keyboard: with a picked term, 1–9 puts it on that box; Esc lets go
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= task.labels.length) (e.preventDefault(), place(pick, n - 1));
      else if (e.key === 'Escape') setPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);
  const check = () => {
    const r = checkLabels(task, given);
    setMarks(r.places);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : { last: given.map((g, k) => `${k + 1}: ${g || '(leer)'}`).join('; '), mistake: undefined }) });
  };
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      {/* our own SVG with escaped labels – safe to insert; the covered boxes are drop targets */}
      <div
        ref={boxRef}
        className={'diagram label-diagram dnd' + (pick || drag ? ' picking' : '')}
        onPointerDown={onBoxDown}
        onClick={(e) => {
          const k = slotOf(e.target);
          if (k !== null) tapSlot(k);
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="sr-only">
        {task.labels.map((_, k) => (
          <button key={k} type="button" onClick={() => tapSlot(k)}>
            Kasten {k + 1}: {given[k] || 'leer'}
          </button>
        ))}
      </div>
      {!right && (
        <div className="label-bank" aria-label="Begriffe">
          {bank.map((t) => (
            <button
              key={t}
              type="button"
              className={'label-chip' + (pick === t ? ' picked' : '')}
              aria-pressed={pick === t}
              onPointerDown={(e) => startDrag(e, t)}
              onClick={() => !justDragged.current && setPick((p) => (p === t ? null : t))}
            >
              {t}
            </button>
          ))}
          {!bank.length && <small className="muted">Alle Begriffe verteilt – tippe auf einen Kasten, um einen Begriff zurückzulegen.</small>}
        </div>
      )}
      {!right && (
        <small className="muted label-help">
          {pick ? `Tippe auf einen Kasten (oder drücke 1–${task.labels.length}), um „${pick}“ dort abzulegen.` : 'Zieh die Begriffe auf die Kästen – oder tippe erst einen Begriff, dann einen Kasten an.'}
        </small>
      )}
      {drag &&
        createPortal(
          <div className="label-ghost" style={{ left: drag.x, top: drag.y }}>
            {drag.term}
          </div>,
          document.body,
        )}
      <div className="row-gap">
        <CheckButton ctx={ctx} right={right} onCheck={check} disabled={given.some((g) => !g)} />
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} richtig beschriftet.` : ''} />
      {right && <Explain text={task.explain} />}
      {hintsOf(ctx, task.hints)}
      <TaskFooter noNext ctx={ctx} solution={<ol className="practice-steps">{task.labels.map((l) => <li key={l}>{l}</li>)}</ol>} card={() => [task.prompt, task.labels.map((l, k) => `${k + 1}. ${l}`).join('\n')]} />
    </div>
  );
}

// ---------- small spreadsheet ----------
export function SheetTaskView({ ctx, task }: { ctx: TaskCtx; task: SheetTask }) {
  const { prog, host, i } = ctx;
  const toFill = Object.keys(task.expect);
  const [given, setGiven] = useState<Record<string, string>>(() => (prog.solved ? { ...task.expect } : {}));
  const [marks, setMarks] = useState<Record<string, boolean> | null>(prog.solved ? Object.fromEntries(toFill.map((k) => [k, true])) : null);
  const [focus, setFocus] = useState<string | null>(null);
  const r = useMemo(() => checkSheet(task, given), [task, given]);
  const right = !!marks && Object.values(marks).every(Boolean);
  const check = () => {
    setMarks(r.cells);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : { last: toFill.map((k) => `${k}: ${given[k] || '(leer)'}`).join('; '), mistake: undefined }) });
  };
  const width = task.rows[0]?.length ?? 0;
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <div className="sheet-wrap">
        <table className="sheet-grid">
          <thead>
            <tr>
              <th />
              {Array.from({ length: width }, (_, c) => (
                <th key={c}>{String.fromCharCode(65 + c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {task.rows.map((row, ri) => (
              <tr key={ri}>
                <th>{ri + 1}</th>
                {row.map((cell, ci) => {
                  const name = cellName(ci, ri);
                  if (!toFill.includes(name)) {
                    const v = r.values[ri][ci];
                    return <td key={ci} className={typeof v === 'number' ? 'num' : ''}>{cell.startsWith('=') ? showValue(v) : cell}</td>;
                  }
                  const v = r.values[ri][ci];
                  const editing = focus === name;
                  return (
                    <td key={ci} className={'fill' + (marks ? (marks[name] ? ' ok' : ' bad') : '')}>
                      <input
                        value={editing || !given[name]?.startsWith('=') ? (given[name] ?? '') : isErr(v) ? v.error : showValue(v)}
                        onFocus={() => setFocus(name)}
                        onBlur={() => setFocus(null)}
                        onChange={(e) => (setGiven((g) => ({ ...g, [name]: e.target.value })), setMarks(null))}
                        onKeyDown={(e) => e.key === 'Enter' && (right ? ctx.isLast || ctx.onNext() : check())}
                        placeholder="?"
                        aria-label={`Zelle ${name}`}
                        disabled={right}
                        spellCheck={false}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Zahl oder Formel eingeben, z. B. =B2*C2 oder =SUMME(D2:D4).</p>
      <div className="row-gap">
        <CheckButton ctx={ctx} right={right} onCheck={check} disabled={toFill.every((k) => !given[k]?.trim())} />
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${Object.values(marks).filter(Boolean).length} von ${toFill.length} Zellen richtig.` : ''} />
      {right && <Explain text={task.explain} />}
      {hintsOf(ctx, task.hints)}
      <TaskFooter
        noNext
        ctx={ctx}
        solution={
          <ul className="practice-steps">
            {toFill.map((k) => (
              <li key={k}>
                <b>{k}</b>: {task.expect[k]}
              </li>
            ))}
          </ul>
        }
        card={() => [task.prompt, toFill.map((k) => `${k}: ${task.expect[k]}`).join('\n')]}
      />
    </div>
  );
}

// ---------- decision scenario ----------
export function ScenarioTaskView({ ctx, task }: { ctx: TaskCtx; task: ScenarioTask }) {
  const { prog, host, i } = ctx;
  const [picks, setPicks] = useState<number[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const walk = scenarioWalk(task, picks);
  const max = scenarioMax(task);
  const last = walk.steps[walk.steps.length - 1];
  const ended = walk.done && shown === null;
  const passed = scenarioPassed(task, walk.score);
  const choose = (k: number) => {
    const next = [...picks, k];
    setPicks(next);
    setShown(k);
    const w = scenarioWalk(task, next);
    if (w.done) host.progress(i, { tries: prog.tries + 1, ...(scenarioPassed(task, w.score) ? { solved: true } : { last: w.steps.map((s) => s.choice.text).join(' → '), mistake: undefined }) });
  };
  return (
    <div className="practice-task scenario">
      <CardContent text={task.prompt} className="practice-problem" />
      {shown !== null && last ? (
        <div className={'scenario-feedback ' + (last.choice.score >= 2 ? 'ok' : last.choice.score === 1 ? 'part' : 'bad')}>
          <p className="muted small">Du hast gewählt: {last.choice.text}</p>
          {last.choice.feedback && <CardContent text={last.choice.feedback} />}
          <button type="button" className="btn primary sm" onClick={() => setShown(null)}>
            {walk.done ? 'Zum Ergebnis' : 'Weiter'}
          </button>
        </div>
      ) : ended ? (
        <div className="scenario-end">
          {walk.here && <CardContent text={walk.here.text} className="scenario-text" />}
          <p>
            <b>
              {walk.score} von {max} Punkten
            </b>{' '}
            {passed ? '– gut entschieden!' : '– da geht noch mehr. Probier einen anderen Weg.'}
          </p>
          <ol className="scenario-path">
            {walk.steps.map((s, k) => (
              <li key={k} className={s.choice.score >= 2 ? 'ok' : s.choice.score === 1 ? 'part' : 'bad'}>
                {s.choice.text}
              </li>
            ))}
          </ol>
          <div className="row-gap">
            {!passed && (
              <button type="button" className="btn outline" onClick={() => (setPicks([]), setShown(null))}>
                Nochmal von vorn
              </button>
            )}
            {(passed || prog.solved) && <CheckButton ctx={ctx} right onCheck={() => undefined} />}
          </div>
        </div>
      ) : (
        walk.here && (
          <div className="scenario-node">
            <CardContent text={walk.here.text} className="scenario-text" />
            <div className="practice-choices">
              {walk.here.choices.map((c, k) => (
                <button key={k} type="button" className="btn outline scenario-choice" onClick={() => choose(k)}>
                  {c.text}
                </button>
              ))}
            </div>
            <small className="muted">Entscheidung {walk.steps.length + 1}</small>
          </div>
        )
      )}
      {hintsOf(ctx, task.hints)}
      <TaskFooter
        noNext={passed && ended}
        ctx={ctx}
        canShow={walk.done}
        solution={<p className="practice-steps">Bester Weg: {max} Punkte. {task.explain ?? ''}</p>}
        card={() => [task.prompt, task.explain ?? walk.steps.map((s) => `${s.choice.text}: ${s.choice.feedback}`).join('\n')]}
      />
    </div>
  );
}

// ---------- role play ----------
export function RoleplayTaskView({ ctx, task }: { ctx: TaskCtx; task: RoleplayTask }) {
  const { prog, host, i } = ctx;
  const [chat, setChat] = useState<ChatLine[]>(() => prog.chat ?? [{ me: false, text: task.opening }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [grade, setGrade] = useState<CaseGrade | null>(null);
  const mine = chat.filter((l) => l.me).length;
  const over = mine >= task.turns;
  const save = (c: ChatLine[]) => (setChat(c), host.progress(i, { chat: c }));
  const send = async () => {
    const text = draft.trim();
    if (!text || busy || over) return;
    const next = [...chat, { me: true, text }];
    save(next);
    setDraft('');
    if (next.filter((l) => l.me).length >= task.turns) return;
    setBusy(true);
    setError('');
    try {
      const p = roleplayReplyPrompt(task, next, LANG_RULE);
      const r = (await completeJson(p.system, p.user, 600)) as { reply?: unknown };
      const reply = typeof r?.reply === 'string' && r.reply.trim() ? r.reply.trim() : '…';
      save([...next, { me: false, text: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      const c = roleplayAsCase(task, chat);
      const p = caseGradePrompt(c, '(siehe Gespräch im Sachverhalt)', LANG_RULE);
      const g = parseCaseGrade(c, await completeJson(p.system, p.user, 2500));
      setGrade(g);
      host.progress(i, { tries: prog.tries + 1, ...(g.total / g.max >= 0.6 ? { solved: true } : { last: chat.filter((l) => l.me).map((l) => l.text).join(' / '), mistake: undefined }) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const restart = () => (save([{ me: false, text: task.opening }]), setGrade(null));
  return (
    <div className="practice-task roleplay">
      <CardContent text={task.prompt} className="practice-problem" />
      <div className="case-facts">
        <b>Situation</b>
        <CardContent text={task.scenario} />
        <p className="small">
          <b>Dein Ziel:</b> {task.goal}
        </p>
      </div>
      <div className="rp-chat" aria-live="polite">
        {chat.map((l, k) => (
          <div key={k} className={'rp-line ' + (l.me ? 'me' : 'them')}>
            <CardContent text={l.text} />
          </div>
        ))}
        {busy && !grade && <div className="rp-line them typing">…</div>}
      </div>
      {!grade && (
        <>
          {!over ? (
            <div className="rp-input">
              <textarea
                className="input"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void send())}
                placeholder="Deine Antwort … (Enter senden, Umschalt+Enter neue Zeile)"
                disabled={busy}
              />
              <button type="button" className="btn primary" onClick={() => void send()} disabled={busy || !draft.trim()} aria-label="Senden">
                <IconSend size={16} />
              </button>
            </div>
          ) : (
            <p className="muted small">Das Gespräch ist zu Ende – lass es jetzt bewerten.</p>
          )}
          <div className="row-gap">
            <span className="muted small">
              {mine} von {task.turns} Beiträgen
            </span>
            <button type="button" className={over ? 'btn primary' : 'btn ghost sm'} onClick={() => void finish()} disabled={busy || mine < 2}>
              {busy && over ? 'Wird bewertet …' : 'Gespräch beenden & bewerten'}
            </button>
          </div>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      {grade && (
        <>
          <GradeBox grade={grade} />
          <div className="row-gap">
            <button type="button" className="btn outline" onClick={restart}>
              Neues Gespräch
            </button>
            {(grade.total / grade.max >= 0.6 || prog.solved) && <CheckButton ctx={ctx} right onCheck={() => undefined} />}
          </div>
        </>
      )}
      {hintsOf(ctx, task.hints)}
      <TaskFooter
        noNext={!!grade}
        ctx={ctx}
        canShow={!!grade || prog.tries >= 1}
        solution={task.solution ? <CardContent text={task.solution} className="case-solution" /> : undefined}
        card={() => [`${task.scenario}\n\nZiel: ${task.goal}`, task.solution || task.rubric.map((r) => r.criterion).join('\n')]}
      />
    </div>
  );
}

/** „Erklär es mir“: explain a concept in your own words; the AI checks the key points (graded like a case). */
export function ExplainTaskView({ ctx, task }: { ctx: TaskCtx; task: ExplainTask }) {
  const { prog, host, i } = ctx;
  const key = `merkora.explain.${ctx.set.id}.${i}`;
  const [answer, setAnswer] = useState(() => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  const [grade, setGrade] = useState<CaseGrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const write = (v: string) => {
    setAnswer(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* no storage */
    }
  };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const asCase = explainAsCase(task);
      const p = caseGradePrompt(asCase, answer, LANG_RULE);
      const g = parseCaseGrade(asCase, await completeJson(p.system, p.user, 2000));
      setGrade(g);
      const right = g.total / g.max >= 0.6;
      host.progress(i, { tries: prog.tries + 1, ...(right ? { solved: true } : { last: answer.slice(0, 600), mistake: undefined }) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const passed = !!grade && grade.total / grade.max >= 0.6;
  return (
    <div className="practice-task explain-task">
      <div className="explain-head">
        <span className="explain-badge">Erklär es mir</span>
        <b className="explain-concept">{task.concept}</b>
      </div>
      <CardContent text={task.prompt} className="practice-problem" />
      <p className="muted small explain-tip">
        Schreib so, als würdest du es {task.audience ?? 'einem Freund ohne Vorwissen'} erklären – einfache Worte, gern mit eigenem Beispiel.
      </p>
      <textarea className="input explain-answer" rows={6} value={answer} onChange={(e) => write(e.target.value)} placeholder="Also, stell dir vor …" aria-label={`Erklärung zu ${task.concept}`} />
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy || words < 15 || (passed && prog.solved)}>
          {busy ? 'Pip liest …' : grade ? (passed ? 'Bestanden' : 'Verbesserte Erklärung prüfen') : 'Prüfen lassen'}
        </button>
        <span className="muted small">
          {words} Wörter{words < 15 ? ' – erklär noch etwas mehr' : ''} · {task.keyPoints.length} Kernpunkte
        </span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {grade && <GradeBox grade={grade} />}
      {grade && !passed && <p className="muted small">Ergänze die fehlenden Punkte direkt im Text oben und lass es nochmal prüfen.</p>}
      {prog.solved && !grade && <Verdict ok text="Schon gut erklärt." />}
      {(passed || prog.solved) && <CheckButton ctx={ctx} right onCheck={() => undefined} />}
      {hintsOf(ctx, task.hints)}
      <TaskFooter ctx={ctx} solution={<CardContent text={task.solution} className="case-solution" />} card={() => [`Erkläre: ${task.concept}`, task.solution]} />
    </div>
  );
}
