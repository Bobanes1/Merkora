/**
 * Calm sounds and music for learning – hybrid studio engine (100 % offline):
 * - Real curated stereo audio recordings (/audio/ambient/*.mp3) with seamless equal-power crossfade looping
 *   for natural environments, places & focus sounds where real acoustics shine
 * - Real multi-sampled Yamaha C5 Grand Piano (Salamander V3) for Sanftes Klavier & Lo-Fi Beats
 * - Pure mathematical Web Audio synthesis for infinite non-repeating noise (brown/pink/white) & evolving ambient pads
 * One engine for the whole app: keeps playing across pages; mix several sounds at once.
 */
import { useSyncExternalStore } from 'react';
import { playSampledGrandNote, preloadPianoSamples } from './musicAudio';

export type SoundId =
  | 'rain'
  | 'storm'
  | 'ocean'
  | 'stream'
  | 'fire'
  | 'wind'
  | 'birds'
  | 'night'
  | 'cafe'
  | 'library'
  | 'train'
  | 'keyboard'
  | 'brown'
  | 'pink'
  | 'white'
  | 'pad'
  | 'piano'
  | 'lofi'
  | 'bowls';
export type SoundGroup = 'natur' | 'rauschen' | 'musik';
export const SOUNDS: { id: SoundId; label: string; group: SoundGroup; hint: string; real?: boolean }[] = [
  { id: 'rain', label: 'Regen am Fenster', group: 'natur', hint: 'echte Aufnahme – warmer Landregen auf Glas', real: true },
  { id: 'storm', label: 'Gewitter', group: 'natur', hint: 'echte Aufnahme – Regen & ferner Donner', real: true },
  { id: 'ocean', label: 'Meeresrauschen', group: 'natur', hint: 'echte Aufnahme – sanfte Meereswellen', real: true },
  { id: 'stream', label: 'Bach', group: 'natur', hint: 'echte Aufnahme – plätschernder Gebirgsbach', real: true },
  { id: 'fire', label: 'Kaminfeuer', group: 'natur', hint: 'echte Aufnahme – knisterndes Holzfeuer', real: true },
  { id: 'wind', label: 'Wind in Bäumen', group: 'natur', hint: 'echte Aufnahme – sanftes Blätterrascheln', real: true },
  { id: 'birds', label: 'Vogelgezwitscher', group: 'natur', hint: 'echte Aufnahme – Morgen im Wald', real: true },
  { id: 'night', label: 'Sommernacht', group: 'natur', hint: 'echte Aufnahme – Grillen & Abendstimmung', real: true },
  { id: 'library', label: 'Bibliothek', group: 'rauschen', hint: 'echte Aufnahme – ruhiger Lesesaal & Blättern', real: true },
  { id: 'cafe', label: 'Café', group: 'rauschen', hint: 'echte Aufnahme – gemütliches Kaffeehaus-Ambiente', real: true },
  { id: 'train', label: 'Zugfahrt', group: 'rauschen', hint: 'echte Aufnahme – gleichmäßiges Gleisrollen', real: true },
  { id: 'keyboard', label: 'Tastatur', group: 'rauschen', hint: 'echte Aufnahme – ruhiges Tippen im Fokus', real: true },
  { id: 'brown', label: 'Braunes Rauschen', group: 'rauschen', hint: 'tief und weich – gut gegen Ablenkung' },
  { id: 'pink', label: 'Rosa Rauschen', group: 'rauschen', hint: 'ausgewogen, wie ein Wasserfall' },
  { id: 'white', label: 'Weißes Rauschen', group: 'rauschen', hint: 'hell, überdeckt Geräusche' },
  { id: 'lofi', label: 'Lo-Fi Beats', group: 'musik', hint: 'echter Flügel, Vinyl-Wärme & 72-BPM-Groove', real: true },
  { id: 'piano', label: 'Sanftes Klavier', group: 'musik', hint: 'echter Yamaha-Flügel, nie zweimal gleich', real: true },
  { id: 'bowls', label: 'Klangschalen', group: 'musik', hint: 'echte Aufnahme – tibetische Klangschalen', real: true },
  { id: 'pad', label: 'Ruhige Klänge', group: 'musik', hint: 'langsame, warme Akkorde' },
];
export const GROUP_LABEL: Record<SoundGroup, string> = { natur: 'Natur', rauschen: 'Orte & Rauschen', musik: 'Musik' };

/** Bundled offline stereo studio recordings (/audio/ambient/*.mp3). */
export const REAL_SOUND_URL: Partial<Record<SoundId, string>> = {
  rain: '/audio/ambient/rain.mp3',
  storm: '/audio/ambient/storm.mp3',
  ocean: '/audio/ambient/ocean.mp3',
  stream: '/audio/ambient/stream.mp3',
  fire: '/audio/ambient/fire.mp3',
  wind: '/audio/ambient/wind.mp3',
  birds: '/audio/ambient/birds.mp3',
  night: '/audio/ambient/night.mp3',
  cafe: '/audio/ambient/cafe.mp3',
  library: '/audio/ambient/library.mp3',
  train: '/audio/ambient/train.mp3',
  keyboard: '/audio/ambient/keyboard.mp3',
  bowls: '/audio/ambient/bowls.mp3',
};

type Mix = Partial<Record<SoundId, number>>;
type State = { playing: Mix; master: number; timerEnd: number | null; paused: boolean };
let state: State = { playing: {}, master: 0.7, timerEnd: null, paused: false };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};
export function useAmbient() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
  );
}
export const ambientState = () => state;

// ---------- audio graph ----------
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbIn: GainNode | null = null;
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
/** Measures what comes out: loudness, peaks and where the sound sits in pitch (for checks and the level display). */
let meter: AnalyserNode | null = null;
export function outputLevels(): { rms: number; peak: number; centroid: number } | null {
  if (!meter || !ctx) return null;
  const wave = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(wave);
  let sum = 0;
  let peak = 0;
  for (const v of wave) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const spec = new Float32Array(meter.frequencyBinCount);
  meter.getFloatFrequencyData(spec);
  let num = 0;
  let den = 0;
  spec.forEach((db, i) => {
    const p = Math.pow(10, db / 10);
    num += p * ((i * ctx!.sampleRate) / meter!.fftSize);
    den += p;
  });
  return { rms: Math.sqrt(sum / wave.length), peak, centroid: den ? num / den : 0 };
}

function masterOut(): GainNode | null {
  const c = audioContext();
  if (!c) return null;
  if (!master) {
    master = c.createGain();
    master.gain.value = state.master;
    meter = c.createAnalyser();
    meter.fftSize = 4096;
    master.connect(meter);
    meter.connect(c.destination);
    // a small reverb (two feedback delays through a soft filter) for the music
    reverbIn = c.createGain();
    reverbIn.gain.value = 0.35;
    for (const [t, fb] of [
      [0.137, 0.55],
      [0.211, 0.5],
    ] as const) {
      const d = c.createDelay(1);
      d.delayTime.value = t;
      const g = c.createGain();
      g.gain.value = fb;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      reverbIn.connect(d);
      d.connect(lp);
      lp.connect(g);
      g.connect(d);
      lp.connect(master);
    }
  }
  return master;
}

/** Noise buffers (white, pink, brown) – 4 s, looped. */
const buffers: Partial<Record<'white' | 'pink' | 'brown', AudioBuffer>> = {};
function noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const c = audioContext()!;
  if (buffers[kind]) return buffers[kind]!;
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') {
      // Paul Kellet's pink noise filter
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  buffers[kind] = buf;
  return buf;
}

type Voice = { gain: GainNode; stop: () => void };
const voices: Partial<Record<SoundId, Voice>> = {};

function loopNoise(c: AudioContext, kind: 'white' | 'pink' | 'brown', out: AudioNode) {
  const src = c.createBufferSource();
  src.buffer = noise(kind);
  src.loop = true;
  src.connect(out);
  src.start();
  return src;
}
function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}
function lfo(c: AudioContext, rate: number, depth: number, target: AudioParam) {
  const o = c.createOscillator();
  o.frequency.value = rate;
  const g = c.createGain();
  g.gain.value = depth;
  o.connect(g);
  g.connect(target);
  o.start();
  return o;
}
/** Runs `tick` every 100 ms (for sounds made of single events: crackling, birds, notes …). */
function every(tick: () => void, ms = 100) {
  const t = window.setInterval(tick, ms);
  return () => window.clearInterval(t);
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A short noise burst (crackle, drop). */
function burst(c: AudioContext, out: AudioNode, at: number, dur: number, freq: number, vol: number) {
  const src = c.createBufferSource();
  src.buffer = noise('white');
  const f = filter(c, 'bandpass', freq, 1.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(at, Math.random() * 3);
  src.stop(at + dur + 0.05);
}
/** A soft tone with harmonics and decay (piano, bowl). */
function tone(c: AudioContext, out: AudioNode, at: number, freq: number, vol: number, decay: number, partials: [number, number][]) {
  for (const [mult, amp] of partials) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol * amp, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * (mult > 2 ? 0.5 : 1));
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + decay + 0.1);
  }
}
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Left/right placement (−1 … 1); without a StereoPanner in the browser simply in the middle. */
function panned(c: AudioContext, out: AudioNode, pan: number): AudioNode {
  if (typeof c.createStereoPanner !== 'function') return out;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(out);
  return p;
}
/** A value that wanders slowly and randomly (smoothed) – makes a loop sound alive instead of mechanical. */
function wander(c: AudioContext, param: AudioParam, min: number, max: number, everySec: number, smooth: number) {
  param.setValueAtTime(rnd(min, max), c.currentTime);
  const t = window.setInterval(() => param.setTargetAtTime(rnd(min, max), c.currentTime, smooth), everySec * 1000);
  return () => window.clearInterval(t);
}
/** How many random events happen in `dt` seconds at `rate` per second (Poisson) – irregular like in nature. */
function poisson(rate: number, dt: number): number {
  let n = 0;
  let t = 0;
  for (;;) {
    t += -Math.log(1 - Math.random()) / rate;
    if (t > dt) return n;
    n++;
  }
}

/** Fire: a very short click from burning wood; a „pop“ is lower, a bit longer and throws a few sparks after it. */
function crackle(c: AudioContext, out: AudioNode, at: number, vol: number, pop: boolean) {
  const src = c.createBufferSource();
  src.buffer = noise('white');
  const hp = filter(c, 'highpass', pop ? rnd(500, 1100) : rnd(1800, 5000), 0.7);
  const g = c.createGain();
  const dur = pop ? rnd(0.012, 0.035) : rnd(0.0015, 0.007);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(out);
  src.start(at, Math.random() * 3);
  src.stop(at + dur + 0.01);
  if (pop) for (let k = Math.floor(rnd(2, 6)); k > 0; k--) crackle(c, out, at + rnd(0.01, 0.15), vol * rnd(0.08, 0.3), false);
}

/** Brook: one tiny air bubble in water – a short tone whose pitch rises quickly (that is the „gurgle“). */
function bubble(c: AudioContext, out: AudioNode, at: number, f: number, vol: number) {
  const dur = 0.01 + 12 / f;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, at);
  o.frequency.exponentialRampToValueAtTime(f * rnd(1.5, 2.4), at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + dur + 0.01);
}

/** Birds: one tone with a pitch curve, soft envelope and a little vibrato. */
function birdNote(c: AudioContext, out: AudioNode, at: number, curve: number[], dur: number, vol: number, vib = 0) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueCurveAtTime(Float32Array.from(curve), at, dur);
  if (vib) {
    const m = c.createOscillator();
    m.frequency.value = rnd(25, 60);
    const mg = c.createGain();
    mg.gain.value = vib;
    m.connect(mg);
    mg.connect(o.frequency);
    m.start(at);
    m.stop(at + dur + 0.02);
  }
  const g = c.createGain();
  const a = Math.min(0.02, dur / 4);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + a);
  g.gain.setValueAtTime(vol, at + dur - a);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}
type Bird = { kind: 'trill' | 'whistle' | 'chirps' | 'call'; base: number; out: AudioNode; vol: number; next: number };
/** Sings one phrase of this bird; returns how long it lasts. */
function sing(c: AudioContext, b: Bird, at: number): number {
  const f = b.base * rnd(0.96, 1.04);
  if (b.kind === 'trill') {
    // fast warbling: many short notes, slowly falling
    const n = Math.floor(rnd(10, 22));
    for (let k = 0; k < n; k++) {
      const p = f * (1 - (k / n) * 0.18);
      birdNote(c, b.out, at + k * 0.045, [p * 1.08, p, p * 1.05], 0.03, b.vol * rnd(0.7, 1), p * 0.05);
    }
    return n * 0.045;
  }
  if (b.kind === 'whistle') {
    // a clear two- or three-tone whistle, gently slurred
    const tones = Math.random() < 0.5 ? [f, f * 1.26, f * 1.12] : [f * 1.2, f, f * 0.9, f * 1.05];
    const dur = rnd(0.35, 0.6);
    birdNote(c, b.out, at, tones, dur, b.vol, f * 0.008);
    if (Math.random() < 0.5) birdNote(c, b.out, at + dur + 0.12, tones, dur * 0.9, b.vol * 0.85, f * 0.008);
    return dur * 2.2;
  }
  if (b.kind === 'chirps') {
    // a series of quick chirps, each falling, the series getting lower
    const n = Math.floor(rnd(3, 7));
    let t = at;
    for (let k = 0; k < n; k++) {
      const p = f * (1 - k * 0.05);
      birdNote(c, b.out, t, [p * 1.45, p * 1.1, p * 0.92], rnd(0.05, 0.08), b.vol * rnd(0.75, 1));
      t += rnd(0.09, 0.15);
    }
    return t - at;
  }
  // call: two short rising notes („zi-zi“)
  for (let k = 0; k < 2; k++) birdNote(c, b.out, at + k * 0.16, [f * 0.9, f * 1.25], 0.09, b.vol);
  return 0.35;
}

// ---------- Real Studio Recording Seamless Crossfade Looper ----------
const realBufCache = new Map<string, Promise<AudioBuffer | null>>();

function loadRealBuffer(c: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (typeof fetch === 'undefined') return Promise.resolve(null);
  let p = realBufCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? c.decodeAudioData(ab) : null))
      .catch(() => null);
    realBufCache.set(url, p);
  }
  return p;
}

/**
 * Plays a real studio MP3 loop with overlapping equal-power crossfades (no click or seam ever).
 * Returns a stop function; falls back cleanly to `onFallback()` if the audio file cannot be decoded.
 */
function startRealLoop(c: AudioContext, url: string, out: AudioNode, gainScale = 1, onFallback?: () => () => void): () => void {
  let stopped = false;
  let timerId: number | undefined;
  let fallbackStop: (() => void) | null = null;
  const active = new Set<AudioBufferSourceNode>();

  const schedulePass = (buf: AudioBuffer, startAt: number, isFirst: boolean) => {
    if (stopped) return;
    const dur = buf.duration;
    // Crossfade up to 2.4s (never more than 35% of buffer length)
    const xfade = Math.min(2.4, Math.max(0.35, dur * 0.25));
    const step = Math.max(0.5, dur - xfade);

    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(isFirst ? gainScale : 0.0001, startAt);
    if (!isFirst) g.gain.linearRampToValueAtTime(gainScale, startAt + xfade);
    g.gain.setValueAtTime(gainScale, startAt + step);
    g.gain.linearRampToValueAtTime(0.0001, startAt + dur);

    src.connect(g).connect(out);
    src.start(startAt);
    src.stop(startAt + dur + 0.05);
    active.add(src);
    src.onended = () => active.delete(src);

    const nextAt = startAt + step;
    const waitMs = Math.max(100, (nextAt - c.currentTime - 0.35) * 1000);
    timerId = window.setTimeout(() => schedulePass(buf, Math.max(c.currentTime + 0.04, nextAt), false), waitMs);
  };

  void loadRealBuffer(c, url).then((buf) => {
    if (stopped) return;
    if (!buf || buf.duration < 0.8) {
      if (onFallback) fallbackStop = onFallback();
      return;
    }
    schedulePass(buf, c.currentTime + 0.02, true);
  });

  return () => {
    stopped = true;
    if (timerId !== undefined) window.clearTimeout(timerId);
    fallbackStop?.();
    active.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already ended
      }
    });
    active.clear();
  };
}

function build(id: SoundId, c: AudioContext, out: GainNode): () => void {
  const realUrl = REAL_SOUND_URL[id];
  if (realUrl) {
    // Use real studio recording with seamless crossfade looping; fall back to synthesis only if unavailable
    return startRealLoop(c, realUrl, out, 0.92, () => buildSynth(id, c, out));
  }
  return buildSynth(id, c, out);
}

function buildSynth(id: SoundId, c: AudioContext, out: GainNode): () => void {
  const stops: (() => void)[] = [];
  const keep = (n: AudioScheduledSourceNode) => stops.push(() => n.stop());
  switch (id) {
    case 'white':
    case 'pink':
    case 'brown': {
      const lp = filter(c, 'lowpass', id === 'white' ? 9000 : 6000);
      lp.connect(out);
      keep(loopNoise(c, id, lp));
      break;
    }
    case 'rain':
    case 'storm': {
      const bp = filter(c, 'bandpass', 1400, 0.4);
      const hs = filter(c, 'highshelf', 4000);
      hs.gain.value = -6;
      bp.connect(hs);
      hs.connect(out);
      keep(loopNoise(c, 'pink', bp));
      // single drops on top
      stops.push(
        every(() => {
          const t = c.currentTime;
          for (let k = 0; k < 3; k++) if (Math.random() < 0.6) burst(c, out, t + Math.random() * 0.1, rnd(0.01, 0.03), rnd(2500, 6000), rnd(0.02, 0.06));
        }),
      );
      if (id === 'storm') {
        let next = c.currentTime + rnd(4, 10);
        stops.push(
          every(() => {
            if (c.currentTime < next) return;
            const src = c.createBufferSource();
            src.buffer = noise('brown');
            const lp = filter(c, 'lowpass', 140);
            const g = c.createGain();
            const at = c.currentTime + 0.05;
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(0.9, at + rnd(0.3, 0.9));
            g.gain.exponentialRampToValueAtTime(0.0001, at + rnd(4, 7));
            src.connect(lp);
            lp.connect(g);
            g.connect(out);
            src.start(at, Math.random() * 2);
            src.stop(at + 8);
            next = c.currentTime + rnd(15, 35);
          }),
        );
      }
      break;
    }
    case 'ocean': {
      const lp = filter(c, 'lowpass', 700);
      const g = c.createGain();
      g.gain.value = 0.55;
      lp.connect(g);
      g.connect(out);
      keep(loopNoise(c, 'brown', lp));
      keep(loopNoise(c, 'pink', filter(c, 'lowpass', 900)));
      // waves: slow swelling of volume and brightness
      keep(lfo(c, 0.11, 0.4, g.gain));
      keep(lfo(c, 0.11, 400, lp.frequency));
      break;
    }
    case 'stream': {
      // the soft rushing of flowing water, never quite the same
      const bed = filter(c, 'bandpass', 900, 0.5);
      const bg = c.createGain();
      bg.gain.value = 0.25;
      bed.connect(bg);
      bg.connect(out);
      keep(loopNoise(c, 'pink', bed));
      stops.push(wander(c, bed.frequency, 600, 1300, 0.7, 0.5));
      stops.push(wander(c, bg.gain, 0.16, 0.3, 0.8, 0.5));
      // the gurgling: 30–60 tiny bubbles per second, spread left and right; bigger bubbles are lower and louder
      let flow = 45;
      stops.push(
        every(() => {
          const t = c.currentTime;
          if (Math.random() < 0.04) flow = rnd(30, 60);
          for (let k = poisson(flow, 0.1); k > 0; k--) {
            const f = Math.exp(rnd(Math.log(350), Math.log(1900)));
            const vol = Math.min(0.09, rnd(0.012, 0.04) * Math.sqrt(1200 / f));
            bubble(c, panned(c, out, rnd(-0.8, 0.8)), t + Math.random() * 0.1, f, vol);
          }
        }),
      );
      break;
    }
    case 'fire': {
      // the body of the flames: a deep, softly breathing roar
      const roarLp = filter(c, 'lowpass', 260);
      const roar = c.createGain();
      roar.gain.value = 0.25;
      roarLp.connect(roar);
      roar.connect(out);
      keep(loopNoise(c, 'brown', roarLp));
      stops.push(wander(c, roar.gain, 0.12, 0.35, 0.35, 0.25));
      stops.push(wander(c, roarLp.frequency, 180, 420, 0.5, 0.3));
      // the faint hiss of hot gas
      const hissBp = filter(c, 'bandpass', 3500, 0.6);
      const hiss = c.createGain();
      hiss.gain.value = 0.05;
      hissBp.connect(hiss);
      hiss.connect(out);
      keep(loopNoise(c, 'pink', hissBp));
      stops.push(wander(c, hiss.gain, 0.02, 0.08, 0.6, 0.4));
      // crackling: very short clicks at irregular times, sometimes in bunches – mostly quiet, now and then a loud pop
      let flare = 1;
      stops.push(
        every(() => {
          const t = c.currentTime;
          if (Math.random() < 0.05) flare = rnd(0.4, 3);
          for (let k = poisson(9 * flare, 0.1); k > 0; k--) {
            const loud = Math.pow(Math.random(), 3);
            crackle(c, panned(c, out, rnd(-0.6, 0.6)), t + Math.random() * 0.1, 0.06 + 0.85 * loud, loud > 0.55);
          }
        }),
      );
      break;
    }
    case 'wind': {
      const bp = filter(c, 'bandpass', 500, 0.8);
      const g = c.createGain();
      g.gain.value = 0.6;
      bp.connect(g);
      g.connect(out);
      keep(loopNoise(c, 'pink', bp));
      keep(lfo(c, 0.07, 250, bp.frequency));
      keep(lfo(c, 0.13, 0.35, g.gain));
      break;
    }
    case 'birds': {
      // a quiet forest: soft air and now and then rustling leaves
      const air = filter(c, 'lowpass', 700);
      const ag = c.createGain();
      ag.gain.value = 0.035;
      air.connect(ag);
      ag.connect(out);
      keep(loopNoise(c, 'pink', air));
      const leaves = filter(c, 'bandpass', 2600, 0.7);
      const lg = c.createGain();
      leaves.connect(lg);
      lg.connect(out);
      keep(loopNoise(c, 'pink', leaves));
      stops.push(wander(c, lg.gain, 0, 0.025, 1.2, 0.8));
      // four birds of different kinds, some near, some far away (quieter, muffled, more echo), each in its own place
      const kinds: Bird['kind'][] = ['trill', 'whistle', 'chirps', 'call'];
      const birds: Bird[] = kinds.map((kind, k) => {
        const near = k % 2 === 0;
        const lp = filter(c, 'lowpass', near ? 9000 : 3800);
        const place = panned(c, out, (k % 2 ? -1 : 1) * rnd(0.3, 0.85));
        lp.connect(place);
        if (!near) lp.connect(reverbIn!);
        return { kind, base: kind === 'whistle' ? rnd(2000, 2900) : rnd(2900, 4600), out: lp, vol: near ? 0.16 : 0.06, next: c.currentTime + rnd(0.3, 4) };
      });
      stops.push(
        every(() => {
          const now = c.currentTime;
          for (const b of birds) {
            if (now < b.next) continue;
            const len = sing(c, b, now + 0.05);
            b.next = now + len + rnd(1.5, 7);
            // sometimes another bird answers soon after
            const other = birds[Math.floor(Math.random() * birds.length)];
            if (other !== b && Math.random() < 0.3) other.next = Math.min(other.next, now + len + rnd(0.3, 1));
          }
        }),
      );
      break;
    }
    case 'pad': {
      // slow warm chords: Cmaj7 – Am7 – Fmaj7 – G6, each about 8 s, soft triangle voices through a filter
      const chords = [
        [48, 55, 59, 64],
        [45, 52, 55, 60],
        [41, 48, 52, 57],
        [43, 50, 52, 59],
      ];
      const lp = filter(c, 'lowpass', 900);
      lp.connect(out);
      lp.connect(reverbIn!);
      let i = 0;
      let next = c.currentTime + 0.1;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          const at = next;
          for (const n of chords[i % chords.length]) {
            for (const det of [-4, 4]) {
              const o = c.createOscillator();
              o.type = 'triangle';
              o.frequency.value = midi(n);
              o.detune.value = det;
              const g = c.createGain();
              g.gain.setValueAtTime(0, at);
              g.gain.linearRampToValueAtTime(0.05, at + 2.5);
              g.gain.setValueAtTime(0.05, at + 6.5);
              g.gain.linearRampToValueAtTime(0, at + 9.5);
              o.connect(g);
              g.connect(lp);
              o.start(at);
              o.stop(at + 10);
            }
          }
          i++;
          next = at + 8;
        }),
      );
      break;
    }
    case 'piano': {
      // Real Yamaha C5 Grand Piano (Salamander V3) playing calm, non-repeating pentatonic melodies
      preloadPianoSamples(c);
      const scale = [60, 62, 64, 67, 69, 72, 74, 76];
      const g = c.createGain();
      g.gain.value = 0.85;
      g.connect(out);
      g.connect(reverbIn!);
      let next = c.currentTime + 0.2;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          const n = scale[Math.floor(Math.random() * scale.length)];
          const dur = rnd(2.2, 3.4);
          if (!playSampledGrandNote(c, g, reverbIn, n, next, dur, 0.14)) {
            tone(c, g, next, midi(n), 0.16, dur, [
              [1, 1],
              [2, 0.35],
              [3, 0.12],
            ]);
          }
          if (Math.random() < 0.28) {
            if (!playSampledGrandNote(c, g, reverbIn, n - 12, next + 0.02, 3.2, 0.09)) {
              tone(c, g, next, midi(n - 12), 0.1, 3, [[1, 1], [2, 0.2]]);
            }
          }
          next += rnd(0.75, 1.85);
        }),
      );
      break;
    }
    case 'bowls': {
      const notes = [48, 51, 53, 55, 58, 60];
      const g = c.createGain();
      g.connect(out);
      g.connect(reverbIn!);
      let next = c.currentTime + 0.2;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          const f = midi(notes[Math.floor(Math.random() * notes.length)]);
          tone(c, g, next, f, 0.16, rnd(7, 10), [
            [1, 1],
            [2.76, 0.35],
            [5.4, 0.12],
          ]);
          next += rnd(5, 9);
        }),
      );
      break;
    }
    case 'lofi': {
      // Warm 72 BPM Lo-Fi Study Beats: real Yamaha C5 Grand Piano chords through warm tape filter + real vinyl crackle + mellow beat
      preloadPianoSamples(c);
      const chords = [
        [53, 57, 60, 64, 67], // Fmaj9
        [52, 55, 59, 62, 64], // Em7
        [50, 53, 57, 60, 64], // Dm9
        [48, 52, 55, 59, 62], // Cmaj9
      ];
      const lp = filter(c, 'lowpass', 1850, 0.7);
      lp.connect(out);
      lp.connect(reverbIn!);

      // Subtle real vinyl crackle loop underneath
      stops.push(startRealLoop(c, '/audio/ambient/vinyl.mp3', out, 0.18));

      const beat = 60 / 72; // ~0.833s per quarter
      let step = 0;
      let next = c.currentTime + 0.1;
      stops.push(
        every(() => {
          while (next < c.currentTime + 0.25) {
            const bar = Math.floor(step / 8) % chords.length;
            const sub = step % 8; // eighth notes
            if (sub === 0) {
              const ch = chords[bar];
              ch.forEach((n, idx) => {
                const at = next + idx * 0.028;
                if (!playSampledGrandNote(c, lp, reverbIn, n, at, beat * 3.5, 0.06)) {
                  tone(c, lp, at, midi(n), 0.055, beat * 3.6, [
                    [1, 1],
                    [2, 0.24],
                    [3, 0.06],
                  ]);
                }
              });
            }
            // Soft muted kick on 1 and 3.5
            if (sub === 0 || sub === 5) {
              const ko = c.createOscillator();
              const kg = c.createGain();
              ko.type = 'sine';
              ko.frequency.setValueAtTime(115, next);
              ko.frequency.exponentialRampToValueAtTime(44, next + 0.12);
              kg.gain.setValueAtTime(0.24, next);
              kg.gain.exponentialRampToValueAtTime(0.001, next + 0.19);
              ko.connect(kg).connect(out);
              ko.start(next);
              ko.stop(next + 0.21);
            }
            // Soft brushed snare on beats 2 & 4 (sub 2 & 6)
            if (sub === 2 || sub === 6) {
              const sSrc = c.createBufferSource();
              sSrc.buffer = noise('pink');
              const sBp = filter(c, 'bandpass', 1450, 1.1);
              const sg = c.createGain();
              sg.gain.setValueAtTime(0.11, next);
              sg.gain.exponentialRampToValueAtTime(0.001, next + 0.11);
              sSrc.connect(sBp).connect(sg).connect(out);
              sSrc.start(next);
              sSrc.stop(next + 0.13);
            }
            // Soft closed hi-hat on every eighth (subtle swing)
            const hSrc = c.createBufferSource();
            hSrc.buffer = noise('white');
            const hHp = filter(c, 'highpass', 6200, 0.7);
            const hg = c.createGain();
            const swung = sub % 2 === 1 ? next + 0.025 : next;
            hg.gain.setValueAtTime(sub % 2 === 0 ? 0.032 : 0.018, swung);
            hg.gain.exponentialRampToValueAtTime(0.001, swung + 0.045);
            hSrc.connect(hHp).connect(hg).connect(out);
            hSrc.start(swung);
            hSrc.stop(swung + 0.05);

            next += beat / 2;
            step++;
          }
        }, 60),
      );
      break;
    }
    case 'library':
    case 'train':
    case 'keyboard':
    case 'cafe': {
      // Cozy library & café room warmth + subtle porcelain clinks & soft page turns
      const roomLp = filter(c, 'lowpass', 680, 0.7);
      const roomHp = filter(c, 'highpass', 110, 0.6);
      const roomG = c.createGain();
      roomG.gain.value = 0.42;
      roomHp.connect(roomLp).connect(roomG).connect(out);
      const roomSrc = loopNoise(c, 'pink', roomHp);
      stops.push(() => roomSrc.stop());

      let next = c.currentTime + 1.2;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          if (Math.random() < 0.45) {
            // Soft porcelain cup clink
            const f = rnd(1900, 2900);
            tone(c, out, next, f, 0.022, 0.22, [
              [1, 1],
              [2.32, 0.35],
            ]);
          } else {
            // Quiet page turn rustle
            const pSrc = c.createBufferSource();
            pSrc.buffer = noise('pink');
            const pBp = filter(c, 'bandpass', rnd(1500, 2400), 1.4);
            const pg = c.createGain();
            pg.gain.setValueAtTime(0.001, next);
            pg.gain.linearRampToValueAtTime(0.055, next + 0.06);
            pg.gain.exponentialRampToValueAtTime(0.001, next + 0.24);
            pSrc.connect(pBp).connect(pg).connect(out);
            pSrc.start(next);
            pSrc.stop(next + 0.26);
          }
          next += rnd(1.8, 4.6);
        }),
      );
      break;
    }
    case 'night': {
      // Warm evening breeze + gentle rhythmic summer crickets
      const breezeLp = filter(c, 'lowpass', 360, 0.6);
      const breezeG = c.createGain();
      breezeG.gain.value = 0.28;
      breezeLp.connect(breezeG).connect(out);
      const breezeSrc = loopNoise(c, 'brown', breezeLp);
      stops.push(() => breezeSrc.stop());

      let next = c.currentTime + 0.5;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          const baseF = rnd(3900, 4400);
          const pulses = Math.random() < 0.5 ? 3 : 4;
          for (let p = 0; p < pulses; p++) {
            const pt = next + p * 0.068;
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = 'sine';
            o.frequency.value = baseF + (p % 2) * 35;
            g.gain.setValueAtTime(0.0001, pt);
            g.gain.linearRampToValueAtTime(0.026, pt + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, pt + 0.052);
            o.connect(g).connect(out);
            o.start(pt);
            o.stop(pt + 0.058);
          }
          next += rnd(0.85, 2.3);
        }),
      );
      break;
    }
  }
  return () => stops.forEach((s) => s());
}

/** Loudness of each sound at volume 1 (so the mix stays balanced). */
const LEVEL: Record<SoundId, number> = {
  rain: 0.82,
  storm: 0.85,
  ocean: 0.8,
  stream: 0.85,
  fire: 0.85,
  wind: 0.78,
  birds: 0.8,
  night: 0.8,
  library: 0.9,
  cafe: 0.82,
  train: 0.82,
  keyboard: 0.75,
  brown: 0.6,
  pink: 0.45,
  white: 0.25,
  lofi: 0.9,
  pad: 1,
  piano: 1,
  bowls: 0.85,
};

function startVoice(id: SoundId, vol: number) {
  const c = audioContext();
  const out = masterOut();
  if (!c || !out || voices[id]) return;
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(vol * LEVEL[id], c.currentTime + 1.2);
  g.connect(out);
  const stopGraph = build(id, c, g);
  voices[id] = {
    gain: g,
    stop: () => {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.8);
      window.setTimeout(() => (stopGraph(), g.disconnect()), 900);
    },
  };
}
function stopVoice(id: SoundId) {
  voices[id]?.stop();
  delete voices[id];
}

// ---------- public controls ----------
export function toggleSound(id: SoundId) {
  const playing = { ...state.playing };
  if (playing[id] !== undefined) {
    delete playing[id];
    stopVoice(id);
  } else {
    playing[id] = 0.7;
    if (!state.paused) startVoice(id, 0.7);
  }
  set({ playing });
}
export function setSoundVolume(id: SoundId, v: number) {
  const vol = Math.max(0, Math.min(1, v));
  set({ playing: { ...state.playing, [id]: vol } });
  const voice = voices[id];
  if (voice && ctx) voice.gain.gain.setTargetAtTime(vol * LEVEL[id], ctx.currentTime, 0.1);
}
export function setMasterVolume(v: number) {
  set({ master: Math.max(0, Math.min(1, v)) });
  if (master && ctx) master.gain.setTargetAtTime(state.master, ctx.currentTime, 0.1);
}
export function playMix(mix: Mix) {
  stopAll();
  for (const [id, v] of Object.entries(mix) as [SoundId, number][]) startVoice(id, v);
  set({ playing: { ...mix }, paused: false });
}
export function pauseAll() {
  (Object.keys(voices) as SoundId[]).forEach(stopVoice);
  set({ paused: true });
}
export function resumeAll() {
  for (const [id, v] of Object.entries(state.playing) as [SoundId, number][]) startVoice(id, v);
  set({ paused: false });
}
export function stopAll() {
  (Object.keys(voices) as SoundId[]).forEach(stopVoice);
  clearTimer();
  set({ playing: {}, paused: false });
}

let timer: number | undefined;
function clearTimer() {
  window.clearTimeout(timer);
  timer = undefined;
  if (state.timerEnd) set({ timerEnd: null });
}
/** Stops everything after `minutes` (null = no timer). */
export function setSleepTimer(minutes: number | null) {
  window.clearTimeout(timer);
  if (!minutes) return set({ timerEnd: null });
  const end = Date.now() + minutes * 60000;
  timer = window.setTimeout(() => stopAll(), minutes * 60000);
  set({ timerEnd: end });
}

// ---------- favourites (only on this device) ----------
export type Favourite = { name: string; mix: Mix };
const FAV_KEY = 'merkora.sound.favourites';
export function loadFavourites(): Favourite[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveFavourites(list: Favourite[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* private mode */
  }
}
/** Ready-made mixes. */
export const PRESETS: Favourite[] = [
  { name: 'Lo-Fi Session', mix: { lofi: 0.78, rain: 0.32 } },
  { name: 'Unibibliothek', mix: { library: 0.78, rain: 0.25 } },
  { name: 'Nachtzug & Regen', mix: { train: 0.72, rain: 0.45 } },
  { name: 'Regen am Fenster', mix: { rain: 0.78, piano: 0.45 } },
  { name: 'Café & Fokus', mix: { cafe: 0.7, keyboard: 0.3 } },
  { name: 'Hütte im Wald', mix: { fire: 0.72, wind: 0.35, birds: 0.25 } },
  { name: 'Am Meer', mix: { ocean: 0.78, bowls: 0.35 } },
  { name: 'Tiefer Fokus', mix: { brown: 0.65, pad: 0.35 } },
];

/** Short text of what is playing („Regen + Klavier“). */
export function mixLabel(mix: Mix): string {
  const names = SOUNDS.filter((s) => mix[s.id] !== undefined).map((s) => s.label);
  return names.length > 2 ? `${names.slice(0, 2).join(' + ')} + ${names.length - 2}` : names.join(' + ');
}

/** For checks in the browser console: window.merkoraSound.levels() while something plays. */
if (typeof window !== 'undefined') (window as unknown as { merkoraSound?: unknown }).merkoraSound = { levels: outputLevels, toggle: toggleSound, stop: stopAll };
