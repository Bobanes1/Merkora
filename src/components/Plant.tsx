import { PLANT_NAMES, plantStage } from '../lib/look';

/** A small plant that grows with the mastery of a deck: seed → sprout → seedling → bush → bud → blossom. */
export function Plant({ pct, size = 28 }: { pct: number; size?: number }) {
  const s = plantStage(pct);
  return (
    <span className={`plant st-${s}`} style={{ width: size, height: size }} title={`${PLANT_NAMES[s]} · ${pct}% gemeistert`} role="img" aria-label={`${PLANT_NAMES[s]}, ${pct}% gemeistert`}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" key={s}>
        {/* pot */}
        <path d="M9 23h14l-1.6 6.2a1.5 1.5 0 0 1-1.5 1.1h-7.8a1.5 1.5 0 0 1-1.5-1.1z" fill="var(--plant-pot)" />
        <rect x="8" y="21.5" width="16" height="2.6" rx="1.2" fill="var(--plant-pot-rim)" />
        {s === 0 && <ellipse cx="16" cy="20.6" rx="2.2" ry="1.4" fill="var(--plant-seed)" />}
        {s >= 1 && <path className="plant-grow" d={`M16 22V${s === 1 ? 17 : s === 2 ? 13 : 10}`} stroke="var(--plant-stem)" strokeWidth="1.8" strokeLinecap="round" />}
        {s === 1 && <path className="plant-grow" d="M16 18c-2.5 0-3.5-1.5-3.5-3 2 0 3.5 1 3.5 3zM16 18c2.5 0 3.5-1.5 3.5-3-2 0-3.5 1-3.5 3z" fill="var(--plant-leaf)" />}
        {s >= 2 && <path className="plant-grow" d="M16 17c-4 0-6-2.5-6-5 3.5 0 6 2 6 5zM16 15c4 0 6-2.5 6-5-3.5 0-6 2-6 5z" fill="var(--plant-leaf)" />}
        {s >= 3 && <path className="plant-grow" d="M16 20c-5 .5-8-1.5-9-4.5 4-.5 7.5 1 9 4.5zM16 19c5 .5 8-1.5 9-4.5-4-.5-7.5 1-9 4.5z" fill="var(--plant-leaf-2)" />}
        {s === 4 && <ellipse className="plant-grow" cx="16" cy="8.5" rx="2.4" ry="3" fill="var(--plant-bud)" />}
        {s === 5 && (
          <g className="plant-grow">
            {[0, 72, 144, 216, 288].map((r) => (
              <ellipse key={r} cx="16" cy="5.2" rx="2.4" ry="3.2" fill="var(--plant-petal)" transform={`rotate(${r} 16 8.5)`} />
            ))}
            <circle cx="16" cy="8.5" r="2.1" fill="var(--plant-heart)" />
          </g>
        )}
      </svg>
    </span>
  );
}
