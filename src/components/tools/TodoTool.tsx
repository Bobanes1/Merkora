import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isLeech } from '../../lib/cardLinks';
import { pomodoro, usePomodoroMeta } from '../../lib/pomodoro';
import { addTodo, deckUrl, deleteTodo, toggleTodo, updateTodo, useStore } from '../../lib/store';
import { dueText, todoGroups, todoSuggestions, type Todo } from '../../lib/todos';
import { toolWindows } from '../../lib/toolWindows';
import { DAY, dayKey } from '../../lib/util';
import { PHASE_LABEL } from '../../lib/workPlan';
import { IconCheck, IconPlay, IconPlus, IconSparkle } from '../Icons';

/**
 * Redesigned To-do List for Merkora Tools & floating popup window.
 * Supports planned durations, Arbeitsplanung phase badges (Einstieg/Hauptteil/Abschluss),
 * and one-click Pomodoro start per task.
 */
export function TodoTool({ compact = false }: { compact?: boolean }) {
  const data = useStore((s) => s.data);
  const todos = data.todos ?? [];
  const { activeTodoId } = usePomodoroMeta();

  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [minutes, setMinutes] = useState('');
  const [deckId, setDeckId] = useState('');
  const [showOpts, setShowOpts] = useState(!compact);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [popped, setPopped] = useState<string | null>(null);

  const now = Date.now();
  const today = dayKey(now);
  const tomorrow = dayKey(now + DAY);
  const groups = todoGroups(todos, now);
  const doneItems = todos.filter((t) => t.doneAt);
  const ideas = todoSuggestions({
    exams: data.exams,
    decks: data.decks.map((d) => ({ id: d.id, name: d.name, leeches: d.cards.filter(isLeech).length })),
    todos: todos.filter((t) => !t.doneAt),
  });

  const add = () => {
    if (!text.trim()) return;
    const mins = Number(minutes);
    addTodo({
      text: text.trim(),
      due: due || undefined,
      deckId: deckId || undefined,
      minutes: mins >= 1 ? Math.min(480, Math.round(mins)) : undefined,
    });
    setText('');
    setDue('');
    setMinutes('');
    setDeckId('');
  };

  const check = (t: Todo) => {
    if (!t.doneAt) {
      setPopped(t.id);
      setTimeout(() => setPopped(null), 450);
      if (activeTodoId === t.id) pomodoro.setActiveTodo(null);
    }
    toggleTodo(t.id);
  };

  const saveEdit = (t: Todo) => {
    const v = draft.trim();
    if (v && v !== t.text) updateTodo(t.id, { text: v });
    setEditing(null);
  };

  const startTimerFor = (t: Todo) => {
    pomodoro.startForTodo(t.id, t.minutes);
    toolWindows.open('pomodoro');
  };

  const clearDone = () => {
    for (const t of doneItems) deleteTodo(t.id);
  };

  const row = (t: Todo, group: string) => {
    const deck = t.deckId ? data.decks.find((d) => d.id === t.deckId) : undefined;
    const exam = t.examId ? data.exams.find((e) => e.id === t.examId) : undefined;
    const isActive = activeTodoId === t.id && !t.doneAt;
    return (
      <li
        key={t.id}
        className={`todo tool-todo ${t.doneAt ? 'done' : ''} ${group === 'overdue' ? 'overdue' : ''} ${isActive ? 'active-timer' : ''} ${popped === t.id ? 'pop' : ''}`}
      >
        <button
          type="button"
          className="todo-check"
          role="checkbox"
          aria-checked={!!t.doneAt}
          aria-label={t.doneAt ? 'Wieder öffnen' : 'Erledigt'}
          onClick={() => check(t)}
        >
          {(t.doneAt || popped === t.id) && <IconCheck size={13} />}
        </button>

        <div className="tool-todo-main">
          {editing === t.id ? (
            <input
              className="input todo-edit"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => saveEdit(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(t);
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <span
              className="todo-text"
              title="Doppelklick zum Bearbeiten"
              onDoubleClick={() => {
                setEditing(t.id);
                setDraft(t.text);
              }}
            >
              {t.text}
            </span>
          )}
          {(t.phase || t.minutes || t.note || deck || exam || (t.due && !t.doneAt)) && (
            <div className="tool-todo-meta">
              {t.phase && !t.doneAt && <span className={`phase-pill p-${t.phase}`}>{PHASE_LABEL[t.phase]}</span>}
              {t.minutes && <span className="min-pill">{t.minutes} Min.</span>}
              {deck && (
                <Link to={deckUrl(data, deck)} className="todo-tag" title="Deck öffnen">
                  {deck.name}
                </Link>
              )}
              {exam && !deck && (
                <Link to="/tools?tab=exams" className="todo-tag">
                  {exam.title}
                </Link>
              )}
              {t.due && !t.doneAt && <small className="todo-due">{dueText(t.due, now)}</small>}
            </div>
          )}
          {t.note && !t.doneAt && <small className="tool-todo-note">{t.note}</small>}
        </div>

        <div className="tool-todo-btns">
          {!t.doneAt && (
            <button
              type="button"
              className="icon-btn sm tool-todo-play"
              aria-label={`Timer für ${t.text} starten`}
              title={t.minutes ? `Pomodoro (${t.minutes} Min.) starten` : 'Pomodoro starten'}
              onClick={() => startTimerFor(t)}
            >
              <IconPlay size={12} />
            </button>
          )}
          <button type="button" className="icon-btn sm todo-del" aria-label="To-do löschen" onClick={() => deleteTodo(t.id)}>
            ×
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className={`todos tool-todos ${compact ? 'compact' : ''}`}>
      {ideas.length > 0 && (
        <div className="todo-ideas">
          {ideas.map((i) => (
            <button key={i.text} type="button" className="chip" title="Als To-do übernehmen" onClick={() => addTodo(i)}>
              <IconSparkle size={12} /> {i.text}
            </button>
          ))}
        </div>
      )}

      <div className="todo-add">
        <div className="tool-todo-input-row">
          <input
            className="input"
            placeholder={todos.length ? 'Neues To-do …' : 'Was steht als Nächstes an?'}
            aria-label="Neues To-do"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button type="button" className="btn primary sm" onClick={add} disabled={!text.trim()} aria-label="Hinzufügen">
            <IconPlus size={14} />
          </button>
        </div>
        {compact && (
          <button type="button" className="link-btn small muted" onClick={() => setShowOpts((v) => !v)}>
            {showOpts ? 'Optionen ausblenden' : 'Datum, Dauer oder Deck …'}
          </button>
        )}
        {showOpts && (
          <div className="todo-opts">
            <button type="button" className={'chip' + (due === today ? ' active' : '')} onClick={() => setDue(due === today ? '' : today)}>
              Heute
            </button>
            <button type="button" className={'chip' + (due === tomorrow ? ' active' : '')} onClick={() => setDue(due === tomorrow ? '' : tomorrow)}>
              Morgen
            </button>
            <input type="date" className="input todo-date" aria-label="Datum" value={due} onChange={(e) => setDue(e.target.value)} />
            <input
              type="number"
              min={1}
              max={480}
              className="input todo-min"
              placeholder="Min."
              aria-label="Dauer in Minuten"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            {data.decks.length > 0 && (
              <select className="input todo-deck" aria-label="Deck" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                <option value="">Kein Deck</option>
                {data.decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {groups.filter((g) => g.id !== 'done').length === 0 && (
        <div className="tool-empty">
          <p className="muted small">Keine offenen To-dos.</p>
          <Link to="/tools?tab=plan" className="btn outline sm">
            <IconSparkle size={14} /> Arbeitsplanung starten
          </Link>
        </div>
      )}

      {groups
        .filter((g) => g.id !== 'done')
        .map((g) => (
          <div key={g.id} className={`todo-group g-${g.id}`}>
            <small className="todo-group-label">{g.label}</small>
            <ul className="todo-list">{g.items.map((t) => row(t, g.id))}</ul>
          </div>
        ))}

      {doneItems.length > 0 && (
        <div className="todo-group g-done">
          <div className="tool-done-head">
            <button type="button" className="link-btn todo-group-label" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              Erledigt ({doneItems.length})
            </button>
            {showDone && (
              <button type="button" className="link-btn small muted" onClick={clearDone}>
                Alle entfernen
              </button>
            )}
          </div>
          {showDone && (
            <ul className="todo-list">
              {groups
                .find((g) => g.id === 'done')
                ?.items.map((t) => row(t, 'done'))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
