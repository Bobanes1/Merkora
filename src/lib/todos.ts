/**
 * To-dos on the start page: grouping, sorting and merging copies from two devices.
 * Pure – tested in scripts/test-srs.mts.
 */
import { DAY, dayKey, startOfDay } from './util';

export type TodoPhase = 'start' | 'main' | 'end';

export type Todo = {
  id: string;
  text: string;
  /** YYYY-MM-DD (optional) */
  due?: string;
  deckId?: string;
  examId?: string;
  /** Planned duration in minutes (e.g. from Arbeitsplanung). */
  minutes?: number;
  /** Role in a planned work session (Einstieg, Hauptteil, Abschluss). */
  phase?: TodoPhase;
  /** Short planning hint / reason. */
  note?: string;
  /** Explicit order within a day's plan. */
  order?: number;
  /** Checked off at (ms). */
  doneAt?: number;
  priority?: TodoPriority;
  /** Time of day HH:MM (with a due date). */
  time?: string;
  subtasks?: Subtask[];
  /** Checking it off makes the next one. */
  repeat?: TodoRepeat;
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
  const byOrder = (a: Todo, b: Todo) => (a.order ?? 1e9) - (b.order ?? 1e9);
  const byDate = (a: Todo, b: Todo) => (a.due ?? '').localeCompare(b.due ?? '') || byOrder(a, b) || a.createdAt - b.createdAt;
  by.get('overdue')!.sort(byDate);
  by.get('today')!.sort(byDate);
  by.get('soon')!.sort(byDate);
  by.get('nodate')!.sort((a, b) => byOrder(a, b) || a.createdAt - b.createdAt);
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

// ---------- the to-do page: quick entry, priority, repeating, sub-tasks ----------
export type TodoPriority = 'high' | 'mid' | 'low';
export type TodoRepeat = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type Subtask = { id: string; text: string; done?: boolean };
export const PRIORITY_LABEL: Record<TodoPriority, string> = { high: 'Hoch', mid: 'Mittel', low: 'Niedrig' };
export const REPEAT_LABEL: Record<TodoRepeat, string> = { daily: 'Täglich', weekdays: 'Werktags', weekly: 'Wöchentlich', monthly: 'Monatlich' };
const PRIO_RANK: Record<TodoPriority, number> = { high: 0, mid: 1, low: 2 };
export const prioRank = (t: { priority?: TodoPriority }) => (t.priority ? PRIO_RANK[t.priority] : 1.5);

const WEEKDAYS: Record<string, number> = { so: 0, sonntag: 0, mo: 1, montag: 1, di: 2, dienstag: 2, mi: 3, mittwoch: 3, do: 4, donnerstag: 4, fr: 5, freitag: 5, sa: 6, samstag: 6 };

/** YYYY-MM-DD of a local date. */
const keyOf = (d: Date) => dayKey(d.getTime());
const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export type QuickTodo = { text: string; due?: string; time?: string; priority?: TodoPriority; deckId?: string; minutes?: number; repeat?: TodoRepeat };

/**
 * Quick entry: "Zusammenfassung schreiben morgen 14:00 !hoch #Biologie 30min jede Woche" →
 * text plus recognized date, time, priority, deck, duration and repeat. Unrecognized words stay in the text.
 * Pure – tested in scripts/test-srs.mts.
 */
export function parseQuickTodo(input: string, decks: { id: string; name: string }[] = [], now = Date.now()): QuickTodo {
  const out: QuickTodo = { text: '' };
  let t = ` ${input.trim()} `;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = t.match(re);
    if (m && fn(m) !== false) t = t.replace(m[0], ' ');
  };
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const plus = (days: number) => keyOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
  // repeat (before weekdays: "jeden Montag" is weekly)
  take(/\s(jeden tag|täglich|taeglich)\s/i, () => void (out.repeat = 'daily'));
  take(/\s(werktags|jeden werktag)\s/i, () => void (out.repeat = 'weekdays'));
  take(/\s(jede woche|wöchentlich|woechentlich)\s/i, () => void (out.repeat = 'weekly'));
  take(/\s(jeden monat|monatlich)\s/i, () => void (out.repeat = 'monthly'));
  take(/\sjeden (montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s/i, (m) => {
    out.repeat = 'weekly';
    const wd = WEEKDAYS[m[1].toLowerCase()];
    out.due = plus(((wd - base.getDay() + 7) % 7) || 7);
  });
  // priority: !hoch, !!, !niedrig …
  take(/\s(!!!?|!hoch|!wichtig|!high)\s/i, () => void (out.priority = 'high'));
  take(/\s(!mittel|!normal)\s/i, () => void (out.priority = 'mid'));
  take(/\s(!niedrig|!low|!später)\s/i, () => void (out.priority = 'low'));
  // duration: 30min, 1h, 1,5 h, 90 Min.
  take(/\s(\d+(?:[.,]\d+)?)\s?(min\.?|minuten|h|std\.?|stunden?)(?=\s)/i, (m) => {
    const v = Number(m[1].replace(',', '.'));
    const mins = /^(h|std|stunde)/i.test(m[2]) ? v * 60 : v;
    if (!(mins >= 1 && mins <= 600)) return false;
    out.minutes = Math.round(mins);
  });
  // time: 14:00, 9 uhr, 14.30 uhr
  take(/\s(?:um\s)?(\d{1,2})(?:[:.](\d{2}))?\s?uhr\s|\s(\d{1,2}):(\d{2})\s/i, (m) => {
    const h = Number(m[1] ?? m[3]), mi = Number(m[2] ?? m[4] ?? 0);
    if (h > 23 || mi > 59) return false;
    out.time = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  });
  // date: heute, morgen, übermorgen, Wochentag, 24.12. / 24.12.2026, in 3 tagen, nächste woche
  if (!out.due) {
    take(/\s(heute)\s/i, () => void (out.due = plus(0)));
    take(/\s(übermorgen|uebermorgen)\s/i, () => void (out.due = plus(2)));
    take(/\s(morgen)\s/i, () => void (out.due = plus(1)));
    take(/\sin (\d{1,3}) tagen?\s/i, (m) => void (out.due = plus(Number(m[1]))));
    take(/\s(nächste|naechste) woche\s/i, () => void (out.due = plus(((8 - base.getDay()) % 7) || 7)));
    take(/\s(?:am\s)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (m) => {
      const d = Number(m[1]), mo = Number(m[2]);
      if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
      let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear();
      let date = new Date(y, mo - 1, d);
      if (!m[3] && date < base) date = new Date(++y, mo - 1, d);
      out.due = keyOf(date);
    });
    take(/\s(?:am\s)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)\.?(?=\s)/i, (m) => {
      const wd = WEEKDAYS[m[1].toLowerCase()];
      out.due = plus(((wd - base.getDay() + 7) % 7) || 7);
    });
  }
  // deck: #Name (also several words when a deck has that name)
  take(/\s#([^\s#!]+(?:\s[^\s#!]+){0,4})/, (m) => {
    const words = m[1].split(/\s+/);
    for (let n = words.length; n >= 1; n--) {
      const name = words.slice(0, n).join(' ').toLowerCase();
      const deck = decks.find((d) => d.name.toLowerCase() === name) ?? (n === 1 ? decks.find((d) => d.name.toLowerCase().startsWith(name)) : undefined);
      if (deck) {
        out.deckId = deck.id;
        t = t.replace('#' + words.slice(0, n).join(' '), ' ');
        return false;
      }
    }
    return false;
  });
  out.text = t.replace(/\s+/g, ' ').trim();
  return out;
}

/** The next date of a repeating to-do (from its due date, or from today). */
export function nextDue(due: string | undefined, repeat: TodoRepeat, now = Date.now()): string {
  const d = due ? parseKey(due) : new Date(new Date(now).setHours(0, 0, 0, 0));
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'weekdays') {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else {
    // monthly: the same day next month, or its last day (31.1. → 28./29.2.)
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return keyOf(d);
}

/** "2/5" of the sub-tasks (null without sub-tasks). */
export function subtaskProgress(t: { subtasks?: Subtask[] }): { done: number; total: number } | null {
  const s = t.subtasks ?? [];
  return s.length ? { done: s.filter((x) => x.done).length, total: s.length } : null;
}

/** Sorting within a group: own order, then priority, then time of day, then creation. */
export function sortTodos<T extends { order?: number; priority?: TodoPriority; time?: string; createdAt: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || prioRank(a) - prioRank(b) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.createdAt - b.createdAt);
}

/** The days of the next `days` days with their to-dos (for „Geplant“). */
export function plannedDays<T extends { due?: string; doneAt?: number }>(todos: T[], now = Date.now(), days = 14): { key: string; items: T[] }[] {
  const out: { key: string; items: T[] }[] = [];
  for (let i = 0; i < days; i++) {
    const key = dayKey(now + i * DAY);
    out.push({ key, items: todos.filter((t) => !t.doneAt && t.due === key) });
  }
  return out;
}
