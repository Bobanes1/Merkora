import type { TimeOfDay } from '../lib/look';

/** Colours of the scene per time of day: the sky strip above the water surface, the light that falls in. */
const LOOK: Record<TimeOfDay, { sun: string; light: string; weed: string; fish: string }> = {
  morning: { sun: '#ffd38a', light: '#ffe2b8', weed: '#2bb673', fish: '#ffb14e' },
  day: { sun: '#fff3b0', light: '#e8fbff', weed: '#2bb673', fish: '#ffd166' },
  evening: { sun: '#ffb38a', light: '#ffc8a8', weed: '#2f9e7a', fish: '#ff9fb6' },
  night: { sun: '#fff6d8', light: '#cfe3ff', weed: '#1f7a6a', fish: '#7fd3ee' },
};

/**
 * Pip's sea behind the greeting: a wavy water surface at the top (sun or moon above it),
 * light rays falling into the water, rising bubbles, seaweed and a few fish – lit by the time of day.
 */
export function HeroScene({ tod }: { tod: TimeOfDay }) {
  const l = LOOK[tod];
  return (
    <span className={`hero-scene ${tod}`} aria-hidden="true">
      {/* stretched layer: surface and light rays over the whole banner */}
      <svg className="hs-water" viewBox="0 0 400 160" preserveAspectRatio="none">
        <path className="hs-surface" d="M0 14 Q 12.5 9 25 14 T 50 14 T 75 14 T 100 14 T 125 14 T 150 14 T 175 14 T 200 14 T 225 14 T 250 14 T 275 14 T 300 14 T 325 14 T 350 14 T 375 14 T 400 14 T 425 14 V0 H0z" />
        <path d="M0 14 Q 12.5 9 25 14 T 50 14 T 75 14 T 100 14 T 125 14 T 150 14 T 175 14 T 200 14 T 225 14 T 250 14 T 275 14 T 300 14 T 325 14 T 350 14 T 375 14 T 400 14" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" />
        <g className="hs-rays" fill={l.light}>
          <path d="M150 14 L190 14 L150 160 L95 160z" opacity="0.10" />
          <path d="M235 14 L262 14 L250 160 L205 160z" opacity="0.08" />
          <path d="M300 14 L322 14 L338 160 L292 160z" opacity="0.07" />
        </g>
      </svg>
      {/* decoration at the right edge, not stretched */}
      <svg className="hs-deco" viewBox="0 0 200 160" preserveAspectRatio="xMaxYMax meet">
        {tod === 'night' ? (
          <>
            <circle cx="150" cy="6" r="11" fill={l.sun} />
            <circle cx="156" cy="2" r="9.5" fill="var(--hs-sky)" />
            {[
              [40, 60], [70, 100], [110, 50], [130, 120], [165, 80], [185, 110], [95, 135], [55, 125],
            ].map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r={1.3} fill="#9ff3ff" className="hs-glow" style={{ animationDelay: `${(k % 4) * 0.7}s` }} />
            ))}
          </>
        ) : (
          <circle cx={tod === 'day' ? 150 : 170} cy={tod === 'day' ? 2 : 14} r={tod === 'day' ? 10 : 14} fill={l.sun} className="hs-sun" />
        )}
        {/* fish */}
        <g className="hs-fish" fill={l.fish}>
          <path d="M70 70c6-5 14-5 18 0-4 5-12 5-18 0zm18 0l6-4v8z" />
          <path d="M100 92c4-3 9-3 12 0-3 3-8 3-12 0zm12 0l4-3v6z" opacity="0.8" />
        </g>
        {/* seaweed and sand at the bottom right */}
        <g fill="none" stroke={l.weed} strokeLinecap="round" className="hs-weed">
          <path d="M160 160c-8-14 8-22 0-36s6-20 0-30" strokeWidth="4" />
          <path d="M176 160c6-12-6-20 2-32" strokeWidth="3.5" opacity="0.85" />
          <path d="M146 160c-4-8 4-12 0-20" strokeWidth="3" opacity="0.7" />
        </g>
        <path d="M110 160c20-10 60-12 90-6v6z" fill="#f3e3b5" opacity="0.35" />
      </svg>
      {/* bubbles rising next to Pip */}
      <span className="hs-bubbles">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
