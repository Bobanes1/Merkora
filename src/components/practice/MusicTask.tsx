import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CardContent } from '../CardContent';
import {
  CHORDS,
  INTERVALS,
  checkChord,
  checkNoteName,
  checkRhythm,
  checkScale,
  checkSequence,
  KEY_CODES,
  keyToMidi,
  pianoFrom,
  chordNotes,
  findInterval,
  midiOf,
  noteName,
  parseNote,
  scaleNotes,
  spell,
  staffStep,
  transpose,
  type Note,
} from '../../lib/music';
import { playNote, playNotes, playRhythm } from '../../lib/musicAudio';
import type { MusicTask } from '../../lib/tasks';
import { shuffled } from '../../lib/tasks';
import { CheckButton, Hints, TaskFooter, Verdict, type TaskCtx } from './PracticeSetView';
import { IconSpeaker } from '../Icons';

const PC_NAMES = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];
const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const KB_HELP = 'merkora.pianoKeys';
/** Letters printed on the keys: the real layout where the browser tells it, otherwise QWERTZ. */
function useKeyLabels() {
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const code of Object.keys(KEY_CODES)) out[code] = code === 'KeyZ' ? 'Y' : code === 'KeyY' ? 'Z' : code.replace(/^Key|^Digit/, '');
    return out;
  });
  useEffect(() => {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.()
      .then((m) => setLabels((old) => {
        const out = { ...old };
        for (const code of Object.keys(KEY_CODES)) if (m.get(code)) out[code] = m.get(code)!.toUpperCase();
        return out;
      }))
      .catch(() => undefined);
  }, []);
  return labels;
}

/**
 * A two-octave piano: tap, click or play with the computer keyboard (bottom letter row = lower octave,
 * top letter row = upper octave). Only the keys held right now light up; the played notes are passed on.
 */
export function Piano({ onPlay, from = 60, highlight }: { onPlay?: (midi: number) => void; from?: number; highlight?: number[] }) {
  const [held, setHeld] = useState<number[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [help, setHelp] = useState(() => {
    try {
      return localStorage.getItem(KB_HELP) !== '0';
    } catch {
      return true;
    }
  });
  const labels = useKeyLabels();
  const clear = useRef<ReturnType<typeof setTimeout>>();
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const down = (m: number) => {
    playNote(m);
    onPlayRef.current?.(m);
    setHeld((h) => (h.includes(m) ? h : [...h, m]));
    setNow(m);
    clearTimeout(clear.current);
  };
  const up = (m: number) => {
    setHeld((h) => h.filter((x) => x !== m));
    clearTimeout(clear.current);
    clear.current = setTimeout(() => setNow(null), 1200);
  };
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const kd = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const m = keyToMidi(e.code, from);
      if (m === null) return;
      e.preventDefault();
      if (!e.repeat) down(m);
    };
    const ku = (e: KeyboardEvent) => {
      const m = keyToMidi(e.code, from);
      if (m !== null) up(m);
    };
    const blur = () => setHeld([]);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      clearTimeout(clear.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);
  const codeOf = (m: number) => Object.keys(KEY_CODES).find((c) => from + KEY_CODES[c] === m);
  const kb = (m: number) => {
    const c = codeOf(m);
    return help && c ? <i className="kb">{labels[c]}</i> : null;
  };
  const toggleHelp = () =>
    setHelp((h) => {
      try {
        localStorage.setItem(KB_HELP, h ? '0' : '1');
      } catch {
        /* not remembered */
      }
      return !h;
    });
  const whites: number[] = [];
  for (let m = from; m < from + 24; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const W = 100 / whites.length;
  const name = (m: number) => PC_NAMES[m % 12] + Math.floor(m / 12 - 1);
  const hlSet = highlight?.length ? new Set(highlight) : null;
  const keyProps = (m: number) => ({
    onPointerDown: (e: ReactPointerEvent) => (e.preventDefault(), (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId), down(m)),
    onPointerUp: () => up(m),
    onPointerCancel: () => up(m),
    onLostPointerCapture: () => up(m),
    'aria-label': name(m),
  });
  return (
    <div className="piano-wrap">
      <div className="piano-bar">
        <span className={'piano-now' + (now !== null ? ' on' : '')} aria-live="polite">
          {now !== null ? name(now) : '–'}
        </span>
        <button type="button" className="btn ghost sm" onClick={toggleHelp} aria-pressed={help} title="Mit der Tastatur spielen: untere Buchstabenreihe = tiefe Oktave, obere = hohe">
          Tastatur-Hilfe {help ? 'aus' : 'an'}
        </button>
      </div>
      <div className="piano" role="group" aria-label="Klavier">
        {whites.map((m, k) => (
          <button
            key={m}
            type="button"
            className={'pkey white' + (held.includes(m) ? ' held' : '') + (hlSet?.has(m) ? ' hl' : '')}
            style={{ left: `${k * W}%`, width: `${W}%` }}
            {...keyProps(m)}
          >
            {kb(m)}
            {m % 12 === 0 && <span>C{Math.floor(m / 12 - 1)}</span>}
          </button>
        ))}
        {whites.map((m, k) =>
          [0, 2, 5, 7, 9].includes(m % 12) && m + 1 < from + 24 ? (
            <button
              key={m + 1}
              type="button"
              className={'pkey black' + (held.includes(m + 1) ? ' held' : '') + (hlSet?.has(m + 1) ? ' hl' : '')}
              style={{ left: `${(k + 1) * W - W * 0.3}%`, width: `${W * 0.6}%` }}
              {...keyProps(m + 1)}
            >
              {kb(m + 1)}
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** A note (or a few) on a five-line staff, treble or bass clef. */
export function Staff({ notes, clef }: { notes: Note[]; clef: 'treble' | 'bass' }) {
  const gap = 10, top = 30, left = 60;
  const width = Math.max(240, left + 50 + notes.length * 40 + 10);
  const y = (step: number) => top + 4 * gap - (step * gap) / 2;
  return (
    <svg className="staff" viewBox={`0 0 ${width} 110`} style={{ maxWidth: width * 1.6 }} role="img" aria-label="Notensystem">
      {[0, 1, 2, 3, 4].map((l) => (
        <line key={l} x1={10} x2={width - 10} y1={top + l * gap} y2={top + l * gap} className="staff-line" />
      ))}
      <text x={14} y={clef === 'treble' ? top + 36 : top + 22} className="staff-clef">
        {clef === 'treble' ? '𝄞' : '𝄢'}
      </text>
      {notes.map((n, k) => {
        const st = staffStep(n, clef);
        const x = left + 50 + k * 40;
        const ledgers: number[] = [];
        for (let s = -2; s >= st; s -= 2) ledgers.push(s);
        for (let s = 10; s <= st; s += 2) ledgers.push(s);
        return (
          <g key={k}>
            {ledgers.map((s) => (
              <line key={s} x1={x - 11} x2={x + 11} y1={y(s)} y2={y(s)} className="staff-line" />
            ))}
            {n.acc !== 0 && (
              <text x={x - 22} y={y(st) + 5} className="staff-acc">
                {n.acc > 0 ? '♯'.repeat(n.acc) : '♭'.repeat(-n.acc)}
              </text>
            )}
            <ellipse cx={x} cy={y(st)} rx={7} ry={5.2} transform={`rotate(-20 ${x} ${y(st)})`} className="staff-note" />
          </g>
        );
      })}
    </svg>
  );
}

function OptionButtons({ options, onPick, disabled }: { options: string[]; onPick: (o: string) => void; disabled?: boolean }) {
  return (
    <div className="practice-choices row">
      {options.map((o) => (
        <button key={o} type="button" className="btn outline" onClick={() => onPick(o)} disabled={disabled}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Music tasks: hear and name, play on the piano, name a note, tap a rhythm. */
export function MusicTaskView({ ctx, task }: { ctx: TaskCtx; task: MusicTask }) {
  const { prog, host, i } = ctx;
  const m = task.music;
  const [result, setResult] = useState<boolean | null>(prog.solved ? true : null);
  const [played, setPlayed] = useState<number[]>([]);
  const [input, setInput] = useState('');
  const taps = useRef<number[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const seed = seedOf(ctx.set.id) + i;

  const root = 'root' in m ? (parseNote(m.root) ?? parseNote('C4')!) : parseNote('C4')!;
  const target = useMemo<Note[]>(() => {
    if (m.mode === 'interval-ear') {
      const iv = findInterval(m.interval)!;
      return [root, transpose(root, iv[1], iv[2])];
    }
    if (m.mode === 'chord-ear' || m.mode === 'build-chord') return chordNotes(root, m.chord);
    if (m.mode === 'build-scale') return scaleNotes(root, m.scale);
    if (m.mode === 'name-note') return [parseNote(m.note)!];
    if (m.mode === 'play-notes') return m.notes.map((x) => parseNote(x)!);
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const options = useMemo(() => {
    if (m.mode === 'interval-ear') {
      const k = INTERVALS.findIndex(([n]) => n === m.interval);
      const near = INTERVALS.filter((_, j) => j !== k && Math.abs(j - k) <= 3).map(([n]) => n);
      return shuffled([m.interval, ...shuffled(near, seed).slice(0, 3)], seed);
    }
    if (m.mode === 'chord-ear') {
      const four = CHORDS[m.chord].length === 4;
      const pool = Object.keys(CHORDS).filter((c) => (CHORDS[c].length === 4) === four && c !== m.chord);
      return shuffled([m.chord, ...shuffled(pool, seed).slice(0, 3)], seed);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const finish = (ok: boolean) => {
    setResult(ok);
    host.progress(i, { tries: prog.tries + 1, ...(ok ? { solved: true } : {}) });
  };
  const listen = () => {
    if (m.mode === 'interval-ear') playNotes(target.map(midiOf), !!m.harmonic);
    else if (m.mode === 'chord-ear') {
      playNotes(target.map(midiOf), false, 0.35);
      setTimeout(() => playNotes(target.map(midiOf), true), target.length * 350 + 250);
    } else if (m.mode === 'rhythm') playRhythm(m.beats, m.tempo);
  };
  const tap = () => {
    if (m.mode !== 'rhythm') return;
    const now = performance.now();
    if (!taps.current.length || now - taps.current[taps.current.length - 1] > 4000) taps.current = [];
    taps.current.push(now);
    playNote(84, 0, 0.15, 0.15);
    setTapCount(taps.current.length);
    if (taps.current.length === m.beats.length) {
      const t0 = taps.current[0];
      finish(checkRhythm(m.beats, m.tempo, taps.current.map((t) => t - t0)).right);
      taps.current = [];
      setTapCount(0);
    }
  };

  const solutionText =
    m.mode === 'interval-ear'
      ? `${m.interval}: ${spell(target)}`
      : m.mode === 'chord-ear' || m.mode === 'build-chord'
        ? `${noteName(root)}-${m.chord}: ${spell(target)}`
        : m.mode === 'build-scale'
          ? `${noteName(root)} ${m.scale}: ${spell(target)}`
          : m.mode === 'name-note'
            ? noteName(target[0])
            : m.mode === 'play-notes'
              ? `Noten: ${target.map((n) => noteName(n) + n.octave).join(' – ')}`
              : `Rhythmus: ${m.beats.map((b) => (b === 1 ? '♩' : b === 0.5 ? '♪' : b === 2 ? '𝅗𝅥' : b === 0.25 ? '𝅘𝅥𝅯' : '♩.')).join(' ')}`;

  return (
    <div className="practice-task">
      {task.prompt && <CardContent text={task.prompt} className="practice-problem" />}
      {(m.mode === 'interval-ear' || m.mode === 'chord-ear') && (
        <>
          <button type="button" className="btn outline" onClick={listen}>
            <IconSpeaker size={15} /> Anhören
          </button>
          <OptionButtons options={options} onPick={(o) => finish(o === (m.mode === 'interval-ear' ? m.interval : m.chord))} />
        </>
      )}
      {(m.mode === 'build-chord' || m.mode === 'build-scale') && (
        <>
          <p className="muted small">
            {m.mode === 'build-chord' ? `Spiele den Akkord ${noteName(root)}-${m.chord} (alle Töne, Reihenfolge egal).` : `Spiele die Tonleiter ${noteName(root)} ${m.scale} aufwärts.`}
          </p>
          <Piano onPlay={(x) => (setPlayed((p) => [...p, x]), setResult(null))} />
          <div className="row-gap">
            <span className="played">{played.length ? `${played.length} ${played.length === 1 ? 'Ton' : 'Töne'} gespielt` : 'Noch nichts gespielt'}</span>
            <button type="button" className="btn ghost sm" onClick={() => (setPlayed([]), setResult(null))} disabled={!played.length}>
              Zurücksetzen
            </button>
            <CheckButton ctx={ctx} right={result === true} disabled={!played.length} onCheck={() => finish(m.mode === 'build-chord' ? checkChord(target, played) : checkScale(target, played))} />
          </div>
        </>
      )}
      {m.mode === 'name-note' && (
        <>
          <Staff notes={target} clef={m.clef} />
          <div className="input-row">
            <input className="input" value={input} onChange={(e) => (setInput(e.target.value), setResult(null))} onKeyDown={(e) => e.key === 'Enter' && input.trim() && finish(checkNoteName(target[0], input))} placeholder="Name der Note, z. B. Fis" />
            <CheckButton ctx={ctx} right={result === true} disabled={!input.trim()} onCheck={() => finish(checkNoteName(target[0], input))} />
            <button type="button" className="btn ghost" onClick={() => playNote(midiOf(target[0]))} aria-label="Anhören">
              <IconSpeaker size={16} />
            </button>
          </div>
        </>
      )}
      {m.mode === 'play-notes' && (
        <>
          <Staff notes={target} clef={m.clef} />
          <p className="muted small">Spiele {target.length === 1 ? 'diese Note' : `diese ${target.length} Noten von links nach rechts`} auf dem Klavier.</p>
          <Piano
            from={pianoFrom(target.map(midiOf))}
            onPlay={(x) => {
              if (result === true) return;
              const next = [...played, x].slice(-target.length);
              setPlayed(next);
              setResult(null);
              if (next.length === target.length && played.length + 1 >= target.length) {
                const ok = checkSequence(target, next).right;
                finish(ok);
                if (!ok) setPlayed([]);
              }
            }}
          />
          <div className="row-gap">
            <span className="played">
              {result === true ? 'Richtig gespielt' : `${played.length} von ${target.length} ${target.length === 1 ? 'Note' : 'Noten'}`}
            </span>
            <button type="button" className="btn ghost sm" onClick={() => (setPlayed([]), setResult(null))} disabled={!played.length}>
              Zurücksetzen
            </button>
            {result === true && <CheckButton ctx={ctx} right onCheck={() => undefined} />}
          </div>
        </>
      )}
      {m.mode === 'rhythm' && (
        <>
          <p className="muted small">
            Hör zu (erst 4 Klicks zum Einzählen), dann klopfe den Rhythmus nach: {m.beats.length} Schläge.
          </p>
          <div className="row-gap">
            <button type="button" className="btn outline" onClick={listen}>
              <IconSpeaker size={15} /> Vorspielen
            </button>
            <button type="button" className="btn primary rhythm-tap" onPointerDown={(e) => (e.preventDefault(), tap())}>
              Klopfen {tapCount ? `(${tapCount}/${m.beats.length})` : ''}
            </button>
          </div>
        </>
      )}
      <Verdict ok={result} text={result === false && (m.mode === 'build-chord' || m.mode === 'build-scale') ? 'Hör dir die Töne nochmal einzeln an.' : result === false && m.mode === 'play-notes' ? 'Noch nicht – schau dir die Noten nochmal an und spiel sie neu.' : ''} />
      {result && <p className="muted small">{solutionText}</p>}
      <Hints hints={task.hints} used={prog.hints} onMore={() => host.progress(i, { hints: prog.hints + 1 })} />
      <TaskFooter
        noNext={m.mode === 'build-chord' || m.mode === 'build-scale' || m.mode === 'name-note' || m.mode === 'play-notes'}
        ctx={ctx}
        solution={
          <div className="practice-steps">
            <p>{solutionText}</p>
            {target.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => playNotes(target.map(midiOf), m.mode === 'chord-ear' || m.mode === 'build-chord')}>
                <IconSpeaker size={14} /> Lösung anhören
              </button>
            )}
          </div>
        }
        card={() => [task.prompt || solutionText, solutionText]}
      />
    </div>
  );
}
