/** Small round progress for decks and courses. */
export function Mastery({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = size / 2 - (size < 30 ? 2 : 4);
  const c = 2 * Math.PI * r;
  return (
    <span className="mastery-ring" style={{ width: size, height: size }} title={`${pct}% gemeistert`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={size < 30 ? 3 : 4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={size < 30 ? 3 : 4}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </span>
  );
}
