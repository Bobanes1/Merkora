/**
 * Pure utilities for Merkora's Library & Deck Power Upgrade:
 * - CSV / TSV / Quizlet / Markdown text import parser
 * - Cloze deletion syntax ({{answer}} / {{answer::hint}})
 * - Duplicate card detector
 * - Card list sorting & status filtering
 * - 14-day upcoming due forecast, study time estimation, hardest cards
 * - Print-ready HTML sheet generator (table, cut-out cards, fold sheet)
 *
 * Pure – tested in scripts/test-srs.mts.
 */
import { cardBackText, cardFrontText, escapeHtml, sideText } from './content';
import { levelOf } from './srs';
import type { Card, Deck, Review } from './store';
import { parseTags } from './tags';
import { DAY, startOfDay } from './util';

// ---------- 1. CSV / TSV / Quizlet / Markdown text import ----------

export type TextDelimiter = 'auto' | 'tab' | 'semicolon' | 'comma' | 'dash' | 'colon';
export type ParsedImportCard = { front: string; back: string; tags?: string[] };

/** Parses a single CSV/DSV line respecting quoted fields and escaped "" quotes. */
function splitQuoted(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur.trim() === '') {
      inQ = true;
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Detects the most likely separator in pasted text (Quizlet TSV, Excel CSV, Markdown lists). */
export function detectDelimiter(raw: string): Exclude<TextDelimiter, 'auto'> {
  const sample = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!sample.length) return 'tab';
  const count = (fn: (l: string) => boolean) => sample.filter(fn).length;
  const scores: [Exclude<TextDelimiter, 'auto'>, number][] = [
    ['tab', count((l) => l.includes('\t'))],
    ['colon', count((l) => /\s*::\s*/.test(l))],
    ['semicolon', count((l) => l.includes(';'))],
    ['dash', count((l) => /\s+[-–—]\s+/.test(l))],
    ['comma', count((l) => l.includes(','))],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : 'tab';
}

const HEADER_WORDS = new Set(['vorderseite', 'frage', 'begriff', 'front', 'term', 'question']);

/** Parses pasted CSV, TSV (Quizlet/Excel) or Markdown text into flashcard pairs. */
export function parseTextImport(
  raw: string,
  opts: { delimiter?: TextDelimiter; extraTags?: string[] } = {},
): ParsedImportCard[] {
  const cleaned = raw.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const delim = !opts.delimiter || opts.delimiter === 'auto' ? detectDelimiter(cleaned) : opts.delimiter;
  const extra = opts.extraTags?.length ? opts.extraTags : [];
  const out: ParsedImportCard[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Strip leading markdown bullet (- , * , 1. )
    const line = lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
    let cols: string[];
    if (delim === 'tab') cols = splitQuoted(line, '\t');
    else if (delim === 'semicolon') cols = splitQuoted(line, ';');
    else if (delim === 'comma') cols = splitQuoted(line, ',');
    else if (delim === 'colon') {
      const idx = line.indexOf('::');
      cols = idx >= 0 ? [line.slice(0, idx).trim(), line.slice(idx + 2).trim()] : [line.trim()];
    } else {
      const m = /\s+[-–—]\s+/.exec(line);
      cols = m ? [line.slice(0, m.index).trim(), line.slice(m.index + m[0].length).trim()] : [line.trim()];
    }

    const front = (cols[0] ?? '').replace(/^\*\*|\*\*$/g, '').trim();
    const back = (cols[1] ?? '').trim();
    if (!front || !back) continue;
    // Skip typical CSV header row
    if (i === 0 && HEADER_WORDS.has(front.toLowerCase())) continue;

    const rowTags = cols[2] ? parseTags(cols[2]) : [];
    const tags = [...new Set([...rowTags, ...extra])];
    out.push({ front, back, ...(tags.length ? { tags } : {}) });
  }
  return out;
}

// ---------- 2. Cloze syntax ({{Lücke}} / {{Lücke::Hinweis}}) ----------

const CLOZE_RE = /\{\{([^{}]+?)(?:::([^{}]+?))?\}\}/g;

/** True when text contains at least one Merkora cloze deletion `{{...}}`. */
export const hasCloze = (text: string) => /\{\{[^{}]+?\}\}/.test(text);

/** Renders cloze placeholders for the question side (replaces `{{ans}}` with `[ … ]` or `[ hint ]`). */
export function renderClozeQuestion(text: string, html?: boolean): string {
  if (!hasCloze(text)) return text;
  if (html) {
    return text.replace(CLOZE_RE, (_m, _ans: string, hint?: string) => {
      const label = hint?.trim() ? `[ ${escapeHtml(hint.trim())} ]` : '[ … ]';
      return `<span class="cloze-blank">${label}</span>`;
    });
  }
  return text.replace(CLOZE_RE, (_m, _ans: string, hint?: string) => (hint?.trim() ? `[ ${hint.trim()} ]` : '[ … ]'));
}

/** Renders cloze deletions revealed for the answer side (highlights the filled-in words). */
export function renderClozeAnswer(text: string, html?: boolean): string {
  if (!hasCloze(text)) return text;
  if (html) {
    return text.replace(CLOZE_RE, (_m, ans: string) => `<span class="cloze-filled">${ans.trim()}</span>`);
  }
  return text.replace(CLOZE_RE, (_m, ans: string) => `**${ans.trim()}**`);
}

// ---------- 3. Duplicate detection ----------

/** Normalised key for comparing card fronts regardless of punctuation/case/whitespace. */
export function duplicateKey(card: Pick<Card, 'front' | 'html'>): string {
  return sideText(card, card.front)
    .toLowerCase()
    .replace(/\{\{|\}\}/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns groups of 2+ cards that share the same normalised front text, sorted best-progress first. */
export function findDuplicateGroups(cards: Card[]): Card[][] {
  const map = new Map<string, Card[]>();
  for (const c of cards) {
    const k = duplicateKey(c);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(c);
    else map.set(k, [c]);
  }
  return [...map.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => (b.srs.reps ?? 0) - (a.srs.reps ?? 0) || a.createdAt - b.createdAt));
}

// ---------- 4. Card list sorting & status filter ----------

export type CardStatusFilter = 'all' | 'new' | 'due' | 'learning' | 'mastered' | 'suspended';
export type CardSort = 'order' | 'newest' | 'hardest' | 'due' | 'alpha';

export function matchesCardStatus(card: Card, status: CardStatusFilter, now = Date.now()): boolean {
  if (status === 'all') return true;
  if (status === 'suspended') return !!card.suspended;
  if (card.suspended) return false;
  if (status === 'due') return card.srs.last !== undefined && card.srs.due <= now;
  const lvl = levelOf(card.srs);
  if (status === 'new') return lvl === 'new';
  if (status === 'learning') return lvl === 'learning' || lvl === 'familiar';
  return lvl === 'mastered';
}

export function sortCardList(cards: Card[], by: CardSort): Card[] {
  if (by === 'order') return cards;
  const list = [...cards];
  if (by === 'newest') return list.sort((a, b) => b.createdAt - a.createdAt);
  if (by === 'hardest') return list.sort((a, b) => (b.srs.lapses - a.srs.lapses) || (a.srs.ease - b.srs.ease));
  if (by === 'due') {
    return list.sort((a, b) => {
      const aDue = a.srs.last !== undefined ? a.srs.due : Number.MAX_SAFE_INTEGER;
      const bDue = b.srs.last !== undefined ? b.srs.due : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
  }
  return list.sort((a, b) => cardFrontText(a).localeCompare(cardFrontText(b), 'de'));
}

// ---------- 5. Forecast, study time estimation & hardest cards ----------

/** Counts how many active (non-suspended) learned cards are due on each of the next `days` days. */
export function upcomingDueByDay(cards: Card[], days = 14, now = Date.now()): { day: number; count: number }[] {
  const today = startOfDay(now);
  const buckets = Array.from({ length: days }, (_, i) => ({ day: today + i * DAY, count: 0 }));
  for (const c of cards) {
    if (c.suspended || c.srs.last === undefined) continue;
    const dueDay = startOfDay(c.srs.due);
    const idx = Math.floor((dueDay - today) / DAY);
    if (idx <= 0) buckets[0].count++;
    else if (idx < days) buckets[idx].count++;
  }
  return buckets;
}

/** Estimates study minutes for `cardCount` cards based on recent review cadence (4–25 s/card, default 10 s). */
export function estimateStudyMinutes(cardCount: number, reviews: Pick<Review, 'at'>[] = []): number {
  if (cardCount <= 0) return 0;
  let secPerCard = 10;
  if (reviews.length >= 4) {
    const times = [...reviews]
      .slice(-40)
      .map((r) => r.at)
      .sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const diff = (times[i] - times[i - 1]) / 1000;
      if (diff >= 2 && diff <= 60) gaps.push(diff);
    }
    if (gaps.length >= 3) {
      gaps.sort((a, b) => a - b);
      const med = gaps[Math.floor(gaps.length / 2)];
      secPerCard = Math.max(4, Math.min(25, med));
    }
  }
  return Math.max(1, Math.round((cardCount * secPerCard) / 60));
}

export function formatEstMinutes(min: number): string {
  if (min <= 0) return '';
  return min < 60 ? `≈ ${min} Min.` : `≈ ${Math.floor(min / 60)} Std. ${min % 60 ? `${min % 60} Min.` : ''}`.trim();
}

/** Returns up to `limit` cards with the highest lapses (or lowest ease among reviewed cards). */
export function hardestCards(cards: Card[], limit = 5): Card[] {
  return [...cards]
    .filter((c) => !c.suspended && (c.srs.lapses > 0 || (c.srs.last !== undefined && c.srs.ease < 2.2)))
    .sort((a, b) => (b.srs.lapses - a.srs.lapses) || (a.srs.ease - b.srs.ease))
    .slice(0, limit);
}

// ---------- 6. Print-ready study sheet HTML ----------

export type PrintLayout = 'table' | 'cards' | 'fold';

/** Builds a clean, standalone HTML document ready for `window.print()` (table, cut-out cards, or fold sheet). */
export function buildPrintHtml(deck: Pick<Deck, 'name' | 'cards'>, layout: PrintLayout): string {
  const active = deck.cards.filter((c) => !c.suspended);
  const title = escapeHtml(deck.name);
  const body =
    layout === 'table'
      ? `<table><thead><tr><th style="width:42%">Vorderseite</th><th>Rückseite</th></tr></thead><tbody>${active
          .map(
            (c) =>
              `<tr><td><strong>${escapeHtml(cardFrontText(c))}</strong>${c.hint ? `<div class="hint">Hinweis: ${escapeHtml(c.hint)}</div>` : ''}</td><td>${escapeHtml(cardBackText(c))}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : layout === 'fold'
        ? `<p class="sub">Entlang der gestrichelten Mittellinie falten – links steht die Frage, rechts die Lösung.</p><div class="fold-list">${active
            .map(
              (c, i) =>
                `<div class="fold-row"><div class="fold-q"><span class="idx">${i + 1}.</span> ${escapeHtml(cardFrontText(c))}</div><div class="fold-a">${escapeHtml(cardBackText(c))}</div></div>`,
            )
            .join('')}</div>`
        : `<p class="sub">Entlang der gestrichelten Linien ausschneiden – Vorder- und Rückseite stehen nebeneinander zum Knicken.</p><div class="cut-grid">${active
            .map(
              (c) =>
                `<div class="cut-card"><div class="cut-f"><small>Frage</small><div>${escapeHtml(cardFrontText(c))}</div></div><div class="cut-b"><small>Antwort</small><div>${escapeHtml(cardBackText(c))}</div></div></div>`,
            )
            .join('')}</div>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title} – Merkora Druckansicht</title><style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#1f2933;margin:20mm 16mm;font-size:11pt;line-height:1.45}
    h1{margin:0 0 4px;font-size:17pt;color:#002a29}
    .meta,.sub{color:#64748b;font-size:9.5pt;margin:0 0 14px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e1;padding:7px 9px;vertical-align:top;text-align:left;white-space:pre-wrap}
    th{background:#eef7f7;font-weight:700}
    tr{break-inside:avoid}
    .hint{color:#09817e;font-size:9pt;margin-top:4px}
    .fold-row{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #cbd5e1;break-inside:avoid}
    .fold-q{padding:8px 12px 8px 0;border-right:1.5px dashed #94a3b8;font-weight:600;white-space:pre-wrap}
    .fold-a{padding:8px 0 8px 12px;white-space:pre-wrap}
    .idx{color:#09817e;margin-right:4px}
    .cut-grid{display:grid;grid-template-columns:1fr;gap:8px}
    .cut-card{display:grid;grid-template-columns:1fr 1fr;border:1.5px dashed #94a3b8;border-radius:6px;break-inside:avoid}
    .cut-f,.cut-b{padding:10px 12px;white-space:pre-wrap}
    .cut-f{border-right:1px dotted #cbd5e1;font-weight:600}
    .cut-card small{display:block;font-size:8pt;text-transform:uppercase;color:#09817e;margin-bottom:4px;font-weight:700}
    @media print{body{margin:12mm}}
  </style></head><body><h1>${title}</h1><p class="meta">${active.length} Karteikarten · Merkora</p>${body}</body></html>`;
}
