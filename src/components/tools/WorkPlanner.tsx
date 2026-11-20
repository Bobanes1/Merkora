import { useMemo, useState } from 'react';
import { aiReady, completeJson } from '../../lib/ai';
import { pomodoro } from '../../lib/pomodoro';
import { addTodo, dueCards, useStore } from '../../lib/store';
import { toolWindows } from '../../lib/toolWindows';
import { dayKey } from '../../lib/util';
import {
  buildWorkPlan,
  MOTIVATION_LABEL,
  PHASE_LABEL,
  SIZE_LABEL,
  type Motivation,
  type PlanInputTask,
  type PlanTaskStep,
  type TaskSize,
} from '../../lib/workPlan';
import { IconCheck, IconPlay, IconPlus, IconSparkle, IconTrash } from '../Icons';

const TIME_PRESETS = [
  { label: '30 Min', min: 30 },
  { label: '1 Std', min: 60 },
  { label: '1,5 Std', min: 90 },
  { label: '2 Std', min: 120 },
  { label: '3 Std', min: 180 },
];

type AiTips = { tips?: { title: string; reason: string }[]; summary?: string };

/**
 * Arbeitsplanung:
 * 1) Enter available time & breaks preference
 * 2) Enter tasks + motivation level (and optional size/priority), or import from decks/skills
 * 3) Merkora builds a structured plan (Einstieg → Hauptteil → Abschluss) with time blocks
 * 4) Transfer straight into the To-do list (and optionally start Pomodoro right away).
 */
export function WorkPlanner() {
  const data = useStore((s) => s.data);
  const canAi = useStore((s) => aiReady(s, 'chat'));

  const [totalMin, setTotalMin] = useState(90);
  const [withBreaks, setWithBreaks] = useState(true);
  const [tasks, setTasks] = useState<PlanInputTask[]>([]);

  const [title, setTitle] = useState('');
  const [motivation, setMotivation] = useState<Motivation>(2);
  const [size, setSize] = useState<TaskSize>('m');
  const [important, setImportant] = useState(false);

  const [minuteOverrides, setMinuteOverrides] = useState<Record<string, number>>({});
  const [aiTips, setAiTips] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  const addTask = (item?: Partial<PlanInputTask>) => {
    const t = (item?.title ?? title).trim();
    if (!t) return;
    setTasks((list) => [
      ...list,
      {
        id: 'pt_' + Math.random().toString(36).slice(2, 9),
        title: t,
        motivation: item?.motivation ?? motivation,
        size: item?.size ?? size,
        important: item?.important ?? important,
        deckId: item?.deckId,
      },
    ]);
    if (!item) {
      setTitle('');
      setImportant(false);
    }
    setSavedNotice('');
  };

  const updateTask = (id: string, patch: Partial<PlanInputTask>) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSavedNotice('');
  };

  const removeTask = (id: string) => {
    setTasks((list) => list.filter((t) => t.id !== id));
    setSavedNotice('');
  };

  // Quick suggestions from decks with due cards & active skills
  const quickSuggestions = useMemo(() => {
    const existing = new Set(tasks.map((t) => t.title.toLowerCase()));
    const out: { label: string; title: string; size: TaskSize; deckId?: string }[] = [];
    for (const d of data.decks) {
      const due = dueCards(d).length;
      if (due <= 0) continue;
      const t = `${d.name} (${due} fällig)`;
      if (!existing.has(t.toLowerCase())) {
        out.push({ label: d.name, title: t, size: due > 25 ? 'l' : due > 10 ? 'm' : 's', deckId: d.id });
      }
    }
    for (const sk of data.skills ?? []) {
      const t = `Skill üben: ${sk.title}`;
      if (!existing.has(t.toLowerCase())) {
        out.push({ label: sk.title, title: t, size: 'm' });
      }
    }
    return out.slice(0, 6);
  }, [data.decks, data.skills, tasks]);

  const plan = useMemo(() => buildWorkPlan(tasks, totalMin, withBreaks), [tasks, totalMin, withBreaks]);

  const taskSteps = plan.steps.filter((s): s is PlanTaskStep => s.kind === 'task');
  const effectiveMinutes = (s: PlanTaskStep) => minuteOverrides[s.taskId] ?? s.minutes;

  const refineWithAI = async () => {
    if (!canAi || taskSteps.length === 0) return;
    setAiBusy(true);
    setAiErr('');
    try {
      const listText = taskSteps
        .map(
          (s, i) =>
            `${i + 1}. [${PHASE_LABEL[s.phase]}] "${s.title}" – ${effectiveMinutes(s)} Min., Motivation: ${MOTIVATION_LABEL[s.motivation]}`,
        )
        .join('\n');
      const res = await completeJson<AiTips>(
        'Du bist ein freundlicher Lerncoach in Merkora. Gib zu einem bestehenden Arbeitsplan kurze, konkrete und motivierende Tipps (je 1 Satz pro Aufgabe: warum guter Einstieg / wie im Hauptteil dranbleiben / wie gut abschließen) und eine 1-Satz-Zusammenfassung. Antworte nur als JSON: {"summary":"...","tips":[{"title":"...","reason":"..."}]}.',
        `Gesamtzeit: ${totalMin} Minuten.\nGeplante Reihenfolge:\n${listText}`,
        1400,
        'chat',
      );
      const map: Record<string, string> = {};
      for (const tip of res.tips ?? []) {
        const match = taskSteps.find((s) => s.title.toLowerCase() === tip.title.trim().toLowerCase());
        if (match && tip.reason?.trim()) map[match.taskId] = tip.reason.trim();
      }
      setAiTips(map);
      if (res.summary?.trim()) setAiSummary(res.summary.trim());
    } catch (e) {
      setAiErr((e as Error).message || 'KI-Tipps konnten gerade nicht geladen werden.');
    } finally {
      setAiBusy(false);
    }
  };

  const applyToTodos = (startFirstTimer: boolean) => {
    if (taskSteps.length === 0) return;
    const today = dayKey(Date.now());
    const baseOrder = Date.now();
    const created = taskSteps.map((s, idx) =>
      addTodo({
        text: s.title,
        due: today,
        deckId: s.deckId,
        minutes: effectiveMinutes(s),
        phase: s.phase,
        note: aiTips[s.taskId] ?? s.reason,
        order: baseOrder + idx,
      }),
    );
    setSavedNotice(`${created.length} Aufgabe${created.length === 1 ? '' : 'n'} in deine To-do-Liste für heute übernommen.`);
    toolWindows.open('todos');
    if (startFirstTimer && created[0]) {
      pomodoro.startForTodo(created[0].id, created[0].minutes);
      toolWindows.open('pomodoro');
    }
  };

  return (
    <div className="wp">
      <div className="wp-grid">
        <section className="panel wp-setup">
          <h2>1. Zeit & Aufgaben</h2>
          <p className="muted small">
            Sag Merkora, wie viel Zeit du hast und wie motiviert du für jede Aufgabe bist – daraus entsteht dein optimaler Ablauf mit Einstieg, Fokus-Phase und Abschluss.
          </p>

          <div className="wp-time-block">
            <label className="field-label" htmlFor="wp-total-min">
              Wie viel Zeit hast du insgesamt?
            </label>
            <div className="wp-time-row">
              <div className="chips">
                {TIME_PRESETS.map((p) => (
                  <button
                    key={p.min}
                    type="button"
                    className={`chip ${totalMin === p.min ? 'active' : ''}`}
                    onClick={() => setTotalMin(p.min)}
                  >
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
            <label className="check-row small">
              <input type="checkbox" checked={withBreaks} onChange={(e) => setWithBreaks(e.target.checked)} />
              Kurze Pausen automatisch mit einplanen
            </label>
          </div>

          <div className="wp-add-box">
            <label className="field-label" htmlFor="wp-task-title">
              Aufgabe hinzufügen
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
              <small className="muted">Schnell aus Merkora übernehmen:</small>
              <div className="chips">
                {quickSuggestions.map((q) => (
                  <button
                    key={q.title}
                    type="button"
                    className="chip"
                    onClick={() => addTask({ title: q.title, size: q.size, motivation: 2, deckId: q.deckId })}
                  >
                    + {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <ul className="wp-task-list">
              {tasks.map((t) => (
                <li key={t.id} className="wp-task-item">
                  <div className="wp-task-head">
                    <b>{t.title}</b>
                    <button type="button" className="icon-btn sm" aria-label="Entfernen" onClick={() => removeTask(t.id)}>
                      <IconTrash size={14} />
                    </button>
                  </div>
                  <div className="wp-task-controls">
                    <div className="seg xs" aria-label="Motivation">
                      {([1, 2, 3] as Motivation[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`mot-${m} ${t.motivation === m ? 'on' : ''}`}
                          onClick={() => updateTask(t.id, { motivation: m })}
                        >
                          {MOTIVATION_LABEL[m]}
                        </button>
                      ))}
                    </div>
                    <div className="seg xs" aria-label="Umfang">
                      {(['s', 'm', 'l'] as TaskSize[]).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          className={t.size === sz ? 'on' : ''}
                          onClick={() => updateTask(t.id, { size: sz })}
                        >
                          {SIZE_LABEL[sz]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`chip sm ${t.important ? 'active' : ''}`}
                      onClick={() => updateTask(t.id, { important: !t.important })}
                    >
                      Wichtig
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel wp-result">
          <div className="wp-res-head">
            <div>
              <h2>2. Dein Arbeitsplan</h2>
              <p className="muted small">{aiSummary || plan.summary}</p>
            </div>
            {taskSteps.length > 0 && canAi && (
              <button type="button" className="btn ghost sm" onClick={() => void refineWithAI()} disabled={aiBusy}>
                <IconSparkle size={14} /> {aiBusy ? 'Verfeinert …' : 'KI-Tipps'}
              </button>
            )}
          </div>

          {aiErr && <p className="err-msg small">{aiErr}</p>}

          {plan.steps.length === 0 ? (
            <div className="wp-empty">
              <p className="muted">Gib links deine Aufgaben ein – Merkora schlägt dir sofort den besten Einstieg, die Zeitverteilung und den Abschluss vor.</p>
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
                  <b>{taskSteps.length}</b> {taskSteps.length === 1 ? 'Aufgabe' : 'Aufgaben'}
                </span>
              </div>

              <ol className="wp-timeline">
                {plan.steps.map((step, i) =>
                  step.kind === 'break' ? (
                    <li key={`brk_${i}`} className="wp-step wp-break">
                      <span className="wp-step-badge">Pause · {step.minutes} Min.</span>
                      <small className="muted">{step.reason}</small>
                    </li>
                  ) : (
                    <li key={step.taskId} className={`wp-step p-${step.phase}`}>
                      <div className="wp-step-top">
                        <span className={`phase-pill p-${step.phase}`}>{PHASE_LABEL[step.phase]}</span>
                        <b className="wp-step-title">{step.title}</b>
                        <label className="wp-step-min" title="Zeit anpassen">
                          <input
                            type="number"
                            min={5}
                            max={240}
                            step={5}
                            className="input"
                            value={effectiveMinutes(step)}
                            onChange={(e) =>
                              setMinuteOverrides((o) => ({
                                ...o,
                                [step.taskId]: Math.max(5, Math.min(240, Number(e.target.value) || step.minutes)),
                              }))
                            }
                          />
                          <span>Min.</span>
                        </label>
                      </div>
                      <p className="wp-step-reason">{aiTips[step.taskId] ?? step.reason}</p>
                    </li>
                  ),
                )}
              </ol>

              {plan.parked.length > 0 && (
                <div className="wp-parked">
                  <b>Für später geparkt ({plan.parked.length})</b>
                  <p className="muted small">
                    Für {totalMin} Minuten wären alle Aufgaben zu eng getaktet. Diese Aufgaben hebst du dir besser für die nächste Einheit auf:
                  </p>
                  <ul>
                    {plan.parked.map((p) => (
                      <li key={p.id}>{p.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="wp-actions">
                <button type="button" className="btn primary" onClick={() => applyToTodos(false)}>
                  <IconCheck size={15} /> Als To-do-Liste übernehmen
                </button>
                <button type="button" className="btn outline" onClick={() => applyToTodos(true)}>
                  <IconPlay size={14} /> Übernehmen & Timer starten
                </button>
              </div>
              {savedNotice && <p className="ok-msg small">{savedNotice}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
