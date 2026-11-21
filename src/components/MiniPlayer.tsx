import { Link } from 'react-router-dom';
import { mixLabel, pauseAll, resumeAll, stopAll, useAmbient } from '../lib/ambient';
import { IconClose, IconPause, IconPlay } from './Icons';

/** What is playing right now (sidebar, or above the bottom bar on the phone): pause and stop, a link to all sounds. */
export function MiniPlayer({ onNavigate, phone = false }: { onNavigate?: () => void; phone?: boolean }) {
  const a = useAmbient();
  if (!Object.keys(a.playing).length) return null;
  return (
    <div className={`mini-player ${phone ? 'phone' : ''} ${a.paused ? 'paused' : ''}`} role="region" aria-label="Klänge">
      <span className="sounds-eq small" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <Link to="/tools?tab=sounds" onClick={onNavigate} className="grow mini-player-name" title="Alle Klänge">
        {mixLabel(a.playing)}
      </Link>
      <button type="button" className="icon-btn sm" aria-label={a.paused ? 'Weiter' : 'Pause'} onClick={a.paused ? resumeAll : pauseAll}>
        {a.paused ? <IconPlay size={13} /> : <IconPause size={13} />}
      </button>
      <button type="button" className="icon-btn sm" aria-label="Klänge stoppen" onClick={stopAll}>
        <IconClose size={13} />
      </button>
    </div>
  );
}
