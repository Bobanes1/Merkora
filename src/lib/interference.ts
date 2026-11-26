/**
 * 100% offline / zero-API-cost learning intelligence:
 * 1. Interference / confusable card detection (for Anti-Leech comparison cards).
 * 2. Local spoken-answer similarity matching (0-token default for Hands-Free Audio Mode).
 * 3. Per-page FSRS mastery heatmap for Living Script Studio.
 * Pure – tested in scripts/test-srs.mts.
 */
import { retrievability, stateFromClassic } from './fsrs';
import { findPageForExcerpt } from './pdfText';
import type { Card } from './store';
import { DAY } from './util';

const STOPWORDS = new Set([
  'der', 'die', 'das', 'ein', 'eine', 'einer', 'einem', 'einen', 'und', 'oder', 'aber', 'nicht', 'kein', 'keine',
  'mit', 'von', 'für', 'aus', 'auf', 'bei', 'nach', 'über', 'unter', 'durch', 'wird', 'werden', 'sind', 'sein',
  'haben', 'hat', 'kann', 'können', 'muss', 'müssen', 'sich', 'auch', 'noch', 'nur', 'sehr', 'mehr', 'als', 'wie',
  'was', 'wer', 'warum', 'wieso', 'welche', 'welcher', 'welches', 'beschreibe', 'erkläre', 'nenne', 'definiere',
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'what', 'which', 'when', 'where', 'how', 'does', 'into',
]);

export function cleanCardText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/gi, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\*\*|__|`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return cleanCardText(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function charTrigrams(text: string): Set<string> {
  const s = cleanCardText(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const out = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    const g = s.slice(i, i + 3);
    if (!g.includes(' ')) out.add(g);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export type ConfusableMatch = {
  card: Card;
  score: number;
  sharedTerms: string[];
};

/**
 * Finds cards in the same deck (or module) that are most likely to be confused with `target`.
 * Combines token overlap, character trigram similarity (catches Mitose vs. Meiose!), and lapse boost.
 */
export function findConfusableCards(cards: Card[], target: Card, limit = 3): ConfusableMatch[] {
  const tFront = cleanCardText(target.front);
  const tBack = cleanCardText(target.back);
  const tTokens = new Set([...tokenize(tFront), ...tokenize(tBack)]);
  const tFrontTri = charTrigrams(tFront);
  const tBackTri = charTrigrams(tBack);

  const ranked: ConfusableMatch[] = [];
  for (const c of cards) {
    if (c.id === target.id || c.suspended) continue;
    const cFront = cleanCardText(c.front);
    const cBack = cleanCardText(c.back);
    const cTokens = new Set([...tokenize(cFront), ...tokenize(cBack)]);
    const shared: string[] = [];
    for (const w of tTokens) if (cTokens.has(w)) shared.push(w);

    const tokenSim = jaccard(tTokens, cTokens);
    const frontTriSim = jaccard(tFrontTri, charTrigrams(cFront));
    const backTriSim = jaccard(tBackTri, charTrigrams(cBack));
    // Strong weight on similar front/title trigrams (Mitose/Meiose, Induktion/Deduktion) + concept overlap
    let score = tokenSim * 0.45 + frontTriSim * 0.35 + backTriSim * 0.2;
    if (c.srs.lapses > 0) score += Math.min(0.12, c.srs.lapses * 0.03);
    if (score >= 0.14 || shared.length >= 2) {
      ranked.push({ card: c, score, sharedTerms: shared.slice(0, 4) });
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type LocalVoiceResult = {
  percent: number;
  verdict: 'strong' | 'partial' | 'weak';
  suggestedRating: 1 | 2 | 3 | 4;
  matchedTerms: string[];
  missedTerms: string[];
};

/**
 * 0-token local comparison between a spoken answer and the expected card back.
 * Uses stem-prefix matching so German inflections ("Zellen"/"Zelle", "oxidiert"/"Oxidation") count cleanly.
 */
export function localVoiceMatch(spoken: string, expected: string): LocalVoiceResult {
  const expTokens = [...new Set(tokenize(expected))];
  const spTokens = tokenize(spoken);
  if (!expTokens.length) {
    return { percent: spTokens.length ? 100 : 0, verdict: spTokens.length ? 'strong' : 'weak', suggestedRating: spTokens.length ? 3 : 1, matchedTerms: [], missedTerms: [] };
  }
  const stem = (w: string) => (w.length >= 6 ? w.slice(0, Math.max(5, w.length - 2)) : w);
  const spStems = spTokens.map(stem);
  const matchedTerms: string[] = [];
  const missedTerms: string[] = [];

  for (const term of expTokens) {
    const st = stem(term);
    const hit = spTokens.some((w) => w === term || w.includes(term) || term.includes(w)) || spStems.some((s) => s === st || (st.length >= 5 && s.startsWith(st.slice(0, 5))));
    if (hit) matchedTerms.push(term);
    else missedTerms.push(term);
  }
  const percent = Math.round((matchedTerms.length / expTokens.length) * 100);
  const verdict: LocalVoiceResult['verdict'] = percent >= 65 ? 'strong' : percent >= 35 ? 'partial' : 'weak';
  const suggestedRating: 1 | 2 | 3 | 4 = percent >= 85 ? 4 : percent >= 60 ? 3 : percent >= 35 ? 2 : 1;
  return { percent, verdict, suggestedRating, matchedTerms: matchedTerms.slice(0, 8), missedTerms: missedTerms.slice(0, 6) };
}

/** Estimated FSRS recall probability R(t) in [0, 1] for any card (works for both FSRS and classic SRS). */
export function cardRetrievability(card: Card, at = Date.now()): number {
  const s = card.srs;
  if (s.last === undefined && s.reps === 0) return 0.35; // unseen new card
  const mem = s.mem ?? stateFromClassic(Math.max(0.5, s.interval || 0.5), s.ease || 2.5);
  const days = Math.max(0, (at - (s.last ?? at)) / DAY);
  return Math.max(0, Math.min(1, retrievability(days, Math.max(0.1, mem.s))));
}

/** Resolves the PDF page number for a card: explicit `sourceRef.page` first, then indexed source match. */
export function resolveCardPage(card: Card, sourceText: string): number | null {
  if (card.sourceRef?.page && card.sourceRef.page >= 1) return card.sourceRef.page;
  if (!sourceText.includes('[[PAGE:')) return null;
  return findPageForExcerpt(sourceText, `${card.front} ${card.back}`);
}

export type PageHeat = {
  page: number;
  cardIds: string[];
  avgRetention: number | null; // 0..100
  level: 'none' | 'weak' | 'mid' | 'strong';
  leeches: number;
};

/**
 * Computes the FSRS mastery heatmap across all pages of a PDF inside Living Script Studio.
 * 100% offline / zero API calls.
 */
export function pageMasteryHeatmap(cards: Card[], totalPages: number, sourceText: string, fileId?: string, now = Date.now()): PageHeat[] {
  const byPage = new Map<number, Card[]>();
  for (const c of cards) {
    if (c.suspended) continue;
    if (fileId && c.sourceRef?.fileId && c.sourceRef.fileId !== fileId) continue;
    const p = resolveCardPage(c, sourceText);
    if (!p || p < 1 || p > totalPages) continue;
    const arr = byPage.get(p) ?? [];
    arr.push(c);
    byPage.set(p, arr);
  }
  const out: PageHeat[] = [];
  for (let page = 1; page <= totalPages; page++) {
    const list = byPage.get(page) ?? [];
    if (!list.length) {
      out.push({ page, cardIds: [], avgRetention: null, level: 'none', leeches: 0 });
      continue;
    }
    const avg = Math.round((list.reduce((sum, c) => sum + cardRetrievability(c, now), 0) / list.length) * 100);
    const leeches = list.filter((c) => c.srs.lapses >= 4).length;
    const level: PageHeat['level'] = avg < 58 || leeches > 0 ? 'weak' : avg < 82 ? 'mid' : 'strong';
    out.push({ page, cardIds: list.map((c) => c.id), avgRetention: avg, level, leeches });
  }
  return out;
}
