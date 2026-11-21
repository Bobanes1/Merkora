import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconCheck, IconPlay, IconPlus, IconSparkle, IconTrash } from '../components/Icons';
import { isLeech } from '../lib/cardLinks';
import { pomodoro, usePomodoroMeta } from '../lib/pomodoro';
import { addTodo, deckUrl, deleteTodo, toggleTodo, updateTodo, useData } from '../lib/store';
import {
  dueText,
  parseQuickTodo,
  plannedDays,
  PRIORITY_LABEL,
  REPEAT_LABEL,
  sortTodos,
  subtaskProgress,
  todoGroups,
  todoSuggestions,
  type Todo,
  type TodoPriority,
  type TodoRepeat,
} from '../lib/todos';
import { toolWindows } from '../lib/toolWindows';
import { DAY, dayKey, uid } from '../lib/util';

type View = 'today' | 'planned' | 'all' | 'done';
const VIEWS: [View, string][] = [
  ['today', 'Heute'],
  ['planned', 'Geplant'],
  ['all', 'Alle'],
  ['done', 'Erledigt'],
];

/** The to-do list as its own page: quick entry, views, details, sub-tasks, repeating, bulk actions, undo, keyboard. */
export default function Todos() {
  const data = useData();
  const [params] = useSearchParams();
  const all = data.todos ?? [];
  const now = Date.now();
  const today = dayKey(now);
  const [view, setView] = useState<View>('today');
  const [search, setSearch] = useState('');
  const [deckFilter, setDeckFilter] = useState(params.get('deck') ?? '');
  const [prioFilter, setPrioFilter] = useState<'' | TodoPriority>('');
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const addRef = useRef<HTMLInputElement>(null);

  const offerUndo = (text: string, run: () => void) => {
    clearTimeout(undoTimer.current);
    setUndo({ text, run });
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };

  // the list for the current view and filters
  const filtered = all.filter(
    (t) =>
      (!search.trim() || (t.text + ' ' + (t.note ?? '')).toLowerCase().includes(search.trim().toLowerCase())) &&
      (!deckFilter || t.deckId === deckFilter) &&
      (!prioFilter || t.priority === prioFilter),
  );
  const sections: { label: string; items: Todo[]; tone?: string }[] = useMemo(() => {
    if (view === 'done') return [{ label: 'Erledigt', items: [...filtered.filter((t) => t.doneAt)].sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)) }];
    if (view === 'planned')
      return plannedDays(filtered, now, 14)
        .filter((d) => d.items.length)
        .map((d): { label: string; items: Todo[]; tone?: string } => ({ label: d.key === today ? 'Heute' : dueText(d.key, now), items: sortTodos(d.items) }))
        .concat(filtered.some((t) => !t.doneAt && t.due && t.due < today) ? [{ label: 'Überfällig', items: sortTodos(filtered.filter((t) => !t.doneAt && t.due && t.due < today)), tone: 'overdue' }] : []);
    const groups = todoGroups(filtered, now).filter((g) => g.id !== 'done');
    const pick = view === 'today' ? groups.filter((g) => g.id === 'overdue' || g.id === 'today') : groups;
    return pick.map((g) => ({ label: g.label, items: sortTodos(g.items), tone: g.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, all, search, deckFilter, prioFilter]);
  const flat = sections.flatMap((s) => s.items);
  const counts = {
    today: all.filter((t) => !t.doneAt && t.due && t.due <= today).length,
    planned: all.filter((t) => !t.doneAt && t.due).length,
    all: all.filter((t) => !t.doneAt).length,
    done: all.filter((t) => t.doneAt).length,
  };

  // ---------- actions ----------
  const check = (t: Todo) => {
    const wasDone = !!t.doneAt;
    const next = toggleTodo(t.id);
    if (!wasDone) offerUndo(`„${t.text}“ erledigt${next ? ' – nächstes Mal ist schon eingeplant' : ''}`, () => (toggleTodo(t.id), next && deleteTodo(next)));
  };
  const remove = (ids: string[]) => {
    const gone = all.filter((t) => ids.includes(t.id));
    ids.forEach(deleteTodo);
    setSelected(new Set());
    if (open && ids.includes(open)) setOpen(null);
    offerUndo(gone.length === 1 ? `„${gone[0].text}“ gelöscht` : `${gone.length} To-dos gelöscht`, () =>
      gone.forEach(({ id: _id, createdAt: _c, ...rest }) => (void _id, void _c, addTodo(rest))),
    );
  };
  const move = (t: Todo, by: -1 | 1, list: Todo[]) => {
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    next.forEach((x, k) => x.order !== k && updateTodo(x.id, { order: k }));
  };
  const startTimer = (t: Todo) => {
    pomodoro.startForTodo(t.id, t.minutes);
    toolWindows.open('pomodoro');
  };

  // keyboard: N new · ↑↓ move · Space check off · Enter details · Del delete
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = flat[focus];
      if (e.key === 'n' || e.key === 'N') (e.preventDefault(), addRef.current?.focus());
      else if (e.key === 'ArrowDown') (e.preventDefault(), setFocus((f) => Math.min(flat.length - 1, f + 1)));
      else if (e.key === 'ArrowUp') (e.preventDefault(), setFocus((f) => Math.max(0, f - 1)));
      else if (e.key === ' ' && t) (e.preventDefault(), check(t));
      else if (e.key === 'Enter' && t) (e.preventDefault(), setOpen(open === t.id ? null : t.id));
      else if ((e.key === 'Delete' || e.key === 'Backspace') && t) (e.preventDefault(), remove([t.id]));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const ideas = todoSuggestions({
    exams: data.exams,
    decks: data.decks.map((d) => ({ id: d.id, name: d.name, leeches: d.cards.filter(isLeech).length })),
    todos: all.filter((t) => !t.doneAt),
  });

  return (
    <div className="page todos-page">
      <header className="page-head">
        <h1>To-dos</h1>
        <p className="muted">
          {counts.all} offen · {counts.today} heute oder überfällig · Tastatur: <kbd>N</kbd> neu, <kbd>↑</kbd>
          <kbd>↓</kbd> wählen, <kbd>Leertaste</kbd> erledigt, <kbd>Enter</kbd> Details
        </p>
      </header>

      <QuickAdd inputRef={addRef} deckId={deckFilter} />

      {ideas.length > 0 && (
        <div className="chips">
          {ideas.map((i) => (
            <button key={i.text} type="button" className="chip" title="Als To-do übernehmen" onClick={() => addTodo(i)}>
              <IconSparkle size={12} /> {i.text}
            </button>
          ))}
        </div>
      )}

      <div className="todos-bar">
        <div className="seg" role="tablist" aria-label="Ansicht">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => (setView(id), setFocus(0))}>
              {label} <span className="seg-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <input className="input sm" type="search" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="To-dos suchen" />
        {data.decks.length > 0 && (
          <select className="input sm" value={deckFilter} onChange={(e) => setDeckFilter(e.target.value)} aria-label="Nach Deck filtern">
            <option value="">Alle Decks</option>
            {data.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <select className="input sm" value={prioFilter} onChange={(e) => setPrioFilter(e.target.value as TodoPriority | '')} aria-label="Nach Priorität filtern">
          <option value="">Jede Priorität</option>
          {(Object.keys(PRIORITY_LABEL) as TodoPriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="todos-bulk" role="toolbar" aria-label="Ausgewählte To-dos">
          <b>{selected.size} ausgewählt</b>
          <button type="button" className="btn outline sm" onClick={() => (selected.forEach((id) => { const t = all.find((x) => x.id === id); if (t && !t.doneAt) toggleTodo(id); }), setSelected(new Set()))}>
            <IconCheck size={14} /> Erledigt
          </button>
          <button type="button" className="btn ghost sm" onClick={() => (selected.forEach((id) => updateTodo(id, { due: today })), setSelected(new Set()))}>
            Auf heute
          </button>
          <button type="button" className="btn ghost sm" onClick={() => (selected.forEach((id) => updateTodo(id, { due: dayKey(now + DAY) })), setSelected(new Set()))}>
            Auf morgen
          </button>
          <button type="button" className="btn ghost sm danger" onClick={() => remove([...selected])}>
            <IconTrash size={14} /> Löschen
          </button>
          <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {sections.length === 0 && (
        <div className="empty">
          <b>{view === 'done' ? 'Noch nichts erledigt.' : view === 'today' ? 'Für heute ist nichts offen. 🎉' : 'Keine To-dos.'}</b>
          {view === 'today' && counts.all > 0 && (
            <button type="button" className="link-btn" onClick={() => setView('all')}>
              Alle {counts.all} offenen ansehen
            </button>
          )}
        </div>
      )}

      {sections.map((sec) => (
        <section key={sec.label} className={'panel todo-section ' + (sec.tone ? 't-' + sec.tone : '')}>
          <h2>
            {sec.label} <span className="muted small">{sec.items.length}</span>
            {view === 'done' && (
              <button type="button" className="link-btn small" onClick={() => remove(sec.items.map((t) => t.id))}>
                Erledigte aufräumen
              </button>
            )}
          </h2>
          <ul className="todo-rows">
            {sec.items.map((t) => (
              <TodoRow
                key={t.id}
                t={t}
                focused={flat[focus]?.id === t.id}
                open={open === t.id}
                selected={selected.has(t.id)}
                onSelect={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(t.id); else n.delete(t.id); return n; })}
                onOpen={() => (setOpen(open === t.id ? null : t.id), setFocus(flat.findIndex((x) => x.id === t.id)))}
                onCheck={() => check(t)}
                onMove={(by) => move(t, by, sec.items)}
                onTimer={() => startTimer(t)}
                onDelete={() => remove([t.id])}
              />
            ))}
          </ul>
        </section>
      ))}

      {undo && (
        <div className="todo-undo" role="status">
          <span>{undo.text}</span>
          <button type="button" className="btn outline sm" onClick={() => (undo.run(), setUndo(null))}>
            Rückgängig
          </button>
        </div>
      )}
    </div>
  );
}

/** Quick entry with recognition: the recognized parts show as chips before saving; details on demand. */
function QuickAdd({ inputRef, deckId }: { inputRef: React.RefObject<HTMLInputElement>; deckId: string }) {
  const data = useData();
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState<{ due?: string; time?: string; priority?: TodoPriority; repeat?: TodoRepeat; minutes?: number; deckId?: string }>({});
  const parsed = parseQuickTodo(text, data.decks, Date.now());
  const final = { ...parsed, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== '')) } as typeof parsed;
  const deck = data.decks.find((d) => d.id === (final.deckId || deckId));
  const add = () => {
    if (!final.text.trim()) return;
    addTodo({
      text: final.text,
      ...(final.due ? { due: final.due } : {}),
      ...(final.time ? { time: final.time } : {}),
      ...(final.priority ? { priority: final.priority } : {}),
      ...(final.repeat ? { repeat: final.repeat } : {}),
      ...(final.minutes ? { minutes: final.minutes } : {}),
      ...(deck ? { deckId: deck.id } : {}),
    });
    setText('');
    setExtra({});
  };
  return (
    <section className="panel todo-quick">
      <div className="input-row">
        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Neues To-do – z. B. „Zusammenfassung schreiben morgen 14:00 !hoch #Biologie 30min“"
          aria-label="Neues To-do"
        />
        <button type="button" className="btn primary" onClick={add} disabled={!final.text.trim()}>
          <IconPlus size={15} /> Hinzufügen
        </button>
      </div>
      <div className="todo-chips">
        {final.due && <span className="chip on">📅 {dueText(final.due)}{final.time ? ` · ${final.time}` : ''}</span>}
        {!final.due && final.time && <span className="chip on">🕑 {final.time}</span>}
        {final.priority && <span className={'chip on prio-' + final.priority}>! {PRIORITY_LABEL[final.priority]}</span>}
        {deck && <span className="chip on"># {deck.name}</span>}
        {final.minutes && <span className="chip on">⏱ {final.minutes} Min.</span>}
        {final.repeat && <span className="chip on">↻ {REPEAT_LABEL[final.repeat]}</span>}
        <button type="button" className="link-btn small" onClick={() => setMore(!more)}>
          {more ? 'Weniger' : 'Datum, Priorität, Wiederholen …'}
        </button>
      </div>
      {more && (
        <div className="todo-fields">
          <label>
            Datum <input className="input sm" type="date" value={extra.due ?? parsed.due ?? ''} onChange={(e) => setExtra({ ...extra, due: e.target.value || undefined })} />
          </label>
          <label>
            Uhrzeit <input className="input sm" type="time" value={extra.time ?? parsed.time ?? ''} onChange={(e) => setExtra({ ...extra, time: e.target.value || undefined })} />
          </label>
          <label>
            Priorität
            <select className="input sm" value={extra.priority ?? parsed.priority ?? ''} onChange={(e) => setExtra({ ...extra, priority: (e.target.value || undefined) as TodoPriority | undefined })}>
              <option value="">–</option>
              {(Object.keys(PRIORITY_LABEL) as TodoPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Wiederholen
            <select className="input sm" value={extra.repeat ?? parsed.repeat ?? ''} onChange={(e) => setExtra({ ...extra, repeat: (e.target.value || undefined) as TodoRepeat | undefined })}>
              <option value="">Nie</option>
              {(Object.keys(REPEAT_LABEL) as TodoRepeat[]).map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dauer (Min.) <input className="input sm" type="number" min={1} max={600} value={extra.minutes ?? parsed.minutes ?? ''} onChange={(e) => setExtra({ ...extra, minutes: Number(e.target.value) || undefined })} />
          </label>
          {data.decks.length > 0 && (
            <label>
              Deck
              <select className="input sm" value={extra.deckId ?? parsed.deckId ?? deckId} onChange={(e) => setExtra({ ...extra, deckId: e.target.value || undefined })}>
                <option value="">Kein Deck</option>
                {data.decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </section>
  );
}

function TodoRow(p: {
  t: Todo;
  focused: boolean;
  open: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
  onCheck: () => void;
  onMove: (by: -1 | 1) => void;
  onTimer: () => void;
  onDelete: () => void;
}) {
  const { t } = p;
  const data = useData();
  const { activeTodoId } = usePomodoroMeta();
  const deck = t.deckId ? data.decks.find((d) => d.id === t.deckId) : undefined;
  const exam = t.examId ? data.exams.find((e) => e.id === t.examId) : undefined;
  const sub = subtaskProgress(t);
  const overdue = !t.doneAt && t.due && t.due < dayKey(Date.now());
  return (
    <li className={'todo-row' + (t.doneAt ? ' done' : '') + (p.focused ? ' focused' : '') + (p.open ? ' open' : '') + (overdue ? ' overdue' : '') + (t.priority ? ' prio-' + t.priority : '')}>
      <div className="todo-line">
        <input type="checkbox" className="todo-select" checked={p.selected} onChange={(e) => p.onSelect(e.target.checked)} aria-label="Auswählen" />
        <button type="button" className="todo-check" role="checkbox" aria-checked={!!t.doneAt} aria-label={t.doneAt ? 'Wieder öffnen' : 'Erledigt'} onClick={p.onCheck}>
          {t.doneAt && <IconCheck size={13} />}
        </button>
        <button type="button" className="todo-main" onClick={p.onOpen} aria-expanded={p.open}>
          <span className="todo-text">{t.text}</span>
          <span className="todo-meta">
            {t.priority && <span className={'prio-dot prio-' + t.priority} title={'Priorität: ' + PRIORITY_LABEL[t.priority]} />}
            {t.due && <span className={overdue ? 'bad' : ''}>📅 {dueText(t.due)}{t.time ? ` ${t.time}` : ''}</span>}
            {t.repeat && <span title={REPEAT_LABEL[t.repeat]}>↻</span>}
            {sub && <span>☑ {sub.done}/{sub.total}</span>}
            {t.minutes && <span>⏱ {t.minutes} Min.</span>}
            {deck && <span># {deck.name}</span>}
            {exam && <span>🎓 {exam.title}</span>}
            {t.note && <span title={t.note}>📝</span>}
          </span>
        </button>
        <span className="todo-actions">
          {!t.doneAt && (
            <button type="button" className={'icon-btn sm' + (activeTodoId === t.id ? ' on' : '')} title={t.minutes ? `Pomodoro (${t.minutes} Min.) starten` : 'Pomodoro starten'} aria-label="Pomodoro starten" onClick={p.onTimer}>
              <IconPlay size={12} />
            </button>
          )}
          <button type="button" className="icon-btn sm" aria-label="Nach oben" onClick={() => p.onMove(-1)}>
            ▲
          </button>
          <button type="button" className="icon-btn sm" aria-label="Nach unten" onClick={() => p.onMove(1)}>
            ▼
          </button>
        </span>
      </div>
      {p.open && <TodoDetails t={t} deckLink={deck ? deckUrl(data, deck) : undefined} onDelete={p.onDelete} />}
    </li>
  );
}

function TodoDetails({ t, deckLink, onDelete }: { t: Todo; deckLink?: string; onDelete: () => void }) {
  const data = useData();
  const [newSub, setNewSub] = useState('');
  const set = (patch: Partial<Todo>) => updateTodo(t.id, patch);
  const subs = t.subtasks ?? [];
  return (
    <div className="todo-details">
      <input className="input" value={t.text} onChange={(e) => set({ text: e.target.value })} aria-label="Titel" />
      <textarea className="input" rows={2} value={t.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} placeholder="Notiz …" aria-label="Notiz" />
      <div className="todo-fields">
        <label>
          Datum <input className="input sm" type="date" value={t.due ?? ''} onChange={(e) => set({ due: e.target.value || undefined })} />
        </label>
        <label>
          Uhrzeit <input className="input sm" type="time" value={t.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} />
        </label>
        <label>
          Priorität
          <select className="input sm" value={t.priority ?? ''} onChange={(e) => set({ priority: (e.target.value || undefined) as TodoPriority | undefined })}>
            <option value="">–</option>
            {(Object.keys(PRIORITY_LABEL) as TodoPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Wiederholen
          <select className="input sm" value={t.repeat ?? ''} onChange={(e) => set({ repeat: (e.target.value || undefined) as TodoRepeat | undefined })}>
            <option value="">Nie</option>
            {(Object.keys(REPEAT_LABEL) as TodoRepeat[]).map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dauer (Min.) <input className="input sm" type="number" min={1} max={600} value={t.minutes ?? ''} onChange={(e) => set({ minutes: Number(e.target.value) || undefined })} />
        </label>
        <label>
          Deck
          <select className="input sm" value={t.deckId ?? ''} onChange={(e) => set({ deckId: e.target.value || undefined })}>
            <option value="">Kein Deck</option>
            {data.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="todo-subs">
        <b>Unteraufgaben</b>
        {subs.map((s, k) => (
          <div key={s.id} className={'todo-sub' + (s.done ? ' done' : '')}>
            <input type="checkbox" checked={!!s.done} onChange={(e) => set({ subtasks: subs.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)) })} aria-label={s.text} />
            <input className="input sm" value={s.text} onChange={(e) => set({ subtasks: subs.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)) })} />
            <button type="button" className="icon-btn sm" aria-label="Unteraufgabe löschen" onClick={() => set({ subtasks: subs.filter((_, j) => j !== k) })}>
              ×
            </button>
          </div>
        ))}
        <div className="input-row">
          <input
            className="input sm"
            value={newSub}
            placeholder="Unteraufgabe hinzufügen …"
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSub.trim()) {
                set({ subtasks: [...subs, { id: uid(), text: newSub.trim() }] });
                setNewSub('');
              }
            }}
          />
        </div>
      </div>
      <div className="row-gap">
        {deckLink && (
          <Link to={deckLink} className="btn ghost sm">
            Deck öffnen
          </Link>
        )}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            const { id: _i, createdAt: _c, doneAt: _d, updatedAt: _u, ...rest } = t;
            void _i, _c, _d, _u;
            addTodo({ ...rest, text: t.text + ' (Kopie)', subtasks: t.subtasks?.map((s) => ({ ...s, id: uid(), done: false })) });
          }}
        >
          Duplizieren
        </button>
        <button type="button" className="btn ghost sm danger" onClick={onDelete}>
          <IconTrash size={14} /> Löschen
        </button>
      </div>
    </div>
  );
}
