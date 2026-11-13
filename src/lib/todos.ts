/**
 * To-dos on the start page: grouping, sorting and merging copies from two devices.
 * Pure – tested in scripts/test-srs.mts.
 */
import { DAY, dayKey, startOfDay } from './util';

export type Todo = {
  id: string;
  text: string;
  /** YYYY-MM-DD (optional) */
  due?: string;
  deckId?: string;
  examId?: string;
  /** Checked off at (ms). */
  doneAt?: number;
  createdAt: number;
  updatedAt?: number;
};

export type TodoGroupId = 'overdue' | 'today' | 'soon' | 'nodate' | 'done';
export type TodoGroup = { id: TodoGroupId; label: string; items: Todo[] };

const LABELS: Record<TodoGroupId, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  soon: 'Demnächst',
  nodate: 'Ohne Datum',
  done: 'Erledigt',
};

export function todoGroup(t: Todo, now = Date.now()): TodoGroupId {
  if (t.doneAt) return 'done';
  if (!t.due) return 'nodate';
  const today = dayKey(now);
  return t.due < today ? 'overdue' : t.due === today ? 'today' : 'soon';
}

/** Open to-dos by urgency (overdue, today, soon by date, without date), checked-off ones last – only non-empty groups. */
export function todoGroups(todos: Todo[], now = Date.now()): TodoGroup[] {
  const order: TodoGroupId[] = ['overdue', 'today', 'soon', 'nodate', 'done'];
  const by = new Map<TodoGroupId, Todo[]>(order.map((id) => [id, []]));
  for (const t of todos) by.get(todoGroup(t, now))!.push(t);
  const byDate = (a: Todo, b: Todo) => (a.due ?? '').localeCompare(b.due ?? '') || a.createdAt - b.createdAt;
  by.get('overdue')!.sort(byDate);
  by.get('today')!.sort(byDate);
  by.get('soon')!.sort(byDate);
  by.get('nodate')!.sort((a, b) => a.createdAt - b.createdAt);
  by.get('done')!.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return order.filter((id) => by.get(id)!.length).map((id) => ({ id, label: LABELS[id], items: by.get(id)! }));
}

/** Short date text: „heute“, „morgen“, „gestern“ or „Mo, 3. Mär“. */
export function dueText(due: string, now = Date.now()): string {
  const today = dayKey(now);
  if (due === today) return 'heute';
  if (due === dayKey(now + DAY)) return 'morgen';
  if (due === dayKey(now - DAY)) return 'gestern';
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Two copies (devices): deleted ones stay deleted, otherwise the later change wins. */
export function mergeTodos(a: Todo[], b: Todo[], isDel: (id: string) => boolean): Todo[] {
  const time = (t: Todo) => t.updatedAt ?? t.createdAt;
  const map = new Map<string, Todo>();
  for (const t of [...a, ...b]) {
    if (isDel(t.id)) continue;
    const x = map.get(t.id);
    if (!x || time(t) > time(x)) map.set(t.id, t);
  }
  return [...map.values()];
}

export type TodoIdea = { text: string; deckId?: string; examId?: string; due?: string };

/**
 * Gentle suggestions without AI: a mock exam when an exam is near (≤ 10 days),
 * improving problem cards when a deck has some. Ideas already on the list are left out; at most `max`.
 */
export function todoSuggestions(
  o: { exams: { id: string; title: string; date: string }[]; decks: { id: string; name: string; leeches: number }[]; todos: Todo[] },
  now = Date.now(),
  max = 2,
): TodoIdea[] {
  const have = new Set(o.todos.map((t) => t.text.trim().toLowerCase()));
  const today = dayKey(now);
  const out: TodoIdea[] = [];
  for (const e of [...o.exams].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date < today) continue;
    const [y, m, d] = e.date.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d).getTime() - startOfDay(now)) / DAY);
    if (days > 10) break;
    out.push({ text: `Probeprüfung für ${e.title} machen`, examId: e.id, due: dayKey(now + DAY) });
  }
  for (const d of [...o.decks].filter((x) => x.leeches > 0).sort((a, b) => b.leeches - a.leeches))
    out.push({ text: `Problemkarten in ${d.name} verbessern`, deckId: d.id });
  return out.filter((x) => !have.has(x.text.toLowerCase())).slice(0, max);
}
