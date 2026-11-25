import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { CardContent } from '../CardContent';
import { IconChevron, IconPause, IconPlay, IconRefresh, IconStop } from '../Icons';
import { highlightCode } from '../../lib/javaHighlight';
import { playNote } from '../../lib/musicAudio';
import { runJs, runPython, runSql } from '../../lib/codeRun';
import { runJavaLocal } from '../../lib/javaRun';
import { PALETTES, renderDiagram, type Diagram } from '../../lib/diagram';
import { useResolvedTheme } from '../../lib/theme';
import { CODE_LANG_LABEL } from '../../lib/practice';
import {
  changedVars,
  layoutScore,
  markedParts,
  ROLE_LABEL,
  SYNTAX_ROLES,
  type Program,
  type Score,
  type Sentence,
  type Sketch,
  type SketchKind,
  type Table,
} from '../../lib/visuals';

/** Fires once when an explanation graphic scrolls into view (falls back to immediate true if IntersectionObserver is unavailable). */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

// ---------- sheet of music ----------
const GAP = 10, TOP = 34;
const yOf = (step: number) => TOP + 4 * GAP - (step * GAP) / 2;

/** A line of music: clef, key, time, notes and chords with stems and flags; play it, the current note lights up. */
export function ScoreView({ score }: { score: Score }) {
  const L = useMemo(() => layoutScore(score), [score]);
  const [now, setNow] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setNow(null);
  };
  useEffect(() => stop, []);
  const play = () => {
    stop();
    const beat = 60 / 88;
    let t = 0;
    L.items.forEach((it, k) => {
      const at = t;
      timers.current.push(setTimeout(() => setNow(k), at * 1000));
      it.midis.forEach((m) => playNote(m, at, Math.min(2.4, it.dur * beat + 0.15), it.midis.length > 1 ? 0.16 : 0.22));
      t += it.dur * beat;
    });
    timers.current.push(setTimeout(() => setNow(null), t * 1000 + 200));
  };
  const H = 140;
  const right = L.width - 8;
  return (
    <figure className="score">
      <svg viewBox={`0 0 ${L.width} ${H}`} style={{ maxWidth: L.width * 1.5 }} role="img" aria-label="Notenblatt">
        {[0, 1, 2, 3, 4].map((l) => (
          <line key={l} x1={8} x2={right} y1={TOP + l * GAP} y2={TOP + l * GAP} className="staff-line" />
        ))}
        <line x1={right} x2={right} y1={TOP} y2={TOP + 4 * GAP} className="staff-line bar end" />
        <text x={12} y={score.clef === 'treble' ? TOP + 36 : TOP + 22} className="staff-clef">
          {score.clef === 'treble' ? '𝄞' : '𝄢'}
        </text>
        {L.keySteps.map((st, k) => (
          <text key={k} x={46 + k * 10} y={yOf(st) + 5} className="staff-acc">
            {L.sharps ? '♯' : '♭'}
          </text>
        ))}
        {score.time && (
          <g className="score-time">
            <text x={L.timeAt} y={TOP + 17}>
              {score.time.split('/')[0]}
            </text>
            <text x={L.timeAt} y={TOP + 37}>
              {score.time.split('/')[1]}
            </text>
          </g>
        )}
        {L.bars.map((x, k) => (
          <line key={k} x1={x} x2={x} y1={TOP} y2={TOP + 4 * GAP} className="staff-line bar" />
        ))}
        {L.items.map((it, k) => {
          const steps = it.notes.map((n) => n.step);
          const lowest = Math.min(...steps), highest = Math.max(...steps);
          const up = (lowest + highest) / 2 < 4;
          const hollow = it.dur >= 2;
          const ledgers = new Set<number>();
          for (const st of steps) {
            for (let s = -2; s >= st; s -= 2) ledgers.add(s);
            for (let s = 10; s <= st; s += 2) ledgers.add(s);
          }
          const stemX = up ? it.x + 6.5 : it.x - 6.5;
          const stemFrom = up ? yOf(lowest) : yOf(highest);
          const stemTo = up ? yOf(highest) - 32 : yOf(lowest) + 32;
          const flags = it.dur === 0.5 ? 1 : it.dur === 0.25 ? 2 : 0;
          const dotted = it.dur === 1.5 || it.dur === 3;
          return (
            <g key={k} className={'score-item' + (now === k ? ' now' : '')} onClick={() => it.midis.forEach((m) => playNote(m))}>
              <rect x={it.x - 14} y={TOP - 30} width={28} height={110} className="score-hit" />
              {[...ledgers].map((s) => (
                <line key={s} x1={it.x - 11} x2={it.x + 11} y1={yOf(s)} y2={yOf(s)} className="staff-line" />
              ))}
              {it.notes.map((n, j) => (
                <Fragment key={j}>
                  {n.acc && (
                    <text x={it.x - 22} y={yOf(n.step) + 5} className="staff-acc">
                      {n.acc}
                    </text>
                  )}
                  <ellipse cx={it.x} cy={yOf(n.step)} rx={6.6} ry={4.8} transform={`rotate(-20 ${it.x} ${yOf(n.step)})`} className={'staff-note' + (hollow ? ' hollow' : '')} />
                  {dotted && <circle cx={it.x + 11} cy={yOf(n.step) - (n.step % 2 === 0 ? 3 : 0)} r={1.8} className="staff-dot" />}
                </Fragment>
              ))}
              {it.dur < 4 && <line x1={stemX} x2={stemX} y1={stemFrom} y2={stemTo} className="staff-stem" />}
              {Array.from({ length: flags }, (_, f) => (
                <path key={f} d={up ? `M${stemX} ${stemTo + f * 7} q 9 8 8 18` : `M${stemX} ${stemTo - f * 7} q 9 -8 8 -18`} className="staff-flag" />
              ))}
              {it.label && (
                <text x={it.x} y={H - 8} className="score-label" textAnchor="middle">
                  {it.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="row-gap">
        {now === null ? (
          <button type="button" className="btn outline sm" onClick={play}>
            <IconPlay size={14} /> Abspielen
          </button>
        ) : (
          <button type="button" className="btn outline sm" onClick={stop}>
            <IconStop size={14} /> Stopp
          </button>
        )}
        <small className="muted">Tipp: Klick auf eine Note spielt sie einzeln.</small>
      </div>
      {score.caption && <figcaption>{score.caption}</figcaption>}
    </figure>
  );
}

// ---------- example program ----------
/** A small example program: run it, or go through it line by line (manually or animated auto-play) with the values of the variables. */
export function ProgramView({ program }: { program: Program }) {
  const [step, setStep] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [out, setOut] = useState<{ text: string; error?: string; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = program.code.split('\n');
  const cur = step !== null ? program.trace[step] : null;
  const changed = step !== null ? changedVars(program.trace, step) : [];
  useEffect(() => {
    if (!auto || !program.trace.length) return;
    if (step !== null && step >= program.trace.length - 1) {
      setAuto(false);
      return;
    }
    const t = window.setTimeout(() => {
      setStep((s) => (s === null ? 0 : Math.min(program.trace.length - 1, s + 1)));
    }, 1400);
    return () => window.clearTimeout(t);
  }, [auto, step, program.trace.length]);
  const toggleAuto = () => {
    if (auto) return setAuto(false);
    if (step === null || step >= program.trace.length - 1) setStep(0);
    setAuto(true);
  };
  const run = async () => {
    setBusy(true);
    setOut(null);
    try {
      if (program.lang === 'javascript' || program.lang === 'python') {
        const r = program.lang === 'python' ? await runPython(program.code, []) : await runJs(program.code, []);
        setOut(r.timedOut ? { text: '', error: 'Das Programm hat zu lange gebraucht und wurde gestoppt.' } : { text: r.logs, error: r.compileError });
      } else if (program.lang === 'sql') {
        const r = await runSql(program.schema ?? '', program.code);
        setOut('error' in r ? { text: '', error: r.error } : { text: [r.columns.join(' | '), ...r.rows.map((x) => x.map((v) => (v === null ? 'NULL' : String(v))).join(' | '))].join('\n') });
      } else {
        const r = await runJavaLocal(program.code).catch(() => 'no-java' as const);
        if (r === 'no-java') setOut({ text: program.output, note: 'Kein Java auf diesem Gerät – das ist die Ausgabe laut Pip.' });
        else setOut({ text: r.stdout, error: r.stderr.trim() || undefined });
      }
    } catch (e) {
      setOut({ text: program.output, note: (e as Error).message + ' – das ist die Ausgabe laut Pip.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="program">
      <div className="program-head">
        <b>Beispielprogramm</b> <span className="badge">{CODE_LANG_LABEL[program.lang]}</span>
      </div>
      <pre className="program-code">
        {lines.map((l, k) => (
          <div key={k} className={'program-line' + (cur?.line === k + 1 ? ' now' : '')}>
            <span className="ln">{k + 1}</span>
            <code dangerouslySetInnerHTML={{ __html: highlightCode(l, program.lang) || ' ' }} />
          </div>
        ))}
      </pre>
      <div className="row-gap">
        <button type="button" className="btn outline sm" onClick={() => void run()} disabled={busy}>
          <IconPlay size={14} /> {busy ? 'Läuft …' : 'Ausführen'}
        </button>
        {program.trace.length > 0 && (
          <>
            <button type="button" className={'btn sm ' + (auto ? 'primary' : 'outline')} onClick={toggleAuto}>
              {auto ? <IconPause size={14} /> : <IconPlay size={14} />} {auto ? 'Pause' : 'Ablauf abspielen'}
            </button>
            {step === null ? (
              <button type="button" className="btn ghost sm" onClick={() => (setAuto(false), setStep(0))}>
                Schritt für Schritt
              </button>
            ) : (
              <>
                <button type="button" className="btn ghost sm" onClick={() => (setAuto(false), setStep(Math.max(0, step - 1)))} disabled={step === 0}>
                  ‹ Zurück
                </button>
                <span className="muted small">
                  Schritt {step + 1} von {program.trace.length}
                </span>
                <button type="button" className="btn primary sm" onClick={() => (setAuto(false), setStep(step + 1 < program.trace.length ? step + 1 : null))}>
                  {step + 1 < program.trace.length ? (
                    <>
                      Weiter <IconChevron size={13} />
                    </>
                  ) : (
                    'Fertig'
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>
      {cur && (
        <div key={step} className="program-trace">
          <p>
            <b>Zeile {cur.line}:</b> {cur.note}
          </p>
          {Object.keys(cur.vars).length > 0 && (
            <table className="trace-vars">
              <tbody>
                {Object.entries(cur.vars).map(([k, v]) => (
                  <tr key={k} className={changed.includes(k) ? 'changed' : ''}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {out && (out.text || out.error) && (
        <div className="code-output">
          {out.text && <pre>{out.text}</pre>}
          {out.error && <pre className="err">{out.error}</pre>}
          {out.note && <small className="muted">{out.note}</small>}
        </div>
      )}
    </div>
  );
}

// ---------- case sketch ----------
const KIND_LABEL: Record<SketchKind, string> = { vertrag: 'Vertrag', anspruch: 'Anspruch?', uebereignung: 'Übereignung', sonstiges: 'Beziehung' };
/** Who is involved, and who wants what from whom – drawn like a case sketch in a law course. */
export function SketchView({ sketch }: { sketch: Sketch }) {
  const [figRef, seen] = useInView<HTMLElement>();
  const [playKey, setPlayKey] = useState(0);
  const n = sketch.parties.length;
  const W = 520, H = n > 2 ? 300 : 190;
  // 2 → side by side, 3 → triangle, 4–5 → around a circle
  const pos = sketch.parties.map((_, k) => {
    if (n === 2) return [110 + k * 300, 95];
    if (n === 3) return [[260, 60], [100, 240], [420, 240]][k];
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
    return [260 + 190 * Math.cos(a), 150 + 105 * Math.sin(a)];
  });
  const at = (id: string) => pos[sketch.parties.findIndex((p) => p.id === id)];
  const pairKey = (a: string, b: string) => [a, b].sort().join('|');
  const total = new Map<string, number>();
  for (const l of sketch.links) total.set(pairKey(l.from, l.to), (total.get(pairKey(l.from, l.to)) ?? 0) + 1);
  const pairs = new Map<string, number>();
  return (
    <figure ref={figRef} className={'sketch' + (seen ? ' sk-anim' : '')}>
      <button type="button" className="icon-btn figure-replay" title="Animation nochmal abspielen" aria-label="Animation nochmal abspielen" onClick={() => setPlayKey((x) => x + 1)}>
        <IconRefresh size={14} />
      </button>
      <svg key={`${seen ? 1 : 0}-${playKey}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fallskizze">
        <defs>
          <marker id="sk-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 1 L10 5 L0 9 z" className="sk-head" />
          </marker>
        </defs>
        {sketch.links.map((l, k) => {
          const [x1, y1] = at(l.from), [x2, y2] = at(l.to);
          const key = pairKey(l.from, l.to);
          const nth = pairs.get(key) ?? 0;
          pairs.set(key, nth + 1);
          // several links between the same two people bend apart evenly (always to the same side for one direction)
          const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
          const flip = l.from < l.to ? 1 : -1;
          const off = (nth - ((total.get(key) ?? 1) - 1) / 2) * 44 * flip;
          const nx = (-dy / len) * off, ny = (dx / len) * off;
          const sx = x1 + (dx / len) * 62, sy = y1 + (dy / len) * 30;
          const ex = x2 - (dx / len) * 62, ey = y2 - (dy / len) * 30;
          const cx = (sx + ex) / 2 + nx * 1.6, cy = (sy + ey) / 2 + ny * 1.6;
          const dly = `${(0.22 + k * 0.14).toFixed(2)}s`;
          return (
            <g key={k} className={'sk-link ' + l.kind} style={{ animationDelay: dly }}>
              <path pathLength={100} style={{ animationDelay: dly }} d={`M${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`} markerEnd="url(#sk-a)" markerStart={l.kind === 'vertrag' ? 'url(#sk-a)' : undefined} />
              {l.kind === 'uebereignung' && <path pathLength={100} style={{ animationDelay: dly }} d={`M${sx + ny * 0.15} ${sy - nx * 0.15 + 5} Q ${cx} ${cy + 5} ${ex} ${ey + 5}`} markerEnd="url(#sk-a)" className="double" />}
              <text x={cx} y={cy - 6} textAnchor="middle" className="sk-label" style={{ animationDelay: `${(0.38 + k * 0.14).toFixed(2)}s` }}>
                {l.label || KIND_LABEL[l.kind]}
              </text>
            </g>
          );
        })}
        {sketch.parties.map((p, k) => (
          <g key={p.id} className="sk-party" style={{ animationDelay: `${(0.06 + k * 0.1).toFixed(2)}s` }}>
            <rect x={pos[k][0] - 58} y={pos[k][1] - 26} width={116} height={52} rx={12} />
            <text x={pos[k][0]} y={pos[k][1] - (p.role ? 3 : -5)} textAnchor="middle" className="sk-name">
              {p.name}
            </text>
            {p.role && (
              <text x={pos[k][0]} y={pos[k][1] + 15} textAnchor="middle" className="sk-role">
                {p.role}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="sk-legend">
        {(['vertrag', 'anspruch', 'uebereignung'] as SketchKind[])
          .filter((k) => sketch.links.some((l) => l.kind === k))
          .map((k) => (
            <span key={k} className={'sk-key ' + k}>
              <i /> {KIND_LABEL[k]}
            </span>
          ))}
      </div>
      {sketch.question && <figcaption>{sketch.question}</figcaption>}
    </figure>
  );
}

// ---------- sentence parts, tables ----------
/** Sentences with their parts in colour (hover shows the part's name), with a legend. */
export function SyntaxView({ sentences }: { sentences: Sentence[] }) {
  const used = SYNTAX_ROLES.filter((r) => sentences.some((s) => s.parts.some((p) => p.role === r)));
  return (
    <div className="syntax">
      {sentences.map((s, k) => (
        <div key={k} className="syntax-sentence">
          <p>
            {s.parts.map((p, j) => (
              <span key={j} className={'sp ' + p.role} title={ROLE_LABEL[p.role]} style={{ animationDelay: `${Math.min(0.6, (k * 3 + j) * 0.065).toFixed(2)}s` }}>
                {p.text}
                <small>{ROLE_LABEL[p.role]}</small>
              </span>
            ))}
          </p>
          {s.translation && <small className="muted">{s.translation}</small>}
        </div>
      ))}
      <div className="syntax-legend">
        {used.map((r) => (
          <span key={r} className={'sp-key ' + r}>
            <i /> {ROLE_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}
export function TablesView({ tables }: { tables: Table[] }) {
  return (
    <div className="lang-tables">
      {tables.map((t, k) => (
        <table key={k} className="lang-table">
          {t.title && <caption>{t.title}</caption>}
          {t.head.length > 0 && (
            <thead>
              <tr>
                {t.head.map((h, j) => (
                  <th key={j}>{h}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {t.rows.map((r, j) => (
              <tr key={j} style={{ animationDelay: `${Math.min(0.55, j * 0.055).toFixed(2)}s` }}>
                {r.map((c, i) => (
                  <td key={i}>
                    {markedParts(c).map((p, q) => (p.mark ? <mark key={q}>{p.text}</mark> : <Fragment key={q}>{p.text}</Fragment>))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

// ---------- a picture of the explanation ----------
/** A Studyflix-style animated graphic of the explanation (with replay button and optional auto-playing state switches for `forces` diagrams). */
export function BuildFigure({ diagram, caption }: { diagram: Diagram; caption?: string; narration?: string[] }) {
  const theme = useResolvedTheme();
  const [figRef, seen] = useInView<HTMLElement>();
  const states = diagram.type === 'forces' && diagram.states?.length ? diagram.states : undefined;
  const [stateIdx, setStateIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const active = states ? Math.min(stateIdx, states.length - 1) : undefined;
  useEffect(() => {
    if (!playing || !states || states.length < 2) return;
    const t = window.setInterval(() => {
      setStateIdx((s) => (s + 1) % states.length);
    }, 2400);
    return () => window.clearInterval(t);
  }, [playing, states]);
  const svg = useMemo(
    () => renderDiagram(diagram, PALETTES[theme], { ...(active !== undefined ? { state: active } : {}), animate: seen }),
    [diagram, theme, active, seen],
  );
  const stateNote = states && active !== undefined ? states[active]?.note : undefined;
  const replay = () => {
    setPlaying(false);
    setPlayKey((x) => x + 1);
  };
  return (
    <figure ref={figRef} className="practice-figure build-figure">
      <div className="figure-bar">
        {states && (
          <div className="figure-states" role="tablist" aria-label="Zustand umschalten">
            {states.map((st, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === active}
                className={'btn sm ' + (idx === active ? 'primary' : 'outline')}
                onClick={() => (setPlaying(false), setStateIdx(idx))}
              >
                {st.name}
              </button>
            ))}
            {states.length >= 2 && (
              <button
                type="button"
                className={'btn sm ' + (playing ? 'primary' : 'ghost')}
                onClick={() => setPlaying((p) => !p)}
                title={playing ? 'Zustands-Animation pausieren' : 'Zustände nacheinander abspielen'}
              >
                {playing ? <IconPause size={13} /> : <IconPlay size={13} />} {playing ? 'Pause' : 'Abspielen'}
              </button>
            )}
          </div>
        )}
        <button type="button" className="icon-btn figure-replay" title="Animation nochmal abspielen" aria-label="Animation nochmal abspielen" onClick={replay}>
          <IconRefresh size={14} />
        </button>
      </div>
      {/* our own SVG with escaped labels / strictly sanitized illustration – safe to insert */}
      <div key={`${seen ? 1 : 0}-${active ?? 0}-${playKey}`} className="diagram" dangerouslySetInnerHTML={{ __html: svg }} />
      {stateNote && (
        <p key={active} className="figure-state-note">
          <CardContent text={stateNote} className="inline" />
        </p>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
