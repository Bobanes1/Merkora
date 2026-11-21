import { useState } from 'react';
import {
  GROUP_LABEL,
  loadFavourites,
  mixLabel,
  pauseAll,
  playMix,
  PRESETS,
  resumeAll,
  saveFavourites,
  setMasterVolume,
  setSleepTimer,
  setSoundVolume,
  SOUNDS,
  stopAll,
  toggleSound,
  useAmbient,
  type Favourite,
  type SoundGroup,
  type SoundId,
} from '../../lib/ambient';
import { remaining } from '../../lib/pomodoroRule';
import { usePomodoro } from '../../lib/pomodoro';
import { IconClose, IconPause, IconPlay, IconPlus, IconStop } from '../Icons';

/** Thin line pictures for the sounds. */
const SOUND_ICON: Record<SoundId, string> = {
  rain: 'M7 16a4 4 0 0 1-.5-8A6 6 0 0 1 18 8.5 3.5 3.5 0 0 1 17.5 16M9 19l-1 2M13 19l-1 2M17 19l-1 2',
  storm: 'M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 7.5 3.5 3.5 0 0 1 17.5 15M13 13l-3 5h4l-3 5',
  ocean: 'M2 10c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-2 5 0M2 15c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-2 5 0M2 20c2.5-2 5-2 7.5 0s5 2 7.5 0',
  stream: 'M4 6c3 0 3 3 6 3s3-3 6-3 3 3 4 3M4 12c3 0 3 3 6 3s3-3 6-3 3 3 4 3M8 19c1.5 0 2-1 4-1s2.5 1 4 1',
  fire: 'M12 21c4 0 6-2.5 6-6 0-4-3-6-4-9-1 2-2 3-3 3 0-2-1-3-2-5-1 3-3 6-3 11 0 3.5 2 6 6 6zM12 21c-1.7 0-3-1.2-3-3 0-2 1.5-3 3-5 1.5 2 3 3 3 5 0 1.8-1.3 3-3 3z',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7',
  birds: 'M3 9c2-2 4-2 6 0 2-2 4-2 6 0M10 16c1.5-1.5 3-1.5 4.5 0 1.5-1.5 3-1.5 4.5 0',
  brown: 'M2 12c2-6 4 6 6 0s4 6 6 0 4 6 6 0 2-3 2-3',
  pink: 'M2 12c1.5-5 3 5 4.5 0s3 5 4.5 0 3 5 4.5 0 3 5 4.5 0',
  white: 'M2 12l2-4 2 8 2-8 2 8 2-8 2 8 2-8 2 8 2-8 2 4',
  pad: 'M4 18V8M9 18V5M14 18V9M19 18V6',
  piano: 'M3 5h18v14H3zM8 5v9M12 5v9M16 5v9M6.5 5v5M10.5 5v5M14.5 5v5',
  bowls: 'M4 11h16a8 8 0 0 1-16 0zM9 20h6M12 7V4M8 8 6.5 5.5M16 8l1.5-2.5',
};
const SoundIcon = ({ id, size = 26 }: { id: SoundId; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={SOUND_ICON[id]} />
  </svg>
);

const TIMERS = [15, 30, 60, 90];

/** Merkora Tools › Klänge: calm sounds and music to learn with – mix several, timer, favourites. */
export function SoundsTool() {
  const a = useAmbient();
  const pomo = usePomodoro();
  const [favs, setFavs] = useState<Favourite[]>(loadFavourites);
  const [name, setName] = useState('');
  const active = Object.keys(a.playing).length > 0;
  const timerLeft = a.timerEnd ? Math.max(0, Math.round((a.timerEnd - Date.now()) / 60000)) : null;
  const pomoMin = pomo.running && pomo.phase === 'work' ? Math.ceil(remaining(pomo, Date.now()) / 60000) : 0;

  const saveFav = () => {
    const n = name.trim() || mixLabel(a.playing);
    const list = [{ name: n, mix: { ...a.playing } }, ...favs.filter((f) => f.name !== n)];
    setFavs(list);
    saveFavourites(list);
    setName('');
  };
  const removeFav = (n: string) => {
    const list = favs.filter((f) => f.name !== n);
    setFavs(list);
    saveFavourites(list);
  };

  return (
    <div className="sounds">
      <section className={`panel sounds-now ${active ? 'on' : ''}`}>
        <div className="sounds-now-main">
          <span className="sounds-eq" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="grow">
            <b>{active ? mixLabel(a.playing) : 'Wähle einen Klang oder eine Mischung'}</b>
            <small className="muted">
              {active ? (a.paused ? 'pausiert' : 'läuft') : 'Alles wird live in Merkora erzeugt – ohne Internet, beliebig lange.'}
              {timerLeft !== null && ` · stoppt in ${timerLeft} Min.`}
            </small>
          </span>
          {active && (
            <>
              <button type="button" className="btn primary sm" onClick={a.paused ? resumeAll : pauseAll}>
                {a.paused ? <IconPlay size={14} /> : <IconPause size={14} />} {a.paused ? 'Weiter' : 'Pause'}
              </button>
              <button type="button" className="btn ghost sm" onClick={stopAll}>
                <IconStop size={14} /> Stopp
              </button>
            </>
          )}
        </div>
        <label className="sounds-master">
          <span className="muted small">Gesamtlautstärke</span>
          <input type="range" min={0} max={1} step={0.01} value={a.master} onChange={(e) => setMasterVolume(Number(e.target.value))} />
        </label>
        <div className="chips">
          <small className="muted">Ausschalten nach:</small>
          {TIMERS.map((m) => (
            <button key={m} type="button" className={`chip ${timerLeft !== null && Math.abs(timerLeft - m) < 1 ? 'on' : ''}`} onClick={() => setSleepTimer(m)}>
              {m} Min.
            </button>
          ))}
          {pomoMin > 0 && (
            <button type="button" className="chip" onClick={() => setSleepTimer(pomoMin)} title="Stoppt, wenn die laufende Pomodoro-Runde endet">
              Ende der Pomodoro-Runde ({pomoMin} Min.)
            </button>
          )}
          {a.timerEnd && (
            <button type="button" className="chip" onClick={() => setSleepTimer(null)}>
              Kein Timer
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Mischungen</h2>
        <div className="sounds-presets">
          {[...favs, ...PRESETS].map((f, k) => (
            <span key={f.name + k} className="sound-preset">
              <button type="button" className="chip" onClick={() => playMix(f.mix)}>
                <IconPlay size={12} /> {f.name}
              </button>
              {k < favs.length && (
                <button type="button" className="icon-btn sm" aria-label={`${f.name} löschen`} onClick={() => removeFav(f.name)}>
                  <IconClose size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        {active && (
          <div className="input-row sounds-save">
            <input className="input sm" placeholder={`Name für „${mixLabel(a.playing)}“`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveFav()} />
            <button type="button" className="btn outline sm" onClick={saveFav}>
              <IconPlus size={14} /> Als Favorit speichern
            </button>
          </div>
        )}
      </section>

      {(['natur', 'rauschen', 'musik'] as SoundGroup[]).map((g) => (
        <section key={g} className="panel">
          <h2>{GROUP_LABEL[g]}</h2>
          <div className="sound-grid">
            {SOUNDS.filter((s) => s.group === g).map((s) => {
              const on = a.playing[s.id] !== undefined;
              return (
                <div key={s.id} className={`sound-card ${on ? 'on' : ''} g-${g}`}>
                  <button type="button" className="sound-toggle" aria-pressed={on} onClick={() => toggleSound(s.id)}>
                    <span className="sound-icon">
                      <SoundIcon id={s.id} />
                    </span>
                    <span className="grow">
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                    <span className="sound-state">{on ? (a.paused ? <IconPause size={14} /> : <IconPause size={14} />) : <IconPlay size={14} />}</span>
                  </button>
                  {on && (
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={a.playing[s.id]}
                      aria-label={`Lautstärke ${s.label}`}
                      onChange={(e) => setSoundVolume(s.id, Number(e.target.value))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
