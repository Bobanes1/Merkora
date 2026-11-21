import type { TimeOfDay } from '../lib/look';

/** The sky behind Pip on the start page: sunrise, day with clouds, sunset with birds, night with moon and stars. */
export function HeroScene({ tod }: { tod: TimeOfDay }) {
  return (
    <svg className={`hero-scene ${tod}`} viewBox="0 0 400 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {tod === 'night' ? (
        <>
          {[
            [40, 30, 1.4], [90, 60, 1], [140, 22, 1.8], [190, 50, 1.1], [240, 18, 1.3], [300, 40, 1.6], [350, 70, 1], [270, 92, 1.2], [370, 20, 1.1], [120, 100, 0.9],
          ].map(([x, y, r], k) => (
            <circle key={k} cx={x} cy={y} r={r} fill="#fff" className="twinkle" style={{ animationDelay: `${(k % 5) * 0.6}s` }} />
          ))}
          <circle cx="330" cy="46" r="20" fill="#fff6d8" />
          <circle cx="340" cy="40" r="18" fill="var(--hero-night-bg, #1f2a5a)" />
        </>
      ) : (
        <>
          <circle cx={tod === 'evening' ? 378 : tod === 'morning' ? 372 : 360} cy={tod === 'evening' ? 150 : tod === 'morning' ? 140 : 30} r={tod === 'day' ? 22 : 28} fill={tod === 'day' ? '#fff3b0' : '#ffd38a'} className="sun" />
          <g className="clouds" fill="#fff" opacity={tod === 'evening' ? 0.35 : 0.55}>
            <path d="M210 52a12 12 0 0 1 23-4 10 10 0 0 1 15 9h-38a7 7 0 0 1 0-5z" />
            <path d="M270 92a10 10 0 0 1 19-3 8 8 0 0 1 12 7h-31a6 6 0 0 1 0-4z" />
            {tod !== 'evening' && <path d="M150 30a8 8 0 0 1 15-2 7 7 0 0 1 10 6h-25a5 5 0 0 1 0-4z" />}
          </g>
          {tod === 'evening' && (
            <g stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7">
              <path d="M230 40q5-5 10 0q5-5 10 0" />
              <path d="M260 56q4-4 8 0q4-4 8 0" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}
