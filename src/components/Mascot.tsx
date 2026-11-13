import { useEffect, useState, type CSSProperties } from 'react';

export type Mood = 'idle' | 'happy' | 'sad' | 'think' | 'cheer' | 'wave';
export type Who = 'pip' | 'flo' | 'tilda';

/**
 * The animated companions: Pip the dolphin (reacts while you learn), Flo the fox (streaks and goals) and Tilda the turtle (tutor in the chat).
 * Pure SVG + CSS animations; a new `pulse` value replays the reaction.
 */
export function Mascot({
  who = 'pip',
  mood = 'idle',
  size = 96,
  say,
  side = 'right',
  pulse,
  className = '',
}: {
  who?: Who;
  mood?: Mood;
  size?: number;
  say?: string;
  side?: 'right' | 'left' | 'top';
  pulse?: number | string;
  className?: string;
}) {
  return (
    <div className={`mascot-wrap say-${side} ${className}`}>
      <div key={`${mood}-${pulse ?? ''}`} className={`mascot m-${who} mood-${mood}`} style={{ width: size, height: size }} aria-hidden="true">
        {who === 'pip' ? <Dolphin mood={mood} /> : who === 'tilda' ? <Turtle mood={mood} /> : <Fox mood={mood} />}
      </div>
      {say && (
        <div className="m-say" role="status" key={say}>
          {say}
        </div>
      )}
    </div>
  );
}

const happyEyes = (mood: Mood) => mood === 'happy' || mood === 'cheer';

function Dolphin({ mood }: { mood: Mood }) {
  const body = '#45b4e3';
  const dark = '#2489bf';
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%">
      <ellipse className="m-shadow" cx="60" cy="113" rx="26" ry="4" fill="rgba(4, 44, 70,.16)" />
      <g className="m-body">
        {/* tail fluke */}
        <path d="M60 96 C53 103 44 108 36 106 C42 99 50 95 57 93z" fill={dark} />
        <path d="M60 96 C67 103 76 108 84 106 C78 99 70 95 63 93z" fill={dark} />
        {/* flippers */}
        <path className="m-wing-l" d="M32 70 C19 72 13 84 17 92 C25 89 31 83 36 77z" fill={dark} />
        <path className="m-wing-r" d="M88 70 C101 72 107 84 103 92 C95 89 89 83 84 77z" fill={dark} />
        <g className="m-head">
          {/* dorsal fin */}
          <path d="M58 30 C62 17 72 11 80 11 C75 18 72 25 72 35z" fill={dark} />
          <ellipse cx="60" cy="64" rx="32" ry="37" fill={body} />
          <ellipse cx="60" cy="80" rx="21" ry="20" fill="#e3f6fd" />
          <ellipse cx="60" cy="33" rx="3" ry="1.6" fill={dark} />
          {/* snout and smile */}
          <ellipse cx="60" cy="74" rx="12.5" ry="7.5" fill="#9fdcf4" />
          <path d={mood === 'sad' ? 'M53 78q7-5 14 0' : 'M52 74q8 7 16 0'} stroke="#0b2540" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          {/* eyes */}
          <circle cx="46" cy="57" r="10" fill="#fff" />
          <circle cx="74" cy="57" r="10" fill="#fff" />
          {happyEyes(mood) ? (
            <path d="M39 59q7-8 14 0M67 59q7-8 14 0" stroke="#0b2540" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          ) : (
            <g className="m-pupils">
              <circle cx="47" cy="58" r="5.6" fill="#0b2540" />
              <circle cx="73" cy="58" r="5.6" fill="#0b2540" />
              <circle cx="49" cy="55.6" r="2" fill="#fff" />
              <circle cx="75" cy="55.6" r="2" fill="#fff" />
            </g>
          )}
          {!happyEyes(mood) && (
            <g className="m-lids" fill={body}>
              <rect x="35" y="46" width="22" height="22" rx="11" />
              <rect x="63" y="46" width="22" height="22" rx="11" />
            </g>
          )}
          {mood === 'sad' && <path d="M37 44l15 5M83 44l-15 5" stroke="#0b2540" strokeWidth="2.6" strokeLinecap="round" />}
          <circle cx="36" cy="70" r="4.2" fill="#f6a5c0" opacity={happyEyes(mood) ? 0.85 : 0.45} />
          <circle cx="84" cy="70" r="4.2" fill="#f6a5c0" opacity={happyEyes(mood) ? 0.85 : 0.45} />
        </g>
      </g>
      {mood === 'think' && (
        <g className="m-dots" fill="#7fd0f2">
          <circle cx="98" cy="32" r="3.5" />
          <circle cx="106" cy="22" r="4.5" />
          <circle cx="114" cy="10" r="5.5" />
        </g>
      )}
      {mood === 'cheer' && (
        <g className="m-sparks" fill="#f2b84b">
          <path d="M14 22l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
          <path d="M104 40l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" />
        </g>
      )}
      {(mood === 'happy' || mood === 'wave') && (
        <g className="m-sparks" fill="#9fdcf4">
          <circle cx="94" cy="20" r="3" />
          <circle cx="101" cy="12" r="2" />
          <circle cx="88" cy="12" r="1.6" />
        </g>
      )}
    </svg>
  );
}

function Fox({ mood }: { mood: Mood }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%">
      <ellipse className="m-shadow" cx="60" cy="113" rx="28" ry="4" fill="rgba(0, 42, 41,.14)" />
      <g className="m-body">
        <g className="m-tail">
          <path d="M76 98 C104 100 116 76 104 56 C98 72 88 80 72 86z" fill="#f07d1a" />
          <path d="M104 56 C110 64 110 72 106 78 C102 72 101 64 104 56z" fill="#fff4e8" />
        </g>
        <rect x="46" y="96" width="9" height="12" rx="4" fill="#3a2418" />
        <rect x="65" y="96" width="9" height="12" rx="4" fill="#3a2418" />
        <ellipse cx="60" cy="88" rx="23" ry="19" fill="#f07d1a" />
        <ellipse cx="60" cy="92" rx="11" ry="13" fill="#fff4e8" />
        <g className="m-head">
          <g className="m-ear-l">
            <path d="M37 46 L32 16 L55 34z" fill="#f07d1a" />
            <path d="M39 39 L36 23 L49 34z" fill="#3a2418" />
          </g>
          <g className="m-ear-r">
            <path d="M83 46 L88 16 L65 34z" fill="#f07d1a" />
            <path d="M81 39 L84 23 L71 34z" fill="#3a2418" />
          </g>
          <ellipse cx="60" cy="52" rx="27" ry="22" fill="#f07d1a" />
          <path d="M34 54 Q60 88 86 54 Q74 64 60 62 Q46 64 34 54z" fill="#fff4e8" />
          {happyEyes(mood) ? (
            <path d="M44 52q5-6 10 0M66 52q5-6 10 0" stroke="#002a29" strokeWidth="3.2" fill="none" strokeLinecap="round" />
          ) : (
            <g className="m-pupils">
              <ellipse cx="49" cy="50" rx="3.8" ry="4.4" fill="#002a29" />
              <ellipse cx="71" cy="50" rx="3.8" ry="4.4" fill="#002a29" />
              <circle cx="50.3" cy="48.6" r="1.2" fill="#fff" />
              <circle cx="72.3" cy="48.6" r="1.2" fill="#fff" />
            </g>
          )}
          {!happyEyes(mood) && (
            <g className="m-lids" fill="#f07d1a">
              <rect x="44" y="44" width="10" height="12" rx="5" />
              <rect x="66" y="44" width="10" height="12" rx="5" />
            </g>
          )}
          <ellipse cx="60" cy="62" rx="4" ry="3" fill="#002a29" />
          {mood !== 'sad' ? (
            <path d="M55 67q5 4 10 0" stroke="#002a29" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : (
            <path d="M55 69q5-4 10 0" stroke="#002a29" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
          {happyEyes(mood) && (
            <>
              <circle cx="41" cy="60" r="3.5" fill="#f6a5c0" opacity=".85" />
              <circle cx="79" cy="60" r="3.5" fill="#f6a5c0" opacity=".85" />
            </>
          )}
        </g>
      </g>
      {mood === 'cheer' && (
        <g className="m-sparks" fill="#f2b84b">
          <path d="M14 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
          <path d="M100 18l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" />
        </g>
      )}
    </svg>
  );
}

const SHELL = '#3f9a5a';
const SHELL_DARK = '#2c7543';
const SKIN = '#8fd19a';
const SKIN_DARK = '#5fae6e';
const PLATE = '#f4e6b2';
const INK = '#14301f';

/** Tilda the turtle: calm, patient tutor in the chat (reading glasses, slow swimming). */
function Turtle({ mood }: { mood: Mood }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%">
      <ellipse className="m-shadow" cx="60" cy="113" rx="30" ry="4" fill="rgba(10, 50, 25,.16)" />
      <g className="m-body">
        {/* back feet */}
        <ellipse cx="44" cy="105" rx="8" ry="5" fill={SKIN_DARK} />
        <ellipse cx="76" cy="105" rx="8" ry="5" fill={SKIN_DARK} />
        {/* front flippers */}
        <path className="m-wing-l" d="M34 74 C20 72 10 80 9 90 C18 92 28 87 36 81z" fill={SKIN} stroke={SKIN_DARK} strokeWidth="1.5" />
        <path className="m-wing-r" d="M86 74 C100 72 110 80 111 90 C102 92 92 87 84 81z" fill={SKIN} stroke={SKIN_DARK} strokeWidth="1.5" />
        {/* shell with its pattern, belly plate in front */}
        <ellipse cx="60" cy="82" rx="31" ry="26" fill={SHELL} stroke={SHELL_DARK} strokeWidth="2.5" />
        <g fill="#56b46f" stroke={SHELL_DARK} strokeWidth="1.2">
          <path d="M33 72l5-4 6 1 2 6-4 5-6-1z" />
          <path d="M31 88l5-3 5 2 1 5-4 4-5-2z" />
          <path d="M87 72l-5-4-6 1-2 6 4 5 6-1z" />
          <path d="M89 88l-5-3-5 2-1 5 4 4 5-2z" />
        </g>
        <ellipse cx="60" cy="85" rx="19" ry="19" fill={PLATE} />
        <path d="M60 67v36M43 79h34M43 91h34" stroke="#dcc483" strokeWidth="1.6" fill="none" />
        <g className="m-head">
          {/* neck and head */}
          <ellipse cx="60" cy="60" rx="11" ry="8" fill={SKIN_DARK} />
          <ellipse cx="60" cy="40" rx="26" ry="23" fill={SKIN} />
          <ellipse cx="60" cy="50" rx="13" ry="6" fill="#a9ddb1" />
          <circle cx="56" cy="46" r="1.2" fill={INK} />
          <circle cx="64" cy="46" r="1.2" fill={INK} />
          <path d={mood === 'sad' ? 'M53 55q7-5 14 0' : 'M52 52q8 7 16 0'} stroke={INK} strokeWidth="2.3" fill="none" strokeLinecap="round" />
          {/* eyes */}
          <circle cx="48" cy="36" r="8.5" fill="#fff" />
          <circle cx="72" cy="36" r="8.5" fill="#fff" />
          {happyEyes(mood) ? (
            <path d="M42 38q6-7 12 0M66 38q6-7 12 0" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          ) : (
            <g className="m-pupils">
              <circle cx="49" cy="37" r="4.6" fill={INK} />
              <circle cx="71" cy="37" r="4.6" fill={INK} />
              <circle cx="50.6" cy="35" r="1.6" fill="#fff" />
              <circle cx="72.6" cy="35" r="1.6" fill="#fff" />
            </g>
          )}
          {!happyEyes(mood) && (
            <g className="m-lids" fill={SKIN}>
              <rect x="39" y="27" width="18" height="18" rx="9" />
              <rect x="63" y="27" width="18" height="18" rx="9" />
            </g>
          )}
          {mood === 'sad' && <path d="M40 24l12 4M80 24l-12 4" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
          {/* reading glasses (pushed up while thinking) */}
          <g className="m-glasses" fill="none" stroke="#7a4e2a" strokeWidth="2.2">
            <circle cx="48" cy="36" r="10.5" />
            <circle cx="72" cy="36" r="10.5" />
            <path d="M58.5 35q1.5-2 3 0M37.5 34l-5-2M82.5 34l5-2" strokeLinecap="round" />
          </g>
          <circle cx="38" cy="47" r="3.8" fill="#f6a5c0" opacity={happyEyes(mood) ? 0.85 : 0.45} />
          <circle cx="82" cy="47" r="3.8" fill="#f6a5c0" opacity={happyEyes(mood) ? 0.85 : 0.45} />
        </g>
      </g>
      {mood === 'think' && (
        <g className="m-bubbles" fill="none" stroke="#7fd0f2" strokeWidth="2">
          <circle cx="98" cy="30" r="3.5" />
          <circle cx="104" cy="19" r="4.5" />
          <circle cx="112" cy="7" r="5.5" />
        </g>
      )}
      {mood === 'cheer' && (
        <g className="m-sparks" fill="#f2b84b">
          <path d="M14 22l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
          <path d="M104 36l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" />
        </g>
      )}
      {(mood === 'happy' || mood === 'wave') && (
        <g className="m-bubbles" fill="none" stroke="#9fdcf4" strokeWidth="1.8">
          <circle cx="94" cy="20" r="3" />
          <circle cx="101" cy="11" r="2" />
          <circle cx="88" cy="11" r="1.6" />
        </g>
      )}
    </svg>
  );
}

/** Tilda's head, small and still (avatar next to her answers). */
export function TildaFace({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <ellipse cx="20" cy="21" rx="17" ry="15.5" fill={SKIN} />
      <ellipse cx="20" cy="28" rx="8.5" ry="4" fill="#a9ddb1" />
      <path d="M15.5 28.5q4.5 3.6 9 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="13" cy="18.5" r="5.2" fill="#fff" />
      <circle cx="27" cy="18.5" r="5.2" fill="#fff" />
      <circle cx="13.6" cy="19" r="2.8" fill={INK} />
      <circle cx="26.4" cy="19" r="2.8" fill={INK} />
      <circle cx="14.5" cy="17.9" r=".9" fill="#fff" />
      <circle cx="27.3" cy="17.9" r=".9" fill="#fff" />
      <g fill="none" stroke="#7a4e2a" strokeWidth="1.4">
        <circle cx="13" cy="18.5" r="6.4" />
        <circle cx="27" cy="18.5" r="6.4" />
        <path d="M19.4 18q.6-1 1.2 0" />
      </g>
      <circle cx="7" cy="25" r="2" fill="#f6a5c0" opacity=".6" />
      <circle cx="33" cy="25" r="2" fill="#f6a5c0" opacity=".6" />
    </svg>
  );
}

// ---------- confetti ----------
const COLORS = ['#09817e', '#32bdb9', '#f2b84b', '#02b6b2', '#4aa8ff', '#f07d1a', '#e5484d'];

/** A burst of confetti that removes itself. */
export function Confetti({ count = 70 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      dur: 1.6 + Math.random() * 1.3,
      color: COLORS[i % COLORS.length],
      rot: Math.random() * 360,
      drift: (Math.random() - 0.5) * 160,
      round: Math.random() < 0.3,
    })),
  );
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 3400);
    return () => clearTimeout(t);
  }, []);
  if (done) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.id}
          className={p.round ? 'round' : ''}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              '--rot': `${p.rot}deg`,
              '--drift': `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const PRAISE = ['Richtig! 🎉', 'Super gemacht!', 'Stark!', 'Genau so!', 'Du bist on fire!', 'Klasse!'];
const COMFORT = ['Fast! Das schaffst du beim nächsten Mal.', 'Kein Problem – Fehler helfen beim Lernen.', 'Hmm, schau dir die Antwort nochmal an.'];
export const praise = (n: number) => PRAISE[n % PRAISE.length];
export const comfort = (n: number) => COMFORT[n % COMFORT.length];
