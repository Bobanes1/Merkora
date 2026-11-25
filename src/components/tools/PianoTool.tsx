import { useEffect, useMemo, useRef, useState } from 'react';
import { getPianoVoice, getSustain, playClick, playNote, setPianoVoice, setSustain, type PianoVoice } from '../../lib/musicAudio';
import { MUSIC_PATTERNS, patternMidis, PIANO_ROOTS } from '../../lib/pianoTheory';
import { Piano } from '../practice/MusicTask';
import { IconPause, IconPlay } from '../Icons';

const BEATS_PER_BAR = [2, 3, 4, 6];
const VOICES: { id: PianoVoice; label: string }[] = [
  { id: 'grand', label: 'Konzertflügel' },
  { id: 'rhodes', label: 'E-Piano' },
  { id: 'warm', label: 'Warm Synth' },
];

/** Studio Piano & Metronome tool with Grand/Rhodes/Synth voices, sustain pedal, scale/chord highlighting & woodblock metronome. */
export function PianoTool() {
  const [rootPc, setRootPc] = useState(0); // C
  const [patternId, setPatternId] = useState<string>('');
  const [voice, setVoiceState] = useState<PianoVoice>(getPianoVoice);
  const [sustain, setSustainState] = useState<boolean>(getSustain);
  const [bpm, setBpm] = useState(100);
  const [beats, setBeats] = useState(4);
  const [metroOn, setMetroOn] = useState(false);
  const [beatIdx, setBeatIdx] = useState(0);
  const tapsRef = useRef<number[]>([]);

  const chooseVoice = (v: PianoVoice) => {
    setPianoVoice(v);
    setVoiceState(v);
    playNote(60, 0, 1.1, 0.2, v);
  };

  const toggleSustain = (on: boolean) => {
    setSustain(on);
    setSustainState(on);
  };

  const pat = MUSIC_PATTERNS.find((p) => p.id === patternId);
  const highlighted = useMemo(() => (patternId ? patternMidis(rootPc, patternId, 60) : []), [rootPc, patternId]);

  const playPattern = () => {
    if (!highlighted.length || !pat) return;
    if (pat.kind === 'chord') {
      highlighted.forEach((m) => playNote(m, 0, 1.7, 0.16, voice));
    } else {
      highlighted.forEach((m, idx) => playNote(m, idx * 0.28, 0.45, 0.21, voice));
    }
  };

  useEffect(() => {
    if (!metroOn) return;
    let count = 0;
    const tick = () => {
      const accent = count % beats === 0;
      setBeatIdx(count % beats);
      count++;
      playClick(0, accent);
    };
    tick();
    const ms = Math.round(60000 / Math.max(40, Math.min(220, bpm)));
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [metroOn, bpm, beats]);

  const tapTempo = () => {
    const now = Date.now();
    const list = [...tapsRef.current.filter((t) => now - t < 2500), now].slice(-5);
    tapsRef.current = list;
    if (list.length >= 2) {
      const diffs = list.slice(1).map((t, i) => t - list[i]);
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      if (avg > 200) setBpm(Math.max(40, Math.min(220, Math.round(60000 / avg))));
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Klavier &amp; Metronom</h2>
          <p className="muted small">Konzertflügel, E-Piano &amp; Haltepedal – Tonleitern &amp; Akkorde markieren, spielen und im Takt üben.</p>
        </div>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <div className="seg compact" role="radiogroup" aria-label="Klangfarbe">
            {VOICES.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={voice === v.id} className={voice === v.id ? 'on' : ''} onClick={() => chooseVoice(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={'chip' + (sustain ? ' on' : '')}
            aria-pressed={sustain}
            title="Haltepedal: Töne klingen länger aus"
            onClick={() => toggleSustain(!sustain)}
          >
            Haltepedal {sustain ? 'An' : 'Aus'}
          </button>
        </div>
      </div>

      <div className="tool">
        <div className="piano-theory-bar">
          <div className="chips">
            <small className="muted">Grundton:</small>
            {PIANO_ROOTS.map((r) => (
              <button key={r.pc} type="button" className={'chip' + (rootPc === r.pc ? ' on' : '')} onClick={() => setRootPc(r.pc)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="chips">
            <small className="muted">Anzeigen:</small>
            <button type="button" className={'chip' + (!patternId ? ' on' : '')} onClick={() => setPatternId('')}>
              Frei
            </button>
            {MUSIC_PATTERNS.map((p) => (
              <button key={p.id} type="button" className={'chip' + (patternId === p.id ? ' on' : '')} onClick={() => setPatternId(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          {pat && (
            <div className="row-gap">
              <button type="button" className="btn outline sm" onClick={playPattern}>
                <IconPlay size={13} /> {PIANO_ROOTS[rootPc].label} {pat.label} abspielen
              </button>
              <small className="muted">{pat.hint}</small>
            </div>
          )}
        </div>

        <Piano highlight={highlighted} />

        <div className="metronome-bar">
          <button type="button" className={'btn sm ' + (metroOn ? 'primary' : 'outline')} onClick={() => setMetroOn((v) => !v)}>
            {metroOn ? <IconPause size={13} /> : <IconPlay size={13} />} Metronom {metroOn ? 'Stopp' : 'Start'}
          </button>
          <label className="metro-bpm">
            <b>{bpm} BPM</b>
            <input type="range" min={40} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <button type="button" className="btn ghost sm" onClick={tapTempo} title="Mehrmals im Wunschtempo tippen">
            Tap-Tempo
          </button>
          <div className="chips">
            {BEATS_PER_BAR.map((b) => (
              <button key={b} type="button" className={'chip' + (beats === b ? ' on' : '')} onClick={() => setBeats(b)}>
                {b}/4
              </button>
            ))}
          </div>
          <div className="metro-dots" aria-hidden="true">
            {Array.from({ length: beats }, (_, i) => (
              <span key={i} className={'metro-dot' + (metroOn && beatIdx === i ? (i === 0 ? ' accent' : ' on') : '')} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
