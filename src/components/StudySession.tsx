import { useCallback, useEffect, useState } from 'react';
import { answerOnly } from '../lib/backSide';
import { capForExam, nextExamAt } from '../lib/exams';
import { RATINGS, formatDelay, schedule, type Rating } from '../lib/srs';
import { addXp, logReview, reviewCard, useStore } from '../lib/store';
import { CardContent, lookOf } from './CardContent';
import { IconClose } from './Icons';
import { FocusButton } from './Pomodoro';
import { countAnswerTime } from '../lib/pomodoro';

export type SessionItem = { deckId: string; cardId: string };

/**
 * A study round over cards from several decks (exam practice, custom sessions).
 * Due cards move their schedule like in the normal learning tab; others are only logged.
 */
export function StudySession({ title, items, onExit }: { title: string; items: SessionItem[]; onExit: () => void }) {
  const data = useStore((s) => s.data);
  const [queue, setQueue] = useState(items);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const item = queue[0];
  const deck = item ? data.decks.find((d) => d.id === item.deckId) : undefined;
  const card = deck?.cards.find((c) => c.id === item.cardId);

  const rate = useCallback(
    (r: Rating) => {
      if (!card || !deck) return;
      const due = card.srs.due <= Date.now();
      if (due) reviewCard(deck.id, card.id, r);
      else logReview(deck.id, card.id, r);
      addXp(r === 1 ? 2 : r === 2 ? 5 : r === 3 ? 8 : 10);
      countAnswerTime();
      const back = r === 1;
      setQueue((q) => (back ? [...q.slice(1), q[0]] : q.slice(1)));
      if (!back) setDone((n) => n + 1);
      setFlipped(false);
    },
    [card, deck],
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === ' ' && card) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
    };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('keydown', k);
    };
  }, [card, flipped, rate]);

  const head = (
    <div className="session-head">
      <b>{title}</b>
      <span className="muted small">
        {done} / {done + queue.length}
      </span>
      <span className="grow" />
      <FocusButton />
      <button type="button" className="icon-btn" aria-label="Runde beenden" onClick={onExit}>
        <IconClose size={18} />
      </button>
    </div>
  );

  if (!card || !deck)
    return (
      <div className="panel session">
        {head}
        <div className="empty">
          <b>{done ? `Geschafft! ${done} Karten wiederholt.` : 'Keine Karten in dieser Runde.'}</b>
          <button type="button" className="btn primary" onClick={onExit}>
            Fertig
          </button>
        </div>
      </div>
    );

  const look = lookOf(deck, card);
  const preview = (r: Rating) => {
    if (card.srs.due > Date.now()) return `Taste ${r}`;
    const now = Date.now();
    return formatDelay(capForExam(schedule(card.srs, r, now), nextExamAt(data, deck.id, now), now).due - now);
  };
  return (
    <div className="panel session">
      {head}
      <span className="bar session-bar">
        <i style={{ width: `${(done / Math.max(1, done + queue.length)) * 100}%` }} />
      </span>
      <small className="muted">{deck.name}</small>
      <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)}>
        <small>Frage</small>
        <CardContent text={card.front} html={card.html} look={look} className="fc-front" />
        {flipped && (
          <>
            <hr />
            <small>Antwort</small>
            <CardContent text={card.html ? answerOnly(card.front, card.back) : card.back} html={card.html} look={look} className="fc-back" />
          </>
        )}
        {!flipped && <span className="fc-hint">Klicken oder Leertaste zum Umdrehen</span>}
      </div>
      {flipped ? (
        <div className="rate-row">
          {RATINGS.map((r) => (
            <button type="button" key={r.value} className={`rate ${r.cls}`} onClick={() => rate(r.value)}>
              <b>{r.label}</b>
              <small>{preview(r.value)}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="row-gap center">
          <button type="button" className="btn primary" onClick={() => setFlipped(true)}>
            Antwort zeigen
          </button>
        </div>
      )}
    </div>
  );
}

/** Weakest cards first: due, then new/learning, then by ease. */
export function weakestFirst(items: (SessionItem & { due: number; ease: number; learned: boolean })[], now = Date.now()) {
  return [...items]
    .sort((a, b) => Number(b.due <= now) - Number(a.due <= now) || Number(a.learned) - Number(b.learned) || a.ease - b.ease)
    .map(({ deckId, cardId }) => ({ deckId, cardId }));
}
