/**
 * Studio-grade offline Web Audio engine for Merkora's Piano, Music Tasks & Metronome:
 * - Physical-modeling Grand Piano (5-partial stretched harmonics, felt hammer transient, dynamic filter, stereo imaging, concert-hall convolution reverb)
 * - Selectable voices: 'grand' (Konzertflügel), 'rhodes' (E-Piano), 'warm' (Weicher Synth)
 * - Sustain pedal support
 * - Crisp wooden metronome click
 */
export type PianoVoice = 'grand' | 'rhodes' | 'warm';

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
      // Warm concert hall damping (gentle lowpass)
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
    reverbSend.gain.value = 0.26;
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

/** Plays a rich piano / e-piano / warm synth note with stereo positioning and hall reverb. */
export function playNote(midi: number, delay = 0, duration = 1.25, volume = 0.24, voice: PianoVoice = currentVoice) {
  const a = audio();
  if (!a || !masterBus) return;
  const t = a.currentTime + delay;
  const dur = sustainOn ? Math.max(duration * 2.4, 2.8) : duration;
  const f0 = freq(midi);

  // Subtle stereo positioning across keyboard (low notes slightly left, high slightly right)
  const pan = typeof a.createStereoPanner === 'function' ? a.createStereoPanner() : null;
  const target: AudioNode = pan ?? masterBus;
  if (pan) {
    pan.pan.value = Math.max(-0.55, Math.min(0.55, (midi - 66) / 36));
    pan.connect(masterBus);
    if (reverbSend) pan.connect(reverbSend);
  }

  // Dynamic brightness filter (bright attack -> mellow sustain like real piano strings)
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

  // Partials (slight inharmonicity & unison detune for authentic acoustic shimmer)
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
            ['sine', 7, 0, 0.07], // bell tine shimmer
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
    // Higher harmonics decay faster on acoustic piano
    if (voice === 'grand' && mult >= 3) {
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.45, dur * 0.4));
    }
    o.connect(g).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.06);
  }

  // Felt hammer-strike transient for acoustic grand piano
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

  // Resonant woody tone
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

  // Subtle percussive attack click
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
