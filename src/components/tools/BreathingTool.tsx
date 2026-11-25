import { useEffect, useState } from 'react';
import { IconPause, IconPlay, IconRefresh } from '../Icons';

type Pattern = { id: string; name: string; hint: string; phases: { label: string; sec: number; scale: number }[] };

const PATTERNS: Pattern[] = [
  {
    id: 'box',
    name: 'Box Breathing (4–4–4–4)',
    hint: 'Beruhigt Nervosität vor Prüfungen und bringt den Fokus zurück.',
    phases: [
      { label: 'Einatmen', sec: 4, scale: 1.28 },
      { label: 'Halten', sec: 4, scale: 1.28 },
      { label: 'Ausatmen', sec: 4, scale: 0.78 },
      { label: 'Halten', sec: 4, scale: 0.78 },
    ],
  },
  {
    id: '478',
    name: '4–7–8 Entspannung',
    hint: 'Senkt Stress spürbar – perfekt für eine kurze Lernpause.',
    phases: [
      { label: 'Ruhig einatmen', sec: 4, scale: 1.3 },
      { label: 'Sanft halten', sec: 7, scale: 1.3 },
      { label: 'Lang ausatmen', sec: 8, scale: 0.75 },
    ],
  },
  {
    id: '55',
    name: '5–5 Fokus-Rhythmus',
    hint: 'Gleichmäßiges, ruhiges Atmen für klare Konzentration.',
    phases: [
      { label: 'Einatmen', sec: 5, scale: 1.26 },
      { label: 'Ausatmen', sec: 5, scale: 0.8 },
    ],
  },
];

/** Calm animated breathing & focus reset guide (1–3 min), usable standalone or inside Pomodoro breaks. */
export function BreathingTool({ compact = false }: { compact?: boolean }) {
  const [patId, setPatId] = useState(PATTERNS[0].id);
  const [minutes, setMinutes] = useState(compact ? 1 : 2);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const pat = PATTERNS.find((p) => p.id === patId) ?? PATTERNS[0];
  const totalSec = minutes * 60;
  const cycleSec = pat.phases.reduce((s, p) => s + p.sec, 0);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= totalSec) {
          setRunning(false);
          return totalSec;
        }
        return e + 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [running, totalSec]);

  let pos = elapsed % cycleSec;
  let phase = pat.phases[0];
  let leftInPhase = phase.sec;
  for (const ph of pat.phases) {
    if (pos < ph.sec) {
      phase = ph;
      leftInPhase = ph.sec - pos;
      break;
    }
    pos -= ph.sec;
  }

  const done = elapsed >= totalSec && !running && elapsed > 0;
  const remSec = Math.max(0, totalSec - elapsed);
  const clock = `${Math.floor(remSec / 60)}:${String(remSec % 60).padStart(2, '0')}`;

  const reset = () => {
    setRunning(false);
    setElapsed(0);
  };

  return (
    <div className={`breath-tool ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="panel-head">
          <div>
            <h2>Atem- &amp; Fokus-Reset</h2>
            <p className="muted small">1–3 Minuten ruhiges Atmen – ideal vor Prüfungen oder in der Pomodoro-Pause.</p>
          </div>
        </div>
      )}

      {!compact && (
        <div className="chips">
          {PATTERNS.map((p) => (
            <button key={p.id} type="button" className={'chip' + (p.id === pat.id ? ' on' : '')} onClick={() => (setPatId(p.id), reset())}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="breath-stage">
        <div
          className={'breath-orb' + (running ? ' on' : '')}
          style={{ transform: `scale(${running ? phase.scale : 1})`, transitionDuration: `${running ? phase.sec : 0.6}s` }}
        >
          <b>{done ? 'Geschafft!' : running ? phase.label : 'Bereit'}</b>
          <small>{running ? `${leftInPhase} s` : clock}</small>
        </div>
      </div>

      {!compact && <p className="muted small breath-hint">{pat.hint}</p>}

      <div className="breath-controls">
        <button
          type="button"
          className="btn primary sm"
          onClick={() => {
            if (done) setElapsed(0);
            setRunning((r) => !r);
          }}
        >
          {running ? <IconPause size={14} /> : <IconPlay size={14} />} {running ? 'Pause' : done ? 'Nochmal' : 'Starten'}
        </button>
        <button type="button" className="btn ghost sm" onClick={reset} aria-label="Zurücksetzen">
          <IconRefresh size={14} />
        </button>
        <span className="muted small">Restzeit: {clock}</span>
        {!compact && (
          <div className="chips">
            {[1, 2, 3].map((m) => (
              <button key={m} type="button" className={'chip' + (minutes === m ? ' on' : '')} onClick={() => (setMinutes(m), reset())}>
                {m} Min.
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
