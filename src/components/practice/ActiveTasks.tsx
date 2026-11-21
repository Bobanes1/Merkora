import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CardContent } from '../CardContent';
import { IconArrowDown, IconArrowUp, IconGrip } from '../Icons';
import { completeJson, LANG_RULE } from '../../lib/ai';
import {
  caseGradePrompt,
  checkClassify,
  checkCloze,
  checkMulti,
  checkOrder,
  clozeParts,
  parseCaseGrade,
  shuffled,
  type CaseGrade,
  type CaseTask,
  type ClassifyTask,
  type ClozeTask,
  type MultiTask,
  type OrderTask,
} from '../../lib/tasks';
import { Hints, TaskFooter, Verdict, type TaskCtx } from './PracticeSetView';

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Points with a German decimal comma (4,5). */
const pts = (n: number) => String(n).replace('.', ',');
const Explain = ({ text }: { text?: string }) => (text ? <CardContent text={text} className="practice-explain" /> : null);

/** Put in order: arrows (and dragging with a mouse). */
export function OrderTaskView({ ctx, task }: { ctx: TaskCtx; task: OrderTask }) {
  const { prog, host, i } = ctx;
  const [list, setList] = useState(() => (prog.solved ? task.items : shuffled(task.items, seedOf(ctx.set.id) + i)));
  const [marks, setMarks] = useState<boolean[] | null>(prog.solved ? task.items.map(() => true) : null);
  const [drag, setDrag] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // dragging with the mouse, a finger or a pen: the item follows the pointer and swaps places on the way
  const dragFrom = useRef<number | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLLIElement>, k: number) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // on touch screens only the grip starts a drag, so the page can still be scrolled
    if (e.pointerType !== 'mouse' && !target.closest('.order-grip')) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no capture possible: the item still follows while the pointer is over the list */
    }
    dragFrom.current = k;
    setDrag(k);
  };
  const dragMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    const from = dragFrom.current;
    if (from === null || !listRef.current) return;
    const items = [...listRef.current.children] as HTMLElement[];
    const to = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (to >= 0 && to !== from) {
      move(from, to);
      dragFrom.current = to;
      setDrag(to);
    }
  };
  const endDrag = () => {
    dragFrom.current = null;
    setDrag(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setList(next);
    setMarks(null);
  };
  const check = () => {
    const r = checkOrder(task, list);
    setMarks(r.places);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : {}) });
  };
  const right = !!marks?.every(Boolean);
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <p className="muted small order-help">Zum Sortieren ziehen – oder mit den Pfeilen verschieben.</p>
      <ol className={'order-list' + (drag !== null ? ' is-dragging' : '')} ref={listRef}>
        {list.map((item, k) => (
          <li
            key={item}
            className={'order-item' + (marks ? (marks[k] ? ' ok' : ' bad') : '') + (drag === k ? ' dragging' : '')}
            onPointerDown={(e) => startDrag(e, k)}
            onPointerMove={dragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            <span className="order-grip" aria-hidden="true">
              <IconGrip size={18} />
            </span>
            <span className="order-n">{k + 1}</span>
            <CardContent text={item} className="grow" />
            <span className="order-btns">
              <button type="button" className="icon-btn" aria-label="Nach oben" onClick={() => move(k, k - 1)} disabled={k === 0}>
                <IconArrowUp size={16} />
              </button>
              <button type="button" className="icon-btn" aria-label="Nach unten" onClick={() => move(k, k + 1)} disabled={k === list.length - 1}>
                <IconArrowDown size={16} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={check}>
          Prüfen
        </button>
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} stehen richtig.` : ''} />
      {right && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        ctx={ctx}
        solution={
          <ol className="practice-steps">
            {task.items.map((x) => (
              <li key={x}>
                <CardContent text={x} />
              </li>
            ))}
          </ol>
        }
        card={() => [task.prompt, task.items.map((x, k) => `${k + 1}. ${x}`).join('\n')]}
      />
    </div>
  );
}

/** Sort into groups: tap a group for every item (works the same with finger and mouse). */
export function ClassifyTaskView({ ctx, task }: { ctx: TaskCtx; task: ClassifyTask }) {
  const { prog, host, i } = ctx;
  const order = useMemo(() => shuffled(task.items.map((_, k) => k), seedOf(ctx.set.id) + i), [task, ctx.set.id, i]);
  const [chosen, setChosen] = useState<number[]>(() => (prog.solved ? task.items.map((it) => it.group) : task.items.map(() => -1)));
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const pick = (item: number, g: number) => {
    setChosen((c) => c.map((x, k) => (k === item ? g : x)));
    setMarks(null);
  };
  const check = () => {
    const r = checkClassify(task, chosen);
    setMarks(r.items);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : {}) });
  };
  const right = !!marks?.every(Boolean);
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <div className="classify">
        {order.map((k) => (
          <div key={k} className={'classify-item' + (marks ? (marks[k] ? ' ok' : ' bad') : '')}>
            <CardContent text={task.items[k].text} className="classify-text" />
            <div className="classify-groups" role="radiogroup" aria-label="Gruppe">
              {task.groups.map((g, gi) => (
                <button key={g} type="button" role="radio" aria-checked={chosen[k] === gi} className={'chip' + (chosen[k] === gi ? ' on' : '')} onClick={() => pick(k, gi)}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={check} disabled={chosen.some((c) => c < 0)}>
          Prüfen
        </button>
        {chosen.some((c) => c < 0) && <span className="muted small">Ordne zuerst alles zu.</span>}
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} richtig zugeordnet.` : ''} />
      {right && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        ctx={ctx}
        solution={
          <ul className="practice-steps">
            {task.groups.map((g, gi) => (
              <li key={g}>
                <b>{g}:</b> {task.items.filter((it) => it.group === gi).map((it) => it.text).join(' · ')}
              </li>
            ))}
          </ul>
        }
        card={() => [task.prompt, task.groups.map((g, gi) => `${g}: ${task.items.filter((it) => it.group === gi).map((it) => it.text).join(', ')}`).join('\n')]}
      />
    </div>
  );
}

/** Fill gaps in a text (or code / a scheme). */
export function ClozeTaskView({ ctx, task }: { ctx: TaskCtx; task: ClozeTask }) {
  const { prog, host, i } = ctx;
  const [given, setGiven] = useState<string[]>(() => (prog.solved ? task.gaps.map((g) => g[0]) : task.gaps.map(() => '')));
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const check = () => {
    const r = checkCloze(task, given);
    setMarks(r.gaps);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : {}) });
  };
  const right = !!marks?.every(Boolean);
  const mono = /[{};=()]/.test(task.text) && /\n/.test(task.text);
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <div className={'cloze' + (mono ? ' mono' : '')}>
        {clozeParts(task.text).map((p, k) =>
          typeof p === 'string' ? (
            <span key={k}>{p}</span>
          ) : (
            <input
              key={k}
              className={'cloze-gap' + (marks ? (marks[p] ? ' ok' : ' bad') : '')}
              value={given[p] ?? ''}
              size={Math.max(6, (task.gaps[p]?.[0]?.length ?? 6) + 2)}
              aria-label={`Lücke ${p + 1}`}
              onChange={(e) => (setGiven((g) => g.map((x, j) => (j === p ? e.target.value : x))), setMarks(null))}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              autoCapitalize="off"
              spellCheck={false}
            />
          ),
        )}
      </div>
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={check} disabled={given.every((g) => !g.trim())}>
          Prüfen
        </button>
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} Lücken richtig.` : ''} />
      {right && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        ctx={ctx}
        solution={<p className="practice-steps">{clozeParts(task.text).map((p) => (typeof p === 'string' ? p : `[${task.gaps[p][0]}]`)).join('')}</p>}
        card={() => [task.prompt + '\n\n' + task.text.replace(/\{\{(\d+)\}\}/g, '___'), clozeParts(task.text).map((p) => (typeof p === 'string' ? p : task.gaps[p][0])).join('')]}
      />
    </div>
  );
}

/** Several right answers. */
export function MultiTaskView({ ctx, task }: { ctx: TaskCtx; task: MultiTask }) {
  const { prog, host, i } = ctx;
  const [chosen, setChosen] = useState<number[]>(prog.solved ? task.correct : []);
  const [result, setResult] = useState<boolean | null>(prog.solved ? true : null);
  const toggle = (k: number) => (setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k])), setResult(null));
  const check = () => {
    const r = checkMulti(task, chosen).right;
    setResult(r);
    host.progress(i, { tries: prog.tries + 1, ...(r ? { solved: true } : {}) });
  };
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <p className="muted small">Mehrere Antworten können richtig sein.</p>
      <div className="practice-choices">
        {task.options.map((o, k) => (
          <label key={k} className={'check-row multi-opt' + (result !== null && chosen.includes(k) ? (task.correct.includes(k) ? ' ok' : ' bad') : '')}>
            <input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} />
            <CardContent text={o} className="inline" />
          </label>
        ))}
      </div>
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={check} disabled={!chosen.length}>
          Prüfen
        </button>
      </div>
      <Verdict ok={result} text={result === false ? `Es sind ${task.correct.length} richtige Antworten.` : ''} />
      {result && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        ctx={ctx}
        solution={
          <ul className="practice-steps">
            {task.correct.map((k) => (
              <li key={k}>
                <CardContent text={task.options[k]} />
              </li>
            ))}
          </ul>
        }
        card={() => [task.prompt + '\n' + task.options.map((o) => '• ' + o).join('\n'), task.correct.map((k) => task.options[k]).join('\n')]}
      />
    </div>
  );
}

/** Case study: read the facts, write your own solution, the AI grades it against the scheme. */
export function CaseTaskView({ ctx, task }: { ctx: TaskCtx; task: CaseTask }) {
  const { prog, host, i } = ctx;
  const key = `merkora.case.${ctx.set.id}.${i}`;
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
      const p = caseGradePrompt(task, answer, LANG_RULE);
      const g = parseCaseGrade(task, await completeJson(p.system, p.user, 2500));
      setGrade(g);
      host.progress(i, { tries: prog.tries + 1, ...(g.total / g.max >= 0.6 ? { solved: true } : {}) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="practice-task">
      <div className="case-facts">
        <b>Sachverhalt</b>
        <CardContent text={task.facts} />
      </div>
      <CardContent text={`**Aufgabe:** ${task.question}`} className="practice-problem" />
      <textarea className="input case-answer" rows={10} value={answer} onChange={(e) => write(e.target.value)} placeholder="Deine Lösung – z. B. im Gutachtenstil: Obersatz, Definition, Subsumtion, Ergebnis" />
      <div className="row-gap">
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy || words < 15}>
          {busy ? 'Wird bewertet …' : grade ? 'Neu bewerten lassen' : 'Abgeben'}
        </button>
        <span className="muted small">
          {words} Wörter{words < 15 ? ' – schreib etwas mehr' : ''} · Bewertung nach {task.rubric.length} Kriterien
        </span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {grade && (
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
      )}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter ctx={ctx} solution={task.solution ? <CardContent text={task.solution} className="case-solution" /> : undefined} card={() => [`${task.facts}\n\n${task.question}`, task.solution]} />
    </div>
  );
}
