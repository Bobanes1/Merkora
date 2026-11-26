/**
 * Studio-grade offline Web Audio engine for Merkora's Piano, Music Tasks & Metronome:
 * - Real Yamaha C5 Grand Piano multi-samples (Salamander Grand Piano V3, 21 keys A1–C7, CC-BY-3.0)
 *   with automatic ±1-semitone pitch interpolation, stereo soundboard imaging & concert-hall convolution reverb
 * - Seamless physical-modeling fallback while samples warm up (zero latency on very first keypress)
 * - Selectable voices: 'grand' (Yamaha C5 Konzertflügel), 'rhodes' (E-Piano), 'warm' (Weicher Synth)
 * - Sustain pedal support & crisp wooden metronome click
 */
export type PianoVoice = 'grand' | 'rhodes' | 'warm';

export type PianoSampleKey = { note: string; midi: number };

/** 21 real Yamaha C5 recordings spanning A1 (MIDI 33) through C7 (MIDI 96), every minor 3rd. */
export const PIANO_SAMPLES: readonly PianoSampleKey[] = [
  { note: 'A1', midi: 33 },
  { note: 'C2', midi: 36 },
  { note: 'Ds2', midi: 39 },
  { note: 'Fs2', midi: 42 },
  { note: 'A2', midi: 45 },
  { note: 'C3', midi: 48 },
  { note: 'Ds3', midi: 51 },
  { note: 'Fs3', midi: 54 },
  { note: 'A3', midi: 57 },
  { note: 'C4', midi: 60 },
  { note: 'Ds4', midi: 63 },
  { note: 'Fs4', midi: 66 },
  { note: 'A4', midi: 69 },
  { note: 'C5', midi: 72 },
  { note: 'Ds5', midi: 75 },
  { note: 'Fs5', midi: 78 },
  { note: 'A5', midi: 81 },
  { note: 'C6', midi: 84 },
  { note: 'Ds6', midi: 87 },
  { note: 'Fs6', midi: 90 },
  { note: 'C7', midi: 96 },
];

/** Pure helper: picks the closest sampled key and exact playback rate for any MIDI note. */
export function nearestPianoSample(midi: number): { note: string; midi: number; rate: number } {
  let best = PIANO_SAMPLES[0];
  let bestDist = Math.abs(midi - best.midi);
  for (let i = 1; i < PIANO_SAMPLES.length; i++) {
    const d = Math.abs(midi - PIANO_SAMPLES[i].midi);
    if (d < bestDist) {
      best = PIANO_SAMPLES[i];
      bestDist = d;
    }
  }
  return { note: best.note, midi: best.midi, rate: Math.pow(2, (midi - best.midi) / 12) };
}

// Per-AudioContext decoded sample cache (shared across PianoTool & ambient.ts)
const rawBytesCache = new Map<string, Promise<ArrayBuffer | null>>();
const ctxBuffers = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
const ctxLoading = new WeakMap<AudioContext, Set<string>>();

function fetchPianoBytes(note: string): Promise<ArrayBuffer | null> {
  let p = rawBytesCache.get(note);
  if (!p) {
    p = fetch(`/audio/piano/${note}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    rawBytesCache.set(note, p);
  }
  return p;
}

function getCtxMap(a: AudioContext): Map<string, AudioBuffer> {
  let m = ctxBuffers.get(a);
  if (!m) {
    m = new Map();
    ctxBuffers.set(a, m);
  }
  return m;
}

async function ensureSample(a: AudioContext, note: string): Promise<AudioBuffer | null> {
  const m = getCtxMap(a);
  const hit = m.get(note);
  if (hit) return hit;
  let loading = ctxLoading.get(a);
  if (!loading) {
    loading = new Set();
    ctxLoading.set(a, loading);
  }
  if (loading.has(note)) return null;
  loading.add(note);
  try {
    const bytes = await fetchPianoBytes(note);
    if (!bytes) return null;
    const decoded = await a.decodeAudioData(bytes.slice(0));
    m.set(note, decoded);
    return decoded;
  } catch {
    return null;
  } finally {
    loading.delete(note);
  }
}

/** Preloads the full Yamaha C5 Grand Piano sample bank in the background for instant playback. */
export function preloadPianoSamples(targetCtx?: AudioContext | null) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  const a = targetCtx ?? audio();
  if (!a) return;
  // Prioritize middle register (C3–C6) first, then outer octaves
  const ordered = [...PIANO_SAMPLES].sort((x, y) => Math.abs(x.midi - 66) - Math.abs(y.midi - 66));
  for (const s of ordered) {
    void ensureSample(a, s.note);
  }
}

/**
 * Plays a real sampled Yamaha C5 Grand Piano note on any AudioContext/destination.
 * Returns true if played from the decoded acoustic sample, or false if still loading.
 */
export function playSampledGrandNote(
  a: AudioContext,
  dest: AudioNode,
  reverbDest: AudioNode | null,
  midi: number,
  at: number,
  duration: number,
  volume: number,
): boolean {
  const pick = nearestPianoSample(midi);
  const buf = getCtxMap(a).get(pick.note);
  if (!buf) {
    void ensureSample(a, pick.note);
    return false;
  }

  const src = a.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pick.rate;

  const pan = typeof a.createStereoPanner === 'function' ? a.createStereoPanner() : null;
  const out = a.createGain();
  // Acoustic piano sample gain calibrated to match synth levels naturally
  const peak = Math.min(1.4, volume * 2.35);
  const naturalDur = Math.min(buf.duration / pick.rate, Math.max(duration + 0.45, 1.4));
  const releaseStart = Math.max(at + 0.06, at + Math.min(duration, naturalDur - 0.12));

  out.gain.setValueAtTime(0.0001, at);
  out.gain.linearRampToValueAtTime(peak, at + 0.004);
  out.gain.setValueAtTime(peak, releaseStart);
  out.gain.exponentialRampToValueAtTime(0.0001, Math.max(releaseStart + 0.25, at + naturalDur));

  src.connect(out);
  if (pan) {
    pan.pan.value = Math.max(-0.55, Math.min(0.55, (midi - 66) / 36));
    out.connect(pan);
    pan.connect(dest);
    if (reverbDest) pan.connect(reverbDest);
  } else {
    out.connect(dest);
    if (reverbDest) out.connect(reverbDest);
  }

  src.start(at);
  src.stop(Math.max(releaseStart + 0.3, at + naturalDur + 0.06));
  return true;
}

// ---------- Default Piano AudioContext ----------

let ctx: AudioContext | null = null;
let reverbNode: ConvolverNode | null = null;
let reverbSend: GainNode | null = null;
let masterBus: DynamicsCompressorNode | null = null;
let currentVoice: PianoVoice = 'grand';
let sustainOn = false;

export const getPianoVoice = (): PianoVoice => currentVoice;
export const setPianoVoice = (v: PianoVoice) => {
  currentVoice = v;
};
export const getSustain = (): boolean => sustainOn;
export const setSustain = (on: boolean) => {
  sustainOn = on;
};

function createHallImpulse(a: AudioContext, seconds = 2.0, decay = 2.8): AudioBuffer {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const raw = (Math.random() * 2 - 1) * env;
      lp = lp * 0.72 + raw * 0.28;
      data[i] = lp * (i < 900 ? i / 900 : 1);
    }
  }
  return buf;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (!masterBus) {
    masterBus = ctx.createDynamicsCompressor();
    masterBus.threshold.value = -14;
    masterBus.knee.value = 18;
    masterBus.ratio.value = 3;
    masterBus.attack.value = 0.005;
    masterBus.release.value = 0.18;
    masterBus.connect(ctx.destination);

    reverbNode = ctx.createConvolver();
    reverbNode.buffer = createHallImpulse(ctx, 2.0, 2.8);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.24;
    reverbSend.connect(reverbNode);
    reverbNode.connect(masterBus);
  }
  return ctx;
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

let hammerBuf: AudioBuffer | null = null;
function hammerNoise(a: AudioContext): AudioBuffer {
  if (hammerBuf) return hammerBuf;
  const len = Math.floor(a.sampleRate * 0.03);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, 2.2);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  hammerBuf = buf;
  return buf;
}

/** Plays a real sampled Yamaha C5 Grand Piano, Rhodes E-Piano, or Warm Synth note with hall reverb. */
export function playNote(midi: number, delay = 0, duration = 1.25, volume = 0.24, voice: PianoVoice = currentVoice) {
  const a = audio();
  if (!a || !masterBus) return;
  const t = a.currentTime + delay;
  const dur = sustainOn ? Math.max(duration * 2.6, 3.2) : duration;

  // Use real Yamaha C5 Salamander Grand Piano recording when voice === 'grand'
  if (voice === 'grand') {
    preloadPianoSamples(a);
    if (playSampledGrandNote(a, masterBus, reverbSend, midi, t, dur, volume)) {
      return;
    }
  }

  // Physical-modeling fallback (or Rhodes / Warm Synth voices)
  const f0 = freq(midi);
  const pan = typeof a.createStereoPanner === 'function' ? a.createStereoPanner() : null;
  const target: AudioNode = pan ?? masterBus;
  if (pan) {
    pan.pan.value = Math.max(-0.55, Math.min(0.55, (midi - 66) / 36));
    pan.connect(masterBus);
    if (reverbSend) pan.connect(reverbSend);
  }

  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  const brightPeak = voice === 'grand' ? Math.min(9000, f0 * 9) : voice === 'rhodes' ? Math.min(5200, f0 * 6) : Math.min(3200, f0 * 4);
  const brightTail = voice === 'grand' ? Math.min(2600, f0 * 2.8) : voice === 'rhodes' ? Math.min(1800, f0 * 2.2) : Math.min(1400, f0 * 1.8);
  lp.frequency.setValueAtTime(brightPeak, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(220, brightTail), t + Math.min(0.55, dur * 0.45));
  lp.Q.value = voice === 'rhodes' ? 1.4 : 0.7;

  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(volume, t + (voice === 'warm' ? 0.045 : 0.009));
  out.gain.exponentialRampToValueAtTime(volume * (voice === 'rhodes' ? 0.48 : 0.36), t + 0.28);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  lp.connect(out);
  out.connect(target);
  if (!pan && reverbSend) out.connect(reverbSend);

  const partials: readonly [OscillatorType, number, number, number][] =
    voice === 'grand'
      ? [
          ['triangle', 1, 0, 1.0],
          ['sine', 1, 2.2, 0.32],
          ['sine', 2.001, -1.5, 0.34],
          ['sine', 3.004, 1.2, 0.14],
          ['sine', 4.01, -0.8, 0.06],
        ]
      : voice === 'rhodes'
        ? [
            ['sine', 1, 0, 1.0],
            ['sine', 2, 1.4, 0.26],
            ['sine', 7, 0, 0.07],
            ['triangle', 1, -2.5, 0.22],
          ]
        : [
            ['sawtooth', 1, -5, 0.42],
            ['sawtooth', 1, 5, 0.42],
            ['sine', 0.5, 0, 0.35],
          ];

  for (const [type, mult, detune, amp] of partials) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f0 * mult;
    o.detune.value = detune;
    g.gain.value = amp;
    if (voice === 'grand' && mult >= 3) {
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.45, dur * 0.4));
    }
    o.connect(g).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.06);
  }

  if (voice === 'grand') {
    const src = a.createBufferSource();
    src.buffer = hammerNoise(a);
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(3600, Math.max(900, f0 * 3.5));
    bp.Q.value = 1.6;
    const hg = a.createGain();
    hg.gain.setValueAtTime(volume * 0.35, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    src.connect(bp).connect(hg).connect(target);
    src.start(t);
    src.stop(t + 0.032);
  }
}

/** Notes one after another (melodic) or together (harmonic). */
export function playNotes(midis: number[], harmonic = false, gap = 0.55) {
  midis.forEach((m, i) => playNote(m, harmonic ? 0 : i * gap, harmonic ? 1.8 : 1.15, harmonic ? 0.16 : 0.22));
}

/** Crisp woodblock click (metronome / rhythm). */
export function playClick(delay = 0, accent = false) {
  const a = audio();
  if (!a || !masterBus) return;
  const t = a.currentTime + delay;

  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(accent ? 1320 : 880, t);
  o.frequency.exponentialRampToValueAtTime(accent ? 760 : 540, t + 0.035);
  g.gain.setValueAtTime(accent ? 0.28 : 0.17, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.048);
  o.connect(g).connect(masterBus);
  o.start(t);
  o.stop(t + 0.055);

  const src = a.createBufferSource();
  src.buffer = hammerNoise(a);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = accent ? 2600 : 1800;
  bp.Q.value = 2.4;
  const ng = a.createGain();
  ng.gain.setValueAtTime(accent ? 0.18 : 0.1, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
  src.connect(bp).connect(ng).connect(masterBus);
  src.start(t);
  src.stop(t + 0.025);
}

/** Plays a rhythm (beats in quarters) at the tempo: one count-in bar of clicks, then the pattern as tones. */
export function playRhythm(beats: number[], tempo: number) {
  const beat = 60 / tempo;
  for (let i = 0; i < 4; i++) playClick(i * beat, i === 0);
  let t = 4 * beat;
  for (const b of beats) {
    playNote(72, t, Math.min(0.35, b * beat), 0.22);
    t += b * beat;
  }
}
