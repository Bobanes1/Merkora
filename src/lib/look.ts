/** Small pure helpers for the look of the app (tested in scripts/test-srs.mts). */
import { accentFor } from './util';

// ---------- start page: scene by time of day ----------
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
/** Morning 5–11, day 11–17, evening 17–21, night 21–5. */
export function timeOfDay(hour: number): TimeOfDay {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}
export const GREETING: Record<TimeOfDay, string> = {
  morning: 'Guten Morgen',
  day: 'Guten Tag',
  evening: 'Guten Abend',
  night: 'Noch wach?',
};

// ---------- decks: a plant that grows with the mastery ----------
export const PLANT_NAMES = ['Samen', 'Keimling', 'Pflänzchen', 'Busch', 'Knospe', 'Blüte'] as const;
/** 0 = seed … 5 = in bloom. */
export function plantStage(masteryPercent: number): number {
  const p = Math.max(0, Math.min(100, masteryPercent));
  if (p < 5) return 0;
  if (p < 20) return 1;
  if (p < 40) return 2;
  if (p < 60) return 3;
  if (p < 85) return 4;
  return 5;
}

// ---------- decks: cover ----------
export const COVER_PATTERNS = ['dots', 'waves', 'grid', 'stripes', 'plain'] as const;
export type CoverPattern = (typeof COVER_PATTERNS)[number];
export const COVER_ICONS = ['cards', 'book', 'brain', 'flask', 'globe', 'music', 'code', 'calc', 'scale', 'leaf', 'heart', 'star', 'chart', 'palette', 'language', 'target'] as const;
export type CoverIcon = (typeof COVER_ICONS)[number];
export type DeckCover = { color: number; pattern: CoverPattern; icon: CoverIcon };

/** The cover of a deck: the chosen one, or a stable automatic one from its id. */
export function coverOf(deck: { id: string; cover?: Partial<DeckCover> }): DeckCover {
  const auto: DeckCover = { color: accentFor(deck.id), pattern: COVER_PATTERNS[accentFor(deck.id + 'p') % 4], icon: 'cards' };
  const c = deck.cover ?? {};
  return {
    color: c.color && c.color >= 1 && c.color <= 6 ? c.color : auto.color,
    pattern: c.pattern && (COVER_PATTERNS as readonly string[]).includes(c.pattern) ? c.pattern : auto.pattern,
    icon: c.icon && (COVER_ICONS as readonly string[]).includes(c.icon) ? c.icon : auto.icon,
  };
}
