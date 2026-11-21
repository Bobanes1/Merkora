import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { aiReady, completeJson } from '../../lib/ai';
import { examDecks } from '../../lib/exams';
import { pomodoro } from '../../lib/pomodoro';
import { addTodo, dueCards, updateTodo, useStore } from '../../lib/store';
import { planCandidates, todayPlan, type Todo } from '../../lib/todos';
import { toolWindows } from '../../lib/toolWindows';
import { DAY, dayKey } from '../../lib/util';
import {
  buildWorkPlan,
  examSoonDecks,
  MOTIVATION_LABEL,
  nextStartTime,
  PHASE_LABEL,
  SIZE_LABEL,
  type Motivation,
  type PlanInputTask,
  type PlanTaskStep,
  type TaskSize,
} from '../../lib/workPlan';
import { IconCalendar, IconCheck, IconChecklist, IconClock, IconFlag, IconPlay, IconPlus, IconSparkle, IconTimer, IconTrash } from '../Icons';

const TIME_PRESETS = [
  { label: '30 Min', min: 30 },
  { label: '1 Std', min: 60 },
  { label: '1,5 Std', min: 90 },
  { label: '2 Std', min: 120 },
  { label: '3 Std', min: 180 },
];

type AiTips = { tips?: { n?: number; title?: string; reason: string }[]; summary?: string };

/** The draft survives switching tabs and reloading (only on this device). */
const DRAFT_KEY = 'merkora.workplan.draft';
type Draft = { totalMin: number; withBreaks: boolean; tasks: PlanInputTask[]; overrides: Record<string, number>; start: string; startDay: string };
function loadDraft(): Partial<Draft> {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<Draft> | null;
    if (!d || typeof d !== 'object') return {};
    // a start time from another day is no use any more
    return d.startDay === dayKey(Date.now()) ? d : { ...d, start: undefined };
  } catch {
    return {};
  }
}
function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode – the draft just isn't kept */
  }
}

const newId = () => 'pt_' + Math.random().toString(36).slice(2, 9);
const sizeFor = (minutes?: number): TaskSize => (!minutes ? 'm' : minutes <= 20 ? 's' : minutes <= 45 ? 'm' : 'l');

/**
 * Arbeitsplanung:
 * 1) Enter available time, start time & breaks preference
 * 2) Enter tasks + motivation (and optional size/priority), or take them from the to-do list, decks and skills
 * 3) Merkora builds a structured plan (Einstieg → Hauptteil → Abschluss) with clock times; long tasks are split with breaks
 * 4) Hand it over to the to-do list (to-dos taken from there are updated, not duplicated) and optionally start the timer.
 */
export function WorkPlanner() {
  const navigate = useNavigate();
  const data = useStore((s) => s.data);
  const canAi = useStore((s) => aiReady(s, 'chat'));
  const [draft] = useState(loadDraft);

  const [totalMin, setTotalMin] = useState(draft.totalMin ?? 90);
  const [withBreaks, setWithBreaks] = useState(draft.withBreaks ?? true);
  const [tasks, setTasks] = useState<PlanInputTask[]>(draft.tasks ?? []);
  const [overrides, setOverrides] = useState<Record<string, number>>(draft.overrides ?? {});
  const [start, setStart] = useState(draft.start ?? nextStartTime());

  const [title, setTitle] = useState('');
  const [motivation, setMotivation] = useState<Motivation>(2);
  const [size, setSize] = useState<TaskSize>('m');
  const [important, setImportant] = useState(false);

  const [aiTips, setAiTips] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');

  useEffect(() => {
    saveDraft({ totalMin, withBreaks, tasks, overrides, start, startDay: dayKey(Date.now()) });
  }, [totalMin, withBreaks, tasks, overrides, start]);

  const changed = () => (setAiTips({}), setAiSummary(null));
  const addTask = (item?: Partial<PlanInputTask>) => {
    const t = (item?.title ?? title).trim();
    if (!t) return;
    const id = newId();
    setTasks((list) => [
      ...list,
      {
        id,
        title: t,
        motivation: item?.motivation ?? motivation,
        size: item?.size ?? size,
        important: item?.important ?? important,
        deckId: item?.deckId,
        todoId: item?.todoId,
      },
    ]);
    // a to-do with a planned duration keeps it
    const td = item?.todoId ? data.todos?.find((x) => x.id === item.todoId) : undefined;
    if (td?.minutes) setOverrides((o) => ({ ...o, [id]: td.minutes! }));
    if (!item) {
      setTitle('');
      setImportant(false);
    }
    changed();
  };
  const updateTask = (id: string, patch: Partial<PlanInputTask>) => (setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t))), changed());
  const removeTask = (id: string) => {
    setTasks((list) => list.filter((t) => t.id !== id));
    setOverrides(({ [id]: _gone, ...rest }) => (void _gone, rest));
    changed();
  };
  const clearAll = () => (setTasks([]), setOverrides({}), changed());

  // decks with an exam in the next 7 days count as important
  const examSoon = useMemo(() => examSoonDecks(data.exams ?? [], (e) => examDecks(data, e).map((d) => d.id)), [data]);
  const effTasks = useMemo(() => tasks.map((t) => (t.deckId && examSoon.has(t.deckId) ? { ...t, important: true } : t)), [tasks, examSoon]);

  // The to-do list as a checklist: checked = in the plan (the link to the to-do stays)
  const candidates = useMemo(() => planCandidates(data.todos ?? []), [data.todos]);
  const inPlan = useMemo(() => new Map(tasks.filter((t) => t.todoId).map((t) => [t.todoId!, t.id])), [tasks]);
  const fromTodo = (t: Todo) => addTask({ title: t.text, size: sizeFor(t.minutes), motivation: 2, important: t.priority === 'high', deckId: t.deckId, todoId: t.id });
  const toggleTodoInPlan = (t: Todo) => {
    const id = inPlan.get(t.id);
    if (id) removeTask(id);
    else fromTodo(t);
  };
  const takeToday = () => candidates.today.filter((t) => !inPlan.has(t.id)).forEach(fromTodo);
  const [showLater, setShowLater] = useState(false);

  // „Tag planen“ from the to-do list: take over today's to-dos once
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('from') !== 'today') return;
    takeToday();
    setParams({ tab: 'plan' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // to-dos checked off (or deleted) in the meantime leave the plan by themselves
  const [removedDone, setRemovedDone] = useState(0);
  useEffect(() => {
    const byId = new Map((data.todos ?? []).map((t) => [t.id, t]));
    const gone = tasks.filter((t) => t.todoId && (!byId.has(t.todoId) || byId.get(t.todoId)!.doneAt));
    if (!gone.length) return;
    setTasks((list) => list.filter((t) => !gone.some((g) => g.id === t.id)));
    setRemovedDone((n) => n + gone.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.todos]);

  // today's plan that is already in the to-do list
  const today = useMemo(() => todayPlan(data.todos ?? []), [data.todos]);
  const replan = () => {
    if (!today) return;
    clearAll();
    today.steps.filter((t) => !t.doneAt).forEach(fromTodo);
  };

  // parked tasks: on to tomorrow's to-do list
  const parkForTomorrow = (list: PlanInputTask[]) => {
    const tomorrow = dayKey(Date.now() + DAY);
    for (const p of list) {
      if (p.todoId) updateTodo(p.todoId, { due: tomorrow, phase: undefined, order: undefined, time: undefined });
      else addTodo({ text: p.title, deckId: p.deckId, due: tomorrow, ...(p.important ? { priority: 'high' as const } : {}) });
      removeTask(p.id);
    }
  };

  // Quick suggestions from decks with due cards & skills
  const quickSuggestions = useMemo(() => {
    const existing = new Set(tasks.map((t) => t.title.toLowerCase()));
    const out: { label: string; title: string; size: TaskSize; deckId?: string; exam?: boolean }[] = [];
    for (const d of data.decks) {
      const due = dueCards(d).length;
      if (due <= 0) continue;
      const t = `${d.name} (${due} fällig)`;
      if (!existing.has(t.toLowerCase())) out.push({ label: d.name, title: t, size: due > 25 ? 'l' : due > 10 ? 'm' : 's', deckId: d.id, exam: examSoon.has(d.id) });
    }
    out.sort((a, b) => Number(!!b.exam) - Number(!!a.exam));
    for (const sk of data.skills ?? []) {
      const t = `Skill üben: ${sk.title}`;
      if (!existing.has(t.toLowerCase())) out.push({ label: sk.title, title: t, size: 'm' });
    }
    return out.slice(0, 6);
  }, [data.decks, data.skills, tasks, examSoon]);

  const plan = useMemo(() => buildWorkPlan(effTasks, totalMin, withBreaks, { overrides, start }), [effTasks, totalMin, withBreaks, overrides, start]);
  const taskSteps = plan.steps.filter((s): s is PlanTaskStep => s.kind === 'task');
  // one entry per task (parts of a split task belong together)
  const planned = taskSteps.filter((s) => !s.part || s.part === 1);

  const refineWithAI = async () => {
    if (!canAi || planned.length === 0) return;
    setAiBusy(true);
    setAiErr('');
    try {
      const listText = planned
        .map((s, i) => `${i + 1}. [${PHASE_LABEL[s.phase]}] "${s.title}" – ${s.taskMinutes ?? s.minutes} Min.${s.parts ? ` in ${s.parts} Teilen` : ''}, Motivation: ${MOTIVATION_LABEL[s.motivation]}`)
        .join('\n');
      const res = await completeJson<AiTips>(
        'Du bist ein freundlicher Lerncoach in Merkora. Gib zu einem bestehenden Arbeitsplan kurze, konkrete und motivierende Tipps (je 1 Satz pro Aufgabe: warum guter Einstieg / wie im Hauptteil dranbleiben / wie gut abschließen) und eine 1-Satz-Zusammenfassung. Antworte nur als JSON: {"summary":"...","tips":[{"n":1,"reason":"..."}]} – n ist die Nummer der Aufgabe.',
        `Gesamtzeit: ${totalMin} Minuten, Start ${start}.\nGeplante Reihenfolge:\n${listText}`,
        1400,
        'chat',
      );
      const map: Record<string, string> = {};
      (res.tips ?? []).forEach((tip, k) => {
        // by number; older answers without a number: by title, then by position
        const byN = tip.n ? planned[tip.n - 1] : undefined;
        const byTitle = tip.title ? planned.find((s) => s.title.toLowerCase() === tip.title!.trim().toLowerCase()) : undefined;
        const match = byN ?? byTitle ?? planned[k];
        if (match && tip.reason?.trim()) map[match.taskId] = tip.reason.trim();
      });
      setAiTips(map);
      if (res.summary?.trim()) setAiSummary(res.summary.trim());
    } catch (e) {
      setAiErr((e as Error).message || 'KI-Tipps konnten gerade nicht geladen werden.');
    } finally {
      setAiBusy(false);
    }
  };

  const applyToTodos = (startFirstTimer: boolean) => {
    if (planned.length === 0) return;
    const today = dayKey(Date.now());
    const ids: { id: string; minutes: number }[] = [];
    planned.forEach((s, idx) => {
      const src = tasks.find((t) => t.id === s.taskId);
      const minutes = s.taskMinutes ?? s.minutes;
      const fields = { due: today, minutes, phase: s.phase, order: idx, time: s.from, note: aiTips[s.taskId] ?? s.reason, ...(src?.important ? { priority: 'high' as const } : {}) };
      const existing = src?.todoId && data.todos?.find((t) => t.id === src.todoId && !t.doneAt);
      if (existing) {
        updateTodo(existing.id, fields);
        ids.push({ id: existing.id, minutes });
      } else {
        const created = addTodo({ text: s.title, deckId: s.deckId, ...fields });
        ids.push({ id: created.id, minutes });
      }
    });
    // the plan now lives in the to-do list; a fresh start next time
    clearAll();
    // saved right away: the page is left before the draft effect would run
    saveDraft({ totalMin, withBreaks, tasks: [], overrides: {}, start, startDay: dayKey(Date.now()) });
    if (startFirstTimer && ids[0]) {
      // a split task starts with its first part
      pomodoro.startForTodo(ids[0].id, Math.min(ids[0].minutes, taskSteps[0]?.minutes ?? ids[0].minutes));
      toolWindows.open('pomodoro');
    }
    navigate(`/tools?tab=todos&plan=${ids.length}`);
  };

  return (
    <div className="wp">
      {today && (
        <div className="wp-today" role="status">
          <span className="grow">
            <b>Dein Plan für heute</b>
            <small>
              {today.done} von {today.total} erledigt{today.endsAt ? ` · bis ca. ${today.endsAt}` : ''}
              {today.done < today.total ? ` · als Nächstes: ${today.steps.find((t) => !t.doneAt)?.text}` : ' – geschafft!'}
            </small>
            <span className="wp-today-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((today.done / today.total) * 100)}%` }} />
            </span>
          </span>
          {today.done < today.total && (
            <button type="button" className="btn ghost sm" onClick={replan} title="Die offenen Schritte von heute neu ordnen">
              Neu planen
            </button>
          )}
          <button type="button" className="btn outline sm" onClick={() => navigate('/tools?tab=todos')}>
            <IconChecklist size={14} /> Zur To-do-Liste
          </button>
        </div>
      )}
      <div className="wp-grid">
        <section className="panel wp-setup">
          <h2>1. Zeit & Aufgaben</h2>
          <p className="muted small">
            Sag Merkora, wie viel Zeit du hast und wie motiviert du für jede Aufgabe bist – daraus entsteht dein Ablauf mit Einstieg, Fokus-Phase und Abschluss. Lange Aufgaben werden automatisch mit Pausen
            aufgeteilt.
          </p>

          <div className="wp-time-block">
            <label className="field-label" htmlFor="wp-total-min">
              Wie viel Zeit hast du insgesamt?
            </label>
            <div className="wp-time-row">
              <div className="chips">
                {TIME_PRESETS.map((p) => (
                  <button key={p.min} type="button" className={`chip ${totalMin === p.min ? 'active' : ''}`} onClick={() => setTotalMin(p.min)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="wp-min-input">
                <input
                  id="wp-total-min"
                  type="number"
                  min={10}
                  max={480}
                  step={5}
                  className="input"
                  value={totalMin}
                  onChange={(e) => setTotalMin(Math.max(10, Math.min(480, Number(e.target.value) || 30)))}
                />
                <span className="muted small">Min.</span>
              </label>
            </div>
            <div className="wp-time-row">
              <label className="wp-start">
                <span className="muted small">Los geht’s um</span>
                <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value || nextStartTime())} />
              </label>
              <button type="button" className="btn ghost sm" onClick={() => setStart(nextStartTime())}>
                Jetzt
              </button>
            </div>
            <label className="check-row small">
              <input type="checkbox" checked={withBreaks} onChange={(e) => setWithBreaks(e.target.checked)} />
              Kurze Pausen automatisch mit einplanen
            </label>
          </div>

          {candidates.today.length + candidates.later.length > 0 && (
            <div className="wp-todos">
              <div className="wp-todos-head">
                <b>
                  <IconChecklist size={15} /> Aus deiner To-do-Liste
                </b>
                {candidates.today.some((t) => !inPlan.has(t.id)) && (
                  <button type="button" className="btn ghost sm" onClick={takeToday}>
                    Alle von heute übernehmen
                  </button>
                )}
              </div>
              {candidates.today.length > 0 && <small className="muted">Heute & überfällig</small>}
              <ul className="wp-todo-list">
                {[...candidates.today, ...(showLater ? candidates.later : [])].map((t, k) => (
                  <li key={t.id} className={k === candidates.today.length ? 'wp-later-start' : ''}>
                    <label className="check-row">
                      <input type="checkbox" checked={inPlan.has(t.id)} onChange={() => toggleTodoInPlan(t)} />
                      <span className="grow">{t.text}</span>
                      <span className="wp-todo-meta">
                        {t.priority === 'high' && <IconFlag size={12} />}
                        {t.time && (
                          <>
                            <IconClock size={12} /> {t.time}
                          </>
                        )}
                        {t.minutes && (
                          <>
                            <IconTimer size={12} /> {t.minutes} Min.
                          </>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {candidates.later.length > 0 && (
                <button type="button" className="link-btn small" onClick={() => setShowLater(!showLater)}>
                  {showLater ? 'Spätere ausblenden' : `Ohne Datum / später (${candidates.later.length}) anzeigen`}
                </button>
              )}
              {removedDone > 0 && (
                <small className="muted wp-removed">
                  {removedDone} erledigt – aus dem Plan genommen.{' '}
                  <button type="button" className="link-btn small" onClick={() => setRemovedDone(0)}>
                    OK
                  </button>
                </small>
              )}
            </div>
          )}

          <div className="wp-add-box">
            <label className="field-label" htmlFor="wp-task-title">
              Neue Aufgabe
            </label>
            <div className="wp-add-row">
              <input
                id="wp-task-title"
                className="input"
                placeholder="z. B. Mathe-Übungsblatt, Vokabeln, Zusammenfassung schreiben …"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
              <button type="button" className="btn primary" onClick={() => addTask()} disabled={!title.trim()}>
                <IconPlus size={15} /> Hinzufügen
              </button>
            </div>

            <div className="wp-add-opts">
              <div className="wp-opt-group">
                <small className="muted">Motivation:</small>
                <div className="seg sm">
                  {([1, 2, 3] as Motivation[]).map((m) => (
                    <button key={m} type="button" className={motivation === m ? 'on' : ''} onClick={() => setMotivation(m)}>
                      {MOTIVATION_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="wp-opt-group">
                <small className="muted">Umfang:</small>
                <div className="seg sm">
                  {(['s', 'm', 'l'] as TaskSize[]).map((sz) => (
                    <button key={sz} type="button" className={size === sz ? 'on' : ''} onClick={() => setSize(sz)}>
                      {SIZE_LABEL[sz]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check-row small">
                <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
                Wichtig
              </label>
            </div>
          </div>

          {quickSuggestions.length > 0 && (
            <div className="wp-quick">
              <small className="muted">Aus Decks und Skills:</small>
              <div className="chips">
                {quickSuggestions.map((q) => (
                  <button key={q.title} type="button" className="chip" onClick={() => addTask({ title: q.title, size: q.size, motivation: 2, deckId: q.deckId })}>
                    + {q.label}
                    {q.exam ? ' · Prüfung bald' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <>
              <ul className="wp-task-list">
                {effTasks.map((t) => (
                  <li key={t.id} className="wp-task-item">
                    <div className="wp-task-head">
                      <b>{t.title}</b>
                      {t.todoId && <span className="badge soft">aus To-dos</span>}
                      {t.deckId && examSoon.has(t.deckId) && <span className="badge warn">Prüfung bald</span>}
                      <button type="button" className="icon-btn sm" aria-label="Entfernen" onClick={() => removeTask(t.id)}>
                        <IconTrash size={14} />
                      </button>
                    </div>
                    <div className="wp-task-controls">
                      <div className="seg xs" aria-label="Motivation">
                        {([1, 2, 3] as Motivation[]).map((m) => (
                          <button key={m} type="button" className={`mot-${m} ${t.motivation === m ? 'on' : ''}`} onClick={() => updateTask(t.id, { motivation: m })}>
                            {MOTIVATION_LABEL[m]}
                          </button>
                        ))}
                      </div>
                      <div className="seg xs" aria-label="Umfang">
                        {(['s', 'm', 'l'] as TaskSize[]).map((sz) => (
                          <button key={sz} type="button" className={t.size === sz ? 'on' : ''} onClick={() => updateTask(t.id, { size: sz })}>
                            {SIZE_LABEL[sz]}
                          </button>
                        ))}
                      </div>
                      <button type="button" className={`chip sm ${t.important ? 'active' : ''}`} onClick={() => updateTask(t.id, { important: !tasks.find((x) => x.id === t.id)?.important })}>
                        Wichtig
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn ghost sm" onClick={clearAll}>
                Alle Aufgaben entfernen
              </button>
            </>
          )}
        </section>

        <section className="panel wp-result">
          <div className="wp-res-head">
            <div>
              <h2>2. Dein Arbeitsplan</h2>
              <p className="muted small">{aiSummary || plan.summary}</p>
            </div>
            {planned.length > 0 && canAi && (
              <button type="button" className="btn ghost sm" onClick={() => void refineWithAI()} disabled={aiBusy}>
                <IconSparkle size={14} /> {aiBusy ? 'Verfeinert …' : 'KI-Tipps'}
              </button>
            )}
          </div>

          {aiErr && <p className="err-msg small">{aiErr}</p>}

          {plan.steps.length === 0 ? (
            <div className="wp-empty">
              <p className="muted">Gib links deine Aufgaben ein oder übernimm sie aus deinen To-dos – Merkora schlägt dir sofort den besten Einstieg, die Zeitverteilung und den Abschluss vor.</p>
            </div>
          ) : (
            <>
              <div className="wp-stats-bar">
                <span>
                  <b>{plan.workMinutes} Min.</b> Arbeitszeit
                </span>
                {plan.breakMinutes > 0 && (
                  <span>
                    <b>{plan.breakMinutes} Min.</b> Pause
                  </span>
                )}
                <span>
                  <b>{planned.length}</b> {planned.length === 1 ? 'Aufgabe' : 'Aufgaben'}
                </span>
                {plan.steps[0].from && (
                  <span>
                    <b>
                      {plan.steps[0].from}–{plan.steps[plan.steps.length - 1].to}
                    </b>
                  </span>
                )}
              </div>

              {plan.overflow > 0 && (
                <p className="wp-overflow small">
                  Dein Plan ist {plan.overflow} Min. länger als deine {totalMin} Min. – kürze eine Aufgabe oder{' '}
                  <button type="button" className="link-btn" onClick={() => setOverrides({})}>
                    lass Merkora neu verteilen
                  </button>
                  .
                </p>
              )}

              <ol className="wp-timeline">
                {plan.steps.map((step, i) =>
                  step.kind === 'break' ? (
                    <li key={`brk_${i}`} className="wp-step wp-break">
                      <span className="wp-step-badge">
                        {step.from && <span className="wp-clock">{step.from}</span>} Pause · {step.minutes} Min.
                      </span>
                      <small className="muted">{step.reason}</small>
                    </li>
                  ) : (
                    <li key={`${step.taskId}_${step.part ?? 1}`} className={`wp-step p-${step.phase}`}>
                      <div className="wp-step-top">
                        {step.from && (
                          <span className="wp-clock" title={`${step.from}–${step.to}`}>
                            {step.from}
                          </span>
                        )}
                        <span className={`phase-pill p-${step.phase}`}>{PHASE_LABEL[step.phase]}</span>
                        <b className="wp-step-title">
                          {step.title}
                          {step.parts && <small className="muted"> · Teil {step.part}/{step.parts}</small>}
                        </b>
                        {!step.part || step.part === 1 ? (
                          <label className="wp-step-min" title={step.parts ? 'Zeit für die ganze Aufgabe (alle Teile)' : 'Zeit anpassen'}>
                            <input
                              type="number"
                              min={5}
                              max={240}
                              step={5}
                              className={`input ${overrides[step.taskId] ? 'fixed' : ''}`}
                              value={overrides[step.taskId] ?? step.taskMinutes ?? step.minutes}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setOverrides((o) => ({ ...o, [step.taskId]: Math.max(5, Math.min(240, v || 5)) }));
                              }}
                            />
                            <span>{step.parts ? 'Min. gesamt' : 'Min.'}</span>
                          </label>
                        ) : (
                          <span className="wp-step-min muted small">{step.minutes} Min.</span>
                        )}
                      </div>
                      <p className="wp-step-reason">{(!step.part || step.part === 1) && aiTips[step.taskId] ? aiTips[step.taskId] : step.reason}</p>
                    </li>
                  ),
                )}
              </ol>

              {plan.parked.length > 0 && (
                <div className="wp-parked">
                  <b>Für später geparkt ({plan.parked.length})</b>
                  <p className="muted small">Für {totalMin} Minuten wären alle Aufgaben zu eng getaktet. Diese Aufgaben hebst du dir besser für die nächste Einheit auf:</p>
                  <ul>
                    {plan.parked.map((p) => (
                      <li key={p.id}>{p.title}</li>
                    ))}
                  </ul>
                  <button type="button" className="btn outline sm" onClick={() => parkForTomorrow(plan.parked)}>
                    <IconCalendar size={14} /> Auf morgen legen
                  </button>
                </div>
              )}

              <div className="wp-actions">
                <button type="button" className="btn primary" onClick={() => applyToTodos(false)}>
                  <IconCheck size={15} /> Als To-dos für heute übernehmen
                </button>
                <button type="button" className="btn outline" onClick={() => applyToTodos(true)}>
                  <IconPlay size={14} /> Übernehmen & Timer starten
                </button>
              </div>
              <p className="muted small">To-dos, die du aus der Liste übernommen hast, werden aktualisiert – nicht doppelt angelegt.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
