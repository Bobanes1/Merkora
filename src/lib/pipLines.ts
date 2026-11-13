/**
 * What Pip says while you learn: reacts to streaks, cards that finally sit, half time, the last cards,
 * a run of mistakes and the time of day. Pure – tested in scripts/test-srs.mts.
 */
export type PipMoment = {
  rating: 1 | 2 | 3 | 4;
  /** Correct answers in a row (Gut/Einfach), including this one. */
  streak: number;
  /** Wrong answers in a row (Nochmal), including this one. */
  misses: number;
  /** How often the card was forgotten before. */
  lapses: number;
  done: number;
  remaining: number;
  total: number;
};

const pick = <T,>(list: T[], seed: number) => list[Math.abs(seed) % list.length];

const STREAK: Record<number, string[]> = {
  5: ['5 richtig in Folge – du bist im Flow!', 'Fünf am Stück! 🐬'],
  10: ['10 in Folge! Das sitzt richtig.', 'Zehnerserie – stark!'],
  20: ['20 richtig hintereinander – Wahnsinn!', 'Zwanzigerserie! Ich mach gleich einen Salto.'],
  30: ['30 in Folge. Bist du sicher, dass du noch lernen musst?'],
  50: ['50 richtig hintereinander – legendär! 🏆'],
};

export function pipReaction(m: PipMoment): string | undefined {
  const seed = m.done + m.streak * 7 + m.remaining;
  if (m.rating >= 3 && m.lapses >= 2)
    return pick([`Die hat dich ${m.lapses}× erwischt – jetzt sitzt sie! 💪`, `Endlich! ${m.lapses}× vergessen, jetzt gewusst.`], seed);
  if (m.rating >= 3 && STREAK[m.streak]) return pick(STREAK[m.streak], seed);
  if (m.rating === 1 && m.misses === 3) return 'Kurz durchatmen – Fehler gehören dazu. Lies die Antwort ruhig zweimal.';
  if (m.rating === 1 && m.misses >= 5 && m.misses % 5 === 0) return 'Harte Runde. Eine kurze Pause hilft oft mehr als weiterbeißen.';
  if (m.total >= 10 && m.remaining === 3) return pick(['Nur noch 3 Karten!', 'Endspurt – noch drei!'], seed);
  if (m.total >= 10 && m.done === Math.floor(m.total / 2)) return pick(['Halbzeit! Weiter so.', 'Die Hälfte ist geschafft 🌊'], seed);
  return undefined;
}

/** Greeting at the start of a round, depending on the time of day. */
export function pipGreeting(hour: number, due: number): string {
  if (hour >= 22 || hour < 4) return `Nachteule! ${due} Karten noch, dann ab ins Bett 🌙`;
  if (hour < 8) return 'Früher Vogel! Morgens bleibt besonders viel hängen.';
  if (due >= 100) return `${due} Karten – wir machen das Stück für Stück.`;
  return pick(['Los geht’s!', 'Schön, dass du da bist!', 'Bereit? Ich schon.'], due);
}

/** End of a round: a short summary and a daily record if there is one. */
export function pipSummary(o: { done: number; firstTry: number; today: number; bestDay: number }): string {
  const share = o.done ? Math.round((o.firstTry / o.done) * 100) : 0;
  if (o.today > o.bestDay && o.bestDay > 0) return `Neuer Tagesrekord: ${o.today} Karten! 🏆`;
  if (o.done >= 5 && share >= 90) return `${share} % auf Anhieb gewusst – top!`;
  if (o.done >= 5) return `${o.firstTry} von ${o.done} auf Anhieb gewusst.`;
  return 'Runde geschafft – stark!';
}

export type PokeMove = 'cheer' | 'wave' | 'happy' | 'flip';
const MOVES: PokeMove[] = ['cheer', 'wave', 'flip', 'happy'];

/** Pip on the start page when tapped: the n-th tap's move – consecutive taps never repeat one. */
export const pokeMove = (n: number): PokeMove => MOVES[((n % MOVES.length) + MOVES.length) % MOVES.length];
