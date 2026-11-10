/**
 * Background AI jobs (summary, quiz, podcast script, flashcards).
 * - OpenAI: sent as a "background" response – the provider keeps working even if this window is closed.
 * - Claude: sent as a message batch (when enabled) – same, usually done within a few minutes.
 * - Other providers: run inside this tab while you keep using the site; if the tab is closed
 *   the job restarts automatically the next time the site is opened.
 * Results are saved into the deck as soon as they arrive.
 */
import {
  AiError,
  cardsPrompt,
  materialFrom,
  parseCards,
  parsePodcast,
  parseQuiz,
  parseSummary,
  podcastPrompt,
  pollRemote,
  quizPrompt,
  remoteModeFor,
  RemoteUnsupported,
  runPrompt,
  startRemote,
  summaryPrompt,
  type Prompt,
  type RemoteMode,
} from './ai';
import { withGraphics } from './graphics';
import { addCards, addJob, getState, patchJob, subscribe, updateDeck, type Deck, type Job, type JobKind } from './store';

export const JOB_LABEL: Record<JobKind, string> = {
  summary: 'Zusammenfassung',
  quiz: 'Quiz',
  podcast: 'Podcast-Skript',
  cards: 'Karteikarten',
};
export const JOB_TAB: Record<JobKind, string> = { summary: 'summary', quiz: 'quiz', podcast: 'podcast', cards: 'cards' };

// ---------- toasts ----------
export type Toast = { id: string; text: string; jobId?: string; ok: boolean; /** Link target (e.g. the calendar). */ to?: string; toLabel?: string; /** Stays until closed. */ sticky?: boolean };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
export const getToasts = () => toasts;
export function subscribeToasts(l: () => void) {
  toastListeners.add(l);
  return () => toastListeners.delete(l);
}
export function pushToast(t: Omit<Toast, 'id'>) {
  const toast = { ...t, id: Math.random().toString(36).slice(2) };
  toasts = [...toasts, toast];
  toastListeners.forEach((l) => l());
  if (!t.sticky) setTimeout(() => dismissToast(toast.id), 9000);
}
export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  toastListeners.forEach((l) => l());
}

function notifyBrowser(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden')
      new Notification(title, { body, icon: '/favicon.svg' });
  } catch {
    /* ignore */
  }
}

// ---------- prompts ----------
function promptFor(job: Job, deck: Deck): Prompt {
  const p = job.params as { count?: number; minutes?: number; focus?: string; text?: string; graphics?: boolean };
  switch (job.kind) {
    case 'summary':
      return summaryPrompt(materialFrom(deck.source, deck.cards));
    case 'quiz':
      return quizPrompt(materialFrom(deck.source, deck.cards), p.count ?? 8);
    case 'podcast':
      return podcastPrompt(materialFrom(deck.source, deck.cards, 16000), p.minutes ?? 4);
    case 'cards':
      return cardsPrompt(p.text || deck.source, p.count ?? 15, p.focus ?? '', !!p.graphics);
  }
}

async function applyResult(job: Job, text: string) {
  switch (job.kind) {
    case 'summary':
      updateDeck(job.deckId, { summary: parseSummary(text) });
      break;
    case 'quiz':
      updateDeck(job.deckId, { quiz: parseQuiz(text) });
      break;
    case 'podcast':
      updateDeck(job.deckId, { podcast: parsePodcast(text) });
      break;
    case 'cards':
      addCards(job.deckId, await withGraphics(parseCards(text)));
      break;
  }
}

// ---------- runner ----------
const localRunning = new Set<string>();
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;

function deckOf(job: Job) {
  return getState().data.decks.find((d) => d.id === job.deckId);
}

async function finish(job: Job, text: string) {
  const deck = deckOf(job);
  if (!deck) {
    patchJob(job.id, { status: 'error', error: 'Das Deck gibt es nicht mehr.', finishedAt: Date.now() });
    return;
  }
  try {
    await applyResult(job, text);
    patchJob(job.id, { status: 'done', finishedAt: Date.now(), error: undefined });
    const msg = `${JOB_LABEL[job.kind]} für „${deck.name}“ ist fertig.`;
    pushToast({ text: msg, jobId: job.id, ok: true });
    notifyBrowser('Fertig!', msg);
  } catch (e) {
    fail(job, e);
  }
}

function fail(job: Job, e: unknown) {
  const msg = (e as Error).message || 'Unbekannter Fehler';
  patchJob(job.id, { status: 'error', error: msg, finishedAt: Date.now() });
  const deck = deckOf(job);
  pushToast({ text: `${JOB_LABEL[job.kind]}${deck ? ` für „${deck.name}“` : ''} konnte nicht erstellt werden: ${msg}`, jobId: job.id, ok: false });
}

async function runInTab(job: Job, deck: Deck) {
  if (localRunning.has(job.id)) return;
  localRunning.add(job.id);
  patchJob(job.id, { status: 'running', mode: 'tab', attempts: (job.attempts ?? 0) + 1 });
  try {
    const text = await runPrompt(promptFor(job, deck));
    await finish(job, text);
  } catch (e) {
    fail(job, e);
  } finally {
    localRunning.delete(job.id);
  }
}

function schedulePoll(job: Job, delay: number) {
  if (pollTimers.has(job.id)) return;
  pollTimers.set(
    job.id,
    setTimeout(() => {
      pollTimers.delete(job.id);
      void poll(job.id);
    }, delay),
  );
}

async function poll(id: string) {
  const job = getState().data.jobs.find((j) => j.id === id);
  if (!job || job.status !== 'running' || !job.remoteId || job.mode === 'tab' || !job.mode) return;
  const mode = job.mode as RemoteMode;
  try {
    const text = await pollRemote(mode, job.remoteId, job.id);
    if (text === null) schedulePoll(job, mode === 'openai-bg' ? 3000 : 8000);
    else finish(job, text);
  } catch (e) {
    if (e instanceof AiError) fail(job, e);
    else schedulePoll(job, 15000); // offline for a moment – try again later
  }
}

async function start(job: Job) {
  const deck = deckOf(job);
  if (!deck) return fail(job, new Error('Das Deck gibt es nicht mehr.'));
  const mode = remoteModeFor();
  if (mode) {
    localRunning.add(job.id);
    patchJob(job.id, { status: 'running', mode });
    try {
      const remoteId = await startRemote(mode, promptFor(job, deck), job.id);
      localRunning.delete(job.id);
      patchJob(job.id, { remoteId });
      schedulePoll({ ...job, status: 'running', mode, remoteId }, mode === 'openai-bg' ? 2500 : 6000);
      return;
    } catch (e) {
      localRunning.delete(job.id);
      if (!(e instanceof RemoteUnsupported)) return fail(job, e);
      // Provider/model doesn't support background mode – run it here instead.
    }
  }
  await runInTab(job, deck);
}

function pump() {
  const { data } = getState();
  for (const job of data.jobs) {
    if (job.status === 'queued' && !localRunning.has(job.id)) void start(job);
    else if (job.status === 'running') {
      if (job.remoteId && job.mode !== 'tab') schedulePoll(job, 0);
      else if (!localRunning.has(job.id)) {
        // Was running in a tab that has been closed: start again.
        const deck = deckOf(job);
        if (!deck) fail(job, new Error('Das Deck gibt es nicht mehr.'));
        else if ((job.attempts ?? 0) >= 3) fail(job, new Error('Wurde mehrmals unterbrochen.'));
        else {
          pushToast({ text: `${JOB_LABEL[job.kind]} für „${deck.name}“ wird fortgesetzt …`, ok: true });
          void runInTab(job, deck);
        }
      }
    }
  }
}

/** Starts the job runner once (on app start); resumes jobs from earlier visits. */
export function startJobRunner() {
  if (started) return;
  started = true;
  setTimeout(pump, 300);
  let last = getState().data.jobs;
  subscribe(() => {
    const now = getState().data.jobs;
    if (now !== last) {
      last = now;
      if (now.some((j) => j.status === 'queued')) setTimeout(pump, 0);
    }
  });
  window.addEventListener('online', pump);
}

/** Creates a job; it starts right away in the background. */
export function startJob(kind: JobKind, deck: Deck, params: Record<string, unknown> = {}) {
  return addJob({ kind, deckId: deck.id, title: `${JOB_LABEL[kind]} · ${deck.name}`, params });
}

export const canSurviveClose = () => remoteModeFor() !== null;

export async function askNotifications() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}
