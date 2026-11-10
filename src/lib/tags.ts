/** Tags of cards: parsing, collecting and filtering. */
import type { Card } from './store';

/** "Biologie, Zelle  #wichtig" → ["Biologie", "Zelle", "wichtig"] */
export const parseTags = (s: string) => [...new Set(s.split(/[\s,;]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))];

/** All tags of these cards, most used first. */
export function allTags(cards: Pick<Card, 'tags'>[]): string[] {
  const n = new Map<string, number>();
  for (const c of cards) for (const t of c.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** Anki-style hierarchical tags: "Bio::Zelle" also matches the filter "Bio". */
export const hasTag = (c: Pick<Card, 'tags'>, tag: string) =>
  (c.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase() || t.toLowerCase().startsWith(tag.toLowerCase() + '::'));
