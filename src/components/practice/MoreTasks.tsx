import { useMemo, useState } from 'react';
import { CardContent } from '../CardContent';
import { completeJson, LANG_RULE } from '../../lib/ai';
import { PALETTES, renderDiagram } from '../../lib/diagram';
import { cellName, isErr, showValue } from '../../lib/sheet';
import {
  caseGradePrompt,
  checkEstimate,
  checkLabels,
  checkSheet,
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
  const svg = useMemo(() => renderDiagram(task.diagram, PALETTES[theme], right ? undefined : { hideMany: task.hide }), [task, theme, right]);
  const check = () => {
    const r = checkLabels(task, given);
    setMarks(r.places);
    host.progress(i, { tries: prog.tries + 1, ...(r.right ? { solved: true } : { last: given.map((g, k) => `${k + 1}: ${g || '(leer)'}`).join('; '), mistake: undefined }) });
  };
  return (
    <div className="practice-task">
      <CardContent text={task.prompt} className="practice-problem" />
      {/* our own SVG with escaped labels – safe to insert */}
      <div className="diagram label-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="label-rows">
        {task.labels.map((_, k) => (
          <label key={k} className={'label-row' + (marks ? (marks[k] ? ' ok' : ' bad') : '')}>
            <span className="label-no">{k + 1}</span>
            <select className="input" value={given[k]} onChange={(e) => (setGiven((g) => g.map((x, j) => (j === k ? e.target.value : x))), setMarks(null))} disabled={right}>
              <option value="">– Begriff wählen –</option>
              {terms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
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
