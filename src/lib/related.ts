/**
 * What belongs to a term: cards that mention it and the parts of the material about it
 * (mind map, regenerating a card). Pure – tested in scripts/test-srs.mts.
 */

const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Words of a term worth searching for (at least 4 letters, so "der", "und" … do not count). */
const words = (term: string) =>
  term
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);

/** Cards that mention the term (the whole term, or else one of its words); those with it in the question first. */
export function relatedCards<T extends { front: string; back: string }>(cards: T[], term: string, max = 5): T[] {
  const t = term.toLowerCase().trim();
  const ws = words(term);
  if (!t) return [];
  const score = (c: T) => {
    const f = plain(c.front).toLowerCase(), b = plain(c.back).toLowerCase();
    if (f.includes(t)) return 4;
    if (b.includes(t)) return 3;
    if (ws.length && ws.some((w) => f.includes(w))) return 2;
    if (ws.length && ws.some((w) => b.includes(w))) return 1;
    return 0;
  };
  return cards
    .map((c, i) => ({ c, s: score(c), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c);
}

/** The paragraphs of the material that mention the term (or its words), at most `limit` characters. */
export function materialAbout(source: string, term: string, limit = 4000): string {
  const t = term.toLowerCase().trim();
  const ws = words(term);
  const paras = source.split(/\n\s*\n|\n(?=\S)/).map((p) => p.trim()).filter(Boolean);
  const hits = paras.filter((p) => {
    const l = p.toLowerCase();
    return (t && l.includes(t)) || ws.some((w) => l.includes(w));
  });
  let out = '';
  for (const p of hits) {
    if (out.length + p.length + 2 > limit) {
      if (!out) out = p.slice(0, limit);
      break;
    }
    out += (out ? '\n\n' : '') + p;
  }
  return out;
}
