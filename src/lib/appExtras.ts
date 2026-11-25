/**
 * Pure offline utilities for Merkora's app-wide upgrades:
 * - Offline Multiple-Choice Quiz generator directly from flashcards (no AI key needed)
 * - Stats analytics: longest streak, rating distribution, retention by time-of-day & weekday, CSV export
 * - Summary helpers: Markdown heading extractor for TOC & printable HTML export
 * - Calendar due-cards-per-day aggregator (excluding archived decks & suspended cards)
 *
 * Pure – tested in scripts/test-srs.mts.
 */
import { cardBackText, cardFrontText, escapeHtml } from './content';
import { hasCloze, renderClozeAnswer, renderClozeQuestion } from './deckTools';
import type { DeckStat } from './stats';
import type { Card, Deck, QuizQuestion, Review } from './store';
import { DAY, dayKey, startOfDay } from './util';

// ---------- 1. Offline Multiple-Choice Quiz from flashcards ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanQuizSide(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Generates an offline Multiple-Choice quiz directly from a deck's active flashcards.
 * Requires at least 4 cards with distinct answers; uses other cards' answers as distractors.
 */
export function buildOfflineQuiz(cards: Card[], count = 8, seed = Date.now()): QuizQuestion[] {
  const rand = mulberry32(seed);
  const pool = cards
    .filter((c) => !c.suspended)
    .map((c) => {
      const rawFront = cardFrontText(c);
      const rawBack = cardBackText(c);
      const q = cleanQuizSide(hasCloze(rawFront) ? renderClozeQuestion(rawFront, false) : rawFront);
      const a = cleanQuizSide(hasCloze(rawBack) ? renderClozeAnswer(rawBack, false) : rawBack);
      return { card: c, q, a };
    })
    .filter((x) => x.q.length > 0 && x.a.length > 0);

  // Deduplicate by normalised answer so distractors are always distinct
  const uniqueAnswers = new Map<string, string>();
  for (const item of pool) {
    const k = item.a.toLowerCase();
    if (!uniqueAnswers.has(k)) uniqueAnswers.set(k, item.a);
  }
  if (uniqueAnswers.size < 4) return [];

  const allAnswers = [...uniqueAnswers.values()];
  // Prefer weaker / due / fewer-reps cards first with light randomness
  const picked = shuffleWith(pool, rand).slice(0, Math.min(count, pool.length));

  const questions: QuizQuestion[] = [];
  for (const item of picked) {
    const others = allAnswers.filter((ans) => ans.toLowerCase() !== item.a.toLowerCase());
    if (others.length < 3) continue;
    const distractors = shuffleWith(others, rand).slice(0, 3);
    const options = shuffleWith([item.a, ...distractors], rand);
    const answer = options.indexOf(item.a);
    const explanation = item.card.hint
      ? `Hinweis: ${item.card.hint}`
      : `Richtige Antwort aus deiner Karteikarte: ${item.a}`;
    questions.push({ question: item.q, options, answer, explanation });
  }
  return questions;
}

// ---------- 2. Stats Analytics ----------

/** Longest consecutive study-day streak across all reviews. */
export function bestStreak(reviews: Pick<Review, 'at'>[]): number {
  if (!reviews.length) return 0;
  const days = [...new Set(reviews.map((r) => startOfDay(r.at)))].sort((a, b) => a - b);
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((days[i] - days[i - 1]) / DAY);
    if (diff === 1) {
      cur++;
      if (cur > best) best = cur;
    } else if (diff > 1) {
      cur = 1;
    }
  }
  return best;
}

export type RatingBreakdown = { 1: number; 2: number; 3: number; 4: number; total: number };

/** Counts ratings 1–4 across the given reviews. */
export function ratingBreakdown(reviews: Pick<Review, 'rating'>[]): RatingBreakdown {
  const out: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
  for (const r of reviews) {
    if (r.rating === 1 || r.rating === 2 || r.rating === 3 || r.rating === 4) {
      out[r.rating]++;
      out.total++;
    }
  }
  return out;
}

export type RetentionBucket = { id: string; label: string; total: number; known: number; percent: number | null };

/** Retention (rating >= 3) grouped into 4 times of day (Morgens, Mittags, Abends, Nachts). */
export function timeOfDayStats(reviews: Pick<Review, 'at' | 'rating'>[]): RetentionBucket[] {
  const defs = [
    { id: 'morning', label: 'Morgens (5–11)', match: (h: number) => h >= 5 && h < 11 },
    { id: 'midday', label: 'Mittags (11–17)', match: (h: number) => h >= 11 && h < 17 },
    { id: 'evening', label: 'Abends (17–22)', match: (h: number) => h >= 17 && h < 22 },
    { id: 'night', label: 'Nachts (22–5)', match: (h: number) => h >= 22 || h < 5 },
  ];
  return defs.map((d) => {
    let total = 0;
    let known = 0;
    for (const r of reviews) {
      const h = new Date(r.at).getHours();
      if (d.match(h)) {
        total++;
        if (r.rating >= 3) known++;
      }
    }
    return { id: d.id, label: d.label, total, known, percent: total ? Math.round((known / total) * 100) : null };
  });
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

/** Retention (rating >= 3) grouped by weekday (Monday = 0 .. Sunday = 6). */
export function weekdayStats(reviews: Pick<Review, 'at' | 'rating'>[]): RetentionBucket[] {
  const counts = Array.from({ length: 7 }, () => ({ total: 0, known: 0 }));
  for (const r of reviews) {
    const wd = (new Date(r.at).getDay() + 6) % 7;
    counts[wd].total++;
    if (r.rating >= 3) counts[wd].known++;
  }
  return WEEKDAYS.map((label, i) => ({
    id: `wd-${i}`,
    label,
    total: counts[i].total,
    known: counts[i].known,
    percent: counts[i].total ? Math.round((counts[i].known / counts[i].total) * 100) : null,
  }));
}

/** Exports deck statistics as semicolon-separated CSV (Excel-friendly in German locale). */
export function statsToCsv(rows: (DeckStat & { course?: string })[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Kurs', 'Deck', 'Karten', 'Fortschritt (%)', 'Fällig', 'Wiederholungen (30 T.)', 'Gewusst (%)'];
  const lines = [header.join(';')];
  for (const r of rows) {
    const knownPct = r.reviews ? Math.round((r.known / r.reviews) * 100) : '';
    lines.push([r.course ?? '', r.name, r.cards, r.mastery, r.due, r.reviews, knownPct].map(esc).join(';'));
  }
  return '\uFEFF' + lines.join('\r\n');
}

// ---------- 3. Summary TOC & Printable HTML ----------

export type TocItem = { level: 2 | 3; text: string; index: number };

/** Extracts ## and ### headings from Markdown for a clickable Table of Contents. */
export function extractMarkdownHeadings(md: string): TocItem[] {
  const out: TocItem[] = [];
  let idx = 0;
  for (const line of md.split(/\r?\n/)) {
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line.trim());
    if (!m) continue;
    const text = m[2].replace(/\*\*|__|`/g, '').trim();
    if (!text) continue;
    out.push({ level: m[1].length as 2 | 3, text, index: idx++ });
  }
  return out;
}

/** Wraps rendered summary HTML into a clean print-ready document. */
export function buildSummaryPrintHtml(title: string, bodyHtml: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${safeTitle} – Zusammenfassung (Merkora)</title><style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#1f2933;margin:18mm 16mm;font-size:11pt;line-height:1.55}
    h1{margin:0 0 4px;font-size:18pt;color:#002a29}
    .meta{color:#64748b;font-size:9.5pt;margin:0 0 18px;border-bottom:1px solid #cbd5e1;padding-bottom:8px}
    h2{font-size:13.5pt;color:#076a68;margin:18px 0 6px;break-after:avoid}
    h3{font-size:11.5pt;color:#1f2933;margin:12px 0 4px;break-after:avoid}
    p,li{margin:4px 0}
    ul,ol{padding-left:20px}
    blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid #09817e;background:#f4fbfa}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
    th{background:#eef7f7}
    code{background:#f1f5f9;padding:1px 4px;border-radius:4px;font-size:9.5pt}
    @media print{body{margin:12mm}}
  </style></head><body><h1>${safeTitle}</h1><p class="meta">Zusammenfassung · Merkora</p>${bodyHtml}</body></html>`;
}

// ---------- 4. Calendar due cards per day ----------

/**
 * Counts how many active (non-suspended, non-archived) learned cards are due on each calendar day.
 * Overdue cards are bucketed into today's key.
 */
export function dueCountsByDay(decks: Pick<Deck, 'archived' | 'cards'>[], now = Date.now()): Map<string, number> {
  const todayStart = startOfDay(now);
  const todayKey = dayKey(todayStart);
  const map = new Map<string, number>();
  for (const d of decks) {
    if (d.archived) continue;
    for (const c of d.cards) {
      if (c.suspended || c.srs.last === undefined) continue;
      const dueDay = startOfDay(c.srs.due);
      const k = dueDay <= todayStart ? todayKey : dayKey(dueDay);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
  }
  return map;
}
