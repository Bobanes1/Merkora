/** Matching game: question and answer tiles to pair up as fast as possible. Pure – tested in scripts/test-srs.mts. */

export type MatchCandidate = { id: string; front: string; back: string; due: number; leech: boolean; media: boolean };
export type MatchPair = { id: string; front: string; back: string };
export type Tile = { key: string; pairId: string; side: 'front' | 'back'; text: string };

/** Longest side text that still fits on a tile. */
export const MATCH_MAX = 90;
const fits = (s: string) => s.trim().length > 0 && s.trim().length <= MATCH_MAX;

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Up to `n` cards for one round: short text only (no pictures), no two with the same answer or question,
 * due cards and problem cards first.
 */
export function pickMatchCards(cards: MatchCandidate[], n = 6, now = Date.now(), rnd = Math.random): MatchPair[] {
  const ok = cards.filter((c) => !c.media && fits(c.front) && fits(c.back));
  const urgent = shuffle(ok.filter((c) => c.leech || c.due <= now), rnd);
  const rest = shuffle(ok.filter((c) => !(c.leech || c.due <= now)), rnd);
  const fronts = new Set<string>();
  const backs = new Set<string>();
  const out: MatchPair[] = [];
  for (const c of [...urgent, ...rest]) {
    const f = c.front.trim().toLowerCase(), b = c.back.trim().toLowerCase();
    if (fronts.has(f) || backs.has(b) || fronts.has(b) || backs.has(f)) continue;
    fronts.add(f);
    backs.add(b);
    out.push({ id: c.id, front: c.front.trim(), back: c.back.trim() });
    if (out.length >= n) break;
  }
  return out;
}

/** The tiles of a round, mixed. */
export const makeTiles = (pairs: MatchPair[], rnd = Math.random): Tile[] =>
  shuffle(
    pairs.flatMap((p) => [
      { key: p.id + ':f', pairId: p.id, side: 'front' as const, text: p.front },
      { key: p.id + ':b', pairId: p.id, side: 'back' as const, text: p.back },
    ]),
    rnd,
  );

/** Two tiles belong together: same card, one question and one answer. */
export const isPair = (a: Tile, b: Tile) => a.pairId === b.pairId && a.side !== b.side;

/** Time shown: seconds with one decimal, e.g. "23,4 s". */
export const formatTime = (ms: number) => (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' s';

/** How many cards can appear in the game at all (short text, no pictures). */
export const matchableCount = (cards: Pick<MatchCandidate, 'front' | 'back' | 'media'>[]) => cards.filter((c) => !c.media && fits(c.front) && fits(c.back)).length;
