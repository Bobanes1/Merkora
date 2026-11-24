import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { CardContent } from '../CardContent';
import { IconArrowDown, IconArrowUp, IconGrip } from '../Icons';
import { completeJson, LANG_RULE } from '../../lib/ai';
import {
  caseGradePrompt,
  fullGrade,
  matchesSolution,
  checkClassify,
  checkCloze,
  checkMulti,
  checkOrder,
  slotFor,
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
import { CheckButton, Hints, TaskFooter, Verdict, type TaskCtx } from './PracticeSetView';

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Points with a German decimal comma (4,5). */
const pts = (n: number) => String(n).replace('.', ',');
const Explain = ({ text }: { text?: string }) => (text ? <CardContent text={text} className="practice-explain" /> : null);

/** Put in order: drag (mouse, finger, pen) or arrows. */
export function OrderTaskView({ ctx, task }: { ctx: TaskCtx; task: OrderTask }) {
  const { prog, host, i } = ctx;
  const [list, setList] = useState(() => (prog.solved ? task.items : shuffled(task.items, seedOf(ctx.set.id) + i)));
  const [marks, setMarks] = useState<boolean[] | null>(prog.solved ? task.items.map(() => true) : null);
  const [drag, setDrag] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Smooth movement: the dragged item follows the pointer exactly (transform), the others glide to their new
  // places (FLIP: remember where they were, jump to the new place, then animate the difference away).
  const prevTops = useRef(new Map<string, number>());
  const pointerY = useRef(0);
  const grabDy = useRef(0);
  const dragKey = useRef<string | null>(null);
  const calm = () => document.documentElement.classList.contains('no-anim') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const items = () => (listRef.current ? ([...listRef.current.children] as HTMLElement[]) : []);
  const rememberTops = () => {
    prevTops.current.clear();
    for (const el of items()) if (el.dataset.k !== dragKey.current) prevTops.current.set(el.dataset.k ?? '', el.getBoundingClientRect().top);
  };
  const placeDragged = () => {
    const el = items().find((x) => x.dataset.k === dragKey.current);
    if (!el || !listRef.current) return;
    const natural = listRef.current.getBoundingClientRect().top + el.offsetTop;
    el.style.transform = `translateY(${pointerY.current - grabDy.current - natural}px) scale(1.02)`;
  };
  useLayoutEffect(() => {
    if (prevTops.current.size) {
      const glide = !calm();
      for (const el of items()) {
        const prev = prevTops.current.get(el.dataset.k ?? '');
        if (prev === undefined) continue;
        el.style.transition = 'none';
        el.style.transform = '';
        const delta = prev - el.getBoundingClientRect().top;
        if (!delta || !glide) continue;
        el.style.transform = `translateY(${delta}px)`;
        void el.offsetHeight; // apply the jump before animating back
        el.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
      }
      prevTops.current.clear();
    }
    if (dragKey.current) placeDragged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  const move = (from: number, to: number) => {
    rememberTops();
    setList((cur) => {
      if (to < 0 || to >= cur.length || from === to) return cur;
      const next = [...cur];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
    setMarks(null);
  };
  // Dragging with the mouse, a finger or a pen: the item swaps places on the way, all the way to the top or bottom.
  // The window follows the pointer (moving an element in the page drops its pointer capture, so the item can't).
  const dragFrom = useRef<number | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLLIElement>, k: number) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // on touch screens only the grip starts a drag, so the page can still be scrolled
    if (e.pointerType !== 'mouse' && !target.closest('.order-grip')) return;
    e.preventDefault();
    const el = e.currentTarget;
    dragKey.current = el.dataset.k ?? null;
    pointerY.current = e.clientY;
    grabDy.current = e.clientY - el.getBoundingClientRect().top;
    el.style.transition = 'none';
    dragFrom.current = k;
    setDrag(k);
  };
  useEffect(() => {
    if (drag === null) return;
    const onMove = (e: PointerEvent) => {
      const from = dragFrom.current;
      if (from === null || !listRef.current) return;
      e.preventDefault();
      pointerY.current = e.clientY;
      placeDragged();
      // the item moves to where its middle is: past the middle of a neighbour → swap
      const all = items();
      const me = all.find((x) => x.dataset.k === dragKey.current);
      if (me) {
        const top = listRef.current.getBoundingClientRect().top;
        const others = all.filter((x) => x !== me).map((x) => top + x.offsetTop + x.offsetHeight / 2);
        const to = slotFor(others, e.clientY - grabDy.current + me.offsetHeight / 2);
        if (to !== from) {
          move(from, to);
          dragFrom.current = to;
          setDrag(to);
        }
      }
      // near the window edge the page scrolls along (long lists on the phone)
      const edge = 56;
      if (e.clientY < edge) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    };
    const onEnd = () => {
      // the item settles into its place
      const el = items().find((x) => x.dataset.k === dragKey.current);
      if (el) {
        el.style.transition = calm() ? 'none' : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
      }
      dragKey.current = null;
      dragFrom.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('blur', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('blur', onEnd);
    };
    // the listeners only need to exist while dragging
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);
  const check = () => {
    const r = checkOrder(task, list);
    setMarks(r.places);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : { last: list.join(' → '), mistake: undefined }) });
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
            data-k={item}
            className={'order-item' + (marks ? (marks[k] ? ' ok' : ' bad') : '') + (drag === k ? ' dragging' : '')}
            onPointerDown={(e) => startDrag(e, k)}
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
        <CheckButton ctx={ctx} right={right} onCheck={check} />
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} stehen richtig.` : ''} />
      {right && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter noNext
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

/** Sort into groups: drag the cards into the boxes – or tap a card, then a box; keys 1–n while a card is picked. */
export function ClassifyTaskView({ ctx, task }: { ctx: TaskCtx; task: ClassifyTask }) {
  const { prog, host, i } = ctx;
  const order = useMemo(() => shuffled(task.items.map((_, k) => k), seedOf(ctx.set.id) + i), [task, ctx.set.id, i]);
  const [chosen, setChosen] = useState<number[]>(() => (prog.solved ? task.items.map((it) => it.group) : task.items.map(() => -1)));
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ k: number; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);
  const right = !!marks?.every(Boolean) || (!!prog.solved && chosen.every((g, k) => g === task.items[k].group));
  const locked = right;

  const put = (k: number, g: number) => {
    if (locked) return;
    setChosen((c) => c.map((x, j) => (j === k ? g : x)));
    setMarks(null);
    setPick(null);
  };
  const groupAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-group]') as HTMLElement | null;
    if (!el || !boxRef.current?.contains(el)) return null;
    return Number(el.dataset.group);
  };
  const startDrag = (e: ReactPointerEvent, k: number) => {
    if (locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      ev.preventDefault();
      setDrag({ k, x: ev.clientX, y: ev.clientY });
      setOver(groupAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 50);
      const g = groupAt(ev.clientX, ev.clientY);
      if (g !== null) put(k, g);
      else if (!boxRef.current?.contains(document.elementFromPoint(ev.clientX, ev.clientY))) put(k, -1);
      setDrag(null);
      setOver(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const tapCard = (k: number) => {
    if (justDragged.current || locked) return;
    if (chosen[k] >= 0 && pick === null) return put(k, -1); // a sorted card goes back to the pile
    setPick((p) => (p === k ? null : k));
  };
  const tapGroup = (g: number) => {
    if (justDragged.current || pick === null) return;
    put(pick, g);
  };
  // keyboard: with a card picked, 1–n sorts it into box n; Esc drops the pick
  useEffect(() => {
    if (pick === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setPick(null);
      const n = Number(e.key);
      if (n >= 1 && n <= task.groups.length) {
        e.preventDefault();
        put(pick, n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const check = () => {
    const r = checkClassify(task, chosen);
    setMarks(r.items);
    const last = task.items.map((it, k) => `${it.text} → ${task.groups[chosen[k] as number] ?? '–'}`).join('; ');
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : { last, mistake: undefined }) });
  };
  const card = (k: number) => (
    <button
      key={k}
      type="button"
      className={'classify-card' + (pick === k ? ' picked' : '') + (drag?.k === k ? ' dragging' : '') + (marks && chosen[k] >= 0 ? (marks[k] ? ' ok' : ' bad') : '')}
      onPointerDown={(e) => startDrag(e, k)}
      onClick={(e) => (e.stopPropagation(), tapCard(k))}
      aria-pressed={pick === k}
      title={chosen[k] >= 0 && !locked ? 'Antippen: zurück in den Stapel' : undefined}
    >
      <CardContent text={task.items[k].text} className="inline" />
    </button>
  );
  const pile = order.filter((k) => chosen[k] < 0);
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      <div className={'classify-dnd' + (pick !== null ? ' picking' : '')} ref={boxRef}>
        {pile.length > 0 && (
          <div className="classify-pile" aria-label="Noch nicht zugeordnet">
            {pile.map(card)}
          </div>
        )}
        <div className="classify-boxes" style={{ ['--groups' as string]: task.groups.length }}>
          {task.groups.map((g, gi) => (
            <div key={g} className={'classify-box' + (over === gi ? ' over' : '')} data-group={gi} onClick={() => tapGroup(gi)}>
              <div className="classify-box-head">
                <span className="classify-num">{gi + 1}</span> {g}
              </div>
              <div className="classify-box-cards">
                {order.filter((k) => chosen[k] === gi).map(card)}
                {!order.some((k) => chosen[k] === gi) && <span className="classify-empty">{pick !== null ? 'Hier ablegen' : 'Hierher ziehen'}</span>}
              </div>
              {pick !== null && (
                <button type="button" className="sr-only" onClick={() => put(pick, gi)}>
                  In „{g}“ einordnen
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {!locked && <small className="muted label-help">Zieh die Karten in die passende Gruppe – oder tippe erst eine Karte, dann die Gruppe (Tasten 1–{task.groups.length}).</small>}
      <div className="row-gap">
        <CheckButton ctx={ctx} right={right} onCheck={check} disabled={chosen.some((c) => c < 0)} />
        {!right && chosen.some((c) => c < 0) && <span className="muted small">Ordne zuerst alles zu.</span>}
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} richtig – zieh die roten Karten um.` : ''} />
      {right && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter noNext
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
      {drag &&
        createPortal(
          <div className="label-ghost" style={{ left: drag.x, top: drag.y }}>
            {task.items[drag.k].text}
          </div>,
          document.body,
        )}
    </div>
  );
}


/** Fill the gaps from a word bank: drag a word into a gap – or tap a word (it goes into the chosen or next free gap). No typing. */
export function ClozeTaskView({ ctx, task }: { ctx: TaskCtx; task: ClozeTask }) {
  const { prog, host, i } = ctx;
  // the bank: the right word of every gap plus the distractors, mixed the same way each time
  const bank = useMemo(() => {
    const words = [...task.gaps.map((g) => g[0]), ...(task.distractors ?? [])];
    return shuffled(words.map((_, k) => k), seedOf(ctx.set.id) + i * 7).map((k) => words[k]);
  }, [task, ctx.set.id, i]);
  // placed[gap] = index into bank (or -1)
  const [placed, setPlaced] = useState<number[]>(() => {
    if (!prog.solved) return task.gaps.map(() => -1);
    const taken = new Set<number>();
    return task.gaps.map((g) => {
      const j = bank.findIndex((w, k) => w === g[0] && !taken.has(k));
      taken.add(j);
      return j;
    });
  });
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ w: number; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);
  const given = placed.map((w) => (w >= 0 ? bank[w] : ''));
  const right = !!marks?.every(Boolean) || (!!prog.solved && checkCloze(task, given).right);
  const used = new Set(placed.filter((w) => w >= 0));

  const put = (w: number, gap: number) => {
    if (right) return;
    setPlaced((p) => p.map((x, k) => (k === gap ? w : x === w ? -1 : x)));
    setMarks(null);
    setSel(null);
  };
  const takeOut = (gap: number) => {
    if (right) return;
    setPlaced((p) => p.map((x, k) => (k === gap ? -1 : x)));
    setMarks(null);
  };
  const tapWord = (w: number) => {
    if (justDragged.current || right) return;
    const target = sel ?? placed.findIndex((x) => x < 0);
    if (target >= 0) put(w, target);
  };
  const tapGap = (gap: number) => {
    if (justDragged.current || right) return;
    if (placed[gap] >= 0) return takeOut(gap);
    setSel((s) => (s === gap ? null : gap));
  };
  const gapAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-gap]') as HTMLElement | null;
    return el && boxRef.current?.contains(el) ? Number(el.dataset.gap) : null;
  };
  const startDrag = (e: ReactPointerEvent, w: number, from?: number) => {
    if (right || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      ev.preventDefault();
      setDrag({ w, x: ev.clientX, y: ev.clientY });
      setOver(gapAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 50);
      const g = gapAt(ev.clientX, ev.clientY);
      if (g !== null) put(w, g);
      else if (from !== undefined) takeOut(from);
      setDrag(null);
      setOver(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const check = () => {
    const r = checkCloze(task, given);
    setMarks(r.gaps);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : { last: given.map((g, k) => `Lücke ${k + 1}: ${g || '(leer)'}`).join('; '), mistake: undefined }) });
  };
  const mono = /[{};=()]/.test(task.text) && /\n/.test(task.text);
  return (
    <div className="practice-task" ref={boxRef}>
      <CardContent text={task.prompt} className="practice-problem" />
      <div className={'cloze' + (mono ? ' mono' : '')}>
        {clozeParts(task.text).map((p, k) =>
          typeof p === 'string' ? (
            <span key={k}>{p}</span>
          ) : (
            <button
              key={k}
              type="button"
              data-gap={p}
              className={'cloze-slot' + (placed[p] >= 0 ? ' filled' : '') + (sel === p ? ' sel' : '') + (over === p ? ' over' : '') + (marks ? (marks[p] ? ' ok' : ' bad') : '')}
              style={{ minWidth: `${Math.max(5, (task.gaps[p]?.[0]?.length ?? 5) + 2)}ch` }}
              onClick={() => tapGap(p)}
              onPointerDown={(e) => placed[p] >= 0 && startDrag(e, placed[p], p)}
              aria-label={placed[p] >= 0 ? `Lücke ${p + 1}: ${bank[placed[p]]} – antippen zum Entfernen` : `Lücke ${p + 1} (leer)`}
            >
              {placed[p] >= 0 ? bank[placed[p]] : p + 1}
            </button>
          ),
        )}
      </div>
      {!right && (
        <div className="cloze-bank" aria-label="Wörter">
          {bank.map((w, k) =>
            used.has(k) ? null : (
              <button key={k} type="button" className="label-chip" onPointerDown={(e) => startDrag(e, k)} onClick={() => tapWord(k)}>
                {w}
              </button>
            ),
          )}
        </div>
      )}
      {!right && <small className="muted label-help">Zieh die Wörter in die Lücken – oder tippe ein Wort an. Eine gefüllte Lücke antippen nimmt das Wort wieder heraus.</small>}
      <div className="row-gap">
        <CheckButton ctx={ctx} right={right} onCheck={check} disabled={placed.some((w) => w < 0)} />
      </div>
      <Verdict ok={marks ? right : null} text={marks && !right ? `${marks.filter(Boolean).length} von ${marks.length} Lücken richtig – tausch die roten aus.` : ''} />
      {right && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter noNext
        ctx={ctx}
        solution={<p className="practice-steps">{clozeParts(task.text).map((p) => (typeof p === 'string' ? p : `[${task.gaps[p][0]}]`)).join('')}</p>}
        card={() => [task.prompt + '\n\n' + task.text.replace(/\{\{(\d+)\}\}/g, '___'), clozeParts(task.text).map((p) => (typeof p === 'string' ? p : task.gaps[p][0])).join('')]}
      />
      {drag &&
        createPortal(
          <div className="label-ghost" style={{ left: drag.x, top: drag.y }}>
            {bank[drag.w]}
          </div>,
          document.body,
        )}
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
    host.progress(i, { tries: prog.tries + 1, ...(r ? { solved: true } : { last: 'gewählt: ' + (chosen.map((k) => task.options[k]).join('; ') || 'nichts'), mistake: undefined }) });
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
        <CheckButton ctx={ctx} right={result === true} onCheck={check} disabled={!chosen.length} />
      </div>
      <Verdict ok={result} text={result === false ? `Es sind ${task.correct.length} richtige Antworten.` : ''} />
      {result && <Explain text={task.explain} />}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter noNext
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
      // the sample solution itself always gets full points – no need to ask the AI
      const p = caseGradePrompt(task, answer, LANG_RULE);
      const g = matchesSolution(answer, task.solution) ? fullGrade(task) : parseCaseGrade(task, await completeJson(p.system, p.user, 2500));
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
        <span className="case-facts-head">
          <b>Sachverhalt</b> {task.law && <span className="badge law case-law">{task.law}</span>}
        </span>
        <CardContent text={task.facts} />
      </div>
      {task.norms?.length ? (
        <details className="case-norms">
          <summary>Gesetz zum Nachschlagen ({task.norms.length})</summary>
          <ul>
            {task.norms.map((n, k) => (
              <li key={k}>
                <CardContent text={n} className="inline" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="practice-problem case-question">
        <b>Aufgabe:</b> <CardContent text={task.question} className="inline" />
      </p>
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
