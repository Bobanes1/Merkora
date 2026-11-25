/**
 * Scale & chord definitions for the interactive Piano & Metronome tool in Merkora Tools.
 * Pure – tested in scripts/test-srs.mts.
 */

export const PIANO_ROOTS: { pc: number; label: string }[] = [
  { pc: 0, label: 'C' },
  { pc: 1, label: 'C♯/D♭' },
  { pc: 2, label: 'D' },
  { pc: 3, label: 'E♭' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 6, label: 'F♯/G♭' },
  { pc: 7, label: 'G' },
  { pc: 8, label: 'A♭' },
  { pc: 9, label: 'A' },
  { pc: 10, label: 'B' },
  { pc: 11, label: 'H' },
];

export type MusicPattern = { id: string; label: string; kind: 'scale' | 'chord'; steps: number[]; hint: string };

export const MUSIC_PATTERNS: MusicPattern[] = [
  { id: 'dur', label: 'Dur-Tonleiter', kind: 'scale', steps: [0, 2, 4, 5, 7, 9, 11, 12], hint: 'Heiter & offen: Ganz-Ganz-Halb-Ganz-Ganz-Ganz-Halb' },
  { id: 'moll', label: 'Moll-Tonleiter', kind: 'scale', steps: [0, 2, 3, 5, 7, 8, 10, 12], hint: 'Nachdenklich & weich (natürliches Moll)' },
  { id: 'penta', label: 'Dur-Pentatonik', kind: 'scale', steps: [0, 2, 4, 7, 9, 12], hint: '5 Töne ohne Halbtonschritte – klingt fast immer harmonisch' },
  { id: 'blues', label: 'Blues-Skala', kind: 'scale', steps: [0, 3, 5, 6, 7, 10, 12], hint: 'Moll-Pentatonik plus die charakteristische „Blue Note“' },
  { id: 'maj', label: 'Dur-Dreiklang', kind: 'chord', steps: [0, 4, 7], hint: 'Grundton + große Terz + reine Quinte' },
  { id: 'min', label: 'Moll-Dreiklang', kind: 'chord', steps: [0, 3, 7], hint: 'Grundton + kleine Terz + reine Quinte' },
  { id: 'maj7', label: 'Maj7-Akkord', kind: 'chord', steps: [0, 4, 7, 11], hint: 'Warm & jazzig (Dur + große Septime)' },
  { id: 'dom7', label: 'Dominant-7', kind: 'chord', steps: [0, 4, 7, 10], hint: 'Spannungsreich – drängt zur Auflösung' },
  { id: 'm7', label: 'Moll-7', kind: 'chord', steps: [0, 3, 7, 10], hint: 'Weich & modern (Moll + kleine Septime)' },
  { id: 'dim', label: 'Vermindert', kind: 'chord', steps: [0, 3, 6], hint: 'Zwei kleine Terzen – spannungsgeladener Übergangsakkord' },
];

/** Returns MIDI notes within [fromMidi, fromMidi + 23] belonging to the selected root & scale/chord. */
export function patternMidis(rootPc: number, patternId: string, fromMidi = 48): number[] {
  const pat = MUSIC_PATTERNS.find((p) => p.id === patternId);
  if (!pat) return [];
  const base = fromMidi + ((rootPc - (fromMidi % 12) + 12) % 12);
  // Start inside the first octave if possible so the full scale fits on a 2-octave keyboard
  const start = base + Math.max(...pat.steps) >= fromMidi + 24 ? base - 12 : base;
  return pat.steps.map((s) => start + s).filter((m) => m >= fromMidi && m < fromMidi + 24);
}
