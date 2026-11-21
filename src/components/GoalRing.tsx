import { useEffect, useState } from 'react';
import { dayKey } from '../lib/util';
import { Confetti } from './Mascot';

/**
 * The daily goal as a large double ring: outside the cards, inside the minutes. It fills up animated,
 * glows when the goal is reached, and celebrates once a day.
 */
export function GoalRing({ cards, cardGoal, minutes, minuteGoal, compact = false }: { cards: number; cardGoal: number; minutes: number; minuteGoal: number; compact?: boolean }) {
  const pc = Math.min(1, cards / Math.max(1, cardGoal));
  const pm = Math.min(1, minutes / Math.max(1, minuteGoal));
  const done = pc >= 1 && pm >= 1;
  // start empty, then fill (the transition makes it grow)
  const [shown, setShown] = useState({ c: 0, m: 0 });
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown({ c: pc, m: pm }));
    return () => cancelAnimationFrame(t);
  }, [pc, pm]);
  // confetti once a day when both are reached
  const [party, setParty] = useState(false);
  useEffect(() => {
    if (!done) return;
    const key = 'merkora.goalParty';
    try {
      if (localStorage.getItem(key) === dayKey(Date.now())) return;
      localStorage.setItem(key, dayKey(Date.now()));
    } catch {
      return;
    }
    setParty(true);
  }, [done]);
  const size = compact ? 120 : 168;
  const R1 = 74, R2 = 54, c1 = 2 * Math.PI * R1, c2 = 2 * Math.PI * R2;
  return (
    <div className={`goal-ring ${done ? 'done' : ''} ${compact ? 'compact' : ''}`}>
      {party && <Confetti count={60} />}
      <svg viewBox="0 0 180 180" width={size} height={size} role="img" aria-label={`Tagesziel: ${cards} von ${cardGoal} Karten, ${minutes} von ${minuteGoal} Minuten`}>
        <defs>
          <linearGradient id="gr-cards" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--chart-6)" />
            <stop offset="1" stopColor="var(--chart-1)" />
          </linearGradient>
          <linearGradient id="gr-min" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2b84b" />
            <stop offset="1" stopColor="var(--chart-4)" />
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r={R1} className="gr-track" strokeWidth="14" />
        <circle cx="90" cy="90" r={R2} className="gr-track" strokeWidth="12" />
        <circle cx="90" cy="90" r={R1} fill="none" stroke="url(#gr-cards)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c1 * shown.c} ${c1}`} transform="rotate(-90 90 90)" className="gr-arc" opacity={shown.c > 0 ? 1 : 0} />
        <circle cx="90" cy="90" r={R2} fill="none" stroke="url(#gr-min)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c2 * shown.m} ${c2}`} transform="rotate(-90 90 90)" className="gr-arc" opacity={shown.m > 0 ? 1 : 0} />
        <text x="90" y="86" textAnchor="middle" className="gr-big">
          {Math.round(((pc + pm) / 2) * 100)}%
        </text>
        <text x="90" y="106" textAnchor="middle" className="gr-small">
          {done ? 'geschafft!' : 'Tagesziel'}
        </text>
      </svg>
      <div className="gr-legend">
        <span>
          <i className="gr-dot cards" /> <b>{cards}</b>/{cardGoal} Karten
        </span>
        <span>
          <i className="gr-dot min" /> <b>{minutes}</b>/{minuteGoal} Min.
        </span>
      </div>
    </div>
  );
}
