/**
 * Your aquarium: inhabitants and plants that come in for learning successes. Pure rules – tested.
 * Which ones are unlocked is kept in game.aquarium (id → time), so they stay even if numbers go down later.
 */
import { pathProgress, totalXp, xpStreak } from './path';
import { lessonDone } from './skills';
import { masteryPercent, streak } from './stats';
import type { Data } from './store';

export type AquaStats = {
  cards: number;
  streak: number;
  minutes: number;
  decksMastered: number;
  pathStars: number;
  skillLessons: number;
  mockPassed: number;
  todosDone: number;
  xp: number;
};

export function aquaStats(d: Data, now = Date.now()): AquaStats {
  return {
    cards: new Set(d.reviews.map((r) => r.cardId)).size,
    streak: Math.max(xpStreak(d, now), streak(d.reviews, now)),
    minutes: Math.round(Object.values(d.game.minutesByDay ?? {}).reduce((a, b) => a + b, 0)),
    decksMastered: d.decks.filter((x) => x.cards.length >= 10 && masteryPercent(x.cards) >= 80).length,
    pathStars: d.decks.reduce((a, x) => a + (x.cards.length ? pathProgress(x).stars : 0), 0),
    skillLessons: (d.skills ?? []).reduce((a, s) => a + s.stages.flatMap((st) => st.lessons).filter((l) => !l.known && lessonDone(l)).length, 0),
    mockPassed: d.decks.reduce((a, x) => a + (x.mockHistory ?? []).filter((m) => m.passed).length, 0),
    todosDone: (d.todos ?? []).filter((t) => t.doneAt).length,
    xp: totalXp(d),
  };
}

type Kind = 'swim' | 'ground' | 'float';
export type AquaItem = { id: string; name: string; kind: Kind; how: string; stat: keyof AquaStats; need: number; x: number; y: number };

/** In order of how soon they usually come; x/y = place in the tank (percent). */
export const AQUA_ITEMS: AquaItem[] = [
  { id: 'shell', name: 'Muschel', kind: 'ground', how: 'Lerne deine erste Karte', stat: 'cards', need: 1, x: 12, y: 86 },
  { id: 'weed', name: 'Seegras', kind: 'ground', how: 'Lerne 25 Karten', stat: 'cards', need: 25, x: 4, y: 70 },
  { id: 'starfish', name: 'Seestern', kind: 'ground', how: 'Lerne 3 Tage in Folge', stat: 'streak', need: 3, x: 30, y: 88 },
  { id: 'clownfish', name: 'Clownfisch', kind: 'swim', how: 'Lerne 100 Karten', stat: 'cards', need: 100, x: 20, y: 30 },
  { id: 'crab', name: 'Krabbe', kind: 'ground', how: 'Hake 10 To-dos ab', stat: 'todosDone', need: 10, x: 62, y: 88 },
  { id: 'coral', name: 'Koralle', kind: 'ground', how: 'Meistere ein Deck (ab 10 Karten, 80 %)', stat: 'decksMastered', need: 1, x: 84, y: 76 },
  { id: 'jelly', name: 'Qualle', kind: 'float', how: 'Sammle 15 Sterne im Lernpfad', stat: 'pathStars', need: 15, x: 70, y: 22 },
  { id: 'bluefish', name: 'Doktorfisch', kind: 'swim', how: 'Lerne 250 Karten', stat: 'cards', need: 250, x: 55, y: 45 },
  { id: 'seahorse', name: 'Seepferdchen', kind: 'float', how: 'Lerne 7 Tage in Folge', stat: 'streak', need: 7, x: 90, y: 40 },
  { id: 'octopus', name: 'Krake', kind: 'ground', how: 'Schaffe 3 Skill-Lektionen', stat: 'skillLessons', need: 3, x: 46, y: 82 },
  { id: 'puffer', name: 'Kugelfisch', kind: 'swim', how: 'Lerne 5 Stunden insgesamt', stat: 'minutes', need: 300, x: 35, y: 55 },
  { id: 'chest', name: 'Schatztruhe', kind: 'ground', how: 'Bestehe eine Probeprüfung', stat: 'mockPassed', need: 1, x: 74, y: 89 },
  { id: 'turtle', name: 'Schildkröte', kind: 'swim', how: 'Lerne 500 Karten', stat: 'cards', need: 500, x: 15, y: 50 },
  { id: 'anemone', name: 'Anemone', kind: 'ground', how: 'Meistere 3 Decks', stat: 'decksMastered', need: 3, x: 94, y: 86 },
  { id: 'snail', name: 'Meeresschnecke', kind: 'ground', how: 'Hake 50 To-dos ab', stat: 'todosDone', need: 50, x: 22, y: 92 },
  { id: 'ray', name: 'Rochen', kind: 'swim', how: 'Lerne 20 Stunden insgesamt', stat: 'minutes', need: 1200, x: 60, y: 62 },
  { id: 'whale', name: 'Wal', kind: 'swim', how: 'Lerne 1000 Karten', stat: 'cards', need: 1000, x: 40, y: 18 },
  { id: 'dolphin', name: 'Pips Freund Flo', kind: 'swim', how: 'Lerne 30 Tage in Folge', stat: 'streak', need: 30, x: 80, y: 12 },
];

/** Which items the numbers unlock (pure). */
export function unlockedBy(s: AquaStats): string[] {
  return AQUA_ITEMS.filter((i) => s[i.stat] >= i.need).map((i) => i.id);
}
/** Progress towards an item (0–1). */
export const progressOf = (i: AquaItem, s: AquaStats) => Math.min(1, s[i.stat] / i.need);
