/** Underwater decorations for the learning path (Pip the dolphin's world). Pure SVG, animated with CSS. */
import type { ReactElement } from 'react';

export type PathTheme = { name: string; top: string; bottom: string; accent: string; deco: string[] };

/** Each section of the path gets its own scene. */
export const PATH_THEMES: PathTheme[] = [
  { name: 'Lagune', top: '#dff7f6', bottom: '#bfeeea', accent: '#09817e', deco: ['starfish', 'seaweed', 'shell', 'bubbles', 'coral', 'jelly'] },
  { name: 'Korallenriff', top: '#ffeef0', bottom: '#ffd9dd', accent: '#d9566a', deco: ['coral', 'shell', 'seaweed', 'crab', 'starfish', 'bubbles'] },
  { name: 'Sonnenbucht', top: '#fff6dc', bottom: '#ffe9b0', accent: '#c98a12', deco: ['starfish', 'shell', 'crab', 'seaweed', 'bubbles', 'coral'] },
  { name: 'Tiefsee', top: '#dfe9ff', bottom: '#c3d4fb', accent: '#3d63c9', deco: ['jelly', 'bubbles', 'seaweed', 'shell', 'jelly', 'coral'] },
];
export const themeFor = (unitIndex: number) => PATH_THEMES[unitIndex % PATH_THEMES.length];

const Fish = ({ c1 = '#ff9f43', c2 = '#ffd166' }: { c1?: string; c2?: string }) => (
  <svg viewBox="0 0 64 40" width="54" height="34">
    <path d="M44 20 L60 8 L58 20 L60 32z" fill={c1} />
    <ellipse cx="28" cy="20" rx="22" ry="14" fill={c1} />
    <path d="M22 7 Q30 2 36 8" stroke={c2} strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M24 10 Q30 20 24 30" stroke={c2} strokeWidth="3" fill="none" opacity=".8" />
    <circle cx="14" cy="17" r="4" fill="#fff" />
    <circle cx="13" cy="17" r="2.2" fill="#123" />
    <path d="M8 24 q3 2 6 0" stroke="#123" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </svg>
);
const Starfish = () => (
  <svg viewBox="0 0 48 48" width="40" height="40">
    <path
      d="M24 3 L29 17 L44 18 L32 27 L36 42 L24 33 L12 42 L16 27 L4 18 L19 17z"
      fill="#ff8a65"
      stroke="#f4511e"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="20" cy="22" r="1.8" fill="#123" />
    <circle cx="28" cy="22" r="1.8" fill="#123" />
    <path d="M21 27 q3 2.5 6 0" stroke="#123" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <circle cx="24" cy="11" r="1.3" fill="#ffe0b2" />
    <circle cx="36" cy="20" r="1.3" fill="#ffe0b2" />
    <circle cx="14" cy="34" r="1.3" fill="#ffe0b2" />
  </svg>
);
const Shell = () => (
  <svg viewBox="0 0 48 40" width="38" height="32">
    <path d="M24 4 C38 4 46 18 44 30 L4 30 C2 18 10 4 24 4z" fill="#ffc6d9" stroke="#f48fb1" strokeWidth="2" />
    <path d="M24 6 L24 30 M14 9 L18 30 M34 9 L30 30 M7 18 L12 30 M41 18 L36 30" stroke="#f48fb1" strokeWidth="1.8" />
    <rect x="18" y="30" width="12" height="6" rx="3" fill="#f48fb1" />
  </svg>
);
const Seaweed = () => (
  <svg viewBox="0 0 40 80" width="30" height="62" className="sway">
    <path d="M14 80 C4 64 22 56 12 40 C4 28 18 18 12 4" stroke="#2bb673" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="M26 80 C34 66 20 58 28 44 C34 34 24 26 30 16" stroke="#1e9e60" strokeWidth="5" fill="none" strokeLinecap="round" />
  </svg>
);
const Coral = () => (
  <svg viewBox="0 0 60 56" width="48" height="45">
    <path
      d="M30 56 L30 34 M30 34 L18 20 M18 20 L14 6 M18 20 L26 10 M30 34 L42 22 M42 22 L40 8 M42 22 L52 14"
      stroke="#ff6f91"
      strokeWidth="6"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="14" cy="6" r="4" fill="#ff8fab" />
    <circle cx="26" cy="10" r="4" fill="#ff8fab" />
    <circle cx="40" cy="8" r="4" fill="#ff8fab" />
    <circle cx="52" cy="14" r="4" fill="#ff8fab" />
  </svg>
);
const Crab = () => (
  <svg viewBox="0 0 64 44" width="50" height="34" className="scuttle">
    <path d="M10 18 C2 14 2 4 10 4 C8 8 12 12 16 12 M54 18 C62 14 62 4 54 4 C56 8 52 12 48 12" stroke="#e53935" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M14 32 L4 40 M18 34 L12 42 M50 32 L60 40 M46 34 L52 42" stroke="#e53935" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="32" cy="28" rx="20" ry="13" fill="#ef5350" />
    <path d="M24 16 L24 10 M40 16 L40 10" stroke="#e53935" strokeWidth="2.5" />
    <circle cx="24" cy="9" r="3.5" fill="#fff" />
    <circle cx="40" cy="9" r="3.5" fill="#fff" />
    <circle cx="24" cy="9" r="1.7" fill="#123" />
    <circle cx="40" cy="9" r="1.7" fill="#123" />
    <path d="M27 31 q5 4 10 0" stroke="#7f1d1d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
);
const Jelly = () => (
  <svg viewBox="0 0 44 60" width="36" height="50" className="float">
    <path d="M4 26 C4 10 40 10 40 26 Q34 30 28 26 Q22 30 16 26 Q10 30 4 26z" fill="#c792ea" opacity=".9" />
    <path d="M10 28 q-4 10 2 20 M18 29 q4 12 -2 24 M26 29 q-4 12 2 24 M34 28 q4 10 -2 20" stroke="#b07fd8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <circle cx="17" cy="20" r="1.8" fill="#123" />
    <circle cx="27" cy="20" r="1.8" fill="#123" />
  </svg>
);
const Bubbles = () => (
  <svg viewBox="0 0 30 60" width="24" height="48" className="bubbles">
    <circle cx="15" cy="50" r="6" fill="none" stroke="#7fd0f2" strokeWidth="2" />
    <circle cx="8" cy="30" r="4" fill="none" stroke="#7fd0f2" strokeWidth="2" />
    <circle cx="20" cy="12" r="3" fill="none" stroke="#7fd0f2" strokeWidth="2" />
  </svg>
);

const DECOS: Record<string, () => ReactElement> = {
  fish: () => <Fish />,
  fish2: () => <Fish c1="#4fc3f7" c2="#b3e5fc" />,
  starfish: Starfish,
  shell: Shell,
  seaweed: Seaweed,
  coral: Coral,
  crab: Crab,
  jelly: Jelly,
  bubbles: Bubbles,
};

/** A decoration next to a node, on the side where the path leaves room. */
export function NodeDecor({ theme, index, side }: { theme: PathTheme; index: number; side: 'left' | 'right' }) {
  const kind = theme.deco[index % theme.deco.length];
  const Deco = DECOS[kind];
  return (
    <span className={`node-decor ${side} d-${kind}`} aria-hidden="true">
      <Deco />
    </span>
  );
}

/** Waves along the top of a scene. */
export function Waves({ color }: { color: string }) {
  return (
    <svg className="scene-waves" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 12 Q25 0 50 12 T100 12 T150 12 T200 12 T250 12 T300 12 T350 12 T400 12 V0 H0z" fill={color} />
    </svg>
  );
}

/** Sand with a few pebbles at the bottom of a scene. */
export function SandFloor() {
  return (
    <svg className="scene-sand" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 18 Q60 6 120 16 T240 14 T400 12 V40 H0z" fill="var(--sand, #f3e3b5)" />
      <circle cx="60" cy="28" r="3" fill="var(--pebble, #e2cd8f)" />
      <circle cx="210" cy="30" r="2.5" fill="var(--pebble, #e2cd8f)" />
      <circle cx="330" cy="26" r="3.5" fill="var(--pebble, #e2cd8f)" />
    </svg>
  );
}

/** Dotted curve from the previous node (dx pixels to the side) down to this node. */
export function PathLink({ dx, height = 58, done = false }: { dx: number; height?: number; done?: boolean }) {
  const w = Math.abs(dx) + 20;
  const x0 = dx < 0 ? 10 : w - 10; // previous node
  const x1 = dx < 0 ? w - 10 : 10; // this node
  if (dx === 0) {
    return (
      <svg className={`path-link ${done ? 'done' : ''}`} width="20" height={height} style={{ left: 'calc(50% - 10px)', top: -(height - 14) }} aria-hidden="true">
        <path d={`M10 0 V${height}`} />
      </svg>
    );
  }
  return (
    <svg
      className={`path-link ${done ? 'done' : ''}`}
      width={w}
      height={height}
      style={{ left: dx < 0 ? `calc(50% - ${w - 10}px)` : `calc(50% - 10px)`, top: -(height - 14) }}
      aria-hidden="true"
    >
      <path d={`M${x0} 0 C${x0} ${height * 0.55} ${x1} ${height * 0.45} ${x1} ${height}`} />
    </svg>
  );
}

/** Seaweed, coral and a shell on the sand at the bottom of a scene. */
export function FloorDecor() {
  return (
    <span className="floor-decor" aria-hidden="true">
      <span className="fd fd-weed1">
        <Seaweed />
      </span>
      <span className="fd fd-shell">
        <Shell />
      </span>
      <span className="fd fd-coral">
        <Coral />
      </span>
      <span className="fd fd-weed2">
        <Seaweed />
      </span>
    </span>
  );
}

/** Fish that swim through the whole scene, turn at the edge and swim back. */
const SWIMMERS = [
  { c1: '#ff9f43', c2: '#ffd166', top: '18%', dur: 26, delay: 0, size: 1 },
  { c1: '#4fc3f7', c2: '#b3e5fc', top: '52%', dur: 34, delay: -12, size: 0.8 },
  { c1: '#f06292', c2: '#f8bbd0', top: '76%', dur: 30, delay: -21, size: 0.7 },
];
export function SwimmingFish({ seed = 0 }: { seed?: number }) {
  return (
    <span className="swimmers" aria-hidden="true">
      {SWIMMERS.map((f, i) => (
        <span
          key={i}
          className="swimmer"
          style={{
            top: f.top,
            animationDuration: `${f.dur + (seed % 3) * 3}s`,
            animationDelay: `${f.delay - seed * 5}s`,
          }}
        >
          <span className="swimmer-body" style={{ animationDuration: `${f.dur + (seed % 3) * 3}s`, animationDelay: `${f.delay - seed * 5}s` }}>
            <span className="swimmer-bob" style={{ transform: `scale(${f.size})` }}>
              <Fish c1={f.c1} c2={f.c2} />
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
