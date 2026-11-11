/**
 * Background AI jobs (summary, quiz, flashcards).
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
  parseQuiz,
  parseSummary,
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
import { avoidList } from './chunks';
import { cardFrontText } from './content';
import { addCards, addJob, getState, patchJob, subscribe, updateDeck, type Deck, type Job, type JobKind } from './store';

export const JOB_LABEL: Record<JobKind, string> = {
  summary: 'Zusammenfassung',
  quiz: 'Quiz',
  cards: 'Karteikarten',
};
export const JOB_TAB: Record<JobKind, string> = { summary: 'summary', quiz: 'quiz', cards: 'cards' };

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
    case 'cards': {
      const part = (job.params as CardParams).part;
      return cardsPrompt(
        p.text || deck.source,
        p.count ?? 0,
        p.focus ?? '',
        !!p.graphics,
        part && part.n > 1 ? { i: part.i, n: part.n, avoid: part.i > 1 ? avoidList(deck.cards.map(cardFrontText)) : [] } : undefined,
      );
    }
  }
}

/**
 * Card jobs for long material run as a chain: each job makes the cards of one part; when it is done,
 * the next part starts with the remaining texts (`rest`) and the share of a fixed count (`counts`).
 */
type CardParams = {
  text?: string;
  count?: number;
  focus?: string;
  graphics?: boolean;
  part?: { i: number; n: number };
  rest?: string[];
  counts?: number[];
};

/** Starts card creation for one or several parts (several = one after another, without repeating cards). */
export function startCardJobs(deck: Deck, parts: string[], o: { counts: number[]; focus: string; graphics: boolean }) {
  if (!parts.length) return;
  const n = parts.length;
  const params: CardParams = {
    text: parts[0],
    count: o.counts[0] ?? 0,
    focus: o.focus,
    graphics: o.graphics,
    ...(n > 1 ? { part: { i: 1, n }, rest: parts.slice(1), counts: o.counts.slice(1) } : {}),
  };
  return addJob({ kind: 'cards', deckId: deck.id, title: partTitle(deck, params), params });
}
const partTitle = (deck: Deck, p: CardParams) =>
  `${JOB_LABEL.cards}${p.part && p.part.n > 1 ? ` (Teil ${p.part.i}/${p.part.n})` : ''} · ${deck.name}`;

/** After a part is done: start the next one. */
function nextPart(job: Job, deck: Deck) {
  const p = job.params as CardParams;
  if (job.kind !== 'cards' || !p.part || !p.rest?.length) return false;
  const params: CardParams = {
    ...p,
    text: p.rest[0],
    count: p.counts?.[0] ?? 0,
    part: { i: p.part.i + 1, n: p.part.n },
    rest: p.rest.slice(1),
    counts: p.counts?.slice(1),
  };
  addJob({ kind: 'cards', deckId: deck.id, title: partTitle(deck, params), params });
  return true;
}

async function applyResult(job: Job, text: string) {
  switch (job.kind) {
    case 'summary':
      updateDeck(job.deckId, { summary: parseSummary(text) });
      break;
    case 'quiz':
      updateDeck(job.deckId, { quiz: parseQuiz(text) });
      break;
    case 'cards': {
      // a part of long material may contain nothing exam-relevant (e.g. only the literature list)
      const part = (job.params as CardParams).part;
      const cards = await withGraphics(parseCards(text, !!part && part.n > 1));
      addCards(job.deckId, cards);
      return cards.length;
    }
  }
  return undefined;
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
    const made = await applyResult(job, text);
    patchJob(job.id, { status: 'done', finishedAt: Date.now(), error: undefined });
    const part = (job.params as CardParams).part;
    const nothing = made === 0 && part ? ` Teil ${part.i} enthielt nichts Prüfungsrelevantes (z. B. nur Literatur) – dafür keine Karten.` : '';
    if (nextPart(job, deck)) {
      pushToast({ text: `Teil ${part!.i} von ${part!.n} für „${deck.name}“ ist fertig – Teil ${part!.i + 1} läuft.${nothing}`, jobId: job.id, ok: true });
      return;
    }
    const msg = `${JOB_LABEL[job.kind]} für „${deck.name}“ ${part && part.n > 1 ? `(alle ${part.n} Teile) ` : ''}${job.kind === 'cards' ? 'sind' : 'ist'} fertig.${nothing}`;
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
  const part = (job.params as CardParams).part;
  const which = part && part.n > 1 ? ` (Teil ${part.i} von ${part.n})` : '';
  pushToast({ text: `${JOB_LABEL[job.kind]}${which}${deck ? ` für „${deck.name}“` : ''} konnte nicht erstellt werden: ${msg}`, jobId: job.id, ok: false });
}

/** Runs a failed job again (for a chain: from the failed part on). */
export function retryJob(id: string) {
  patchJob(id, { status: 'queued', error: undefined, finishedAt: undefined, remoteId: undefined, mode: undefined, attempts: 0 });
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
