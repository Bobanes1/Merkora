/**
 * Calm sounds and music for learning – generated live with Web Audio (no audio files, no licences, offline).
 * One engine for the whole app: it keeps playing when you change pages. Several sounds can play at once (a mix).
 */
import { useSyncExternalStore } from 'react';

export type SoundId = 'rain' | 'storm' | 'ocean' | 'stream' | 'fire' | 'wind' | 'birds' | 'brown' | 'pink' | 'white' | 'pad' | 'piano' | 'bowls';
export type SoundGroup = 'natur' | 'rauschen' | 'musik';
export const SOUNDS: { id: SoundId; label: string; group: SoundGroup; hint: string }[] = [
  { id: 'rain', label: 'Regen', group: 'natur', hint: 'gleichmäßiger Landregen' },
  { id: 'storm', label: 'Gewitter', group: 'natur', hint: 'Regen mit fernem Donner' },
  { id: 'ocean', label: 'Meeresrauschen', group: 'natur', hint: 'Wellen, die kommen und gehen' },
  { id: 'stream', label: 'Bach', group: 'natur', hint: 'plätscherndes Wasser' },
  { id: 'fire', label: 'Kaminfeuer', group: 'natur', hint: 'Knistern und Glut' },
  { id: 'wind', label: 'Wind', group: 'natur', hint: 'sanfte Böen' },
  { id: 'birds', label: 'Vogelgezwitscher', group: 'natur', hint: 'Morgen im Wald' },
  { id: 'brown', label: 'Braunes Rauschen', group: 'rauschen', hint: 'tief und weich – gut gegen Ablenkung' },
  { id: 'pink', label: 'Rosa Rauschen', group: 'rauschen', hint: 'ausgewogen, wie ein Wasserfall' },
  { id: 'white', label: 'Weißes Rauschen', group: 'rauschen', hint: 'hell, überdeckt Geräusche' },
  { id: 'pad', label: 'Ruhige Klänge', group: 'musik', hint: 'langsame, warme Akkorde' },
  { id: 'piano', label: 'Sanftes Klavier', group: 'musik', hint: 'leise Töne, nie zweimal gleich' },
  { id: 'bowls', label: 'Klangschalen', group: 'musik', hint: 'lang ausklingende Töne' },
];
export const GROUP_LABEL: Record<SoundGroup, string> = { natur: 'Natur', rauschen: 'Rauschen', musik: 'Musik' };

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
function masterOut(): GainNode | null {
  const c = audioContext();
  if (!c) return null;
  if (!master) {
    master = c.createGain();
    master.gain.value = state.master;
    master.connect(c.destination);
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
function every(tick: () => void) {
  const t = window.setInterval(tick, 100);
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

function build(id: SoundId, c: AudioContext, out: GainNode): () => void {
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
      const bp = filter(c, 'bandpass', 1800, 0.9);
      bp.connect(out);
      keep(loopNoise(c, 'white', bp));
      keep(lfo(c, 5.3, 500, bp.frequency));
      keep(lfo(c, 0.7, 300, bp.frequency));
      stops.push(
        every(() => {
          const t = c.currentTime;
          if (Math.random() < 0.5) burst(c, out, t + Math.random() * 0.1, rnd(0.02, 0.05), rnd(900, 2200), rnd(0.03, 0.07));
        }),
      );
      break;
    }
    case 'fire': {
      const lp = filter(c, 'lowpass', 500);
      const g = c.createGain();
      g.gain.value = 0.7;
      lp.connect(g);
      g.connect(out);
      keep(loopNoise(c, 'brown', lp));
      stops.push(
        every(() => {
          const t = c.currentTime;
          const n = Math.random() < 0.15 ? 4 : Math.random() < 0.5 ? 1 : 0;
          for (let k = 0; k < n; k++) burst(c, out, t + Math.random() * 0.1, rnd(0.004, 0.02), rnd(1500, 5000), rnd(0.08, 0.25));
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
      const bed = filter(c, 'lowpass', 1200);
      const bg = c.createGain();
      bg.gain.value = 0.12;
      bed.connect(bg);
      bg.connect(out);
      keep(loopNoise(c, 'pink', bed));
      let next = c.currentTime + 0.5;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          // a little phrase of 2–5 chirps
          const base = rnd(2200, 3800);
          const n = Math.floor(rnd(2, 6));
          let at = c.currentTime + 0.05;
          for (let k = 0; k < n; k++) {
            const o = c.createOscillator();
            const g = c.createGain();
            o.frequency.setValueAtTime(base * rnd(0.9, 1.1), at);
            o.frequency.exponentialRampToValueAtTime(base * rnd(1.3, 1.7), at + 0.07);
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(0.07, at + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
            o.connect(g);
            g.connect(out);
            o.start(at);
            o.stop(at + 0.12);
            at += rnd(0.1, 0.2);
          }
          next = c.currentTime + rnd(1.2, 4.5);
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
      // pentatonic notes (C major), sometimes a soft two-note chord – never the same twice
      const scale = [60, 62, 64, 67, 69, 72, 74, 76];
      const g = c.createGain();
      g.gain.value = 0.9;
      g.connect(out);
      g.connect(reverbIn!);
      let next = c.currentTime + 0.2;
      stops.push(
        every(() => {
          if (c.currentTime < next) return;
          const n = scale[Math.floor(Math.random() * scale.length)];
          tone(c, g, next, midi(n), 0.16, rnd(2.2, 3.2), [
            [1, 1],
            [2, 0.35],
            [3, 0.12],
          ]);
          if (Math.random() < 0.25) tone(c, g, next, midi(n - 12), 0.1, 3, [[1, 1], [2, 0.2]]);
          next += rnd(0.55, 1.4);
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
  }
  return () => stops.forEach((s) => s());
}

/** Loudness of each sound at volume 1 (so the mix stays balanced). */
const LEVEL: Record<SoundId, number> = { rain: 0.9, storm: 0.9, ocean: 0.9, stream: 0.7, fire: 0.9, wind: 0.8, birds: 1, brown: 0.6, pink: 0.45, white: 0.25, pad: 1, piano: 1, bowls: 1 };

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
  { name: 'Regen am Fenster', mix: { rain: 0.8, piano: 0.4 } },
  { name: 'Hütte im Wald', mix: { fire: 0.7, wind: 0.35, birds: 0.25 } },
  { name: 'Am Meer', mix: { ocean: 0.8, bowls: 0.3 } },
  { name: 'Tiefer Fokus', mix: { brown: 0.7, pad: 0.35 } },
];

/** Short text of what is playing („Regen + Klavier“). */
export function mixLabel(mix: Mix): string {
  const names = SOUNDS.filter((s) => mix[s.id] !== undefined).map((s) => s.label);
  return names.length > 2 ? `${names.slice(0, 2).join(' + ')} + ${names.length - 2}` : names.join(' + ');
}
