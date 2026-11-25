import { useCallback, useEffect, useMemo, useState } from 'react';
import { playUi } from '../../lib/uiSound';
import { IconBulb, IconEdit, IconHelp, IconNote, IconPause, IconPlay, IconPlus, IconShuffle, IconSparkle } from '../../components/Icons';
import { CardContent, lookOf } from '../../components/CardContent';
import { DrawPad } from '../../components/DrawPad';
import { Confetti, Mascot, praise, type Mood } from '../../components/Mascot';
import { Markdown } from '../../components/Markdown';
import { Modal } from '../../components/Modal';
import { FocusButton } from '../../components/Pomodoro';
import { countAnswerTime } from '../../lib/pomodoro';
import { explainCard, gradeAnswer, hasKey } from '../../lib/ai';
import { cardFrontText, htmlToText } from '../../lib/content';
import { estimateStudyMinutes, formatEstMinutes, renderClozeAnswer, renderClozeQuestion } from '../../lib/deckTools';
import { RATINGS, formatDelay, schedule, type Rating, type Srs } from '../../lib/srs';
import {
  addXp,
  boostNewCards,
  dueCards,
  logReview,
  newCardsLeft,
  reviewCard,
  setSettings,
  toggleMark,
  toggleSuspendCard,
  undoReview,
  updateDeck,
  useStore,
  type Card,
  type Deck,
} from '../../lib/store';
import { allTags, hasTag } from '../../lib/tags';
import { undoable } from '../../lib/undo';
import { capForExam, countdownText, nextExamAt, nextExamForDeck } from '../../lib/exams';
import { pipGreeting, pipReaction, pipSummary } from '../../lib/pipLines';
import { MarkButton } from '../../components/MarkButton';
import { dayKey } from '../../lib/util';
import { becomesLeech, isLeech } from '../../lib/cardLinks';
import { ASK_SIDES, asksBack, sidesFor, type AskSide } from '../../lib/askSide';
import { graphicQuiz, withDiagramView } from '../../lib/diagram';
import { ImproveCardDialog } from '../../components/ImproveCardDialog';
import { SpeakButton } from '../../components/SpeakButton';
import { usePhone } from '../../lib/phone';
import { useSwipe } from '../../components/useSwipe';
import { htmlSpeech } from '../../lib/speechText';
import { speak, stopSpeaking } from '../../lib/speech';
import { CardEditor } from './CardsTab';

/** Explanations already asked for in this session. */
const explainMemo = new Map<string, string>();

/** A stable number per card id (picks which label of a graphic is covered). */
const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type Grade = { score: number; verdict: string; feedback: string };
type RoundFilter = 'due' | 'new' | 'leech' | 'marked' | 'cram' | 'all';

export default function LearnTab({
  deck,
  onDone,
  customRound,
  onClearCustom,
}: {
  deck: Deck;
  onDone: () => void;
  customRound?: { ids: string[]; label: string } | null;
  onClearCustom?: () => void;
}) {
  const newPerDay = useStore((s) => s.data.settings.newPerDay);
  const [startAfterBoost, setStartAfterBoost] = useState(false);
  const exams = useStore((s) => s.data.exams);
  const decks = useStore((s) => s.data.decks);
  const exam = nextExamForDeck({ exams, decks }, deck.id);
  /** Time until the next review for a rating – never after the exam of this deck. */
  const preview = (s: Srs, r: Rating) => {
    const now = Date.now();
    return formatDelay(capForExam(schedule(s, r, now), nextExamAt({ exams, decks }, deck.id, now), now).due - now);
  };
  const [mode, setMode] = useState<'due' | 'all' | null>(null);
  const [modeLabel, setModeLabel] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [pickFilter, setPickFilter] = useState<RoundFilter>('due');
  const [pickTag, setPickTag] = useState('');
  const [batchCap, setBatchCap] = useState<number>(0); // 0 = all
  const phone = usePhone();
  // phone: swiping the turned card rates it (left = Nochmal, right = Gut)
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [done, setDone] = useState(0);
  const [typed, setTyped] = useState('');
  const [typeMode, setTypeMode] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [explain, setExplain] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lastRating, setLastRating] = useState<Rating | null>(null);
  /** A card that has just become a problem card (forgotten again and again). */
  const [leech, setLeech] = useState<string | null>(null);
  const [improving, setImproving] = useState<string | null>(null);
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const autoRead = useStore((s) => !!s.data.settings.speechAuto);
  // Pip's reactions: streaks, cards that finally sit, half time, last cards …
  const [run, setRun] = useState({ streak: 0, misses: 0, firstTry: 0, seen: new Set<string>() });
  const [say, setSay] = useState<{ text?: string; big: boolean }>({ big: false });
  // "Rückgängig": everything needed to take the last rating back (one step)
  type Undo = {
    cardId: string;
    prevSrs: Card['srs'];
    at: number;
    xp: number;
    queue: string[];
    done: number;
    run: typeof run;
    say: typeof say;
    lastRating: Rating | null;
    leech: string | null;
  };
  const [undo, setUndo] = useState<Undo | null>(null);
  const reviews = useStore((s) => s.data.reviews);
  const deckReviews = useMemo(() => reviews.filter((r) => r.deckId === deck.id), [reviews, deck.id]);
  const mood: Mood = busy
    ? 'think'
    : grade
      ? grade.score >= 3 ? 'happy' : 'sad'
      : say.big
        ? 'cheer'
        : lastRating === null ? 'wave' : lastRating >= 3 ? 'happy' : lastRating === 1 ? 'sad' : 'idle';
  const moodSay = busy ? 'Ich denke nach …' : say.text;

  const activeCards = useMemo(() => deck.cards.filter((c) => !c.suspended), [deck.cards]);
  const tags = useMemo(() => allTags(activeCards), [activeCards]);

  const dueIds = useMemo(
    () =>
      dueCards(deck)
        .sort((a, b) => a.srs.due - b.srs.due)
        .map((c) => c.id),
    // only when the deck's card set (or today's new-card limit) changes, not after each review
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.id, deck.cards.length, deck.newBoost?.n, deck.newBoost?.day, deck.newPerDay, deck.maxReviewsPerDay, newPerDay],
  );

  // after "+10 neue Karten" the round starts as soon as the new cards are due
  useEffect(() => {
    if (!startAfterBoost) return;
    setStartAfterBoost(false);
    startIds(dueIds, 'due', 'Fällige Karten');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueIds]);

  const fresh = activeCards.filter((c) => c.srs.last === undefined);
  const newDueIds = new Set(fresh.slice(0, newCardsLeft(deck)).map((c) => c.id));
  const newInDue = dueIds.filter((id) => newDueIds.has(id)).length;
  const waiting = fresh.length - newInDue;
  const leechList = useMemo(() => activeCards.filter(isLeech), [activeCards]);
  const markedList = useMemo(() => activeCards.filter((c) => c.marked), [activeCards]);

  // which side is asked (per deck); "mixed" draws anew for every round
  const side: AskSide = deck.askSide ?? 'front';
  const [roundSeed, setRoundSeed] = useState(() => Date.now());

  const reset = () => {
    setFlipped(false);
    setShowHint(false);
    setTyped('');
    setGrade(null);
    setExplain('');
    setError('');
  };

  const startIds = (rawIds: string[], m: 'due' | 'all', label: string) => {
    const ids = batchCap > 0 ? rawIds.slice(0, batchCap) : rawIds;
    if (!ids.length) return;
    setRoundSeed(Date.now());
    setQueue(ids);
    setMode(m);
    setModeLabel(label);
    setDone(0);
    setMissedIds([]);
    setRun({ streak: 0, misses: 0, firstTry: 0, seen: new Set() });
    setLastRating(null);
    setUndo(null);
    setSay({ text: pipGreeting(new Date().getHours(), ids.length), big: false });
    reset();
  };

  // Auto-launch when Deck.tsx passes a custom card selection (from CardsTab / MasteryTab)
  useEffect(() => {
    if (!customRound?.ids.length) return;
    startIds(customRound.ids, 'all', customRound.label);
    onClearCustom?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRound]);

  const poolForFilter = useMemo(() => {
    const byTag = (list: Card[]) => (pickTag ? list.filter((c) => hasTag(c, pickTag)) : list);
    if (pickFilter === 'due') {
      const dueSet = new Set(dueIds);
      return byTag(activeCards.filter((c) => dueSet.has(c.id))).sort((a, b) => a.srs.due - b.srs.due);
    }
    if (pickFilter === 'new') return byTag(fresh);
    if (pickFilter === 'leech') return byTag(leechList);
    if (pickFilter === 'marked') return byTag(markedList);
    if (pickFilter === 'cram') {
      return [...byTag(activeCards)].sort((a, b) => (b.srs.lapses - a.srs.lapses) || (a.srs.ease - b.srs.ease));
    }
    return [...byTag(activeCards)].sort(() => Math.random() - 0.5);
  }, [pickFilter, pickTag, dueIds, activeCards, fresh, leechList, markedList]);

  const startSelectedFilter = () => {
    const labelMap: Record<RoundFilter, string> = {
      due: 'Fällige Karten',
      new: 'Neue Karten',
      leech: 'Problemkarten',
      marked: 'Markierte Karten',
      cram: 'Prüfungs-Cramming',
      all: 'Freies Üben',
    };
    const label = pickTag ? `${labelMap[pickFilter]} · #${pickTag}` : labelMap[pickFilter];
    startIds(
      poolForFilter.map((c) => c.id),
      pickFilter === 'due' ? 'due' : 'all',
      label,
    );
  };

  const card = deck.cards.find((c) => c.id === queue[0]);
  const fromBack = card ? asksBack(side, card.id, roundSeed) : false;
  const qa = card ? sidesFor(card, fromBack) : { question: '', answer: '' };
  // "Grafiken abfragen": every 3rd review of a card with a graphic, one label of it is covered and asked for
  const quizOn = useStore((s) => s.data.settings.quizGraphics !== false);
  const animOn = useStore((s) => s.data.settings.animations !== false);
  const gq = useMemo(() => {
    if (!card?.html || !quizOn || (card.srs.reps + card.srs.lapses) % 3 !== 2 || qa.question.includes('data-diagram=')) return null;
    return graphicQuiz(qa.answer, seedOf(card.id) + roundSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, card?.srs.reps, card?.srs.lapses, quizOn, qa.question, qa.answer, roundSeed]);
  const rawQuestion = gq ? `${qa.question}<p class="gq-ask">Was gehört an die markierte Stelle?</p>${gq.graphic}` : qa.question;
  const shownQuestion = renderClozeQuestion(rawQuestion, card?.html);
  // the answer: the covered label marked, or graphics that build up step by step (not with animations off), plus revealed cloze
  const rawAnswer = gq ? gq.answer : card?.html && animOn ? withDiagramView(qa.answer, { steps: true }) : qa.answer;
  const shownAnswer = renderClozeAnswer(rawAnswer, card?.html);
  const clozeFrontFilled = card && rawQuestion !== shownQuestion ? renderClozeAnswer(rawQuestion, card.html) : null;
  const hasGraphics = deck.cards.some((c) => c.html && c.back.includes('data-diagram='));
  const plain = (s: string) => (card?.html ? htmlToText(s) : s);
  const frontSpeech = card ? (card.html ? htmlSpeech(shownQuestion) : shownQuestion) : '';
  const backSpeech = card ? (card.html ? htmlSpeech(shownAnswer) : shownAnswer) : '';
  // "Karten automatisch vorlesen": question when a card appears, answer when it is turned
  useEffect(() => {
    if (!autoRead || !card) return;
    speak(flipped ? backSpeech : frontSpeech);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, card?.id, flipped]);
  useEffect(() => () => stopSpeaking(), []);

  const rate = useCallback(
    (r: Rating) => {
      if (!card) return;
      if (r > 1) playUi('tick');
      // Practice mode only moves the schedule for cards that are actually due.
      const scheduled = mode === 'due' || card.srs.due <= Date.now();
      let at: number;
      if (scheduled) {
        at = reviewCard(deck.id, card.id, r);
        if (becomesLeech(card, { srs: schedule(card.srs, r) })) setLeech(card.id);
      } else at = logReview(deck.id, card.id, r);
      const xp = r === 1 ? 2 : r === 2 ? 5 : r === 3 ? 8 : 10;
      addXp(xp);
      setUndo({ cardId: card.id, prevSrs: card.srs, at, xp, queue, done, run, say, lastRating, leech });
      countAnswerTime();
      setLastRating(r);
      if (r === 1) setMissedIds((m) => (m.includes(card.id) ? m : [...m, card.id]));
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
    [card, deck.id, mode, run, done, queue, say, lastRating, leech],
  );
  const takeBack = useCallback(() => {
    if (!undo) return;
    undoReview(deck.id, undo.cardId, undo.prevSrs, undo.at, undo.xp);
    setQueue(undo.queue);
    setDone(undo.done);
    setRun(undo.run);
    setSay(undo.say);
    setLastRating(undo.lastRating);
    setLeech(undo.leech);
    setUndo(null);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, deck.id]);

  const suspendCurrent = useCallback(() => {
    if (!card) return;
    undoable('Karte aus dem Lernplan pausiert', () => toggleSuspendCard(deck.id, card.id));
    setQueue((q) => q.slice(1));
    reset();
  }, [card, deck.id]);

  const undoBtn = undo && (
    <button type="button" className="btn ghost sm undo-btn" onClick={takeBack} title="Letzte Bewertung zurücknehmen (Taste Z)">
      ↶ Rückgängig
    </button>
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (editingCard || showPad || showKeys) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === ' ' && card) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
      else if (card && (e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleMark(deck.id, card.id);
      else if (card && (e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey) (e.preventDefault(), setEditingCard(true));
      else if (card && card.hint && (e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) setShowHint((v) => !v);
      else if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey) takeBack();
      else if (e.key === '?') setShowKeys((v) => !v);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [card, flipped, rate, deck.id, takeBack, editingCard, showPad, showKeys]);
  // phone: after turning, the card follows the finger – right = „Gut“, left = „Nochmal“
  const swipeProps = useSwipe(phone && flipped && !typeMode, rate);

  const check = async () => {
    if (!card) return;
    setBusy('grade');
    setError('');
    try {
      setGrade(await gradeAnswer(plain(qa.question), plain(qa.answer), typed));
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
      // the same card explained once per session (asking again costs nothing)
      const key = plain(qa.question) + '|' + plain(qa.answer);
      const known = explainMemo.get(key);
      const text = known ?? (await explainCard(plain(qa.question), plain(qa.answer)));
      explainMemo.set(key, text);
      setExplain(text);
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

  if (mode === null || !card) {
    const effectiveCount = batchCap > 0 ? Math.min(batchCap, poolForFilter.length) : poolForFilter.length;
    const est = formatEstMinutes(estimateStudyMinutes(effectiveCount, deckReviews));
    const missedCards = missedIds.map((id) => deck.cards.find((c) => c.id === id)).filter((c): c is Card => !!c);

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
              ? `Wiederholungen erledigt. ${waiting} neue Karten warten – mit „10 neue Karten“ fängst du hier trotzdem an.`
              : 'Alles wiederholt. Du kannst trotzdem gezielt üben – das verschiebt deinen Plan kaum.'}
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
                {waiting} neue warten auf die nächsten Tage ({deck.newPerDay ?? newPerDay ?? 20} pro Tag)
              </span>
            )}
          </p>
        )}

        {mode !== null && missedCards.length > 0 && (
          <div className="learn-missed-box">
            <div className="learn-missed-head">
              <b>Noch unsicher in dieser Runde ({missedCards.length})</b>
              <button type="button" className="btn outline sm" onClick={() => startIds(missedCards.map((c) => c.id), 'all', 'Unsichere Karten')}>
                <IconPlay size={12} /> Nochmal üben
              </button>
            </div>
            <ul>
              {missedCards.slice(0, 6).map((c) => (
                <li key={c.id}>{cardFrontText(c).slice(0, 90)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="learn-settings">
          <span className="field-label">Welche Karten üben?</span>
          <div className="chips center">
            <button type="button" className={`chip ${pickFilter === 'due' ? 'on' : ''}`} onClick={() => setPickFilter('due')}>
              Fällig ({dueIds.length})
            </button>
            {fresh.length > 0 && (
              <button type="button" className={`chip ${pickFilter === 'new' ? 'on' : ''}`} onClick={() => setPickFilter('new')}>
                Nur neue ({fresh.length})
              </button>
            )}
            {leechList.length > 0 && (
              <button type="button" className={`chip ${pickFilter === 'leech' ? 'on' : ''}`} onClick={() => setPickFilter('leech')}>
                Problemkarten ({leechList.length})
              </button>
            )}
            {markedList.length > 0 && (
              <button type="button" className={`chip ${pickFilter === 'marked' ? 'on' : ''}`} onClick={() => setPickFilter('marked')}>
                Markiert ({markedList.length})
              </button>
            )}
            <button type="button" className={`chip ${pickFilter === 'cram' ? 'on' : ''}`} onClick={() => setPickFilter('cram')} title="Schwierigste Karten zuerst – ideal kurz vor der Prüfung">
              Prüfungs-Cramming
            </button>
            <button type="button" className={`chip ${pickFilter === 'all' ? 'on' : ''}`} onClick={() => setPickFilter('all')}>
              Alle ({activeCards.length})
            </button>
          </div>

          <div className="learn-opts-row">
            {tags.length > 0 && (
              <select className="input sm" aria-label="Nach Tag filtern" value={pickTag} onChange={(e) => setPickTag(e.target.value)}>
                <option value="">Alle Tags</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            )}
            <div className="seg compact" role="radiogroup" aria-label="Rundengröße">
              {[
                { v: 15, l: '15' },
                { v: 30, l: '30' },
                { v: 0, l: 'Alle' },
              ].map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={batchCap === o.v} className={batchCap === o.v ? 'on' : ''} onClick={() => setBatchCap(o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <span className="field-label">Was soll gefragt werden?</span>
          <AskSidePicker deck={deck} />
          {hasGraphics && (
            <label className="check-row learn-quiz-toggle" title="Bei jeder dritten Wiederholung einer Karte mit Grafik wird eine Beschriftung verdeckt und abgefragt">
              <input type="checkbox" checked={quizOn} onChange={(e) => setSettings({ quizGraphics: e.target.checked })} />
              Grafiken abfragen (eine Beschriftung verdecken)
            </label>
          )}
        </div>
        <div className="row-gap center">
          <button type="button" className="btn primary learn-start-btn" disabled={effectiveCount === 0} onClick={startSelectedFilter}>
            <IconPlay size={14} /> Starten · {effectiveCount} {effectiveCount === 1 ? 'Karte' : 'Karten'}
            {est ? ` (${est})` : ''}
          </button>
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
          {pickFilter !== 'all' && (
            <button type="button" className="btn ghost" onClick={() => startIds([...activeCards.map((c) => c.id)].sort(() => Math.random() - 0.5), 'all', 'Freies Üben')}>
              <IconShuffle size={16} /> Alle mischen
            </button>
          )}
          {mode !== null && (
            <button type="button" className="btn ghost" onClick={onDone}>
              Fortschritt ansehen
            </button>
          )}
          {mode !== null && undoBtn}
        </div>
      </div>
    );
  }

  const total = done + queue.length;
  return (
    <div className="learn">
      <PhoneFullscreen on={phone} />
      {exam && (
        <div className="exam-hint">
          Prüfung „{exam.title}“ {countdownText(exam)} – alle Karten kommen vorher noch einmal dran.
        </div>
      )}
      <div className="learn-progress">
        {phone && (
          <button type="button" className="icon-btn learn-exit" aria-label="Runde beenden" onClick={() => (setQueue([]), setMode(null))}>
            ✕
          </button>
        )}
        <span>
          {done} / {total}
        </span>
        <span className="bar">
          <i style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
        </span>
        <span className="muted small">{modeLabel || (mode === 'due' ? 'Fällige Karten' : 'Freies Üben')}</span>
        {undoBtn}
        <button type="button" className="icon-btn sm" aria-label="Karte bearbeiten" title="Karte bearbeiten (Taste E)" onClick={() => setEditingCard(true)}>
          <IconEdit size={14} />
        </button>
        <button type="button" className="icon-btn sm" aria-label="Karte pausieren" title="Karte aus dem Lernplan pausieren" onClick={suspendCurrent}>
          <IconPause size={14} />
        </button>
        <button type="button" className={'icon-btn sm' + (showPad ? ' on' : '')} aria-label="Schmierblatt öffnen" title="Zeichen-Schmierblatt öffnen" onClick={() => setShowPad(true)}>
          <IconNote size={14} />
        </button>
        {!phone && (
          <button type="button" className="icon-btn sm" aria-label="Tastenkürzel" title="Tastenkürzel (?)" onClick={() => setShowKeys(true)}>
            <IconHelp size={14} />
          </button>
        )}
        <AskSidePicker deck={deck} compact />
        <FocusButton />
      </div>

      {leech && deck.cards.some((c) => c.id === leech) && (
        <div className="leech-hint" role="status">
          <span>
            Diese Karte vergisst du immer wieder: „{cardFrontText(deck.cards.find((c) => c.id === leech)!).slice(0, 80)}“. Oft hilft es, sie zu verbessern.
          </span>
          <button type="button" className="btn outline sm" onClick={() => setImproving(leech)}>
            Karte verbessern
          </button>
          <button type="button" className="icon-btn" aria-label="Hinweis schließen" onClick={() => setLeech(null)}>
            ×
          </button>
        </div>
      )}
      {improving && deck.cards.some((c) => c.id === improving) && (
        <ImproveCardDialog
          deck={deck}
          card={deck.cards.find((c) => c.id === improving)!}
          onClose={() => {
            setImproving(null);
            setLeech(null);
          }}
        />
      )}
      {editingCard && <CardEditor deck={deck} card={card} onClose={() => setEditingCard(false)} />}
      {showPad && <DrawPad onClose={() => setShowPad(false)} onSave={() => setShowPad(false)} />}
      {showKeys && (
        <Modal title="Tastenkürzel beim Lernen" onClose={() => setShowKeys(false)}>
          <ul className="shortcuts-list">
            <li><kbd>Leertaste</kbd> Karte umdrehen / Antwort zeigen</li>
            <li><kbd>1</kbd> – <kbd>4</kbd> Bewerten (Nochmal, Schwer, Gut, Einfach)</li>
            <li><kbd>H</kbd> Hinweis / Eselsbrücke einblenden</li>
            <li><kbd>E</kbd> Aktuelle Karte direkt bearbeiten</li>
            <li><kbd>M</kbd> Karte markieren (★)</li>
            <li><kbd>Z</kbd> Letzte Bewertung rückgängig machen</li>
            <li><kbd>?</kbd> Diese Hilfe öffnen</li>
          </ul>
        </Modal>
      )}
      <Mascot className="learn-mascot" mood={mood} pulse={done + queue.length} size={64} say={moodSay} />
      <div
        key={`${card.id}-${flipped ? 'b' : 'f'}`}
        className={`flashcard ${flipped ? 'flipped flip-in' : 'card-in'}`}
        onClick={() => !typeMode && setFlipped(true)}
        {...swipeProps}
      >
        <MarkButton deckId={deck.id} card={card} className="fc-mark" />
        <small className="fc-label">
          Frage <SpeakButton text={frontSpeech} label="Frage vorlesen" className="icon-btn fc-speak" />
        </small>
        <CardContent text={flipped && clozeFrontFilled ? clozeFrontFilled : shownQuestion} html={card.html} look={lookOf(deck, card)} className="fc-front" />
        {!flipped && card.hint && (
          <div className="fc-clue" onClick={(e) => e.stopPropagation()}>
            {showHint ? (
              <div className="fc-clue-box">
                <IconBulb size={14} /> <span>{card.hint}</span>
              </div>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setShowHint(true)}>
                <IconBulb size={14} /> Hinweis zeigen (H)
              </button>
            )}
          </div>
        )}
        {flipped && (
          <>
            <hr />
            <small className="fc-label">
              Antwort <SpeakButton text={backSpeech} label="Antwort vorlesen" className="icon-btn fc-speak" />
            </small>
            {gq && (
              <p className="gq-solution">
                Gesucht war: <b>{gq.label}</b>
              </p>
            )}
            <CardContent text={shownAnswer} html={card.html} look={lookOf(deck, card)} className="fc-back" />
            {card.hint && (
              <div className="fc-clue-box after">
                <IconBulb size={13} /> <small>{card.hint}</small>
              </div>
            )}
          </>
        )}
        {!flipped && !typeMode && <span className="fc-hint">{phone ? 'Tippen zum Umdrehen – danach wischen: ← Nochmal, Gut →' : 'Klicken oder Leertaste zum Umdrehen'}</span>}
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

/** Ask the term first, the definition first, or mixed – saved per deck. */
function AskSidePicker({ deck, compact }: { deck: Deck; compact?: boolean }) {
  const side = deck.askSide ?? 'front';
  return (
    <div className={'seg ask-side' + (compact ? ' compact' : '')} role="radiogroup" aria-label="Was wird gefragt?">
      {ASK_SIDES.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={side === o.id}
          className={side === o.id ? 'on' : ''}
          title={o.hint}
          onClick={() => updateDeck(deck.id, { askSide: o.id === 'front' ? undefined : o.id })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Phone: while a round runs, the app's bars step aside so the card has the whole screen. */
export function PhoneFullscreen({ on }: { on: boolean }) {
  useEffect(() => {
    if (!on) return;
    document.documentElement.classList.add('learning');
    return () => document.documentElement.classList.remove('learning');
  }, [on]);
  return null;
}
