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
};

export type PlanBreakStep = {
  kind: 'break';
  minutes: number;
  reason: string;
};

export type PlanStep = PlanTaskStep | PlanBreakStep;

export type WorkPlan = {
  totalMinutes: number;
  workMinutes: number;
  breakMinutes: number;
  steps: PlanStep[];
  parked: PlanInputTask[];
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

/**
 * Builds a complete work plan for the given tasks and total available minutes.
 */
export function buildWorkPlan(rawTasks: PlanInputTask[], rawMinutes: number, withBreaks = true): WorkPlan {
  const tasks = rawTasks.filter((t) => t.title.trim().length > 0).map((t) => ({ ...t, title: t.title.trim() }));
  const totalMinutes = Math.max(10, Math.min(480, Math.round(rawMinutes || 60)));

  if (tasks.length === 0) {
    return {
      totalMinutes,
      workMinutes: totalMinutes,
      breakMinutes: 0,
      steps: [],
      parked: [],
      summary: 'Füge mindestens eine Aufgabe hinzu, um deinen Arbeitsplan zu erstellen.',
    };
  }

  // Decide break budget: 5 min per ~40 min session when >= 45 min and breaks enabled.
  const plannedBreaks = withBreaks && totalMinutes >= 45 ? Math.min(4, Math.floor((totalMinutes - 15) / 40)) : 0;
  const breakUnit = totalMinutes >= 150 ? 10 : 5;
  const breakMinutes = plannedBreaks * breakUnit;
  const workMinutes = Math.max(10, totalMinutes - breakMinutes);

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

  // Allocate minutes proportionally.
  const stepUnit = workMinutes >= 25 ? 5 : 1;
  const minPer = Math.min(MIN_TASK_MINUTES, Math.floor(workMinutes / ordered.length));
  const durations = allocateMinutes(
    ordered.map((o) => taskWeight(o.task)),
    workMinutes,
    stepUnit,
    Math.max(5, minPer),
  );

  // Build steps and interleave breaks roughly evenly across the session.
  const steps: PlanStep[] = [];
  let breaksLeft = plannedBreaks;
  let sinceBreak = 0;
  const breakThreshold = breaksLeft > 0 ? Math.max(25, Math.floor(workMinutes / (breaksLeft + 1))) : Infinity;

  ordered.forEach((o, idx) => {
    const mins = durations[idx];
    steps.push({
      kind: 'task',
      taskId: o.task.id,
      title: o.task.title,
      phase: o.phase,
      minutes: mins,
      motivation: o.task.motivation,
      reason: o.reason,
      deckId: o.task.deckId,
    });
    sinceBreak += mins;
    const isLast = idx === ordered.length - 1;
    if (!isLast && breaksLeft > 0 && sinceBreak >= breakThreshold) {
      steps.push({
        kind: 'break',
        minutes: breakUnit,
        reason: 'Kurz aufstehen, Wasser trinken, Augen entspannen.',
      });
      breaksLeft--;
      sinceBreak = 0;
    }
  });

  // If a planned break wasn't placed (e.g. only 1 long task), fold its minutes back into the task or insert mid-break.
  const actualBreakMinutes = steps.filter((s) => s.kind === 'break').reduce((n, s) => n + s.minutes, 0);
  const leftoverBreak = breakMinutes - actualBreakMinutes;
  if (leftoverBreak > 0) {
    const firstTask = steps.find((s): s is PlanTaskStep => s.kind === 'task');
    if (firstTask) firstTask.minutes += leftoverBreak;
  }

  const finalWorkMinutes = steps.filter((s): s is PlanTaskStep => s.kind === 'task').reduce((n, s) => n + s.minutes, 0);
  const summary =
    ordered.length === 1
      ? `${finalWorkMinutes} Min. fokussiert an „${ordered[0].task.title}“`
      : `Einstieg mit „${ordered[0].task.title}“ (${durations[0]} Min.), Abschluss mit „${ordered[ordered.length - 1].task.title}“` +
        (actualBreakMinutes > 0 ? ` · inkl. ${actualBreakMinutes} Min. Pause` : '');

  return {
    totalMinutes: finalWorkMinutes + actualBreakMinutes,
    workMinutes: finalWorkMinutes,
    breakMinutes: actualBreakMinutes,
    steps,
    parked,
    summary,
  };
}
