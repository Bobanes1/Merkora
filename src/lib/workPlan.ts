/**
 * Arbeitsplanung: builds a structured, motivation-aware study/work session plan
 * (Einstieg → Hauptteil with breaks → Abschluss) from tasks, available time, and motivation per task.
 * Pure core – tested in scripts/test-srs.mts.
 */
import type { TodoPhase } from './todos';

export type Motivation = 1 | 2 | 3; // 1 = wenig Lust, 2 = okay, 3 = motiviert
export type TaskSize = 's' | 'm' | 'l';

export type PlanInputTask = {
  id: string;
  title: string;
  motivation: Motivation;
  size: TaskSize;
  important?: boolean;
  deckId?: string;
  /** Taken from the to-do list: handing the plan over updates this to-do instead of making a new one. */
  todoId?: string;
};

export type PlanTaskStep = {
  kind: 'task';
  taskId: string;
  title: string;
  phase: TodoPhase;
  minutes: number;
  motivation: Motivation;
  reason: string;
  deckId?: string;
  /** Part n of m when a long task is split. */
  part?: number;
  parts?: number;
  /** All minutes of the task (over all parts). */
  taskMinutes?: number;
  from?: string;
  to?: string;
};

export type PlanBreakStep = {
  kind: 'break';
  minutes: number;
  reason: string;
  from?: string;
  to?: string;
};

export type PlanStep = PlanTaskStep | PlanBreakStep;

export type WorkPlan = {
  totalMinutes: number;
  workMinutes: number;
  breakMinutes: number;
  steps: PlanStep[];
  parked: PlanInputTask[];
  /** Minutes the plan is longer than the available time (because of hand-edited minutes). */
  overflow: number;
  summary: string;
};

export const MOTIVATION_LABEL: Record<Motivation, string> = {
  1: 'Wenig Lust',
  2: 'Okay',
  3: 'Motiviert',
};

export const SIZE_LABEL: Record<TaskSize, string> = {
  s: 'Klein',
  m: 'Mittel',
  l: 'Groß',
};

export const PHASE_LABEL: Record<TodoPhase, string> = {
  start: 'Einstieg',
  main: 'Hauptteil',
  end: 'Abschluss',
};

const SIZE_WEIGHT: Record<TaskSize, number> = { s: 1, m: 2, l: 3.2 };
const MIN_TASK_MINUTES = 10;

function taskWeight(t: PlanInputTask): number {
  const base = SIZE_WEIGHT[t.size] ?? 2;
  return base * (t.important ? 1.35 : 1);
}

/** Score for picking a good starter (Einstieg): high motivation + smaller/approachable size. */
function starterScore(t: PlanInputTask): number {
  const sizeBonus = t.size === 's' ? 2 : t.size === 'm' ? 1 : 0;
  return t.motivation * 10 + sizeBonus * 2 + (t.important ? 0.5 : 0);
}

/** Score for picking a good finisher (Abschluss): lighter or enjoyable when energy drops at the end. */
function enderScore(t: PlanInputTask): number {
  const sizeBonus = t.size === 's' ? 3 : t.size === 'm' ? 1.5 : 0;
  const lowPenalty = t.motivation === 1 ? -4 : 0;
  return t.motivation * 6 + sizeBonus * 3 + lowPenalty + (t.important ? -1 : 0);
}

/**
 * Distributes `total` minutes across `weights`, rounded to `step` minutes,
 * guaranteeing every item gets at least `minPer` and the exact sum equals `total`.
 */
function allocateMinutes(weights: number[], total: number, step: number, minPer: number): number[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) return [total];
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => Math.max(minPer, (w / sumW) * total));
  const rounded = raw.map((v) => Math.max(minPer, Math.round(v / step) * step));
  let diff = total - rounded.reduce((a, b) => a + b, 0);

  // Adjust in `step` increments (or 1-min fallback) so the sum matches `total` exactly.
  const order = weights.map((w, i) => ({ i, w })).sort((a, b) => b.w - a.w);
  let guard = 0;
  while (diff !== 0 && guard < 200) {
    guard++;
    const delta = Math.abs(diff) >= step ? (diff > 0 ? step : -step) : diff > 0 ? 1 : -1;
    let changed = false;
    const list = delta > 0 ? order : [...order].reverse();
    for (const { i } of list) {
      if (delta < 0 && rounded[i] + delta < minPer) continue;
      rounded[i] += delta;
      diff -= delta;
      changed = true;
      if (diff === 0) break;
    }
    if (!changed) break;
  }
  return rounded;
}

function starterReason(t: PlanInputTask): string {
  if (t.motivation === 3 && t.size === 's') return 'Guter Einstieg: hohe Motivation und schnell erledigt – bringt dich direkt in den Flow.';
  if (t.motivation === 3) return 'Guter Einstieg: hohe Motivation hilft dir, ohne Hürde loszulegen.';
  if (t.size === 's') return 'Guter Einstieg: überschaubare Aufgabe für ein schnelles erstes Erfolgserlebnis.';
  return 'Guter Einstieg: solide Aufgabe zum Warmwerden am Anfang.';
}

function mainReason(t: PlanInputTask): string {
  if (t.motivation === 1 && t.important) return 'Wichtige Aufgabe mit wenig Lust – im Fokus-Block erledigen, wenn du schon im Rhythmus bist.';
  if (t.motivation === 1) return 'Wenig Lust: am besten im Hauptteil anpacken, sobald der Einstieg geschafft ist.';
  if (t.important) return 'Hohe Priorität: bekommt einen konzentrierten Block im Hauptteil.';
  if (t.size === 'l') return 'Größerer Brocken: im Hauptteil hast du die beste Konzentration dafür.';
  return 'Im Hauptteil konzentriert abarbeiten.';
}

function enderReason(t: PlanInputTask): string {
  if (t.motivation === 3) return 'Schöner Abschluss: macht dir Spaß und rundet die Einheit motiviert ab.';
  if (t.size === 's') return 'Angenehmer Abschluss: kurz und machbar, auch wenn die Konzentration nachlässt.';
  return 'Guter Ausklang zum Schluss ohne zu viel Druck.';
}

/** Longest block without a break; longer tasks are split into parts. */
export const MAX_BLOCK = 50;

export type PlanOptions = {
  /** Fixed minutes per task (edited by hand); the rest of the time is shared by the other tasks. */
  overrides?: Record<string, number>;
  /** Start time HH:MM – then every step gets from/to clock times. */
  start?: string;
};

/** Splits `m` minutes into the fewest parts of at most MAX_BLOCK, as even as possible (multiples of 5 where it fits). */
export function splitBlock(m: number): number[] {
  if (m <= MAX_BLOCK) return [m];
  const n = Math.ceil(m / MAX_BLOCK);
  const unit = m % 5 === 0 ? 5 : 1;
  const parts = Array.from({ length: n }, () => Math.floor(m / n / unit) * unit);
  let rest = m - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % n) {
    const add = Math.min(unit, rest);
    parts[i] += add;
    rest -= add;
  }
  return parts;
}

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null;
};
/** Minutes since midnight as HH:MM (capped at 23:59). */
export const clockText = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** Now, rounded up to the next 5 minutes, as HH:MM. */
export const nextStartTime = (now = Date.now()) => {
  const d = new Date(now);
  return clockText(Math.ceil((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
};

/** Deck ids with an exam in the next `days` days (today included). */
export function examSoonDecks<E extends { date: string }>(exams: E[], deckIdsOf: (e: E) => string[], now = Date.now(), days = 7): Set<string> {
  const out = new Set<string>();
  const d = new Date(now);
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  for (const e of exams) {
    const [y, mo, da] = e.date.split('-').map(Number);
    const diff = Math.round((Date.UTC(y, mo - 1, da) - today) / 86400000);
    if (diff >= 0 && diff <= days) for (const id of deckIdsOf(e)) out.add(id);
  }
  return out;
}

/**
 * Builds a complete work plan for the given tasks and total available minutes.
 */
export function buildWorkPlan(rawTasks: PlanInputTask[], rawMinutes: number, withBreaks = true, opts: PlanOptions = {}): WorkPlan {
  const tasks = rawTasks.filter((t) => t.title.trim().length > 0).map((t) => ({ ...t, title: t.title.trim() }));
  const totalMinutes = Math.max(10, Math.min(480, Math.round(rawMinutes || 60)));

  if (tasks.length === 0) {
    return {
      totalMinutes,
      workMinutes: totalMinutes,
      breakMinutes: 0,
      steps: [],
      parked: [],
      overflow: 0,
      summary: 'Füge mindestens eine Aufgabe hinzu, um deinen Arbeitsplan zu erstellen.',
    };
  }

  // Break budget: one break per ~40 min when the session is 45 min or longer.
  const plannedBreaks = withBreaks && totalMinutes >= 45 ? Math.min(6, Math.floor((totalMinutes - 15) / 40)) : 0;
  const breakUnit = totalMinutes >= 150 ? 10 : 5;
  const workMinutes = Math.max(10, totalMinutes - plannedBreaks * breakUnit);

  // If too many tasks for the available time, park overflow tasks cleanly.
  const maxFit = Math.max(1, Math.floor(workMinutes / MIN_TASK_MINUTES));
  let active = [...tasks];
  let parked: PlanInputTask[] = [];
  if (active.length > maxFit) {
    const keepOrder = [...active].sort(
      (a, b) =>
        Number(!!b.important) - Number(!!a.important) ||
        b.motivation - a.motivation ||
        SIZE_WEIGHT[a.size] - SIZE_WEIGHT[b.size],
    );
    const keepIds = new Set(keepOrder.slice(0, maxFit).map((t) => t.id));
    parked = active.filter((t) => !keepIds.has(t.id));
    active = active.filter((t) => keepIds.has(t.id));
  }

  // Order tasks into Einstieg -> Hauptteil -> Abschluss.
  let starter: PlanInputTask | null = null;
  let ender: PlanInputTask | null = null;
  let middle: PlanInputTask[] = [];
  if (active.length === 1) {
    starter = active[0];
  } else if (active.length === 2) {
    const sorted = [...active].sort((a, b) => starterScore(b) - starterScore(a));
    starter = sorted[0];
    ender = sorted[1];
  } else {
    const pool = [...active];
    pool.sort((a, b) => starterScore(b) - starterScore(a));
    starter = pool.shift()!;
    pool.sort((a, b) => enderScore(b) - enderScore(a));
    ender = pool.shift()!;
    // Middle: tackle important & harder/low-motivation tasks while in peak focus.
    middle = pool.sort(
      (a, b) =>
        Number(!!b.important) - Number(!!a.important) ||
        a.motivation - b.motivation ||
        SIZE_WEIGHT[b.size] - SIZE_WEIGHT[a.size],
    );
  }
  const ordered: { task: PlanInputTask; phase: TodoPhase; reason: string }[] = [];
  if (starter) ordered.push({ task: starter, phase: 'start', reason: starterReason(starter) });
  for (const m of middle) ordered.push({ task: m, phase: 'main', reason: mainReason(m) });
  if (ender) ordered.push({ task: ender, phase: 'end', reason: enderReason(ender) });

  // Minutes: hand-edited tasks keep theirs, the others share the rest proportionally.
  const fixed = (t: PlanInputTask) => {
    const v = opts.overrides?.[t.id];
    return v && v > 0 ? Math.max(5, Math.min(240, Math.round(v))) : null;
  };
  const fixedSum = ordered.reduce((n, o) => n + (fixed(o.task) ?? 0), 0);
  const free = ordered.filter((o) => fixed(o.task) === null);
  const freeMinutes = Math.max(0, workMinutes - fixedSum);
  const stepUnit = freeMinutes >= 25 ? 5 : 1;
  const minPer = free.length ? Math.max(5, Math.min(MIN_TASK_MINUTES, Math.floor(freeMinutes / free.length))) : 5;
  const shared = allocateMinutes(
    free.map((o) => taskWeight(o.task)),
    Math.max(freeMinutes, free.length * minPer),
    stepUnit,
    minPer,
  );
  const durations = ordered.map((o) => fixed(o.task) ?? shared[free.indexOf(o)]);

  // Blocks: long tasks are split into parts, so nobody works 90 minutes straight.
  type Block = Omit<PlanTaskStep, 'reason'> & { reason: string };
  const blocks: Block[] = [];
  ordered.forEach((o, idx) => {
    const parts = splitBlock(durations[idx]);
    parts.forEach((m, k) =>
      blocks.push({
        kind: 'task',
        taskId: o.task.id,
        title: o.task.title,
        phase: o.phase,
        minutes: m,
        motivation: o.task.motivation,
        reason: k === 0 ? o.reason : 'Weiter am selben Thema – nach der Pause geht es leichter.',
        deckId: o.task.deckId,
        ...(parts.length > 1 ? { part: k + 1, parts: parts.length } : {}),
        taskMinutes: durations[idx],
      }),
    );
  });

  // Breaks go into the gaps closest to evenly spread points; spare break time makes those breaks longer.
  const workSum = blocks.reduce((n, b) => n + b.minutes, 0);
  const gaps: number[] = []; // cumulative work minutes after block i (for i < last)
  let cum = 0;
  blocks.forEach((b, i) => {
    cum += b.minutes;
    if (i < blocks.length - 1) gaps.push(cum);
  });
  const breakAt = new Map<number, number>(); // gap index -> minutes
  if (plannedBreaks > 0 && gaps.length > 0) {
    const n = Math.min(plannedBreaks, gaps.length);
    for (let k = 1; k <= n; k++) {
      const target = (k * workSum) / (n + 1);
      let best = -1;
      gaps.forEach((g, gi) => {
        if (breakAt.has(gi)) return;
        if (best < 0 || Math.abs(g - target) < Math.abs(gaps[best] - target)) best = gi;
      });
      if (best >= 0) breakAt.set(best, breakUnit);
    }
    // more breaks planned than gaps: the extra minutes make the breaks a bit longer
    let extra = (plannedBreaks - breakAt.size) * breakUnit;
    const keys = [...breakAt.keys()].sort((a, b) => a - b);
    for (let i = 0; extra > 0 && keys.length; i = (i + 1) % keys.length) {
      breakAt.set(keys[i], breakAt.get(keys[i])! + 5);
      extra -= 5;
    }
  } else if (plannedBreaks > 0 && blocks.length) {
    // a single short block: no break needed, the time goes to the work itself
    blocks[0].minutes += plannedBreaks * breakUnit;
    blocks[0].taskMinutes = (blocks[0].taskMinutes ?? 0) + plannedBreaks * breakUnit;
  }

  const steps: PlanStep[] = [];
  blocks.forEach((b, i) => {
    steps.push(b);
    const br = breakAt.get(i);
    if (br) steps.push({ kind: 'break', minutes: br, reason: br > 10 ? 'Längere Pause: kurz raus, etwas essen, bewegen.' : 'Kurz aufstehen, Wasser trinken, Augen entspannen.' });
  });

  // Clock times from the start time.
  const startMin = opts.start ? toMin(opts.start) : null;
  if (startMin !== null) {
    let t = startMin;
    for (const s of steps) {
      s.from = clockText(t);
      t += s.minutes;
      s.to = clockText(t);
    }
  }

  const finalWork = steps.filter((s): s is PlanTaskStep => s.kind === 'task').reduce((n, s) => n + s.minutes, 0);
  const finalBreak = steps.filter((s) => s.kind === 'break').reduce((n, s) => n + s.minutes, 0);
  const overflow = Math.max(0, finalWork + finalBreak - totalMinutes);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const summary =
    ordered.length === 1
      ? `${finalWork} Min. fokussiert an „${first.task.title}“` + (finalBreak > 0 ? ` · inkl. ${finalBreak} Min. Pause` : '')
      : `Einstieg mit „${first.task.title}“ (${durations[0]} Min.), Abschluss mit „${last.task.title}“` + (finalBreak > 0 ? ` · inkl. ${finalBreak} Min. Pause` : '');

  return {
    totalMinutes: finalWork + finalBreak,
    workMinutes: finalWork,
    breakMinutes: finalBreak,
    steps,
    parked,
    overflow,
    summary,
  };
}
