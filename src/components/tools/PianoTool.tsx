import { useEffect, useMemo, useRef, useState } from 'react';
import { playNote } from '../../lib/musicAudio';
import { MUSIC_PATTERNS, patternMidis, PIANO_ROOTS } from '../../lib/pianoTheory';
import { Piano } from '../practice/MusicTask';
import { IconPause, IconPlay } from '../Icons';

const BEATS_PER_BAR = [2, 3, 4, 6];

/** Enhanced Piano & Metronome tool with scale/chord key highlighting, arpeggio playback, and Web Audio metronome with tap tempo. */
export function PianoTool() {
  const [rootPc, setRootPc] = useState(0); // C
  const [patternId, setPatternId] = useState<string>('');
  const [bpm, setBpm] = useState(100);
  const [beats, setBeats] = useState(4);
  const [metroOn, setMetroOn] = useState(false);
  const [beatIdx, setBeatIdx] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  const pat = MUSIC_PATTERNS.find((p) => p.id === patternId);
  const highlighted = useMemo(() => (patternId ? patternMidis(rootPc, patternId, 60) : []), [rootPc, patternId]);

  const playPattern = () => {
    if (!highlighted.length || !pat) return;
    if (pat.kind === 'chord') {
      highlighted.forEach((m) => playNote(m, 0, 1.4, 0.16));
    } else {
      highlighted.forEach((m, idx) => playNote(m, idx * 0.28, 0.32, 0.2));
    }
  };

  useEffect(() => {
    if (!metroOn) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC && !audioRef.current) audioRef.current = new AC();
    if (audioRef.current?.state === 'suspended') void audioRef.current.resume();

    let count = 0;
    const click = () => {
      const accent = count % beats === 0;
      setBeatIdx(count % beats);
      count++;
      try {
        const ctx = audioRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(accent ? 1046 : 740, ctx.currentTime);
        gain.gain.setValueAtTime(accent ? 0.18 : 0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      } catch {
        /* ignore audio error */
      }
    };
    click();
    const ms = Math.round(60000 / Math.max(40, Math.min(220, bpm)));
    const id = window.setInterval(click, ms);
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
          <p className="muted small">Tonleitern &amp; Akkorde direkt auf den Tasten markieren, mit PC-Tastatur spielen und im Takt üben.</p>
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
