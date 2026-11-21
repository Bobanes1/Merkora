/**
 * Music theory for practical music tasks: German note names (C, Cis, Des … H, B = H♭), intervals, chords,
 * scales with correct spelling, the position of a note on the staff, and checking what was played.
 * Pure – tested in scripts/test-srs.mts. Sound: lib/musicAudio.ts.
 */

export type MusicMode = 'interval-ear' | 'chord-ear' | 'build-chord' | 'build-scale' | 'name-note' | 'rhythm' | 'play-notes';
export type MusicSpec =
  | { mode: 'interval-ear'; root: string; interval: string; harmonic?: boolean }
  | { mode: 'chord-ear'; root: string; chord: string }
  | { mode: 'build-chord'; root: string; chord: string }
  | { mode: 'build-scale'; root: string; scale: string }
  | { mode: 'name-note'; note: string; clef: 'treble' | 'bass' }
  | { mode: 'rhythm'; beats: number[]; tempo: number }
  | { mode: 'play-notes'; notes: string[]; clef: 'treble' | 'bass' };

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/** A spelled note: letter index (C=0 … H=6), accidental (−2…+2) and octave. */
export type Note = { letter: number; acc: number; octave: number };

/** "Fis4", "es", "B3", "H", "Ces5", "C#4", "Eb" → note (default octave 4); null if unknown. */
export function parseNote(input: string): Note | null {
  const t = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = /^([A-Ha-h])(is|isis|es|eses|s|#|##|b|bb)?(-?\d)?$/.exec(t);
  if (!m) return null;
  let letter = LETTERS.indexOf(m[1].toUpperCase());
  let acc = 0;
  const suf = (m[2] ?? '').toLowerCase();
  // German: B = H flat ("Heses" = B flat flat); "As"/"Es" = A flat / E flat
  if (m[1].toUpperCase() === 'B') {
    letter = 6;
    acc = suf === 'es' || suf === 'b' ? -2 : -1;
  } else acc = suf === 'is' || suf === '#' ? 1 : suf === 'isis' || suf === '##' ? 2 : suf === 'es' || suf === 's' || suf === 'b' ? -1 : suf === 'eses' || suf === 'bb' ? -2 : 0;
  if (letter < 0) return null;
  return { letter, acc, octave: m[3] !== undefined ? Number(m[3]) : 4 };
}

/** German name of a note (without octave): Fis, Es, As, B (= H♭), H, Cis … */
export function noteName(n: Pick<Note, 'letter' | 'acc'>): string {
  const L = LETTERS[n.letter];
  if (n.letter === 6 && n.acc === -1) return 'B';
  if (n.acc === 0) return L;
  if (n.acc > 0) return L + 'is'.repeat(n.acc);
  // flats: E/A take only "s" (Es, As), the others "es" (Des, Ges …)
  const one = L === 'E' || L === 'A' ? 's' : 'es';
  return n.acc === -1 ? L + one : L + one + 'es';
}

export const pitchClass = (n: Pick<Note, 'letter' | 'acc'>) => (((LETTER_PC[n.letter] + n.acc) % 12) + 12) % 12;
export const midiOf = (n: Note) => 12 * (n.octave + 1) + LETTER_PC[n.letter] + n.acc;

// ---------- intervals ----------
/** [name, semitones, letter steps] */
export const INTERVALS: [string, number, number][] = [
  ['Prime', 0, 0],
  ['kleine Sekunde', 1, 1],
  ['große Sekunde', 2, 1],
  ['kleine Terz', 3, 2],
  ['große Terz', 4, 2],
  ['reine Quarte', 5, 3],
  ['Tritonus', 6, 3],
  ['reine Quinte', 7, 4],
  ['kleine Sexte', 8, 5],
  ['große Sexte', 9, 5],
  ['kleine Septime', 10, 6],
  ['große Septime', 11, 6],
  ['Oktave', 12, 7],
];
export const intervalBySemis = (n: number) => INTERVALS.find(([, s]) => s === Math.abs(n))?.[0] ?? '';
export const findInterval = (name: string) => INTERVALS.find(([n]) => n.toLowerCase() === name.trim().toLowerCase());

/** The note `semis` half steps and `steps` letters above `n` – correctly spelled (D + große Terz = Fis, not Ges). */
export function transpose(n: Note, semis: number, steps: number): Note {
  const letterAbs = n.letter + steps;
  const letter = ((letterAbs % 7) + 7) % 7;
  const octave = n.octave + Math.floor(letterAbs / 7);
  const target = midiOf(n) + semis;
  const natural = 12 * (octave + 1) + LETTER_PC[letter];
  return { letter, acc: target - natural, octave };
}

// ---------- chords and scales ----------
/** [name, semitones above the root] – thirds stacked, so letter steps are 0, 2, 4, 6. */
export const CHORDS: Record<string, number[]> = {
  Dur: [0, 4, 7],
  Moll: [0, 3, 7],
  vermindert: [0, 3, 6],
  übermäßig: [0, 4, 8],
  Dominantseptakkord: [0, 4, 7, 10],
  'großer Septakkord': [0, 4, 7, 11],
  'Moll-Septakkord': [0, 3, 7, 10],
  halbvermindert: [0, 3, 6, 10],
  'verminderter Septakkord': [0, 3, 6, 9],
};
export const SCALES: Record<string, number[]> = {
  Dur: [0, 2, 4, 5, 7, 9, 11],
  'natürliches Moll': [0, 2, 3, 5, 7, 8, 10],
  'harmonisches Moll': [0, 2, 3, 5, 7, 8, 11],
  'melodisches Moll': [0, 2, 3, 5, 7, 9, 11],
  dorisch: [0, 2, 3, 5, 7, 9, 10],
  phrygisch: [0, 1, 3, 5, 7, 8, 10],
  lydisch: [0, 2, 4, 6, 7, 9, 11],
  mixolydisch: [0, 2, 4, 5, 7, 9, 10],
  lokrisch: [0, 1, 3, 5, 6, 8, 10],
  'Dur-Pentatonik': [0, 2, 4, 7, 9],
  'Moll-Pentatonik': [0, 3, 5, 7, 10],
};
const PENTA_STEPS: Record<string, number[]> = { 'Dur-Pentatonik': [0, 1, 2, 4, 5], 'Moll-Pentatonik': [0, 2, 3, 4, 6] };

/** Finds a chord / scale by a name the AI may write a bit differently ("Moll" = "moll", "Moll natürlich"). */
function lookup<T>(table: Record<string, T>, name: string): [string, T] | null {
  const k = name.trim().toLowerCase().replace(/-/g, ' ');
  const alias: Record<string, string> = { major: 'dur', minor: 'moll', moll: 'moll', 'a moll': 'natürliches moll', 'moll natürlich': 'natürliches moll', 'äolisch': 'natürliches moll', 'ionisch': 'dur', 'dominantsept': 'dominantseptakkord', 'maj7': 'großer septakkord', 'm7': 'moll septakkord', 'dim': 'vermindert', 'aug': 'übermäßig' };
  const want = alias[k] ?? k;
  const hit = Object.entries(table).find(([n]) => n.toLowerCase().replace(/-/g, ' ') === want);
  return hit ?? null;
}
export const findChord = (name: string) => lookup(CHORDS, name);
export const findScale = (name: string) => {
  const hit = lookup(SCALES, name);
  // "Moll" alone means natural minor for scales
  return hit ?? (name.trim().toLowerCase() === 'moll' ? (['natürliches Moll', SCALES['natürliches Moll']] as [string, number[]]) : null);
};

export function chordNotes(root: Note, chord: string): Note[] {
  const c = findChord(chord);
  if (!c) return [];
  return c[1].map((semis, i) => transpose(root, semis, i * 2));
}
export function scaleNotes(root: Note, scale: string): Note[] {
  const sc = findScale(scale);
  if (!sc) return [];
  const steps = PENTA_STEPS[sc[0]] ?? sc[1].map((_, i) => i);
  return sc[1].map((semis, i) => transpose(root, semis, steps[i]));
}

/** "D – Fis – A" */
export const spell = (notes: Note[]) => notes.map(noteName).join(' – ');

// ---------- checking what was played ----------
/** A chord is right when exactly its pitch classes were played (any octave, any order, repeats allowed). */
export function checkChord(target: Note[], playedMidi: number[]): boolean {
  const want = new Set(target.map(pitchClass));
  const got = new Set(playedMidi.map((m) => ((m % 12) + 12) % 12));
  return want.size === got.size && [...want].every((p) => got.has(p));
}
/** A scale is right when its notes were played in order upwards from the root (the octave at the end may be added). */
export function checkScale(target: Note[], playedMidi: number[]): boolean {
  const seq = playedMidi.filter((m, i) => i === 0 || m !== playedMidi[i - 1]);
  const pcs = seq.map((m) => ((m % 12) + 12) % 12);
  const want = target.map(pitchClass);
  const body = pcs.length === want.length + 1 && pcs[pcs.length - 1] === want[0] ? pcs.slice(0, -1) : pcs;
  if (body.length !== want.length || !body.every((p, i) => p === want[i])) return false;
  // upwards: every next note higher than the one before
  return seq.every((m, i) => i === 0 || m > seq[i - 1]);
}
/** Naming a written note: the spelling counts ("Fis" ≠ "Ges"), upper/lower case does not. */
export function checkNoteName(note: Note, answer: string): boolean {
  const a = parseNote(answer.replace(/\d/g, ''));
  return !!a && a.letter === note.letter && a.acc === note.acc;
}

/**
 * Tapped rhythm: the gaps between taps compared with the pattern (in beats at the tempo); each gap may be
 * off by 20 % of a beat (plus a little for slow reactions). `taps` in milliseconds.
 */
export function checkRhythm(beats: number[], tempo: number, taps: number[]): { right: boolean; offs: number[] } {
  const beatMs = 60000 / tempo;
  const want = beats.slice(0, -1).map((b) => b * beatMs);
  const got = taps.slice(1).map((t, i) => t - taps[i]);
  if (got.length !== want.length) return { right: false, offs: [] };
  const offs = got.map((g, i) => (g - want[i]) / beatMs);
  return { right: offs.every((o) => Math.abs(o) <= 0.2), offs };
}

// ---------- staff ----------
/** Staff position: 0 = bottom line, 1 = space above it, … (treble: E4 bottom line, bass: G2). Negative = below. */
export function staffStep(n: Note, clef: 'treble' | 'bass'): number {
  const diatonic = n.octave * 7 + n.letter;
  const bottom = clef === 'treble' ? 4 * 7 + 2 : 2 * 7 + 4; // E4 / G2
  return diatonic - bottom;
}

// ---------- reading what the AI wrote ----------
/** A music task from the AI, checked (unknown notes, chords or scales → null). */
export function parseMusic(raw: unknown): MusicSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const mode = str(r.mode);
  const root = parseNote(str(r.root) || 'C4');
  switch (mode) {
    case 'interval-ear':
      return root && findInterval(str(r.interval)) ? { mode, root: str(r.root) || 'C4', interval: findInterval(str(r.interval))![0], harmonic: r.harmonic === true } : null;
    case 'chord-ear':
    case 'build-chord':
      return root && findChord(str(r.chord)) ? { mode, root: str(r.root) || 'C4', chord: findChord(str(r.chord))![0] } : null;
    case 'build-scale':
      return root && findScale(str(r.scale)) ? { mode, root: str(r.root) || 'C4', scale: findScale(str(r.scale))![0] } : null;
    case 'name-note': {
      const n = parseNote(str(r.note));
      const clef = str(r.clef) === 'bass' ? 'bass' : 'treble';
      if (!n) return null;
      const step = staffStep(n, clef);
      return step >= -4 && step <= 12 ? { mode, note: str(r.note), clef } : null;
    }
    case 'play-notes': {
      const clef = str(r.clef) === 'bass' ? 'bass' : 'treble';
      const list = (Array.isArray(r.notes) ? r.notes : []).map((x) => str(x)).filter((x) => {
        const n = parseNote(x);
        if (!n) return false;
        const step = staffStep(n, clef);
        return step >= -4 && step <= 12;
      });
      const notes = list.slice(0, 6);
      if (!notes.length) return null;
      // the piano shows two octaves: all notes must fit from the C below the lowest one
      const midis = notes.map((x) => midiOf(parseNote(x)!));
      return Math.max(...midis) - pianoFrom(midis) < 24 ? { mode, notes, clef } : null;
    }
    case 'rhythm': {
      const beats = (Array.isArray(r.beats) ? r.beats : []).map(Number).filter((b) => [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].includes(b)).slice(0, 12);
      const tempo = Math.min(160, Math.max(50, Number(r.tempo) || 80));
      return beats.length >= 3 ? { mode, beats, tempo } : null;
    }
  }
  return null;
}

// ---------- playing with the computer keyboard ----------
/**
 * Two octaves on the keyboard, by physical key (KeyboardEvent.code – the same on QWERTZ and QWERTY):
 * lower octave on the bottom letter row (Y X C V B N M, black keys S D G H J),
 * upper octave on the top letter row (Q W E R T Z U, black keys 2 3 5 6 7).
 */
export const KEY_CODES: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
};
/** The MIDI note of a key on the piano starting at `from`; null if the key plays nothing. */
export function keyToMidi(code: string, from = 60): number | null {
  const k = KEY_CODES[code];
  return k === undefined ? null : from + k;
}
/** Where a two-octave piano starts so these notes are on it: the C at or below the lowest one. */
export function pianoFrom(midis: number[]): number {
  const low = Math.min(...midis);
  return low - (((low % 12) + 12) % 12);
}
/** Played the notes in this order? (Enharmonic spellings count as the same key.) */
export function checkSequence(target: Note[], played: number[]): { right: boolean; places: boolean[] } {
  const want = target.map(midiOf);
  const places = want.map((m, i) => played[i] === m);
  return { right: played.length === want.length && places.every(Boolean), places };
}
