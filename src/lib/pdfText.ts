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
