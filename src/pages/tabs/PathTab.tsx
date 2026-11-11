import { useEffect, useMemo, useRef, useState } from 'react';
import { CardContent, lookOf } from '../../components/CardContent';
import { IconCheck, IconClose, IconFlame, IconGift, IconHeart, IconLock, IconStar, IconTarget, IconTrophy } from '../../components/Icons';
import {
  buildExercises,
  buildPath,
  flatNodes,
  nodeStates,
  pathProgress,
  playerLevel,
  starsFor,
  totalXp,
  xpStreak,
  xpToday,
  type Exercise,
  type PathNode,
} from '../../lib/path';
import { comfort, Confetti, Mascot, praise } from '../../components/Mascot';
import { FloorDecor, NodeDecor, PathLink, SandFloor, themeFor, Waves } from '../../components/PathDecor';
import { addXp, logReview, reviewCard, savePathResult, setDailyGoal, useData, type Deck } from '../../lib/store';

const HEARTS = 3;
const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56];

// ---------- header with XP, streak and goal ----------
export function GameBar() {
  const data = useData();
  const xp = totalXp(data);
  const lvl = playerLevel(xp);
  const today = xpToday(data);
  const goal = data.game.dailyGoal;
  const streak = xpStreak(data);
  return (
    <div className="game-bar">
      <div className="gb-item" title="Tage in Folge gelernt">
        <span className={`gb-icon flame ${today > 0 ? 'lit' : ''}`}>
          <IconFlame size={18} />
        </span>
        <span>
          <b>{streak}</b>
          <small>{streak === 1 ? 'Tag Serie' : 'Tage Serie'}</small>
        </span>
      </div>
      <div className="gb-item grow" title="Tagesziel">
        <span className="gb-icon goal">
          <IconTarget size={18} />
        </span>
        <span className="gb-goal">
          <span className="gb-goal-top">
            <b>
              {Math.min(today, goal)} / {goal} XP
            </b>
            <small>{today >= goal ? 'Tagesziel geschafft!' : 'Tagesziel'}</small>
            <select aria-label="Tagesziel ändern" value={goal} onChange={(e) => setDailyGoal(+e.target.value)}>
              {[20, 50, 100, 200].map((g) => (
                <option key={g} value={g}>
                  {g} XP
                </option>
              ))}
            </select>
          </span>
          <span className="bar">
            <i style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
          </span>
        </span>
      </div>
      <div className="gb-item" title={`${lvl.into} von ${lvl.need} XP bis Stufe ${lvl.level + 1}`}>
        <span className="gb-level">{lvl.level}</span>
        <span>
          <b>{xp} XP</b>
          <small>Stufe {lvl.level}</small>
        </span>
      </div>
    </div>
  );
}

// ---------- the path ----------
export default function PathTab({ deck }: { deck: Deck }) {
  const units = useMemo(() => buildPath(deck), [deck]);
  const nodes = useMemo(() => flatNodes(units), [units]);
  const states = nodeStates(deck, nodes);
  const [playing, setPlaying] = useState<PathNode | null>(null);
  const [showUnits, setShowUnits] = useState(3);
  const progress = pathProgress(deck);
  const currentRef = useRef<HTMLButtonElement>(null);
  const currentUnit = nodes.find((n) => states[n.key] === 'current')?.unit ?? 0;
  const visibleUnits = units.filter((u) => u.index < Math.max(showUnits, currentUnit + 2));

  useEffect(() => {
    if (!playing) currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [playing]);

  if (playing) return <Lesson deck={deck} node={playing} onExit={() => setPlaying(null)} />;

  if (!deck.cards.length)
    return (
      <div>
        <GameBar />
        <div className="empty">
          <b>Noch kein Lernpfad</b>
          <p className="muted">Sobald das Deck Karten hat, entsteht hier ein Pfad aus kleinen Levels mit Sternen und Belohnungen.</p>
        </div>
      </div>
    );

  let i = 0;
  return (
    <div className="path-tab">
      <GameBar />
      <div className="path-summary">
        <span>
          <b>
            {progress.done} / {progress.total}
          </b>{' '}
          Stationen geschafft
        </span>
        <span className="path-stars">
          <IconStar size={16} /> {progress.stars} / {progress.maxStars}
        </span>
      </div>
      <div className="path">
        {visibleUnits.map((u) => {
          const theme = themeFor(u.index);
          const doneHere = u.nodes.filter((n) => states[n.key] === 'done').length;
          let prevOff: number | null = null;
          return (
          <section
            key={u.index}
            className="path-unit scene"
            style={{ ['--scene-top' as string]: theme.top, ['--scene-bottom' as string]: theme.bottom, ['--scene-accent' as string]: theme.accent }}
          >
            <Waves color="var(--scene-wave)" />
            <span className="scene-bubbles" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <header className="unit-banner">
              <span className="unit-no">{u.index + 1}</span>
              <span className="grow">
                <b>{u.title}</b>
                <small>
                  {theme.name} · {doneHere} von {u.nodes.length} geschafft
                </small>
                <span className="unit-progress">
                  <i style={{ width: `${(doneHere / Math.max(1, u.nodes.length)) * 100}%` }} />
                </span>
              </span>
            </header>
            <div className="unit-nodes">
              {u.nodes.map((n, k) => {
                const st = states[n.key];
                const res = deck.path?.[n.key];
                const off = OFFSETS[i++ % OFFSETS.length];
                const dx = prevOff === null ? null : prevOff - off;
                prevOff = off;
                // decorations go where the path leaves room – and never where Pip is waving
                const mascotSide = off > 0 ? 'left' : 'right';
                let decoSide: 'left' | 'right' = off > 0 ? 'left' : off < 0 ? 'right' : k % 2 ? 'left' : 'right';
                if (st === 'current') decoSide = mascotSide === 'left' ? 'right' : 'left';
                const Icon = n.kind === 'review' ? IconGift : n.kind === 'final' ? IconTrophy : st === 'done' ? IconCheck : st === 'locked' ? IconLock : IconStar;
                return (
                  <div key={n.key} className={`path-node-wrap ${st}`} style={{ transform: `translateX(${off}px)`, animationDelay: `${Math.min(i, 24) * 45}ms`, zIndex: 200 - k }}>
                    {dx !== null && <PathLink dx={dx} height={st === 'current' ? 88 : 58} done={st === 'done' || st === 'current'} />}
                    <NodeDecor theme={theme} index={k + u.index * 2} side={decoSide} />
                    {st === 'current' && <span className="node-bubble">{n.kind === 'lesson' ? 'Start' : 'Los!'}</span>}
                    {st === 'current' && <Mascot className={`node-mascot ${off > 0 ? 'left' : 'right'}`} mood="wave" size={64} />}
                    <button
                      ref={st === 'current' ? currentRef : undefined}
                      type="button"
                      className={`path-node ${n.kind} ${st}`}
                      disabled={st === 'locked'}
                      onClick={() => setPlaying(n)}
                      aria-label={`${n.title}${st === 'locked' ? ' (gesperrt)' : st === 'done' ? ` (${res?.stars} Sterne)` : ''}`}
                    >
                      <Icon size={n.kind === 'lesson' ? 28 : 30} />
                    </button>
                    <span className="node-label">{n.title}</span>
                    {st === 'done' && (
                      <span className="node-stars" aria-hidden="true">
                        {[1, 2, 3].map((s) => (
                          <IconStar key={s} size={14} className={s <= (res?.stars ?? 0) ? 'on' : ''} />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <SandFloor />
            <FloorDecor />
          </section>
          );
        })}
        {visibleUnits.length < units.length && (
          <button type="button" className="btn outline" onClick={() => setShowUnits(visibleUnits.length + 3)}>
            Weitere Abschnitte anzeigen ({units.length - visibleUnits.length})
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- one level ----------
type Answer = { cardId: string; correct: boolean };

function Lesson({ deck, node, onExit }: { deck: Deck; node: PathNode; onExit: () => void }) {
  const [queue, setQueue] = useState<Exercise[]>(() => buildExercises(deck, node));
  const total = useMemo(() => queue.length, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [first, setFirst] = useState<Record<string, boolean>>({});
  const [hearts, setHearts] = useState(HEARTS);
  const [combo, setCombo] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);
  const [earned, setEarned] = useState(0);
  const [end, setEnd] = useState<null | { win: boolean; stars: number; xp: number }>(null);
  const [lastGain, setLastGain] = useState(0);
  const [reacts, setReacts] = useState(0);
  const ex = queue[0];
  const doneCount = Object.keys(first).length;

  const answer = (correct: boolean) => {
    if (!ex || result) return;
    const card = deck.cards.find((c) => c.id === ex.cardId);
    const isFirst = first[ex.cardId] === undefined;
    if (isFirst && card) {
      if (card.srs.due <= Date.now()) reviewCard(deck.id, card.id, correct ? 3 : 1);
      else logReview(deck.id, card.id, correct ? 3 : 1);
      setFirst((f) => ({ ...f, [ex.cardId]: correct }));
    }
    const gain = correct ? (isFirst ? 10 : 3) + (combo >= 2 ? 2 : 0) : 0;
    if (gain) {
      addXp(gain);
      setEarned((e) => e + gain);
    }
    setLastGain(gain);
    setReacts((n) => n + 1);
    setCombo(correct ? combo + 1 : 0);
    if (!correct) setHearts((h) => h - 1);
    setResult({ cardId: ex.cardId, correct });
  };

  const next = () => {
    if (!result) return;
    const rest = result.correct ? queue.slice(1) : [...queue.slice(1), queue[0]];
    if (!result.correct && hearts <= 0) {
      setEnd({ win: false, stars: 0, xp: earned });
      return;
    }
    if (!rest.length) {
      const right = Object.values({ ...first }).filter(Boolean).length;
      const stars = starsFor(right, total);
      const bonus = 15 + stars * 5 + (node.kind === 'final' ? 30 : node.kind === 'review' ? 15 : 0);
      addXp(bonus);
      savePathResult(deck.id, node.key, stars, Math.round((right / Math.max(1, total)) * 100));
      setEnd({ win: true, stars, xp: earned + bonus });
      return;
    }
    setQueue(rest);
    setPicked(null);
    setShown(false);
    setResult(null);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (end) return;
      if (e.key === 'Enter' && result) next();
      else if (ex?.type === 'mc' && !result && ['1', '2', '3', '4'].includes(e.key)) {
        const n = Number(e.key) - 1;
        setPicked(n);
        answer(n === ex.answer);
      } else if (ex?.type === 'flip' && !result && e.key === ' ') {
        e.preventDefault();
        setShown(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (end)
    return (
      <div className="lesson-end panel">
        {end.win && <Confetti />}
        <Mascot
          who={end.win ? 'pip' : 'flo'}
          mood={end.win ? 'cheer' : 'sad'}
          size={110}
          side="top"
          say={end.win ? (end.stars === 3 ? 'Wahnsinn, alles richtig!' : 'Geschafft – ich bin stolz auf dich!') : 'Kopf hoch, gleich nochmal!'}
        />
        {end.win ? (
          <>
            <span className="end-icon win">{node.kind === 'final' ? <IconTrophy size={40} /> : node.kind === 'review' ? <IconGift size={40} /> : <IconCheck size={40} />}</span>
            <h2>{node.kind === 'final' ? 'Abschlusstest bestanden!' : `${node.title} geschafft!`}</h2>
            <div className="end-stars" aria-label={`${end.stars} von 3 Sternen`}>
              {[1, 2, 3].map((s) => (
                <span key={s} className={`end-star ${s <= end.stars ? 'on' : ''}`} style={{ animationDelay: `${s * 0.18}s` }}>
                  <IconStar size={44} />
                </span>
              ))}
            </div>
            <p className="muted">
              {end.stars === 3 ? 'Perfekt – alles beim ersten Versuch richtig!' : end.stars === 2 ? 'Stark! Für 3 Sterne alles beim ersten Mal richtig beantworten.' : 'Geschafft! Wiederhole das Level für mehr Sterne.'}
            </p>
          </>
        ) : (
          <>
            <span className="end-icon lose">
              <IconHeart size={40} />
            </span>
            <h2>Keine Herzen mehr</h2>
            <p className="muted">Kein Problem – die schwierigen Karten kommen jetzt öfter dran. Versuch es gleich nochmal!</p>
          </>
        )}
        <div className="end-xp">+{end.xp} XP</div>
        <div className="row-gap center">
          <button type="button" className="btn outline" onClick={onExit}>
            Zum Lernpfad
          </button>
          {!end.win || end.stars < 3 ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setQueue(buildExercises(deck, node));
                setFirst({});
                setHearts(HEARTS);
                setCombo(0);
                setPicked(null);
                setShown(false);
                setResult(null);
                setEarned(0);
                setEnd(null);
              }}
            >
              Nochmal spielen
            </button>
          ) : null}
        </div>
      </div>
    );

  if (!ex)
    return (
      <div className="empty">
        <b>Dieses Level hat keine Karten mehr.</b>
        <button type="button" className="btn primary" onClick={onExit}>
          Zurück
        </button>
      </div>
    );

  return (
    <div className="lesson">
      <div className="lesson-top">
        <button type="button" className="icon-btn" aria-label="Level verlassen" onClick={onExit}>
          <IconClose size={20} />
        </button>
        <span className="bar lesson-bar">
          <i style={{ width: `${(doneCount / Math.max(1, total)) * 100}%` }} />
        </span>
        <span className="hearts" aria-label={`${hearts} Herzen übrig`}>
          {Array.from({ length: HEARTS }, (_, k) => (
            <IconHeart key={k} size={20} className={k < hearts ? 'on' : ''} />
          ))}
        </span>
      </div>
      <div className="lesson-meta">
        <span>{node.title}</span>
        {combo >= 2 && (
          <span className="combo" key={combo}>
            <IconFlame size={14} /> {combo}er-Serie
          </span>
        )}
      </div>
      <Mascot
        className="lesson-mascot"
        mood={!result ? (ex.type === 'flip' && shown ? 'think' : 'idle') : result.correct ? (combo >= 3 ? 'cheer' : 'happy') : 'sad'}
        pulse={reacts}
        size={72}
        say={!result ? (doneCount === 0 ? 'Los geht’s! Du schaffst das.' : undefined) : result.correct ? praise(reacts) : comfort(reacts)}
      />

      <div className="panel lesson-card">
        {ex.type === 'mc' ? (
          <>
            <small className="ex-kind">{ex.reverse ? 'Welche Frage passt zu dieser Antwort?' : 'Wähle die richtige Antwort'}</small>
            <CardContent text={ex.reverse ? ex.prompt.back : ex.prompt.front} html={ex.prompt.html} look={lookOf(deck, deck.cards.find((c) => c.id === ex.cardId))} className="ex-prompt" />
            <div className="options">
              {ex.options.map((o, k) => {
                const st = picked === null ? '' : k === ex.answer ? 'right' : k === picked ? 'wrong' : 'dim';
                return (
                  <button
                    type="button"
                    key={k}
                    className={`option ${st}`}
                    disabled={picked !== null}
                    onClick={() => {
                      setPicked(k);
                      answer(k === ex.answer);
                    }}
                  >
                    <span className="opt-letter">{k + 1}</span>
                    {o}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <small className="ex-kind">Weißt du die Antwort?</small>
            <CardContent text={ex.prompt.front} html={ex.prompt.html} look={lookOf(deck, deck.cards.find((c) => c.id === ex.cardId))} className="ex-prompt" />
            {shown ? (
              <>
                <hr />
                <CardContent text={ex.prompt.back} html={ex.prompt.html} look={lookOf(deck, deck.cards.find((c) => c.id === ex.cardId))} className="ex-answer" />
                {!result && (
                  <div className="row-gap center">
                    <button type="button" className="btn outline" onClick={() => answer(false)}>
                      Nicht gewusst
                    </button>
                    <button type="button" className="btn primary" onClick={() => answer(true)}>
                      Gewusst
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="row-gap center">
                <button type="button" className="btn primary" onClick={() => setShown(true)}>
                  Antwort zeigen
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {result && (
        <div className={`lesson-feedback ${result.correct ? 'ok' : 'bad'}`} role="status">
          {result.correct && lastGain > 0 && (
            <span className="xp-pop" key={reacts}>
              +{lastGain} XP
            </span>
          )}
          <span>
            <b>{result.correct ? ['Richtig!', 'Super!', 'Stark!', 'Genau!'][doneCount % 4] : 'Nicht ganz.'}</b>
            {!result.correct && ex.type === 'mc' && <small>Richtig wäre: {ex.options[ex.answer]}</small>}
            {!result.correct && <small>Die Karte kommt am Ende nochmal.</small>}
          </span>
          <button type="button" className="btn primary" onClick={next} autoFocus>
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
