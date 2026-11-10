import { useEffect, useState, type CSSProperties } from 'react';

export type Mood = 'idle' | 'happy' | 'sad' | 'think' | 'cheer' | 'wave';
export type Who = 'pip' | 'flo';

/**
 * The two animated companions: Pip the owl (tutor, reacts while you learn) and Flo the fox (streaks and goals).
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
        {who === 'pip' ? <Owl mood={mood} /> : <Fox mood={mood} />}
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

function Owl({ mood }: { mood: Mood }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%">
      <ellipse className="m-shadow" cx="60" cy="113" rx="26" ry="4" fill="rgba(0, 44, 23,.14)" />
      <g className="m-body">
        <ellipse cx="50" cy="105" rx="6" ry="3.5" fill="#f2b84b" />
        <ellipse cx="70" cy="105" rx="6" ry="3.5" fill="#f2b84b" />
        <path className="m-wing-l" d="M31 60 C17 68 16 88 30 98 C35 86 37 72 31 60z" fill="#055936" />
        <path className="m-wing-r" d="M89 60 C103 68 104 88 90 98 C85 86 83 72 89 60z" fill="#055936" />
        <g className="m-head">
          <path d="M36 46 L30 24 L50 37z M84 46 L90 24 L70 37z" fill="#0f8552" />
          <ellipse cx="60" cy="72" rx="32" ry="35" fill="#0f8552" />
          <ellipse cx="60" cy="84" rx="20" ry="19" fill="#7eca9f" />
          <path d="M50 80q5 4 10 0q5 4 10 0M50 89q5 4 10 0q5 4 10 0" stroke="#42ab76" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="46" cy="55" r="12.5" fill="#fff" />
          <circle cx="74" cy="55" r="12.5" fill="#fff" />
          {happyEyes(mood) ? (
            <path d="M38 57q8-9 16 0M66 57q8-9 16 0" stroke="#002c17" strokeWidth="3.6" fill="none" strokeLinecap="round" />
          ) : (
            <g className="m-pupils">
              <circle cx="47" cy="56" r="5.6" fill="#002c17" />
              <circle cx="73" cy="56" r="5.6" fill="#002c17" />
              <circle cx="49" cy="54" r="1.7" fill="#fff" />
              <circle cx="75" cy="54" r="1.7" fill="#fff" />
            </g>
          )}
          {!happyEyes(mood) && (
            <g className="m-lids" fill="#0f8552">
              <rect x="33" y="42" width="26" height="26" rx="13" />
              <rect x="61" y="42" width="26" height="26" rx="13" />
            </g>
          )}
          {mood === 'sad' && <path d="M35 40l18 6M85 40l-18 6" stroke="#044b2d" strokeWidth="3" strokeLinecap="round" />}
          <path d="M55 65 L65 65 L60 73z" fill="#f2b84b" />
          {happyEyes(mood) && (
            <>
              <circle cx="38" cy="68" r="4" fill="#f6a5c0" opacity=".8" />
              <circle cx="82" cy="68" r="4" fill="#f6a5c0" opacity=".8" />
            </>
          )}
        </g>
      </g>
      {mood === 'think' && (
        <g className="m-dots" fill="#62bc8b">
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
    </svg>
  );
}

function Fox({ mood }: { mood: Mood }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%">
      <ellipse className="m-shadow" cx="60" cy="113" rx="28" ry="4" fill="rgba(0, 44, 23,.14)" />
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
            <path d="M44 52q5-6 10 0M66 52q5-6 10 0" stroke="#002c17" strokeWidth="3.2" fill="none" strokeLinecap="round" />
          ) : (
            <g className="m-pupils">
              <ellipse cx="49" cy="50" rx="3.8" ry="4.4" fill="#002c17" />
              <ellipse cx="71" cy="50" rx="3.8" ry="4.4" fill="#002c17" />
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
          <ellipse cx="60" cy="62" rx="4" ry="3" fill="#002c17" />
          {mood !== 'sad' ? (
            <path d="M55 67q5 4 10 0" stroke="#002c17" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : (
            <path d="M55 69q5-4 10 0" stroke="#002c17" strokeWidth="2" fill="none" strokeLinecap="round" />
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

// ---------- confetti ----------
const COLORS = ['#0f8552', '#62bc8b', '#f2b84b', '#3cba6f', '#4aa8ff', '#f07d1a', '#e5484d'];

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
