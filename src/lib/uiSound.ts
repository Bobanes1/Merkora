/** Subtle sounds for small moments: checking off, right/wrong, level up, new aquarium inhabitant (switchable). */
import { audioContext } from './ambient';
import { playerLevel, totalXp } from './path';
import { getState, subscribe } from './store';

const levelNow = () => playerLevel(totalXp(getState().data)).level;

export type UiSound = 'tick' | 'right' | 'wrong' | 'level' | 'unlock';

/** Notes of each sound: [start in s, frequency, length in s, wave]. */
const NOTES: Record<UiSound, [number, number, number, OscillatorType][]> = {
  tick: [[0, 1320, 0.06, 'sine']],
  right: [
    [0, 659.3, 0.12, 'sine'],
    [0.09, 987.8, 0.18, 'sine'],
  ],
  wrong: [
    [0, 233.1, 0.16, 'triangle'],
    [0.1, 196, 0.22, 'triangle'],
  ],
  level: [
    [0, 523.3, 0.14, 'triangle'],
    [0.11, 659.3, 0.14, 'triangle'],
    [0.22, 784, 0.14, 'triangle'],
    [0.33, 1046.5, 0.4, 'sine'],
  ],
  unlock: [
    [0, 1568, 0.1, 'sine'],
    [0.07, 2093, 0.1, 'sine'],
    [0.14, 2637, 0.12, 'sine'],
    [0.22, 3136, 0.35, 'sine'],
  ],
};

export function playUi(name: UiSound) {
  const s = getState().data.settings;
  if (s.uiSounds === false) return;
  const c = audioContext();
  if (!c) return;
  const vol = 0.12 * (s.soundVolume ?? 0.5);
  const t0 = c.currentTime + 0.01;
  for (const [at, f, len, wave] of NOTES[name]) {
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(vol, t0 + at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0 + at);
    o.stop(t0 + at + len + 0.05);
  }
}

/** Plays the fanfare when the level goes up (started once by the app). */
let watching = false;
export function watchLevelUps() {
  if (watching) return;
  watching = true;
  let last = levelNow();
  subscribe(() => {
    const now = levelNow();
    if (now > last) playUi('level');
    last = now;
  });
}
