import type { ReactElement } from 'react';
import { AQUA_ITEMS, aquaStats, progressOf, unlockedBy, type AquaItem } from '../lib/aquarium';
import { pushToast } from '../lib/jobs';
import { getState, subscribe, update, useStore } from '../lib/store';
import { playUi } from '../lib/uiSound';

/** Friendly little drawings (60×40 box) for the inhabitants. */
const ART: Record<string, ReactElement> = {
  shell: (
    <g>
      <path d="M30 8c13 0 20 12 18 22H12C10 20 17 8 30 8z" fill="#ffc6d9" stroke="#f48fb1" strokeWidth="2" />
      <path d="M30 10v20M21 12l3 18M39 12l-3 18" stroke="#f48fb1" strokeWidth="1.6" />
    </g>
  ),
  weed: (
    <g fill="none" strokeLinecap="round">
      <path d="M24 40c-8-10 6-14-2-24s4-12 0-16" stroke="#2bb673" strokeWidth="4" />
      <path d="M34 40c6-9-4-14 3-22" stroke="#1e9e60" strokeWidth="3.5" />
    </g>
  ),
  starfish: <path d="M30 4l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="#ff8a65" stroke="#f4511e" strokeWidth="1.6" strokeLinejoin="round" />,
  clownfish: (
    <g>
      <path d="M44 20l12-9-2 9 2 9z" fill="#ff7a1a" />
      <ellipse cx="28" cy="20" rx="18" ry="11" fill="#ff7a1a" />
      <path d="M20 10v20M31 9v22" stroke="#fff" strokeWidth="3.5" />
      <circle cx="14" cy="17" r="2.6" fill="#fff" />
      <circle cx="13.5" cy="17" r="1.4" fill="#123" />
    </g>
  ),
  crab: (
    <g>
      <path d="M12 16c-6-3-6-10 0-10-1 3 2 6 5 6M48 16c6-3 6-10 0-10 1 3-2 6-5 6" stroke="#e53935" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="30" cy="24" rx="15" ry="10" fill="#ef5350" />
      <circle cx="25" cy="14" r="2.6" fill="#fff" />
      <circle cx="35" cy="14" r="2.6" fill="#fff" />
      <circle cx="25" cy="14" r="1.3" fill="#123" />
      <circle cx="35" cy="14" r="1.3" fill="#123" />
    </g>
  ),
  coral: (
    <g fill="none" strokeLinecap="round">
      <path d="M30 40V26M30 26L20 15M20 15l-3-10M20 15l7-8M30 26l10-10M40 16l-1-11M40 16l8-6" stroke="#ff6f91" strokeWidth="4.5" />
    </g>
  ),
  jelly: (
    <g>
      <path d="M14 18c0-12 32-12 32 0-5 3-10 0-16 3-6-3-11 0-16-3z" fill="#c792ea" />
      <path d="M19 20q-3 8 1 16M26 21q3 9-1 17M34 21q-3 9 1 17M41 20q3 8-1 16" stroke="#b07fd8" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  bluefish: (
    <g>
      <path d="M44 20l12-9-2 9 2 9z" fill="#1f6fc2" />
      <ellipse cx="28" cy="20" rx="18" ry="12" fill="#2f8fd0" />
      <path d="M12 26q16 8 30-2" stroke="#ffd166" strokeWidth="3" fill="none" />
      <circle cx="14" cy="17" r="2.6" fill="#fff" />
      <circle cx="13.5" cy="17" r="1.4" fill="#123" />
    </g>
  ),
  seahorse: (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M30 4c6 0 9 4 7 8-2 3-6 3-6 7 0 5 7 6 7 12 0 6-8 8-11 4" stroke="#f2b84b" strokeWidth="5" />
      <path d="M36 7l7-1" stroke="#f2b84b" strokeWidth="3" />
      <circle cx="31" cy="8" r="1.3" fill="#123" stroke="none" />
    </g>
  ),
  octopus: (
    <g>
      <path d="M16 22c0-11 28-11 28 0v4H16z" fill="#b8327a" />
      <path d="M18 26q-4 8-8 8M24 26q-1 9-5 11M30 26v12M36 26q1 9 5 11M42 26q4 8 8 8" stroke="#b8327a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="25" cy="18" r="2.4" fill="#fff" />
      <circle cx="35" cy="18" r="2.4" fill="#fff" />
      <circle cx="25" cy="18" r="1.2" fill="#123" />
      <circle cx="35" cy="18" r="1.2" fill="#123" />
    </g>
  ),
  puffer: (
    <g>
      <circle cx="28" cy="20" r="14" fill="#f9d56e" />
      <path d="M28 4v4M16 9l3 3M40 9l-3 3M12 20h4M42 32l-3-3M16 31l3-3" stroke="#d9a520" strokeWidth="2" strokeLinecap="round" />
      <path d="M42 20l10-6v12z" fill="#f2b84b" />
      <circle cx="21" cy="17" r="2.6" fill="#fff" />
      <circle cx="20.5" cy="17" r="1.4" fill="#123" />
    </g>
  ),
  chest: (
    <g>
      <rect x="12" y="18" width="36" height="20" rx="3" fill="#a0632e" />
      <path d="M12 20c0-10 36-10 36 0z" fill="#c17d3c" />
      <rect x="27" y="20" width="6" height="7" rx="1" fill="#f2b84b" />
      <circle cx="24" cy="12" r="2" fill="#ffe27a" />
      <circle cx="36" cy="13" r="1.6" fill="#ffe27a" />
    </g>
  ),
  turtle: (
    <g>
      <ellipse cx="30" cy="22" rx="16" ry="11" fill="#3fa772" />
      <path d="M22 16l8 6 8-6M22 28l8-6 8 6" stroke="#2c7a52" strokeWidth="1.6" fill="none" />
      <circle cx="49" cy="20" r="5" fill="#8fd19e" />
      <circle cx="51" cy="18.5" r="1.1" fill="#123" />
      <path d="M18 30l-5 5M42 30l4 5M18 14l-5-4M42 14l4-4" stroke="#8fd19e" strokeWidth="4" strokeLinecap="round" />
    </g>
  ),
  anemone: (
    <g fill="none" strokeLinecap="round">
      {[-24, -12, 0, 12, 24].map((r) => (
        <path key={r} d="M30 40q0-14 0-26" stroke="#ff8fab" strokeWidth="3.5" transform={`rotate(${r} 30 40)`} />
      ))}
    </g>
  ),
  snail: (
    <g>
      <path d="M10 34h36q4 0 4-4" stroke="#c9a37a" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="24" r="10" fill="#e8b878" />
      <path d="M30 24m-5 0a5 5 0 1 0 5-5" stroke="#b07f45" strokeWidth="2" fill="none" />
    </g>
  ),
  ray: (
    <g>
      <path d="M30 10c10 2 22 8 26 12-8 2-18 4-26 8-8-4-18-6-26-8 4-4 16-10 26-12z" fill="#7b8bb8" />
      <path d="M30 30q2 6 8 10" stroke="#7b8bb8" strokeWidth="2" fill="none" />
      <circle cx="26" cy="17" r="1.3" fill="#123" />
      <circle cx="34" cy="17" r="1.3" fill="#123" />
    </g>
  ),
  whale: (
    <g>
      <path d="M6 22c0-10 14-14 28-12 10 1 16 8 14 14-2 7-16 10-28 8C12 31 6 28 6 22z" fill="#4b6fc9" />
      <path d="M46 18l8-8v14z" fill="#4b6fc9" />
      <path d="M10 26q14 6 34 0" stroke="#c9d6f5" strokeWidth="3" fill="none" />
      <circle cx="16" cy="19" r="1.6" fill="#123" />
    </g>
  ),
  dolphin: (
    <g>
      <path d="M8 24c6-12 22-16 34-10 6 3 10 8 12 12-6-2-10-2-14 0-8 4-22 6-32-2z" fill="#3fb6c9" />
      <path d="M28 12l4-8 4 9z" fill="#3fb6c9" />
      <circle cx="16" cy="21" r="1.6" fill="#123" />
      <path d="M13 26q3 2 6 0" stroke="#123" strokeWidth="1.2" fill="none" />
    </g>
  ),
};

/** Notices new inhabitants while you learn: saved, a toast and the unlock sound. First start: quietly takes over what is already earned. */
let watching = false;
export function watchAquarium() {
  if (watching) return;
  watching = true;
  let timer: number | undefined;
  const check = () => {
    const d = getState().data;
    const have = d.game.aquarium;
    const now = unlockedBy(aquaStats(d));
    const fresh = now.filter((id) => !have?.[id]);
    if (!fresh.length) return;
    const t = Date.now();
    update((x) => ({ ...x, game: { ...x.game, aquarium: { ...(x.game.aquarium ?? {}), ...Object.fromEntries(fresh.map((id) => [id, t])) } } }));
    if (!have) return; // first start: no flood of messages for old successes
    for (const id of fresh) {
      const item = AQUA_ITEMS.find((i) => i.id === id)!;
      pushToast({ text: `Neu in deinem Aquarium: ${item.name}!`, ok: true, to: '/stats#aquarium', toLabel: 'Ansehen' });
    }
    playUi('unlock');
  };
  check();
  // at most every few seconds (the numbers need a little work)
  subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 2500);
  });
}

function Creature({ item, locked }: { item: AquaItem; locked?: boolean }) {
  return (
    <svg viewBox="0 0 60 40" className={`aq-creature ${locked ? 'locked' : ''}`} aria-hidden="true">
      {ART[item.id]}
    </svg>
  );
}

/** The aquarium: unlocked inhabitants swim in a tank; the others wait as silhouettes with „so schaltest du es frei“. */
export function Aquarium({ compact = false }: { compact?: boolean }) {
  const data = useStore((s) => s.data);
  const have = data.game.aquarium ?? {};
  const stats = aquaStats(data);
  const inside = AQUA_ITEMS.filter((i) => have[i.id]);
  const waiting = AQUA_ITEMS.filter((i) => !have[i.id]);
  return (
    <div className={`aquarium ${compact ? 'compact' : ''}`}>
      <div className="aq-tank" role="img" aria-label={`Dein Aquarium mit ${inside.length} von ${AQUA_ITEMS.length} Bewohnern`}>
        <span className="aq-light" aria-hidden="true" />
        <span className="aq-bubbles" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        {inside.map((i, k) => (
          <span key={i.id} className={`aq-item ${i.kind}`} style={{ left: `${i.x}%`, top: `${i.y}%`, animationDelay: `${-k * 1.7}s` }} title={i.name}>
            <Creature item={i} />
          </span>
        ))}
        <span className="aq-sand" aria-hidden="true" />
        {!inside.length && <p className="aq-empty">Noch leer – lerne deine erste Karte, dann zieht die erste Muschel ein.</p>}
      </div>
      {compact && (
        <span className="aq-count">
          {inside.length} von {AQUA_ITEMS.length} Bewohnern
        </span>
      )}
      {!compact && (
        <>
          <p className="muted small">
            {inside.length} von {AQUA_ITEMS.length} Bewohnern
          </p>
          <ul className="aq-list">
            {waiting.map((i) => {
              const p = progressOf(i, stats);
              return (
                <li key={i.id}>
                  <Creature item={i} locked />
                  <span className="grow">
                    <b>{i.name}</b>
                    <small>{i.how}</small>
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${Math.round(p * 100)}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
