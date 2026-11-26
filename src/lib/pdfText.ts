/**
 * Text of PDF slides, cleaned: headers and footers that repeat on most slides (university name, lecture title,
 * page numbers) are removed – they only cost tokens and clutter the material. Pure – tested in scripts/test-srs.mts.
 */

const EDGE = 4; // headers / footers sit in the first or last lines of a slide
// page numbers ("12", "- 12 -", "12 / 40", "Seite 12 von 40") count as the same line; other numbers keep lines apart
const norm = (l: string) => {
  const k = l.replace(/\s+/g, ' ').trim().toLowerCase();
  if (/^[^\p{L}]*\d[^\p{L}]*$/u.test(k)) return '#';
  return k.replace(/\b(seite|folie|page|slide|s\.)\s*\d+(\s*(von|of|\/)\s*\d+)?/g, '$1 #');
};
const counts = (k: string) => k.length >= 3 || k === '#';

/** The same pages without lines that repeat at the top or bottom of at least 40 % of the slides (min. 3). */
export function stripRepeatedLines(pages: string[]): string[] {
  const n = pages.filter((p) => p.trim()).length;
  if (n < 4) return pages;
  const split = pages.map((p) => p.split('\n'));
  const atEdge = (i: number, len: number) => i < EDGE || i >= len - EDGE;
  const seenOn = new Map<string, number>();
  for (const ls of split) {
    const seen = new Set<string>();
    ls.forEach((l, i) => {
      const k = norm(l);
      if (atEdge(i, ls.length) && counts(k) && !seen.has(k)) {
        seen.add(k);
        seenOn.set(k, (seenOn.get(k) ?? 0) + 1);
      }
    });
  }
  const min = Math.max(3, Math.ceil(n * 0.4));
  const drop = new Set([...seenOn].filter(([, c]) => c >= min).map(([k]) => k));
  if (!drop.size) return pages;
  return split.map((ls) => ls.filter((l, i) => !(atEdge(i, ls.length) && drop.has(norm(l)))).join('\n').trim());
}

/** All slides as one text (empty slides left out). */
export const pagesToText = (pages: string[]) =>
  pages
    .filter((p) => p.trim())
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const PAGE_MARKER_RE = /^\[\[PAGE:(\d+)\]\]$/gm;

/** Joins pages while preserving lightweight `[[PAGE:N]]` markers so cards & search know their exact PDF page. */
export function pagesToIndexedText(pages: string[]): string {
  const parts: string[] = [];
  pages.forEach((raw, idx) => {
    const clean = raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (clean) parts.push(`[[PAGE:${idx + 1}]]\n${clean}`);
  });
  return parts.join('\n\n').trim();
}

/** Removes `[[PAGE:N]]` markers for clean reading, TTS or display. */
export function stripPageMarkers(text: string): string {
  return text.replace(PAGE_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Splits indexed source text back into `{ page, text }` entries. */
export function splitIndexedPages(source: string): { page: number; text: string }[] {
  if (!source.includes('[[PAGE:')) return [];
  const out: { page: number; text: string }[] = [];
  const re = /\[\[PAGE:(\d+)\]\]\s*/g;
  let match: RegExpExecArray | null;
  const starts: { page: number; start: number; markerStart: number }[] = [];
  while ((match = re.exec(source))) {
    starts.push({ page: Number(match[1]), start: re.lastIndex, markerStart: match.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].markerStart : source.length;
    const text = source.slice(starts[i].start, end).trim();
    if (text) out.push({ page: starts[i].page, text });
  }
  return out;
}

/**
 * Finds the best matching PDF page number for a card or excerpt inside indexed source text.
 * Returns null if the source has no page markers or no meaningful overlap.
 */
export function findPageForExcerpt(source: string, query: string): number | null {
  const pages = splitIndexedPages(source);
  if (!pages.length) return null;
  const clean = query
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$\$?[^$]+\$\$?/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .toLowerCase();
  const terms = [...new Set(clean.split(/\s+/).filter((w) => w.length >= 4))].slice(0, 14);
  if (!terms.length) return null;
  let bestPage: number | null = null;
  let bestScore = 0;
  for (const p of pages) {
    const low = p.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (low.includes(t)) score += t.length >= 7 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPage = p.page;
    }
  }
  return bestScore >= 2 ? bestPage : null;
}
