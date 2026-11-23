import { useState } from 'react';
import { Link } from 'react-router-dom';
import { pomodoro, usePomodoroMeta } from '../lib/pomodoro';
import { addTodo, toggleTodo, useStore } from '../lib/store';
import { dueText, parseQuickTodo, todoGroups, type Todo } from '../lib/todos';
import { IconCheck, IconChevron, IconPlay, IconPlus } from './Icons';

const SHOWN = 5;

/**
 * The slim to-do list on the start page: quick entry (same shorthand as the To-do page: „morgen“, „#Deck“ …),
 * the next few open to-dos to tick off or to start the timer for, and a link to the full list.
 */
export function HomeTodos() {
  const data = useStore((s) => s.data);
  const todos = data.todos ?? [];
  const { activeTodoId } = usePomodoroMeta();
  const [text, setText] = useState('');
  const [popped, setPopped] = useState<string | null>(null);
  const now = Date.now();
  // overdue and today first, then soon and without date – each group already sorted
  const open = todoGroups(todos, now)
    .filter((g) => g.id !== 'done')
    .flatMap((g) => g.items.map((t) => ({ t, late: g.id === 'overdue' })));

  const add = () => {
    if (!text.trim()) return;
    const q = parseQuickTodo(text, data.decks, Date.now());
    addTodo({ ...q, text: q.text || text.trim() });
    setText('');
  };
  const check = (t: Todo) => {
    setPopped(t.id);
    setTimeout(() => {
      setPopped(null);
      if (activeTodoId === t.id) pomodoro.setActiveTodo(null);
      toggleTodo(t.id);
    }, 350);
  };

  return (
    <div className="home-todos">
      <div className="home-todos-add">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Neues To-do, z. B. „Folien lesen morgen“"
          aria-label="Neues To-do"
        />
        <button type="button" className="btn primary sm" onClick={add} disabled={!text.trim()} aria-label="To-do hinzufügen">
          <IconPlus size={14} />
        </button>
      </div>
      {open.length === 0 ? (
        <p className="muted small home-todos-empty">Nichts offen – was steht an?</p>
      ) : (
        <ul className="home-todos-list">
          {open.slice(0, SHOWN).map(({ t, late }) => (
            <li key={t.id} className={`${popped === t.id ? 'pop' : ''} ${activeTodoId === t.id ? 'active' : ''}`}>
              <button type="button" className="todo-check" role="checkbox" aria-checked={popped === t.id} aria-label={`${t.text} erledigt`} onClick={() => check(t)}>
                {popped === t.id && <IconCheck size={12} />}
              </button>
              <span className="home-todo-text" title={t.text}>
                {t.text}
              </span>
              {t.due && <small className={`home-todo-due ${late ? 'late' : ''}`}>{dueText(t.due, now)}</small>}
              <button
                type="button"
                className="icon-btn sm home-todo-play"
                aria-label={`Timer für ${t.text} starten`}
                title={t.minutes ? `Pomodoro (${t.minutes} Min.) starten` : 'Pomodoro starten'}
                onClick={() => pomodoro.startForTodo(t.id, t.minutes)}
              >
                <IconPlay size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/tools?tab=todos" className="small-link home-todos-all">
        Alle To-dos{open.length ? ` (${open.length})` : ''} <IconChevron size={12} />
      </Link>
    </div>
  );
}
