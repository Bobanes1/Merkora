/**
 * Sound for music tasks: a small piano-like synthesizer with Web Audio (no sound files, works offline).
 * The audio system starts on the first tap (browsers only allow sound after a user action).
 */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** One note: two slightly detuned partials with a quick attack and a piano-like decay. */
export function playNote(midi: number, delay = 0, duration = 1.1, volume = 0.22) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  out.gain.exponentialRampToValueAtTime(volume * 0.35, t + 0.25);
  out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  out.connect(a.destination);
  for (const [type, mult, vol] of [['triangle', 1, 1], ['sine', 2, 0.25], ['sine', 3, 0.08]] as const) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq(midi) * mult;
    g.gain.value = vol;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + duration + 0.05);
  }
}

/** Notes one after another (melodic) or together (harmonic). */
export function playNotes(midis: number[], harmonic = false, gap = 0.55) {
  midis.forEach((m, i) => playNote(m, harmonic ? 0 : i * gap, harmonic ? 1.6 : 1, harmonic ? 0.16 : 0.22));
}

/** A short click (metronome / rhythm). */
export function playClick(delay = 0, accent = false) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.value = accent ? 1600 : 1100;
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.07);
}

/** Plays a rhythm (beats in quarters) at the tempo: one count-in bar of clicks, then the pattern as tones. */
export function playRhythm(beats: number[], tempo: number) {
  const beat = 60 / tempo;
  for (let i = 0; i < 4; i++) playClick(i * beat, i === 0);
  let t = 4 * beat;
  for (const b of beats) {
    playNote(72, t, Math.min(0.3, b * beat), 0.2);
    t += b * beat;
  }
}
