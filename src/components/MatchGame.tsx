import { useEffect, useMemo, useRef, useState } from 'react';
import { isLeech } from '../lib/cardLinks';
import { cardBackText, cardFrontText, cardHasMedia } from '../lib/content';
import { formatTime, isPair, makeTiles, pickMatchCards, type Tile } from '../lib/match';
import { updateDeck, type Deck } from '../lib/store';
import { Confetti } from './Mascot';

const PENALTY = 1000;

/** Matching game: pair questions with answers as fast as possible. Does not change the learning plan. */
export function MatchGame({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const candidates = useMemo(
    () =>
      deck.cards.map((c) => ({ id: c.id, front: cardFrontText(c), back: cardBackText(c), due: c.srs.due, leech: isLeech(c), media: cardHasMedia(c) })),
    // a round is fixed once started
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.id],
  );
  const [round, setRound] = useState(0);
  const tiles = useMemo(() => makeTiles(pickMatchCards(candidates, 6)), [candidates, round]);
  const [picked, setPicked] = useState<Tile | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [penalty, setPenalty] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ ms: number; best: boolean } | null>(null);
  const wrongTimer = useRef<number>();

  const pairs = tiles.length / 2;
  const finished = result !== null;

  // the clock runs from the first click until the last pair
  useEffect(() => {
    if (start === null || finished) return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [start, finished]);

  const restart = () => {
    setRound((r) => r + 1);
    setPicked(null);
    setGone(new Set());
    setWrong([]);
    setPenalty(0);
    setStart(null);
    setResult(null);
  };

  const click = (t: Tile) => {
    if (finished || gone.has(t.key)) return;
    if (start === null) setStart(Date.now());
    if (!picked) return setPicked(t);
    if (picked.key === t.key) return setPicked(null);
    if (isPair(picked, t)) {
      const next = new Set(gone).add(picked.key).add(t.key);
      setGone(next);
      setPicked(null);
      if (next.size === tiles.length) {
        const ms = Date.now() - (start ?? Date.now()) + penalty;
        const best = !deck.matchBest || ms < deck.matchBest;
        if (best) updateDeck(deck.id, { matchBest: ms });
        setResult({ ms, best });
      }
    } else {
      setWrong([picked.key, t.key]);
      setPenalty((p) => p + PENALTY);
      setPicked(null);
      window.clearTimeout(wrongTimer.current);
      wrongTimer.current = window.setTimeout(() => setWrong([]), 450);
    }
  };

  if (pairs < 4)
    return (
      <div className="empty">
        <b>Zu wenige passende Karten</b>
        <p className="muted">Für das Zuordnen-Spiel brauchst du mindestens 4 Karten mit kurzem Text (ohne Bilder, höchstens etwa 90 Zeichen pro Seite).</p>
        <button type="button" className="btn outline" onClick={onClose}>
          Zurück
        </button>
      </div>
    );

  const elapsed = start === null ? 0 : (finished ? result!.ms - penalty : now - start) + penalty;
  return (
    <div className="match">
      {result?.best && <Confetti count={60} />}
      <div className="match-top">
        <b>Zuordnen</b>
        <span className="muted small">Finde zu jeder Frage die Antwort. Ein falsches Paar kostet 1 Sekunde.</span>
        <span className="grow" />
        <span className="match-time" aria-live="off">
          {formatTime(elapsed)}
        </span>
        {deck.matchBest && <span className="muted small">Bestzeit {formatTime(deck.matchBest)}</span>}
      </div>
      {finished ? (
        <div className="empty match-done">
          <b>{result!.best ? 'Neue Bestzeit!' : 'Geschafft!'}</b>
          <p className="match-result">{formatTime(result!.ms)}</p>
          {penalty > 0 && <p className="muted small">davon {penalty / 1000} s Strafzeit</p>}
          <div className="row-gap center">
            <button type="button" className="btn primary" onClick={restart}>
              Nochmal
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              Zurück
            </button>
          </div>
        </div>
      ) : (
        <div className="match-grid">
          {tiles.map((t) => (
            <button
              key={t.key + round}
              type="button"
              className={'match-tile' + (picked?.key === t.key ? ' picked' : '') + (wrong.includes(t.key) ? ' wrong' : '') + (gone.has(t.key) ? ' gone' : '') + (t.side === 'back' ? ' back' : '')}
              disabled={gone.has(t.key)}
              aria-pressed={picked?.key === t.key}
              onClick={() => click(t)}
            >
              {t.text}
            </button>
          ))}
        </div>
      )}
      {!finished && (
        <div className="row-gap center">
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Beenden
          </button>
        </div>
      )}
    </div>
  );
}
