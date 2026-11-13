import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isLeech } from '../lib/cardLinks';
import { deckUrl, addTodo, deleteTodo, toggleTodo, updateTodo, useStore } from '../lib/store';
import { dueText, todoGroups, todoSuggestions, type Todo } from '../lib/todos';
import { DAY, dayKey } from '../lib/util';
import { IconCheck, IconPlus, IconSparkle } from './Icons';

/** To-dos: add with Enter (optionally a date and a deck), check off, edit with a double click. */
export function TodoList() {
  const data = useStore((s) => s.data);
  const todos = data.todos ?? [];
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [deckId, setDeckId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [popped, setPopped] = useState<string | null>(null);
  const now = Date.now();
  const today = dayKey(now);
  const tomorrow = dayKey(now + DAY);
  const groups = todoGroups(todos, now);
  const ideas = todoSuggestions({
    exams: data.exams,
    decks: data.decks.map((d) => ({ id: d.id, name: d.name, leeches: d.cards.filter(isLeech).length })),
    todos: todos.filter((t) => !t.doneAt),
  });

  const add = () => {
    if (!text.trim()) return;
    addTodo({ text: text.trim(), due: due || undefined, deckId: deckId || undefined });
    setText('');
    setDue('');
    setDeckId('');
  };
  const check = (t: Todo) => {
    if (!t.doneAt) {
      setPopped(t.id);
      setTimeout(() => setPopped(null), 450);
    }
    toggleTodo(t.id);
  };
  const saveEdit = (t: Todo) => {
    const v = draft.trim();
    if (v && v !== t.text) updateTodo(t.id, { text: v });
    setEditing(null);
  };

  const row = (t: Todo, group: string) => {
    const deck = t.deckId ? data.decks.find((d) => d.id === t.deckId) : undefined;
    const exam = t.examId ? data.exams.find((e) => e.id === t.examId) : undefined;
    return (
      <li key={t.id} className={`todo ${t.doneAt ? 'done' : ''} ${group === 'overdue' ? 'overdue' : ''} ${popped === t.id ? 'pop' : ''}`}>
        <button type="button" className="todo-check" role="checkbox" aria-checked={!!t.doneAt} aria-label={t.doneAt ? 'Wieder öffnen' : 'Erledigt'} onClick={() => check(t)}>
          {(t.doneAt || popped === t.id) && <IconCheck size={13} />}
        </button>
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
        {deck && (
          <Link to={deckUrl(data, deck)} className="todo-tag" title="Deck öffnen">
            {deck.name}
          </Link>
        )}
        {exam && !deck && (
          <Link to="/calendar" className="todo-tag">
            {exam.title}
          </Link>
        )}
        {t.due && !t.doneAt && <small className="todo-due">{dueText(t.due, now)}</small>}
        <button type="button" className="icon-btn todo-del" aria-label="To-do löschen" onClick={() => deleteTodo(t.id)}>
          ×
        </button>
      </li>
    );
  };

  return (
    <div className="todos">
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
        <input
          className="input"
          placeholder={todos.length ? 'Neues To-do …' : 'Was steht als Nächstes an?'}
          aria-label="Neues To-do"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <div className="todo-opts">
          <button type="button" className={'chip' + (due === today ? ' active' : '')} onClick={() => setDue(due === today ? '' : today)}>
            Heute
          </button>
          <button type="button" className={'chip' + (due === tomorrow ? ' active' : '')} onClick={() => setDue(due === tomorrow ? '' : tomorrow)}>
            Morgen
          </button>
          <input type="date" className="input todo-date" aria-label="Datum" value={due} onChange={(e) => setDue(e.target.value)} />
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
          <button type="button" className="btn primary sm" onClick={add} disabled={!text.trim()}>
            <IconPlus size={14} /> Hinzufügen
          </button>
        </div>
      </div>
      {groups
        .filter((g) => g.id !== 'done')
        .map((g) => (
          <div key={g.id} className={`todo-group g-${g.id}`}>
            <small className="todo-group-label">{g.label}</small>
            <ul className="todo-list">{g.items.map((t) => row(t, g.id))}</ul>
          </div>
        ))}
      {groups
        .filter((g) => g.id === 'done')
        .map((g) => (
          <div key="done" className="todo-group g-done">
            <button type="button" className="link-btn todo-group-label" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              Erledigt ({g.items.length})
            </button>
            {showDone && <ul className="todo-list">{g.items.map((t) => row(t, 'done'))}</ul>}
          </div>
        ))}
    </div>
  );
}
