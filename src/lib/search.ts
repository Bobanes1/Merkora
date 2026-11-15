/**
 * Global search (Strg+K): courses, decks and cards in one list.
 * Pure – tested in scripts/test-srs.mts.
 */
type SCourse = { id: string; name: string; workspaceId: string };
type SDeck = { id: string; name: string; courseId: string; cards: { id: string; front: string; back: string }[]; files?: { id: string; name: string }[] };

export type SearchHit =
  | { kind: 'course'; id: string; title: string; sub: string }
  | { kind: 'deck'; id: string; title: string; sub: string }
  | { kind: 'file'; id: string; deckId: string; title: string; sub: string }
  | { kind: 'card'; id: string; deckId: string; title: string; sub: string; snippet: string; term: string };

const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,;:])/g, '$1')
    .trim();
/** Lower case (also Ä → ä), so "osmose" finds "Osmose". */
const norm = (s: string) => s.toLocaleLowerCase('de');

/** A short piece of text around the first match. */
export function snippetAround(text: string, word: string, size = 70): string {
  const i = norm(text).indexOf(norm(word));
  if (i < 0) return text.length > size ? text.slice(0, size).trimEnd() + ' …' : text;
  const start = Math.max(0, i - Math.round(size / 3));
  const out = text.slice(start, start + size).trim();
  return (start > 0 ? '… ' : '') + out + (start + size < text.length ? ' …' : '');
}

/**
 * Everything that contains all words of the query. Courses and decks by name; cards by question and answer
 * (a match in the question ranks first). At most `max.cards` cards and `max.other` courses / decks.
 */
export function searchAll(
  data: { courses: SCourse[]; decks: SDeck[] },
  query: string,
  max: { cards: number; other: number } = { cards: 20, other: 6 },
): SearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = (s: string) => {
    const n = norm(s);
    return words.every((w) => n.includes(w));
  };
  const courseName = new Map(data.courses.map((c) => [c.id, c.name]));
  const courses: SearchHit[] = data.courses
    .filter((c) => all(c.name))
    .slice(0, max.other)
    .map((c) => ({ kind: 'course', id: c.id, title: c.name, sub: `${data.decks.filter((d) => d.courseId === c.id).length} Decks` }));
  const decks: SearchHit[] = data.decks
    .filter((d) => all(d.name))
    .slice(0, max.other)
    .map((d) => ({ kind: 'deck', id: d.id, title: d.name, sub: `${courseName.get(d.courseId) ?? ''} · ${d.cards.length} Karten` }));
  const files: SearchHit[] = data.decks
    .flatMap((d) => (d.files ?? []).filter((f) => all(f.name)).map((f) => ({ kind: 'file' as const, id: f.id, deckId: d.id, title: f.name, sub: d.name })))
    .slice(0, max.other);
  const cards: { hit: SearchHit; rank: number; i: number }[] = [];
  let i = 0;
  for (const d of data.decks)
    for (const c of d.cards) {
      const f = plain(c.front), b = plain(c.back);
      const rank = all(f) ? 0 : all(f + ' ' + b) ? 1 : -1;
      if (rank < 0) continue;
      const term = words.reduce((a, w) => (w.length > a.length ? w : a), '');
      cards.push({ hit: { kind: 'card', id: c.id, deckId: d.id, title: f, sub: d.name, snippet: snippetAround(b, term), term }, rank, i: i++ });
    }
  cards.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return [...courses, ...decks, ...files, ...cards.slice(0, max.cards).map((x) => x.hit)];
}
