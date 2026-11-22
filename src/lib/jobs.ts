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
  AiFormatError,
  cardsPrompt,
  completeJson,
  curatePrompt,
  makeQuiz,
  makeSummary,
  materialFrom,
  SUMMARY_ONE_GO,
  parseCardsInfo,
  parseJson,
  parseQuiz,
  parseSummary,
  pollRemote,
  quizPrompt,
  remoteModeFor,
  RemoteUnsupported,
  runCards,
  runPrompt,
  startRemote,
  withSlideImages,
  type AiCard,
  summaryPrompt,
  type Prompt,
  type RemoteMode,
} from './ai';
import { withGraphics } from './graphics';
import { parsePractice, practicePrompt, type PracticeKind } from './practice';
import { renderSlides, slidesInPart } from './slideImages';
import { deckFileBlob } from './deckFiles';
import { avoidList, dropDuplicates } from './chunks';
import { cardFrontText } from './content';
import { addCards, addJob, deleteCard, getState, patchJob, subscribe, updateDeck, type Deck, type Job, type JobKind } from './store';
import { applyCuration, uncovered } from './cardCount';

export const JOB_LABEL: Record<JobKind, string> = {
  summary: 'Zusammenfassung',
  quiz: 'Quiz',
  cards: 'Karteikarten',
  practice: 'Übungsaufgaben',
};
/** Verb that fits the job's name ("Karteikarten werden …", "Zusammenfassung wird …"). */
export const JOB_VERB: Record<JobKind, { is: string; could: string }> = {
  summary: { is: 'wird', could: 'konnte' },
  quiz: { is: 'wird', could: 'konnte' },
  cards: { is: 'werden', could: 'konnten' },
  practice: { is: 'werden', could: 'konnten' },
};
export const JOB_TAB: Record<JobKind, string> = { summary: 'summary', quiz: 'quiz', cards: 'cards', practice: 'practice' };

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
function promptFor(job: Job, deck: Deck, slides: string[] = []): Prompt {
  const p = job.params as { count?: number; minutes?: number; focus?: string; text?: string; graphics?: boolean };
  switch (job.kind) {
    case 'summary':
      return summaryPrompt(materialFrom(deck.source, deck.cards));
    case 'quiz':
      return quizPrompt(materialFrom(deck.source, deck.cards), p.count ?? 8);
    case 'practice':
      return practicePrompt(materialFrom(deck.source, deck.cards), ((job.params as { type?: PracticeKind }).type ?? 'auto') as PracticeKind, p.count ?? 8);
    case 'cards': {
      const cp = job.params as CardParams;
      const part = cp.part;
      const n = part?.n ?? 1;
      // a continuation, a second try or a later part: the questions already in the deck are not repeated
      const avoid = cp.more || cp.few || cp.gaps || (part && n > 1) ? avoidList(avoidFronts(deck.cards, cp.run)) : [];
      const info =
        n > 1 || cp.more || cp.few || cp.topics?.length || cp.gaps?.length
          ? { i: part?.i ?? 1, n, avoid, ...(cp.more ? { more: true } : {}), ...(cp.few ? { few: true } : {}), ...(cp.topics?.length ? { topics: cp.topics } : {}), ...(cp.gaps?.length ? { gaps: cp.gaps } : {}) }
          : undefined;
      return cardsPrompt(p.text || deck.source, p.count ?? 0, p.focus ?? '', !!p.graphics, info, !!cp.figureSet, slides);
    }
  }
}

/**
 * Card jobs: long material is split into parts, each part is its own job. Up to MAX_PARALLEL parts run at
 * the same time (much faster than one after another); cards that two parts both made are dropped when added.
 * An answer cut off at the length limit gets a continuation for the rest of its part.
 */
type CardParams = {
  text?: string;
  count?: number;
  focus?: string;
  graphics?: boolean;
  /** PDF slides with figures of this run (lib/figureFiles.ts) – the AI may name one per card. */
  figureSet?: string;
  /** Send pictures of the marked slides of this part (the PDFs are stored with the deck). */
  slideImages?: boolean;
  part?: { i: number; n: number };
  /** All jobs of one "Mit KI erstellen" (for the final message). */
  run?: string;
  /** Continuation number (the previous answer for this part was cut off). */
  more?: number;
  /** Second try because a long part gave very few cards. */
  few?: boolean;
  /** The part's topic list (from its first answer) – continuations number their cards by it. */
  topics?: string[];
  /** Topics of the part that got no card – this job makes cards for exactly those. */
  gaps?: string[];
};

/** Parts that run at the same time. */
export const MAX_PARALLEL = 3;
/** Continuations per part at most. */
const MAX_MORE = 3;

/** Starts card creation for one or several parts (several run side by side, without repeating cards). */
export function startCardJobs(deck: Deck, parts: string[], o: { counts: number[]; focus: string; graphics: boolean; figureSet?: string; slideImages?: boolean }) {
  if (!parts.length) return;
  const n = parts.length;
  const run = Math.random().toString(36).slice(2, 10);
  let first: Job | undefined;
  parts.forEach((text, k) => {
    const params: CardParams = {
      text,
      count: o.counts[k] ?? 0,
      focus: o.focus,
      graphics: o.graphics,
      run,
      ...(o.figureSet ? { figureSet: o.figureSet } : {}),
      ...(o.slideImages ? { slideImages: true } : {}),
      ...(n > 1 ? { part: { i: k + 1, n } } : {}),
    };
    const j = addJob({ kind: 'cards', deckId: deck.id, title: partTitle(deck, params), params });
    first ??= j;
  });
  return first;
}
const partTitle = (deck: Deck, p: CardParams) =>
  `${JOB_LABEL.cards}${p.part && p.part.n > 1 ? ` (Teil ${p.part.i}/${p.part.n}${p.more ? ', Fortsetzung' : ''})` : p.more ? ' (Fortsetzung)' : ''} · ${deck.name}`;

/**
 * All parts of one "Mit KI erstellen" (they run side by side): how many there are, how many are done,
 * and when the first started. Null for a single job. Pure – tested.
 */
export function runProgress(jobs: Job[], job: Job): { n: number; done: number; running: number; since: number } | null {
  const run = (job.params as CardParams).run;
  const n = (job.params as CardParams).part?.n ?? 1;
  if (!run || n < 2) return null;
  const mine = jobs.filter((j) => j.kind === 'cards' && (j.params as CardParams).run === run);
  const active = (j: Job) => j.status === 'queued' || j.status === 'running';
  let done = 0;
  let running = 0;
  for (let i = 1; i <= n; i++) {
    const part = mine.filter((j) => (j.params as CardParams).part?.i === i);
    if (part.some((j) => j.status === 'running')) running++;
    // a part counts as done when none of its jobs (also continuations) is still waiting or working
    if (part.length && !part.some(active)) done++;
  }
  return { n, done, running, since: Math.min(...mine.map((j) => j.createdAt)) };
}

/**
 * The questions the AI is told not to repeat: all cards of this run (parts side by side, continuations)
 * and only the most recent earlier cards of the deck – not hundreds of unrelated ones. Pure – tested.
 */
export function avoidFronts(cards: { front: string; back: string; html?: boolean; run?: string }[], run?: string, earlier = 60): string[] {
  const same = run ? cards.filter((c) => c.run === run) : [];
  const others = cards.filter((c) => !run || c.run !== run).slice(-earlier);
  // the run's own questions last: avoidList keeps the end of the list when it has to shorten it
  return [...others, ...same].map((c) => cardFrontText(c as never));
}

/** "12 Karten, davon 4 mit Grafik" */
export const madeText = (n: number, g: number) => `${n} ${n === 1 ? 'Karte' : 'Karten'}${g ? `, davon ${g} mit Grafik` : ''}`;
/** A long part (this many characters) that gives fewer than 2 cards is tried once more. */
export const FEW_CARDS_CHARS = 15000;
/** What happens after a card answer: continue a cut-off part, try a thin result again, or nothing. Pure – tested. */
export function followUp(p: { more?: number; few?: boolean; text?: string; count?: number }, made: number, cut: boolean): 'more' | 'few' | null {
  if (cut && (p.more ?? 0) < MAX_MORE) return 'more';
  if (!cut && !p.more && !p.few && !(p.count ?? 0) && made < 2 && (p.text ?? '').length >= FEW_CARDS_CHARS) return 'few';
  return null;
}

type CardResult = { cards: AiCard[]; cut: boolean; topics?: string[] };

/** The jobs to stop with this one: every still active job of the same run (all parts, continuations, missing topics). Pure – tested. */
export function runJobsToCancel(jobs: Job[], id: string): string[] {
  const job = jobs.find((j) => j.id === id);
  if (!job) return [];
  const run = (job.params as CardParams).run;
  const active = (j: Job) => j.status === 'queued' || j.status === 'running';
  return jobs.filter((j) => active(j) && (j.id === id || (!!run && j.kind === 'cards' && (j.params as CardParams).run === run))).map((j) => j.id);
}

async function applyResult(job: Job, text: string, pre?: CardResult): Promise<{ made: number; graphics: number; cut: boolean; topics: string[]; hits: number[] } | undefined> {
  switch (job.kind) {
    case 'summary':
      updateDeck(job.deckId, { summary: parseSummary(text) });
      break;
    case 'quiz':
      updateDeck(job.deckId, { quiz: parseQuiz(text) });
      break;
    case 'practice': {
      const set = parsePractice(parseJson(text), Math.random().toString(36).slice(2, 10), Date.now());
      if (!set) throw new AiFormatError('Die KI hat keine brauchbaren Aufgaben geliefert. Bitte versuche es noch einmal.');
      updateDeck(job.deckId, (d) => ({ practice: [set, ...(d.practice ?? [])].slice(0, 20) }));
      break;
    }
    case 'cards': {
      const cp = job.params as CardParams;
      // a part of long material may contain nothing exam-relevant (e.g. only the literature list)
      const r = pre ?? parseCardsInfo(text, (!!cp.part && cp.part.n > 1) || !!cp.more || !!cp.few);
      const deck = deckOf(job);
      // parts running side by side may make the same card: keep the first
      // which topics of the part these cards cover (also the ones dropped as duplicates – the topic has a card)
      const hits = r.cards.map((c) => (c as { topic?: number }).topic).filter((x): x is number => Number.isInteger(x));
      const fresh = dropDuplicates(r.cards.map(({ topic: _t, ...c }) => c), deck ? deck.cards.map(cardFrontText) : []);
      const cards = await withGraphics(fresh, cp.figureSet);
      addCards(job.deckId, cp.run ? cards.map((c) => ({ ...c, run: cp.run })) : cards);
      return { made: cards.length, graphics: cards.filter((c) => /data-diagram=|slide-figure|<svg/.test(c.back)).length, cut: r.cut, topics: r.topics ?? [], hits };
    }
  }
  return undefined;
}

/**
 * The last step after long material: the AI names duplicates, too small-grained and unimportant cards of
 * this run, and they are removed (at most 40 %). Returns how many went; a failure keeps all cards.
 */
async function curateRun(deckId: string, run: string, topics: string[] = []): Promise<number> {
  const deck = getState().data.decks.find((d) => d.id === deckId);
  const mine = deck?.cards.filter((c) => c.run === run) ?? [];
  if (mine.length < 12) return 0;
  try {
    const p = curatePrompt(mine.map((c) => ({ front: cardFrontText(c as never), back: c.back })), topics);
    const r = await completeJson<{ drop?: unknown }>(p.system, p.user, p.maxTokens);
    const gone = new Set(applyCuration(mine.length, r?.drop).map((k) => mine[k].id));
    for (const id of gone) deleteCard(deckId, id);
    return gone.size;
  } catch {
    return 0;
  }
}

// ---------- runner ----------
const localRunning = new Set<string>();
/** Requests running in this window, so „Stoppen“ can abort them. */
const aborts = new Map<string, AbortController>();

/**
 * „Stoppen“: this job and every still active job of its run stop – queued ones never start, running ones in
 * this window are aborted, at the provider their answer is ignored. Cards already made stay.
 */
export function cancelRun(id: string) {
  const { jobs, decks } = getState().data;
  const ids = runJobsToCancel(jobs, id);
  for (const j of ids) {
    patchJob(j, { status: 'cancelled', finishedAt: Date.now() });
    aborts.get(j)?.abort();
    aborts.delete(j);
    const t = pollTimers.get(j);
    if (t) clearTimeout(t);
    pollTimers.delete(j);
  }
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  const run = (job.params as CardParams).run;
  const kept = run ? getState().data.jobs.filter((j) => (j.params as CardParams).run === run).reduce((n, j) => n + (j.made ?? 0), 0) : 0;
  const deck = decks.find((d) => d.id === job.deckId);
  pushToast({ text: `Gestoppt${deck ? ` – „${deck.name}“` : ''}${job.kind === 'cards' ? `: ${kept} ${kept === 1 ? 'fertige Karte bleibt' : 'fertige Karten bleiben'}` : ''}.`, ok: true });
}
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;

function deckOf(job: Job) {
  return getState().data.decks.find((d) => d.id === job.deckId);
}

async function finish(job: Job, text: string, pre?: CardResult) {
  // stopped in the meantime: the answer is not used
  if (getState().data.jobs.find((j) => j.id === job.id)?.status === 'cancelled') return;
  const deck = deckOf(job);
  if (!deck) {
    patchJob(job.id, { status: 'error', error: 'Das Deck gibt es nicht mehr.', finishedAt: Date.now() });
    return;
  }
  try {
    const res = await applyResult(job, text, pre);
    patchJob(job.id, {
      status: 'done',
      finishedAt: Date.now(),
      error: undefined,
      ...(res ? { made: res.made, graphics: res.graphics, ...(res.topics.length ? { topics: res.topics } : {}), hits: res.hits } : {}),
    });
    if (job.kind !== 'cards' || !res) {
      const msg = `${JOB_LABEL[job.kind]} für „${deck.name}“ ist fertig.`;
      pushToast({ text: msg, jobId: job.id, ok: true });
      notifyBrowser('Fertig!', msg);
      return;
    }
    const cp = job.params as CardParams;
    const part = cp.part;
    const label = part && part.n > 1 ? `Teil ${part.i} von ${part.n}` : '';
    // the answer was cut off (length limit) or very thin: Merkora asks once more for the rest
    const topics = cp.topics?.length ? cp.topics : res.topics;
    const next = followUp(cp, res.made, res.cut);
    if (next) {
      const params: CardParams = { ...cp, ...(topics.length && !cp.gaps ? { topics } : {}), ...(next === 'more' ? { more: (cp.more ?? 0) + 1 } : { few: true }) };
      addJob({ kind: 'cards', deckId: deck.id, title: partTitle(deck, params), params });
      pushToast({
        text:
          next === 'more'
            ? `${label || 'Karteikarten'}: ${madeText(res.made, res.graphics)} – die Antwort der KI war zu lang, Merkora holt den Rest …`
            : `${label || 'Karteikarten'}: nur ${madeText(res.made, res.graphics)} aus viel Material – Merkora fragt noch einmal nach …`,
        jobId: job.id,
        ok: true,
      });
      return;
    }
    // every topic of the part should have a card: once, the missing ones are asked for
    if (!(cp.count ?? 0) && !cp.gaps && topics.length) {
      const mine = getState().data.jobs.filter((j) => j.kind === 'cards' && (j.id === job.id || (!!cp.run && (j.params as CardParams).run === cp.run && (j.params as CardParams).part?.i === part?.i && !(j.params as CardParams).gaps)));
      const gaps = uncovered(topics, mine.flatMap((j) => (j.id === job.id ? res.hits : (j.hits ?? []))));
      if (gaps.length) {
        const params: CardParams = { ...cp, more: undefined, few: undefined, topics, gaps };
        addJob({ kind: 'cards', deckId: deck.id, title: `${partTitle(deck, cp)} (fehlende Themen)`, params });
        pushToast({ text: `${label || 'Karteikarten'}: ${gaps.length} ${gaps.length === 1 ? 'Thema hat' : 'Themen haben'} noch keine Karte – Merkora ergänzt sie …`, jobId: job.id, ok: true });
        return;
      }
    }
    // other jobs of the same run still working: a short note; the last one sums everything up
    const run = getState().data.jobs.filter((j) => j.kind === 'cards' && (j.params as CardParams).run && (j.params as CardParams).run === cp.run);
    const open = run.filter((j) => j.status === 'queued' || j.status === 'running').length;
    if (cp.run && open > 0) {
      pushToast({ text: `${label || 'Ein Teil'} für „${deck.name}“ ist fertig (${madeText(res.made, res.graphics)}) – noch ${open} ${open === 1 ? 'Teil läuft' : 'Teile laufen'}.`, jobId: job.id, ok: true });
      return;
    }
    const all = cp.run ? run : [{ ...job, made: res.made, graphics: res.graphics }];
    let total = all.reduce((s, j) => s + ((j as Job).made ?? 0), 0);
    // long material in several parts (number left to the AI): sort out duplicates and unimportant cards at the end
    // the topics of all parts (each part's list once), for the message and for sorting out
    const allTopics = all.flatMap((j) => ((j as Job).id === job.id ? (cp.topics?.length || cp.gaps ? [] : res.topics) : ((j as Job).params as CardParams).topics?.length || ((j as Job).params as CardParams).gaps ? [] : ((j as Job).topics ?? [])));
    const sorted = part && part.n > 1 && !(cp.count ?? 0) && cp.run ? await curateRun(deck.id, cp.run, allTopics) : 0;
    total -= sorted;
    const g = all.reduce((s, j) => s + ((j as Job).graphics ?? 0), 0);
    const failed = all.filter((j) => j.status === 'error').length;
    const msg = `${JOB_LABEL.cards} für „${deck.name}“ ${part && part.n > 1 ? `(alle ${part.n} Teile) ` : ''}sind fertig: ${madeText(total, g)}${allTopics.length ? ` zu ${allTopics.length} Themen` : ''}.${
      total === 0 ? ' Im Material wurde nichts Prüfungsrelevantes gefunden.' : ''
    }${sorted ? ` ${sorted} doppelte oder unwichtige Karten aussortiert.` : ''}${failed ? ` ${failed} ${failed === 1 ? 'Teil hat' : 'Teile haben'} nicht geklappt – unter „Aufträge“ nochmal versuchen.` : ''}`;
    pushToast({ text: msg, jobId: job.id, ok: true });
    notifyBrowser('Fertig!', msg);
  } catch (e) {
    fail(job, e);
  }
}

function fail(stale: Job, e: unknown) {
  // the job as it is now (the copy passed in may be older and miss the counted attempts)
  const job = getState().data.jobs.find((j) => j.id === stale.id) ?? stale;
  // stopped: the aborted request is no error
  if (job.status === 'cancelled') return;
  // an unreadable answer: start the job once more by itself before telling the person (at most 2 times)
  if (e instanceof AiFormatError && (job.attempts ?? 0) <= 2) {
    patchJob(job.id, { status: 'queued', error: undefined, remoteId: undefined, mode: undefined });
    // the run that just failed is still being cleaned up – start the new one a moment later
    setTimeout(pump, 1500);
    return;
  }
  const msg = (e as Error).message || 'Unbekannter Fehler';
  patchJob(job.id, { status: 'error', error: msg, finishedAt: Date.now() });
  const deck = deckOf(job);
  const part = (job.params as CardParams).part;
  const which = part && part.n > 1 ? ` (Teil ${part.i} von ${part.n})` : '';
  pushToast({ text: `${JOB_LABEL[job.kind]}${which}${deck ? ` für „${deck.name}“` : ''} konnte nicht erstellt werden: ${msg}`, jobId: job.id, ok: false });
}

/** Runs a failed job again. */
export function retryJob(id: string) {
  patchJob(id, { status: 'queued', error: undefined, finishedAt: undefined, remoteId: undefined, mode: undefined, attempts: 0 });
}

/** The slides of this part that are sent as pictures (empty when switched off or nothing is marked). */
function slidesOf(job: Job, deck: Deck) {
  const p = job.params as CardParams;
  return job.kind === 'cards' && p.slideImages ? slidesInPart(p.text || deck.source) : [];
}

/** The prompt, with pictures of the part's slides from the PDFs stored with the deck. */
async function promptWithSlides(job: Job, deck: Deck): Promise<Prompt> {
  const wanted = slidesOf(job, deck);
  if (!wanted.length) return promptFor(job, deck);
  const byName = async (name: string) => {
    const f = (deckOf(job) ?? deck).files?.find((x) => x.name === name);
    return f ? deckFileBlob(f.id) : null;
  };
  const slides = await renderSlides(wanted, byName);
  return withSlideImages(promptFor(job, deck, slides.map((x) => x.label)), slides);
}

const droppedToasts = new Set<string>();
const imagesDropped = (why: 'rejected' | 'format') => {
  if (droppedToasts.has(why)) return;
  droppedToasts.add(why);
  pushToast({
    text:
      why === 'rejected'
        ? 'Dieses KI-Modell kann keine Bilder lesen – für die Folien wurde nur ihr Text verwendet.'
        : 'Mit Folien-Bildern kam keine lesbare Antwort – Merkora hat es mit dem Text der Folien wiederholt.',
    ok: true,
  });
};

async function runInTab(job: Job, deck: Deck) {
  if (localRunning.has(job.id)) return;
  localRunning.add(job.id);
  patchJob(job.id, { status: 'running', mode: 'tab', attempts: (job.attempts ?? 0) + 1 });
  try {
    if (job.kind === 'cards') {
      const cp = job.params as CardParams;
      const ac = new AbortController();
      aborts.set(job.id, ac);
      const r = await runCards(await promptWithSlides(job, deck), (!!cp.part && cp.part.n > 1) || !!cp.more || !!cp.few || !!cp.gaps, imagesDropped, ac.signal);
      await finish(job, '', r);
    } else if (job.kind === 'summary') {
      await finish(job, await makeSummary(deck.source, deck.cards));
    } else if (job.kind === 'quiz') {
      await finish(job, await makeQuiz(materialFrom(deck.source, deck.cards), (job.params as { count?: number }).count ?? 8));
    } else {
      const text = await runPrompt(await promptWithSlides(job, deck));
      await finish(job, text);
    }
  } catch (e) {
    fail(job, e);
  } finally {
    localRunning.delete(job.id);
    aborts.delete(job.id);
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
  // with slide pictures the job runs here (background modes at the provider would need the pictures stored there)
  // with slide pictures, or a summary of long material (several requests), the job runs here
  const mode = slidesOf(job, deck).length || (job.kind === 'summary' && deck.source.trim().length + deck.cards.length * 120 > SUMMARY_ONE_GO) ? null : remoteModeFor();
  if (mode) {
    localRunning.add(job.id);
    patchJob(job.id, { status: 'running', mode, attempts: (job.attempts ?? 0) + 1 });
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
  // card parts run side by side, but at most MAX_PARALLEL at once
  let busy = data.jobs.filter((j) => j.kind === 'cards' && j.status === 'running').length;
  for (const job of data.jobs) {
    if (job.status === 'queued' && !localRunning.has(job.id)) {
      if (job.kind === 'cards') {
        if (busy >= MAX_PARALLEL) continue;
        busy++;
      }
      void start(job);
    }
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
