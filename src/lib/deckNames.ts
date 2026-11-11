/**
 * Shorter deck names for lists: a prefix that all decks of a course share (typical for Anki sub-decks,
 * e.g. "PR-Forschung HS26 › 01 Grundbegriffe") is left out → "01 Grundbegriffe".
 */
const SEPARATORS = [' › ', '::', ' > ', ' / '];

export function shortNames(decks: { id: string; name: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  let prefix = '';
  if (decks.length >= 2) {
    prefix = decks[0].name;
    for (const d of decks) while (prefix && !d.name.startsWith(prefix)) prefix = prefix.slice(0, -1);
    // only cut at a separator, never in the middle of a word
    let cut = -1;
    for (const sep of SEPARATORS) {
      const i = prefix.lastIndexOf(sep);
      if (i >= 0) cut = Math.max(cut, i + sep.length);
    }
    prefix = cut > 0 ? prefix.slice(0, cut) : '';
  }
  for (const d of decks) {
    const short = prefix && d.name.length > prefix.length ? d.name.slice(prefix.length).trim() : d.name;
    out.set(d.id, short || d.name);
  }
  return out;
}

/** Short name of one deck among its siblings. */
export const shortName = (deck: { id: string; name: string }, siblings: { id: string; name: string }[]) =>
  shortNames(siblings).get(deck.id) ?? deck.name;
