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

/** A branch of the mind map: its own cards first, then the cards of each sub-point – every card once. */
export function branchCards<T extends { front: string; back: string }>(cards: T[], labels: string[]): { label: string; cards: T[] }[] {
  const seen = new Set<T>();
  return labels
    .map((label) => ({
      label,
      cards: relatedCards(cards, label, Infinity).filter((c) => !seen.has(c) && (seen.add(c), true)),
    }))
    .filter((g) => g.cards.length);
}

type MapLike = { center: string; branches: { label: string; children: string[] }[] };

/**
 * What the AI gets to explain a term of the mind map: its place in the map, the matching parts of the material
 * and the matching cards (or, for decks without material text, the first cards) – at most `limit` characters.
 */
export function explainContext(
  deck: { source?: string; cards: { front: string; back: string }[] },
  term: string,
  branch: string,
  map?: MapLike,
  limit = 3500,
): string {
  const parts: string[] = [];
  if (map) {
    const b = map.branches.find((x) => x.label === branch) ?? map.branches.find((x) => x.children.includes(term));
    parts.push(`MINDMAP: Hauptthema „${map.center}“${b ? ` › Ast „${b.label}“: ${b.children.join('; ')}` : ''}`);
  }
  const material = materialAbout(deck.source ?? '', term, Math.round(limit * 0.4));
  if (material) parts.push('LERNMATERIAL:\n' + material);
  const qa = (c: { front: string; back: string }) => `F: ${plain(c.front)}\nA: ${plain(c.back)}`;
  let cards = relatedCards(deck.cards, term, 8);
  if (!cards.length && branch && branch !== term) cards = relatedCards(deck.cards, branch, 8);
  if (cards.length) parts.push('KARTEIKARTEN DAZU:\n' + cards.map(qa).join('\n'));
  let out = parts.join('\n\n');
  if (out.length < 300 && deck.cards.length) out += (out ? '\n\n' : '') + 'KARTEIKARTEN DES DECKS:\n' + deck.cards.slice(0, 15).map(qa).join('\n');
  return out.length > limit ? out.slice(0, limit) : out;
}
