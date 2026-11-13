/**
 * Problem cards ("leeches"): cards that are forgotten again and again. Pure (no storage) – tested in scripts/test-srs.mts.
 */
import type { Card } from './store';

/** Forgotten this often after having known it: the card itself probably needs work. */
export const LEECH = 4;
export const isLeech = (c: Pick<Card, 'srs'>) => (c.srs.lapses ?? 0) >= LEECH;

/** Would this rating turn the card into a problem card right now? */
export const becomesLeech = (before: Pick<Card, 'srs'>, after: Pick<Card, 'srs'>) => !isLeech(before) && isLeech(after);
