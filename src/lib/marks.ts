/**
 * Marked cards (★), like "Notiz markieren" in Anki. Anki stores a mark as the tag "marked";
 * Merkora keeps it as a flag on the card and turns it back into that tag on export.
 * Pure – tested in scripts/test-srs.mts.
 */
export const ANKI_MARK = 'marked';

/** Anki tags → mark flag + the remaining tags. */
export function fromAnkiTags(tags: string[] | undefined): { marked: boolean; tags: string[] | undefined } {
  const list = tags ?? [];
  const marked = list.some((t) => t.toLowerCase() === ANKI_MARK);
  const rest = list.filter((t) => t.toLowerCase() !== ANKI_MARK);
  return { marked, tags: rest.length ? rest : undefined };
}

/** Mark flag → tags for an Anki export. */
export const toAnkiTags = (tags: string[] | undefined, marked: boolean | undefined) => [...(tags ?? []), ...(marked ? [ANKI_MARK] : [])];
