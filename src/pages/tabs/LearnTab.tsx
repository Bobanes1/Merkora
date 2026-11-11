import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconShuffle, IconSparkle } from '../../components/Icons';
import { CardContent, lookOf } from '../../components/CardContent';
import { Confetti, Mascot, praise, type Mood } from '../../components/Mascot';
import { Markdown } from '../../components/Markdown';
import { FocusButton } from '../../components/Pomodoro';
import { countAnswerTime } from '../../lib/pomodoro';
import { explainCard, gradeAnswer, hasKey } from '../../lib/ai';
import { cardBackText, cardFrontText } from '../../lib/content';
import { RATINGS, formatDelay, schedule, type Rating, type Srs } from '../../lib/srs';
import { addXp, boostNewCards, dueCards, logReview, newCardsLeft, reviewCard, useStore, type Deck } from '../../lib/store';
import { capForExam, countdownText, nextExamAt, nextExamForDeck } from '../../lib/exams';
import { pipGreeting, pipReaction, pipSummary } from '../../lib/pipLines';
import { answerOnly } from '../../lib/backSide';
import { dayKey } from '../../lib/util';

type Grade = { score: number; verdict: string; feedback: string };

export default function LearnTab({ deck, onDone }: { deck: Deck; onDone: () => void }) {
  const newPerDay = useStore((s) => s.data.settings.newPerDay);
  const [startAfterBoost, setStartAfterBoost] = useState(false);
  const exams = useStore((s) => s.data.exams);
  const exam = nextExamForDeck({ exams }, deck.id);
  /** Time until the next review for a rating – never after the exam of this deck. */
  const preview = (s: Srs, r: Rating) => {
    const now = Date.now();
    return formatDelay(capForExam(schedule(s, r, now), nextExamAt({ exams }, deck.id, now), now).due - now);
  };
  const [mode, setMode] = useState<'due' | 'all' | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [typed, setTyped] = useState('');
  const [typeMode, setTypeMode] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [explain, setExplain] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lastRating, setLastRating] = useState<Rating | null>(null);
  // Pip's reactions: streaks, cards that finally sit, half time, last cards …
  const [run, setRun] = useState({ streak: 0, misses: 0, firstTry: 0, seen: new Set<string>() });
  const [say, setSay] = useState<{ text?: string; big: boolean }>({ big: false });
  const reviews = useStore((s) => s.data.reviews);
  const mood: Mood = busy
    ? 'think'
    : grade
      ? grade.score >= 3 ? 'happy' : 'sad'
      : say.big
        ? 'cheer'
        : lastRating === null ? 'wave' : lastRating >= 3 ? 'happy' : lastRating === 1 ? 'sad' : 'idle';
  const moodSay = busy ? 'Ich denke nach …' : say.text;

  const dueIds = useMemo(
    () =>
      dueCards(deck)
        .sort((a, b) => a.srs.due - b.srs.due)
        .map((c) => c.id),
    // only when the deck's card set (or today's new-card limit) changes, not after each review
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.id, deck.cards.length, deck.newBoost?.n, deck.newBoost?.day, newPerDay],
  );

  // after "+10 neue Karten" the round starts as soon as the new cards are due
  useEffect(() => {
    if (!startAfterBoost) return;
    setStartAfterBoost(false);
    start('due');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueIds]);
  const fresh = deck.cards.filter((c) => c.srs.last === undefined);
  const newDueIds = new Set(fresh.slice(0, newCardsLeft(deck)).map((c) => c.id));
  const newInDue = dueIds.filter((id) => newDueIds.has(id)).length;
  const waiting = fresh.length - newInDue;

  const start = (m: 'due' | 'all') => {
    const ids = m === 'due' ? dueIds : [...deck.cards.map((c) => c.id)].sort(() => Math.random() - 0.5);
    setQueue(ids);
    setMode(m);
    setDone(0);
    setRun({ streak: 0, misses: 0, firstTry: 0, seen: new Set() });
    setLastRating(null);
    setSay({ text: pipGreeting(new Date().getHours(), ids.length), big: false });
    reset();
  };

  useEffect(() => {
    if (mode === null && dueIds.length) start('due');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setFlipped(false);
    setTyped('');
    setGrade(null);
    setExplain('');
    setError('');
  };

  const card = deck.cards.find((c) => c.id === queue[0]);

  const rate = useCallback(
    (r: Rating) => {
      if (!card) return;
      // Practice mode only moves the schedule for cards that are actually due.
      const scheduled = mode === 'due' || card.srs.due <= Date.now();
      if (scheduled) reviewCard(deck.id, card.id, r);
      else logReview(deck.id, card.id, r);
      addXp(r === 1 ? 2 : r === 2 ? 5 : r === 3 ? 8 : 10);
      countAnswerTime();
      setLastRating(r);
      // Cards that are still in a short learning step (minutes) come back later in this round.
      const comesBack = r === 1 || (scheduled && schedule(card.srs, r).due - Date.now() <= 60 * 60 * 1000);
      setQueue((q) => (comesBack ? [...q.slice(1), q[0]] : q.slice(1)));
      if (!comesBack) setDone((n) => n + 1);
      const streak = r >= 3 ? run.streak + 1 : 0;
      const misses = r === 1 ? run.misses + 1 : 0;
      const first = !run.seen.has(card.id);
      setRun({ streak, misses, firstTry: run.firstTry + (first && r >= 3 ? 1 : 0), seen: new Set(run.seen).add(card.id) });
      const doneNow = done + (comesBack ? 0 : 1);
      const reaction = pipReaction({
        rating: r,
        streak,
        misses,
        lapses: card.srs.lapses,
        done: doneNow,
        remaining: queue.length - (comesBack ? 0 : 1),
        total: done + queue.length,
      });
      setSay(
        reaction
          ? { text: reaction, big: r >= 3 }
          : { text: r === 4 ? praise(doneNow) : r === 1 ? 'Die kommt gleich nochmal – du packst das!' : undefined, big: false },
      );
      reset();
    },
    [card, deck.id, mode, run, done, queue.length],
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
    return () => window.removeEventListener('keydown', k);
  }, [card, flipped, rate]);

  const check = async () => {
    if (!card) return;
    setBusy('grade');
    setError('');
    try {
      setGrade(await gradeAnswer(cardFrontText(card), cardBackText(card), typed));
      setFlipped(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const doExplain = async () => {
    if (!card) return;
    setBusy('explain');
    setError('');
    try {
      setExplain(await explainCard(cardFrontText(card), cardBackText(card)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  /** End of the round: share known at first try, and a new daily record. */
  const summary = () => {
    const perDay = new Map<string, number>();
    for (const rv of reviews) perDay.set(dayKey(rv.at), (perDay.get(dayKey(rv.at)) ?? 0) + 1);
    const today = perDay.get(dayKey(Date.now())) ?? 0;
    perDay.delete(dayKey(Date.now()));
    return pipSummary({ done, firstTry: run.firstTry, today, bestDay: Math.max(0, ...perDay.values()) });
  };

  if (!deck.cards.length)
    return (
      <div className="empty">
        <b>Noch keine Karten</b>
        <p className="muted">Füge zuerst Karteikarten hinzu.</p>
      </div>
    );

  if (mode === null || !card)
    return (
      <div className="empty learn-start">
        {mode !== null && done > 0 && <Confetti count={50} />}
        {mode !== null ? (
          <Mascot who="pip" mood="cheer" size={96} side="top" say={done > 0 ? summary() : 'Alles erledigt!'} />
        ) : (
          <Mascot who="pip" mood="wave" size={84} side="top" />
        )}
        <b>{mode !== null ? `Geschafft! ${done} Karten wiederholt.` : dueIds.length ? `${dueIds.length} Karten sind fällig` : 'Keine Karten fällig'}</b>
        <p className="muted">
          {dueIds.length && mode === null
            ? 'Starte deine Wiederholung – im richtigen Moment wiederholt bleibt es am längsten hängen.'
            : mode === null && waiting > 0
              ? `Wiederholungen erledigt. ${waiting} neue Karten warten – das Tageskontingent neuer Karten geht im Kurs der Reihe nach an die Decks. Mit „10 neue Karten“ fängst du hier trotzdem an.`
              : 'Alles wiederholt. Du kannst trotzdem frei üben – das verschiebt deinen Plan kaum.'}
        </p>
        {mode === null && dueIds.length > 0 && (
          <p className="due-split">
            <span>
              <b>{dueIds.length - newInDue}</b> Wiederholungen
            </span>
            <span>
              <b>{newInDue}</b> neue Karten
            </span>
            {waiting > 0 && (
              <span className="muted">
                {waiting} neue warten auf die nächsten Tage ({newPerDay ?? 20} pro Tag im Kurs)
              </span>
            )}
          </p>
        )}
        <div className="row-gap center">
          {dueIds.length > 0 && mode === null && (
            <button type="button" className="btn primary" onClick={() => start('due')}>
              Fällige Karten lernen
            </button>
          )}
          {waiting > 0 && (
            <button
              type="button"
              className="btn outline"
              title="Heute zusätzlich 10 neue Karten aus diesem Deck lernen"
              onClick={() => {
                boostNewCards(deck.id, 10);
                setStartAfterBoost(true);
              }}
            >
              <IconPlus size={16} /> 10 neue Karten
            </button>
          )}
          <button type="button" className="btn outline" onClick={() => start('all')}>
            <IconShuffle size={16} /> Alle Karten üben
          </button>
          {mode !== null && (
            <button type="button" className="btn ghost" onClick={onDone}>
              Fortschritt ansehen
            </button>
          )}
        </div>
      </div>
    );

  const total = done + queue.length;
  return (
    <div className="learn">
      {exam && (
        <div className="exam-hint">
          Prüfung „{exam.title}“ {countdownText(exam)} – alle Karten kommen vorher noch einmal dran.
        </div>
      )}
      <div className="learn-progress">
        <span>
          {done} / {total}
        </span>
        <span className="bar">
          <i style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
        </span>
        <span className="muted small">{mode === 'due' ? 'Fällige Karten' : 'Freies Üben'}</span>
        <FocusButton />
      </div>

      <Mascot className="learn-mascot" mood={mood} pulse={done + queue.length} size={64} say={moodSay} />
      <div key={`${card.id}-${flipped ? 'b' : 'f'}`} className={`flashcard ${flipped ? 'flipped flip-in' : 'card-in'}`} onClick={() => !typeMode && setFlipped(true)}>
        <small>Frage</small>
        <CardContent text={card.front} html={card.html} look={lookOf(deck, card)} className="fc-front" />
        {flipped && (
          <>
            <hr />
            <small>Antwort</small>
            <CardContent text={card.html ? answerOnly(card.front, card.back) : card.back} html={card.html} look={lookOf(deck, card)} className="fc-back" />
          </>
        )}
        {!flipped && !typeMode && <span className="fc-hint">Klicken oder Leertaste zum Umdrehen</span>}
      </div>

      {typeMode && !flipped && (
        <div className="type-answer">
          <textarea className="input" rows={3} placeholder="Schreib deine Antwort …" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <div className="row-gap">
            <button type="button" className="btn primary" onClick={check} disabled={busy === 'grade'}>
              <IconSparkle size={16} /> {busy === 'grade' ? 'Wird bewertet …' : 'Von KI bewerten lassen'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setFlipped(true)}>
              Antwort zeigen
            </button>
          </div>
        </div>
      )}

      {grade && (
        <div className={`grade g${grade.score}`}>
          <b>{grade.verdict}</b>
          <p>{grade.feedback}</p>
        </div>
      )}
      {explain && (
        <div className="explain">
          <Markdown text={explain} />
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {flipped ? (
        <div className="rate-row">
          {RATINGS.map((r) => (
            <button
              type="button"
              key={r.value}
              className={`rate ${r.cls} ${grade && grade.score === r.value ? 'suggested' : ''}`}
              onClick={() => rate(r.value)}
            >
              <b>{r.label}</b>
              <small>{mode === 'due' ? preview(card.srs, r.value) : `Taste ${r.key}`}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="row-gap center">
          {!typeMode && (
            <button type="button" className="btn primary" onClick={() => setFlipped(true)}>
              Antwort zeigen
            </button>
          )}
          <label className="switch">
            <input type="checkbox" checked={typeMode} onChange={(e) => setTypeMode(e.target.checked)} />
            <span>Antwort eintippen</span>
          </label>
        </div>
      )}
      {flipped && !explain && hasKey('chat') && (
        <div className="row-gap center">
          <button type="button" className="btn ghost sm" onClick={doExplain} disabled={busy === 'explain'}>
            <IconSparkle size={14} /> {busy === 'explain' ? 'Erklärung wird erstellt …' : 'Von der KI erklären lassen'}
          </button>
        </div>
      )}
    </div>
  );
}
