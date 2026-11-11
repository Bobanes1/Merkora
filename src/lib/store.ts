import { useSyncExternalStore } from 'react';
import { kvDel, kvGet, kvSet, mediaDeleteMany, mediaKeys } from './db';
import { desktop, isDesktop } from './desktop';
import { capForExam, nextExamAt } from './exams';
import { masterySnapshot, withSnapshot } from './weekly';
import { DEFAULT_NEW_PER_DAY, pickDue, planNewForCourse } from './newCards';
import { newSrs, schedule, setSchedulerOptions, type Rating, type Srs } from './srs';
import { dayKey, uid, uniqueSlug } from './util';

export type Provider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom';

/** A flashcard. With `html` the sides are (sanitised) HTML that may contain images and audio, like Anki cards. */
export type Card = {
  id: string;
  front: string;
  back: string;
  html?: boolean;
  /** Imported Anki cards: id of the note type look (CSS in `Deck.styles`) and the wrapping class (`card card1`). */
  styleId?: string;
  cardClass?: string;
  /** Free tags (also taken over from Anki notes). */
  tags?: string[];
  createdAt: number;
  updatedAt?: number;
  srs: Srs;
};
export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string };
export type MockQuestion = {
  id: string;
  /** mc = multiple choice, short = short answer, open = longer written answer */
  type: 'mc' | 'short' | 'open';
  question: string;
  options?: string[];
  answer?: number;
  points: number;
  solution: string;
  criteria?: string;
};
export type MockResult = {
  perQuestion: Record<string, { points: number; feedback: string }>;
  total: number;
  max: number;
  percent: number;
  grade: string;
  passed: boolean;
  summary: string;
  strengths: string[];
  improve: string[];
};
/** A mock exam ("Probeprüfung") written by the AI for the learner's level. */
export type MockExam = {
  id: string;
  createdAt: number;
  status: 'generating' | 'ready' | 'running' | 'submitted' | 'grading' | 'graded' | 'error';
  error?: string;
  level: string;
  detail: string;
  minutes: number;
  scope: 'deck' | 'course';
  scale: 'ch' | 'de' | 'at' | 'pct';
  title: string;
  instructions: string;
  questions: MockQuestion[];
  answers: Record<string, string | number>;
  startedAt?: number;
  /** Pause: since when it is paused, and how long all earlier pauses took (the clock stops meanwhile). */
  pausedAt?: number;
  pausedMs?: number;
  pauses?: number;
  submittedAt?: number;
  result?: MockResult;
  /** Cards from the mistakes were already created. */
  mistakesLearned?: boolean;
  /** Shared by a friend: their name and (if sent) their result to compare with. */
  friend?: { name: string; grade?: string; percent?: number; passed?: boolean; scale?: string };
};
export type MockHistory = { at: number; title: string; level: string; percent: number; grade: string; passed: boolean; scale: string };
export type PodcastLine = { speaker: 'A' | 'B'; text: string };
export type ChatMsg = { role: 'user' | 'assistant'; content: string };
export type PathResult = { stars: number; best: number; at: number };

export type Deck = {
  id: string;
  courseId: string;
  name: string;
  slug: string;
  createdAt: number;
  /** Last change (used to merge synced copies). */
  updatedAt?: number;
  cards: Card[];
  source: string;
  summary?: string;
  quiz?: QuizQuestion[];
  podcast?: PodcastLine[];
  chat: ChatMsg[];
  /** Learning path: result per level index. */
  path?: Record<string, PathResult>;
  /** CSS of imported Anki note types (colours, fonts, layout), by note type id. */
  styles?: Record<string, string>;
  /** Folder inside the course (see `Course.folders`); none = directly in the course. */
  folderId?: string;
  /** Extra new cards allowed today ("Heute mehr neue Karten"). */
  newBoost?: { day: string; n: number };
  /** Current mock exam and earlier results. */
  mockExam?: MockExam;
  mockHistory?: MockHistory[];
};
/** A folder inside a course that groups decks. */
export type Folder = { id: string; name: string };
export type Course = { id: string; workspaceId: string; name: string; slug: string; folders?: Folder[] };
export type Workspace = { id: string; name: string; slug: string };
export type Review = { deckId: string; cardId: string; at: number; rating: Rating };
/** An exam date linked to the decks it covers. */
export type Exam = {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (optional) */
  time?: string;
  deckIds: string[];
  note?: string;
  createdAt: number;
  updatedAt?: number;
};

export type JobKind = 'summary' | 'quiz' | 'cards';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type Job = {
  id: string;
  kind: JobKind;
  deckId: string;
  title: string;
  status: JobStatus;
  createdAt: number;
  finishedAt?: number;
  error?: string;
  /** Where the work happens: on the provider's servers (survives closing the window) or in this tab. */
  mode?: 'openai-bg' | 'anthropic-batch' | 'tab';
  remoteId?: string;
  params: Record<string, unknown>;
  seen?: boolean;
  attempts?: number;
};

export type Game = {
  xpByDay: Record<string, number>;
  dailyGoal: number;
  /** Study minutes per day (YYYY-MM-DD). */
  minutesByDay?: Record<string, number>;
  /** Mastery per deck, one snapshot per day (for the weekly review). */
  masterySnaps?: Record<string, Record<string, number>>;
  /** Week (its Sunday) whose review was closed. */
  weekSeen?: string;
};

export type Settings = {
  provider: Provider;
  model: string;
  baseUrl: string;
  setupDone: boolean;
  /** Anthropic: use the Message Batches API so work continues after the window is closed. */
  claudeBatch: boolean;
  /** Characters and animations. */
  animations: boolean;
  /** Colour scheme. */
  theme: 'system' | 'light' | 'dark';
  /** New cards per course and day, shared by its decks (the rest waits for the next days). */
  newPerDay: number;
  /** Planning: FSRS (like Anki 23+) instead of the classic intervals, with the desired chance to still know a card. */
  fsrs?: boolean;
  retention?: number;
  /** Mock exams: education level, subject/semester and grading scale (asked once, then prefilled). */
  eduLevel?: string;
  eduDetail?: string;
  gradeScale?: 'ch' | 'de' | 'at' | 'pct';
  /** Name shown to friends when sharing a deck. */
  shareName?: string;
  /** Daily reminder at a time of day (HH:MM). */
  reminderOn: boolean;
  reminderTime: string;
  /** Desktop: keep running in the tray when the window is closed. */
  trayOnClose: boolean;
  /** Pomodoro phases in minutes. */
  pomodoroWork: number;
  pomodoroBreak: number;
  /** Use a different AI model for the chat (tutor, explanations, grading) than for generating content. */
  chatSeparate: boolean;
  chatProvider: Provider;
  chatModel: string;
  chatBaseUrl: string;
};

export type Data = {
  version: 2;
  workspaces: Workspace[];
  courses: Course[];
  decks: Deck[];
  reviews: Review[];
  settings: Settings;
  game: Game;
  jobs: Job[];
  /** Exam dates (calendar). */
  exams: Exam[];
  /** Deleted ids with time – so a sync doesn't bring them back. */
  deleted?: Record<string, number>;
  /** When this copy was last saved (to pick the newest copy on start). */
  savedAt?: number;
};

export type Consent = 'unset' | 'all' | 'none' | 'custom';
export type Privacy = { consent: Consent; keepData: boolean; keepKey: boolean };

const DATA_KEY = 'merkora.data';
const KEY_KEY = 'merkora.apikey';
const CHAT_KEY_KEY = 'merkora.chatkey';
const PRIVACY_KEY = 'merkora.privacy';
const OLD = { data: 'lernblitz.data', key: 'lernblitz.apikey', privacy: 'lernblitz.privacy' };

function safeGet(store: Storage, k: string): string | null {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(store: Storage, k: string, v: string | null): boolean {
  try {
    if (v === null) store.removeItem(k);
    else store.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

const defaultSettings = (): Settings => ({
  provider: 'openai',
  model: '',
  baseUrl: '',
  setupDone: false,
  claudeBatch: true,
  animations: true,
  theme: 'system',
  newPerDay: DEFAULT_NEW_PER_DAY,
  fsrs: true,
  retention: 0.9,
  reminderOn: true,
  reminderTime: '18:00',
  trayOnClose: false,
  pomodoroWork: 25,
  pomodoroBreak: 5,
  chatSeparate: false,
  chatProvider: 'openrouter',
  chatModel: '',
  chatBaseUrl: '',
});

const SAMPLE_PAIRS: [string, string][] = [
  ['Was ist verteiltes Lernen (Spaced Repetition)?', 'Wiederholen in wachsenden Abständen, kurz bevor man etwas vergessen würde.'],
  ['Was beschreibt die Vergessenskurve?', 'Wie schnell Gelerntes ohne Wiederholung verloren geht – anfangs schnell, dann langsamer.'],
  ['Was ist aktives Erinnern (Active Recall)?', 'Wissen aus dem Gedächtnis abrufen, statt es nur noch einmal zu lesen.'],
  ['Warum helfen Karteikarten beim Lernen?', 'Sie zwingen zum aktiven Erinnern und lassen sich gezielt wiederholen.'],
  ['Was bedeutet „Interleaving“?', 'Verschiedene Themen oder Aufgabentypen beim Üben abwechseln.'],
  ['Was ist die Feynman-Methode?', 'Ein Thema so einfach erklären, als würde man es einem Kind beibringen – Lücken werden sichtbar.'],
  ['Wie lang sollte eine Lerneinheit nach der Pomodoro-Technik sein?', 'Etwa 25 Minuten konzentriert lernen, dann 5 Minuten Pause.'],
  ['Was ist der Testeffekt?', 'Sich selbst abzufragen festigt Wissen stärker als erneutes Lesen.'],
  ['Was ist Elaboration beim Lernen?', 'Neues Wissen mit Bekanntem verknüpfen, indem man sich fragt, wie und warum etwas zusammenhängt.'],
  ['Was ist die Loci-Methode?', 'Lernstoff gedanklich an bekannten Orten ablegen, z. B. entlang eines Wegs durch die eigene Wohnung.'],
];

function sampleData(): Data {
  const now = Date.now();
  const ws: Workspace = { id: uid(), name: 'Erster Workspace', slug: 'erster-workspace' };
  const course: Course = { id: uid(), workspaceId: ws.id, name: 'Erster Kurs', slug: 'erster-kurs' };
  // All sample cards start fresh: no learning progress.
  const cards: Card[] = SAMPLE_PAIRS.map(([front, back]) => ({ id: uid(), front, back, createdAt: now, srs: newSrs(now) }));
  const deck: Deck = {
    id: uid(),
    courseId: course.id,
    name: 'Mein erstes Deck',
    slug: 'mein-erstes-deck',
    createdAt: now,
    cards,
    source:
      'Lerntechniken im Überblick\n\nVerteiltes Lernen (Spaced Repetition) bedeutet, Lernstoff in wachsenden Abständen zu wiederholen. ' +
      'Die Vergessenskurve zeigt, dass wir Neues ohne Wiederholung schnell vergessen. Aktives Erinnern – also das Abrufen aus dem Gedächtnis – ' +
      'festigt Wissen stärker als erneutes Lesen (Testeffekt). Interleaving mischt verschiedene Themen beim Üben. Die Feynman-Methode deckt ' +
      'Wissenslücken auf, indem man ein Thema ganz einfach erklärt. Die Pomodoro-Technik teilt Lernzeit in 25-Minuten-Blöcke mit kurzen Pausen. ' +
      'Elaboration verknüpft Neues mit Bekanntem, die Loci-Methode legt Wissen gedanklich an vertrauten Orten ab.',
    chat: [],
  };
  return {
    version: 2,
    workspaces: [ws],
    courses: [course],
    decks: [deck],
    reviews: [],
    settings: defaultSettings(),
    game: { xpByDay: {}, dailyGoal: 50 },
    jobs: [],
    exams: [],
  };
}

/** Models that turned out unusable are replaced by their successor. */
const RETIRED_MODELS: Record<string, string> = { 'nvidia/nemotron-3-ultra-550b-a55b:free': 'nvidia/nemotron-3.5-super-vl:free' };
const migrateSettings = (s: Settings): Settings => ({
  ...s,
  model: RETIRED_MODELS[s.model] ?? s.model,
  chatModel: RETIRED_MODELS[s.chatModel] ?? s.chatModel,
});

/** Brings older saved data up to date. */
function normalize(raw: unknown): Data | null {
  const d = raw as Partial<Data> & { version?: number };
  if (!d || typeof d !== 'object' || !Array.isArray(d.decks)) return null;
  const base = sampleData();
  let decks = d.decks as Deck[];
  let reviews = (d.reviews as Review[]) ?? [];
  if ((raw as { version?: number }).version === 1) {
    // Version 1 shipped the sample deck with made-up progress – start it fresh.
    const now = Date.now();
    const sample = decks.find((x) => x.slug === 'mein-erstes-deck');
    if (sample) {
      decks = decks.map((x) => (x === sample ? { ...x, cards: x.cards.map((c) => ({ ...c, srs: newSrs(now) })) } : x));
      reviews = reviews.filter((r) => r.deckId !== sample.id);
    }
  }
  return {
    version: 2,
    workspaces: d.workspaces ?? [],
    courses: d.courses ?? [],
    decks: decks.map((x) => ({ ...x, chat: x.chat ?? [], source: x.source ?? '', cards: x.cards ?? [] })),
    reviews,
    settings: migrateSettings({ ...base.settings, ...(d.settings ?? {}) }),
    game: { ...base.game, ...(d.game ?? {}) },
    // the podcast feature is paused – its unfinished jobs are dropped
    jobs: (d.jobs ?? []).filter((j) => (j.kind as string) !== 'podcast'),
    exams: d.exams ?? [],
    deleted: d.deleted ?? {},
    savedAt: d.savedAt,
  };
}

// Desktop app (Tauri/Rust): learning data is also written to a save file with daily backups.
export { desktop, isDesktop } from './desktop';

function loadPrivacy(): Privacy {
  const raw = safeGet(localStorage, PRIVACY_KEY) ?? safeGet(localStorage, OLD.privacy);
  // The learning progress is always saved automatically on this device (the core of the app).
  if (isDesktop) return { consent: 'all', keepKey: true, ...(raw ? safeParse(raw) : {}), keepData: true } as Privacy;
  if (raw) {
    const p = safeParse(raw);
    if (p) return { consent: 'unset', keepKey: false, ...p, keepData: true };
  }
  return { consent: 'unset', keepData: true, keepKey: false };
}
function safeParse(raw: string): Partial<Privacy> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let privacy: Privacy = loadPrivacy();
let data: Data = sampleData();
let apiKey = '';
let chatKey = '';
let storageWarning = '';
let savedAt = 0;

type Snapshot = { data: Data; apiKey: string; chatKey: string; privacy: Privacy; storageWarning: string; savedAt: number };
let snapshot: Snapshot = { data, apiKey, chatKey, privacy, storageWarning, savedAt };
const listeners = new Set<() => void>();

/** Loads saved data (desktop save file, IndexedDB, then older browser-storage copies). Call once before rendering. */
export async function initStore() {
  apiKey =
    safeGet(localStorage, KEY_KEY) ?? safeGet(sessionStorage, KEY_KEY) ?? safeGet(localStorage, OLD.key) ?? safeGet(sessionStorage, OLD.key) ?? '';
  chatKey = safeGet(localStorage, CHAT_KEY_KEY) ?? safeGet(sessionStorage, CHAT_KEY_KEY) ?? '';
  let loaded: Data | null = null;
  let fromIdb: Data | null = null;
  try {
    fromIdb = normalize(await kvGet(DATA_KEY));
  } catch {
    /* IndexedDB blocked */
  }
  if (desktop) {
    try {
      const raw = await desktop.loadData();
      const fromFile = raw ? normalize(JSON.parse(raw)) : null;
      // Desktop app: the save file is the only source of truth. The browser copy is only used once,
      // when there is no save file yet (e.g. data from before the save file existed).
      loaded = fromFile ?? fromIdb;
      // Remove the old browser copy so it can never be mixed up with the save file again.
      if (fromFile && fromIdb) void kvDel(DATA_KEY).catch(() => undefined);
    } catch {
      loaded = fromIdb;
    }
  } else loaded = fromIdb;
  if (!loaded) {
    const raw = safeGet(sessionStorage, DATA_KEY) ?? safeGet(localStorage, OLD.data) ?? safeGet(sessionStorage, OLD.data);
    if (raw) {
      try {
        loaded = normalize(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }
  data = loaded ?? sampleData();
  safeSet(localStorage, OLD.data, null);
  safeSet(sessionStorage, OLD.data, null);
  safeSet(localStorage, OLD.key, null);
  safeSet(sessionStorage, OLD.key, null);
  safeSet(localStorage, OLD.privacy, null);
  emit();
  if (privacy.keepData) void collectMediaGarbage();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedData: Data | null = null;
/** Saves the learning data right away (automatic, a moment after every change). */
function persistNow(sync = false) {
  saveTimer = null;
  if (data === lastSavedData) return;
  const stamped: Data = { ...data, savedAt: Date.now() };
  lastSavedData = data;
  const done = () => {
    setWarning('');
    setSaved(stamped.savedAt!);
  };
  const failed = () => setWarning('Dein Lernstand konnte gerade nicht gespeichert werden (Speicher voll oder blockiert). Lade zur Sicherheit eine Sicherung herunter.');
  let pending: Promise<unknown> = Promise.resolve();
  if (desktop) {
    const json = JSON.stringify(stamped);
    pending = (sync ? desktop.saveDataNow(json) : desktop.saveData(json)).then(done, failed);
  }
  // In the desktop app the save file (with daily backups) is the store; no second copy in the browser storage.
  if (!desktop) kvSet(DATA_KEY, stamped).then(done, failed);
  safeSet(sessionStorage, DATA_KEY, null);
  return pending;
}
function setWarning(w: string) {
  if (w === storageWarning) return;
  storageWarning = w;
  snapshot = { ...snapshot, storageWarning };
  listeners.forEach((l) => l());
}
function setSaved(t: number) {
  savedAt = t;
  snapshot = { ...snapshot, savedAt };
  listeners.forEach((l) => l());
}
export function flush(): Promise<unknown> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    return persistNow(true) ?? Promise.resolve();
  }
  return Promise.resolve();
}
// Safety net: save at least every 30 seconds while the app is open.
if (typeof window !== 'undefined') setInterval(() => persistNow(), 30000);
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());
  // Desktop app: the window waits for the last save before it closes.
  desktop?.onClose(() => flush().then(() => undefined));
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
  safeSet(privacy.keepKey ? localStorage : sessionStorage, KEY_KEY, apiKey || null);
  safeSet(privacy.keepKey ? sessionStorage : localStorage, KEY_KEY, null);
  safeSet(privacy.keepKey ? localStorage : sessionStorage, CHAT_KEY_KEY, chatKey || null);
  safeSet(privacy.keepKey ? sessionStorage : localStorage, CHAT_KEY_KEY, null);
  if (privacy.consent !== 'unset') safeSet(localStorage, PRIVACY_KEY, JSON.stringify(privacy));
}

function emit() {
  setSchedulerOptions({ fsrs: !!data.settings.fsrs, retention: data.settings.retention ?? 0.9 });
  snapshot = { data, apiKey, chatKey, privacy, storageWarning, savedAt };
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getState = () => snapshot;

export function useStore<T>(sel: (s: Snapshot) => T): T {
  return useSyncExternalStore(subscribe, () => sel(snapshot));
}
export const useData = () => useStore((s) => s.data);

export function update(fn: (d: Data) => Data) {
  data = fn(data);
  emit();
}

// ---------- privacy & key ----------
export function setPrivacy(p: Partial<Privacy>) {
  privacy = { ...privacy, ...p };
  emit();
}
export function setApiKey(k: string) {
  apiKey = k.trim();
  emit();
}
/** Key for the chat model when it uses a different provider than the generation model. */
export function setChatKey(k: string) {
  chatKey = k.trim();
  emit();
}
export function setSettings(s: Partial<Settings>) {
  update((d) => ({ ...d, settings: { ...d.settings, ...s } }));
}

function tomb(d: Data, ids: string[]) {
  const now = Date.now();
  const out = { ...(d.deleted ?? {}) };
  for (const id of ids) out[id] = now;
  return out;
}

/** Puts merged (synced) data in place, keeping this device's settings and running jobs. */
export function applySynced(next: Data) {
  update((d) => ({ ...next, settings: d.settings, jobs: d.jobs }));
}

// ---------- library ----------
export function addWorkspace(name: string): Workspace {
  const w: Workspace = { id: uid(), name, slug: uniqueSlug(name, data.workspaces.map((x) => x.slug)) };
  update((d) => ({ ...d, workspaces: [...d.workspaces, w] }));
  return w;
}
export function addCourse(workspaceId: string, name: string): Course {
  const taken = data.courses.filter((c) => c.workspaceId === workspaceId).map((c) => c.slug);
  const c: Course = { id: uid(), workspaceId, name, slug: uniqueSlug(name, taken) };
  update((d) => ({ ...d, courses: [...d.courses, c] }));
  return c;
}
export function addDeck(courseId: string, name: string, extra: Partial<Deck> = {}): Deck {
  const taken = data.decks.filter((x) => x.courseId === courseId).map((x) => x.slug);
  const deck: Deck = {
    id: uid(),
    courseId,
    name,
    slug: uniqueSlug(name, taken),
    createdAt: Date.now(),
    cards: [],
    source: '',
    chat: [],
    ...extra,
  };
  update((d) => ({ ...d, decks: [...d.decks, deck] }));
  return deck;
}
export function renameWorkspace(id: string, name: string) {
  update((d) => ({ ...d, workspaces: d.workspaces.map((w) => (w.id === id ? { ...w, name } : w)) }));
}
export function renameCourse(id: string, name: string) {
  update((d) => ({ ...d, courses: d.courses.map((c) => (c.id === id ? { ...c, name } : c)) }));
}
export function deleteWorkspace(id: string) {
  const courseIds = data.courses.filter((c) => c.workspaceId === id).map((c) => c.id);
  const deckIds = data.decks.filter((x) => courseIds.includes(x.courseId)).map((x) => x.id);
  update((d) => ({
    ...d,
    workspaces: d.workspaces.filter((w) => w.id !== id),
    courses: d.courses.filter((c) => c.workspaceId !== id),
    decks: d.decks.filter((x) => !courseIds.includes(x.courseId)),
    deleted: tomb(d, [id, ...courseIds, ...deckIds]),
  }));
}
// ---------- folders inside courses ----------
export function addFolder(courseId: string, name: string): Folder {
  const f: Folder = { id: uid(), name };
  update((d) => ({ ...d, courses: d.courses.map((c) => (c.id === courseId ? { ...c, folders: [...(c.folders ?? []), f] } : c)) }));
  return f;
}
export function renameFolder(courseId: string, folderId: string, name: string) {
  update((d) => ({
    ...d,
    courses: d.courses.map((c) => (c.id === courseId ? { ...c, folders: (c.folders ?? []).map((f) => (f.id === folderId ? { ...f, name } : f)) } : c)),
  }));
}
/** Removes the folder; its decks stay in the course. */
export function deleteFolder(courseId: string, folderId: string) {
  update((d) => ({
    ...d,
    courses: d.courses.map((c) => (c.id === courseId ? { ...c, folders: (c.folders ?? []).filter((f) => f.id !== folderId) } : c)),
    decks: d.decks.map((x) => (x.folderId === folderId ? { ...x, folderId: undefined, updatedAt: Date.now() } : x)),
  }));
}
/** Moves a deck into a folder (or to the course itself) – optionally into another course. */
export function moveDeck(deckId: string, folderId: string | undefined, courseId?: string) {
  update((d) => {
    const deck = d.decks.find((x) => x.id === deckId);
    if (!deck) return d;
    const target = courseId ?? deck.courseId;
    const taken = d.decks.filter((x) => x.courseId === target && x.id !== deckId).map((x) => x.slug);
    const slug = target === deck.courseId ? deck.slug : uniqueSlug(deck.name, taken);
    return { ...d, decks: d.decks.map((x) => (x.id === deckId ? { ...x, courseId: target, folderId, slug, updatedAt: Date.now() } : x)) };
  });
}
export function deleteCourse(id: string) {
  const deckIds = data.decks.filter((x) => x.courseId === id).map((x) => x.id);
  update((d) => ({
    ...d,
    courses: d.courses.filter((c) => c.id !== id),
    decks: d.decks.filter((x) => x.courseId !== id),
    deleted: tomb(d, [id, ...deckIds]),
  }));
}
export function deleteDeck(id: string) {
  update((d) => ({
    ...d,
    decks: d.decks.filter((x) => x.id !== id),
    reviews: d.reviews.filter((r) => r.deckId !== id),
    jobs: d.jobs.filter((j) => j.deckId !== id || j.status === 'running'),
    exams: d.exams.map((e) => (e.deckIds.includes(id) ? { ...e, deckIds: e.deckIds.filter((x) => x !== id), updatedAt: Date.now() } : e)),
    deleted: tomb(d, [id]),
  }));
}
export function updateDeck(id: string, patch: Partial<Deck> | ((d: Deck) => Partial<Deck>)) {
  update((d) => ({
    ...d,
    decks: d.decks.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch), updatedAt: Date.now() } : x)),
  }));
}
export type NewCard = { front: string; back: string; html?: boolean; styleId?: string; cardClass?: string; tags?: string[]; srs?: Srs };
export function addCards(deckId: string, pairs: NewCard[]) {
  const now = Date.now();
  const cards: Card[] = pairs.map((p) => ({
    id: uid(),
    front: p.front,
    back: p.back,
    ...(p.html ? { html: true } : {}),
    ...(p.styleId ? { styleId: p.styleId } : {}),
    ...(p.cardClass ? { cardClass: p.cardClass } : {}),
    ...(p.tags?.length ? { tags: p.tags } : {}),
    createdAt: now,
    srs: p.srs ?? newSrs(now),
  }));
  updateDeck(deckId, (x) => ({ cards: [...x.cards, ...cards] }));
}
export function updateCard(deckId: string, cardId: string, patch: Partial<Card>) {
  updateDeck(deckId, (x) => ({ cards: x.cards.map((c) => (c.id === cardId ? { ...c, ...patch, updatedAt: Date.now() } : c)) }));
}
export function deleteCard(deckId: string, cardId: string) {
  updateDeck(deckId, (x) => ({ cards: x.cards.filter((c) => c.id !== cardId) }));
  update((d) => ({ ...d, deleted: tomb(d, [cardId]) }));
}
export function resetProgress(deckId: string) {
  const now = Date.now();
  update((d) => ({
    ...d,
    decks: d.decks.map((x) => (x.id === deckId ? { ...x, path: {}, cards: x.cards.map((c) => ({ ...c, srs: newSrs(now) })) } : x)),
    reviews: d.reviews.filter((r) => r.deckId !== deckId),
  }));
}
export function reviewCard(deckId: string, cardId: string, rating: Rating) {
  const now = Date.now();
  update((d) => ({
    ...d,
    decks: d.decks.map((x) =>
      x.id === deckId
        ? {
            ...x,
            cards: x.cards.map((c) =>
              c.id === cardId
                ? {
                    ...c,
                    srs: {
                      ...capForExam(schedule(c.srs, rating, now), nextExamAt(d, deckId, now), now),
                      // first time studied: counts against today's limit of new cards
                      introduced: c.srs.introduced ?? (c.srs.last === undefined ? now : undefined),
                    },
                  }
                : c,
            ),
          }
        : x,
    ),
    reviews: [...d.reviews, { deckId, cardId, at: now, rating }],
  }));
}

export function logReview(deckId: string, cardId: string, rating: Rating) {
  update((d) => ({ ...d, reviews: [...d.reviews, { deckId, cardId, at: Date.now(), rating }] }));
}

// ---------- exams ----------
export function addExam(e: Omit<Exam, 'id' | 'createdAt'>): Exam {
  const exam: Exam = { ...e, id: uid(), createdAt: Date.now() };
  update((d) => ({ ...d, exams: [...d.exams, exam] }));
  return exam;
}
export function updateExam(id: string, patch: Partial<Exam>) {
  update((d) => ({ ...d, exams: d.exams.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)) }));
}
export function deleteExam(id: string) {
  update((d) => ({ ...d, exams: d.exams.filter((e) => e.id !== id), deleted: tomb(d, [id]) }));
}

// ---------- gamification ----------
export function addXp(n: number) {
  if (n <= 0) return;
  const k = dayKey(Date.now());
  update((d) => ({ ...d, game: { ...d.game, xpByDay: { ...d.game.xpByDay, [k]: (d.game.xpByDay[k] ?? 0) + n } } }));
}
export function addStudyMinutes(n: number) {
  if (n <= 0) return;
  const k = dayKey(Date.now());
  update((d) => ({ ...d, game: { ...d.game, minutesByDay: { ...(d.game.minutesByDay ?? {}), [k]: Math.round(((d.game.minutesByDay?.[k] ?? 0) + n) * 10) / 10 } } }));
}
export function setDailyGoal(n: number) {
  update((d) => ({ ...d, game: { ...d.game, dailyGoal: n } }));
}
export function savePathResult(deckId: string, level: string, stars: number, score: number) {
  updateDeck(deckId, (x) => {
    const prev = x.path?.[level];
    const next: PathResult = { stars: Math.max(stars, prev?.stars ?? 0), best: Math.max(score, prev?.best ?? 0), at: Date.now() };
    return { path: { ...(x.path ?? {}), [level]: next } };
  });
}

// ---------- background jobs ----------
export function addJob(j: Omit<Job, 'id' | 'createdAt' | 'status'>): Job {
  const job: Job = { ...j, id: uid(), createdAt: Date.now(), status: 'queued' };
  update((d) => ({ ...d, jobs: [...d.jobs.filter((x) => x.status !== 'done' || Date.now() - (x.finishedAt ?? 0) < 7 * 86400000), job] }));
  return job;
}
export function patchJob(id: string, patch: Partial<Job>) {
  update((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
}
export function removeJob(id: string) {
  update((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== id) }));
}

// ---------- whole data ----------
export function replaceAll(next: unknown): boolean {
  const n = normalize(next);
  if (!n) return false;
  data = n;
  emit();
  return true;
}
export function resetAll() {
  data = sampleData();
  apiKey = '';
  chatKey = '';
  emit();
  void collectMediaGarbage();
}

/** Deletes stored images/audio that no card references any more. */
export async function collectMediaGarbage() {
  try {
    const used = new Set<string>();
    const re = /data-media="([^"]+)"/g;
    for (const d of data.decks)
      for (const c of d.cards) {
        if (!c.html) continue;
        for (const s of [c.front, c.back]) for (const m of s.matchAll(re)) used.add(m[1]);
      }
    const keys = (await mediaKeys()).map(String);
    const unused = keys.filter((k) => !used.has(k));
    if (unused.length) await mediaDeleteMany(unused);
  } catch {
    /* ignore */
  }
}

// ---------- lookups ----------
export function findPath(d: Data, ws?: string, course?: string, deck?: string) {
  const w = d.workspaces.find((x) => x.slug === ws);
  const c = w ? d.courses.find((x) => x.workspaceId === w.id && x.slug === course) : undefined;
  const k = c ? d.decks.find((x) => x.courseId === c.id && x.slug === deck) : undefined;
  return { workspace: w, course: c, deck: k };
}
export function deckUrl(d: Data, deck: Deck, tab?: string) {
  const c = d.courses.find((x) => x.id === deck.courseId);
  const w = c ? d.workspaces.find((x) => x.id === c.workspaceId) : undefined;
  return `/library/${w?.slug}/${c?.slug}/${deck.slug}${tab ? `?tab=${tab}` : ''}`;
}
/** Due cards: learned cards whose time has come plus today's share of new cards (see settings "Neue Karten pro Tag"). */
export const dueCards = (deck: Deck, now = Date.now()) => pickDue(deck.cards, now, newCardsLeft(deck, now));
/** New cards this deck may still introduce today – the daily limit is shared by all decks of a course. */
const planCache = new WeakMap<Data, Map<string, Map<string, number>>>();
export function newCardsLeft(deck: Deck, now = Date.now()) {
  let byCourse = planCache.get(data);
  if (!byCourse) planCache.set(data, (byCourse = new Map()));
  const key = deck.courseId + '|' + dayKey(now);
  let plan = byCourse.get(key);
  if (!plan) {
    const today = dayKey(now);
    const decks = data.decks
      .filter((d) => d.courseId === deck.courseId)
      .map((d) => ({ id: d.id, cards: d.cards, boost: d.newBoost?.day === today ? d.newBoost.n : 0 }));
    plan = planNewForCourse(decks, now, data.settings.newPerDay ?? DEFAULT_NEW_PER_DAY);
    byCourse.set(key, plan);
  }
  // a deck that is not (yet) in the saved data, e.g. while rendering an import, gets nothing extra
  return plan.get(deck.id) ?? 0;
}
/** "Heute mehr neue Karten": raises today's limit for this deck. */
export function boostNewCards(deckId: string, n: number) {
  const day = dayKey(Date.now());
  updateDeck(deckId, (x) => ({ newBoost: { day, n: (x.newBoost?.day === day ? x.newBoost.n : 0) + n } }));
}

/** Once a day: remember the mastery per deck (the weekly review compares with it). */
export function recordMasterySnapshot(now = Date.now()) {
  const day = dayKey(now);
  if (data.game.masterySnaps?.[day]) return;
  update((d) => ({ ...d, game: { ...d.game, masterySnaps: withSnapshot(d.game.masterySnaps, day, masterySnapshot(d), now) } }));
}
export const closeWeekReview = (week: string) => update((d) => ({ ...d, game: { ...d.game, weekSeen: week } }));
