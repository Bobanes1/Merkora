/** Progress of AI jobs for the status in the sidebar: step, parts done, and a time estimate from earlier jobs. */
import { runProgress } from './jobs';
import type { Job, JobKind } from './store';

export const JOB_STEPS = ['Wartet', 'KI arbeitet', 'Fertig'] as const;
/** 0 = waiting, 1 = working, 2 = done (or failed). */
export const jobStep = (j: Job) => (j.status === 'queued' ? 0 : j.status === 'running' ? 1 : 2);

/** Rough times (s) until there is enough own history. */
const DEFAULT_SECONDS: Record<JobKind, number> = { cards: 90, summary: 60, quiz: 45, practice: 60, podcast: 55 };

/** Typical duration (s) of a job of this kind: the median of the last 10 finished ones. */
export function typicalSeconds(jobs: Job[], kind: JobKind): number {
  const times = jobs
    .filter((j) => j.kind === kind && j.status === 'done' && j.finishedAt && j.finishedAt > j.createdAt)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, 10)
    .map((j) => ((j.finishedAt ?? 0) - j.createdAt) / 1000)
    .sort((a, b) => a - b);
  if (times.length < 2) return DEFAULT_SECONDS[kind];
  const m = Math.floor(times.length / 2);
  return Math.round(times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2);
}

/** „noch ca. 2 Min.“ – or a calm note when it takes longer than usual. */
export function etaText(job: Job, jobs: Job[], now = Date.now()): string {
  if (job.status === 'done') return 'fertig';
  if (job.status === 'error') return 'Fehler';
  const left = typicalSeconds(jobs, job.kind) - (now - job.createdAt) / 1000;
  if (left <= 0) return 'dauert etwas länger als üblich';
  if (left < 60) return 'noch weniger als 1 Min.';
  return `noch ca. ${Math.round(left / 60)} Min.`;
}

/**
 * Overall progress of what is going on right now (0–1). A card run over several parts counts each part
 * (with runProgress from jobs.ts); a running job adds its elapsed share of the typical time.
 */
export function overallProgress(jobs: Job[], now = Date.now()): { done: number; total: number; share: number } {
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  if (!active.length) return { done: 0, total: 0, share: 1 };
  const seenRuns = new Set<string>();
  let done = 0;
  let total = 0;
  for (const j of active) {
    const run = runProgress(jobs, j);
    const key = run ? String((j.params as { run?: string }).run) : j.id;
    if (seenRuns.has(key)) continue;
    seenRuns.add(key);
    done += run ? run.done : 0;
    total += run ? run.n : 1;
  }
  const working = active
    .filter((j) => j.status === 'running')
    .reduce((n, j) => n + Math.min(0.9, (now - j.createdAt) / 1000 / typicalSeconds(jobs, j.kind)), 0);
  return { done, total, share: Math.min(0.97, (done + working) / total) };
}
