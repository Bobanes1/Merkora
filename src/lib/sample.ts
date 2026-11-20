/**
 * Material from the whole deck instead of only its beginning: when a long text or many cards do not fit into
 * a request, pieces are taken evenly from everything (new uploads are appended at the end and would be cut
 * first otherwise). Pure – tested in scripts/test-srs.mts.
 */

/** Size of one section when long text is spread (characters). */
const SECTION = 4000;

/** Splits text at blank lines into sections of about SECTION characters. */
function sections(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\s*\n/)) {
    if (cur && cur.length + para.length > SECTION) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur) out.push(cur);
  return out;
}

/** Cuts at the last sentence or line end before `n` (if that is not too early). */
function cutAt(s: string, n: number): string {
  if (s.length <= n) return s;
  const head = s.slice(0, n);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('\n'), head.lastIndexOf('? '), head.lastIndexOf('! '));
  return end > n * 0.6 ? head.slice(0, end + 1) : head;
}

/**
 * Text of at most `limit` characters taken evenly from start, middle and end: every section gets its share,
 * cut at a sentence end; left-out text is marked "[…]". Short text stays as it is.
 */
export function spreadClip(text: string, limit: number): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  const secs = sections(t);
  const marker = '\n[…]\n';
  const share = Math.floor(limit / secs.length) - marker.length;
  if (share < 200) {
    // very long material: whole sections at even steps instead of tiny pieces of every one
    const take = Math.max(1, Math.floor(limit / (SECTION + marker.length)));
    const step = secs.length / take;
    return Array.from({ length: take }, (_, i) => cutAt(secs[Math.floor(i * step)], SECTION)).join(marker).slice(0, limit);
  }
  return secs.map((s) => cutAt(s, share)).join(marker).slice(0, limit);
}

type SampleCard = { front: string; back: string; marked?: boolean; srs?: { lapses?: number } };

/**
 * Which cards go along when not all fit (`fits` = how many): first the hard ones (forgotten again and again)
 * and the marked ones, then the rest evenly across the deck. The deck order is kept.
 */
export function sampleCards<T extends SampleCard>(cards: T[], fits: number): T[] {
  if (cards.length <= fits) return cards;
  const hard = new Set(cards.filter((c) => c.marked || (c.srs?.lapses ?? 0) >= 2).slice(0, Math.floor(fits / 3)));
  const rest = cards.filter((c) => !hard.has(c));
  const left = fits - hard.size;
  const step = rest.length / left;
  const even = new Set(Array.from({ length: left }, (_, i) => rest[Math.floor(i * step)]));
  return cards.filter((c) => hard.has(c) || even.has(c));
}
