import { useCallback, useEffect, useState } from 'react';
import { useSwipe } from './useSwipe';
import { ASK_SIDES, asksBack, sidesFor, type AskSide } from '../lib/askSide';
import { stopSpeaking } from '../lib/speech';
import { htmlSpeech } from '../lib/speechText';
import { SpeakButton } from './SpeakButton';
import { usePhone } from '../lib/phone';
import { PhoneFullscreen } from '../pages/tabs/LearnTab';
import { CardEditor } from '../pages/tabs/CardsTab';
import { MarkButton } from './MarkButton';
import { DrawPad } from './DrawPad';
import { Modal } from './Modal';
import { capForExam, nextExamAt } from '../lib/exams';
import { hasCloze, renderClozeAnswer, renderClozeQuestion } from '../lib/deckTools';
import { RATINGS, formatDelay, schedule, type Rating } from '../lib/srs';
import { addXp, logReview, reviewCard, toggleSuspendCard, undoReview, useStore, type Card } from '../lib/store';
import { CardContent, lookOf } from './CardContent';
import { IconBulb, IconClose, IconDoc, IconEdit, IconHelp, IconPause, IconRefresh } from './Icons';
import { FocusButton } from './Pomodoro';
import { PdfSourceDrawer } from './PdfStudio';
import { pdfFiles } from '../lib/deckFiles';
import { resolveCardPage } from '../lib/interference';
import { countAnswerTime } from '../lib/pomodoro';
import { cardFrontText } from '../lib/content';

export type SessionItem = { deckId: string; cardId: string };

/**
 * A study round over cards from several decks (exam practice, custom sessions, "Alle fälligen").
 * Supports cloze deletions, revealable hints (H), inline editing (E), suspend, scratchpad,
 * keyboard shortcuts (?), undo (Z), and a missed-cards recap at the end.
 */
export function StudySession({ title, items, onExit }: { title: string; items: SessionItem[]; onExit: () => void }) {
  const data = useStore((s) => s.data);
  const [queue, setQueue] = useState(items);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [done, setDone] = useState(0);
  const [missed, setMissed] = useState<SessionItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [scratch, setScratch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const phone = usePhone();
  // "Rückgängig" for the last rating (one step)
  const [undo, setUndo] = useState<{ deckId: string; cardId: string; prevSrs: Card['srs']; at: number; xp: number; queue: SessionItem[]; done: number } | null>(null);
  // which side is asked in this round (term, definition or mixed)
  const [side, setSide] = useState<AskSide>('front');
  const [seed] = useState(() => Date.now());
  useEffect(() => () => stopSpeaking(), []);
  const item = queue[0];
  const deck = item ? data.decks.find((d) => d.id === item.deckId) : undefined;
  const card = deck?.cards.find((c) => c.id === item.cardId);

  const rate = useCallback(
    (r: Rating) => {
      if (!card || !deck) return;
      const due = card.srs.due <= Date.now();
      const at = due ? reviewCard(deck.id, card.id, r) : logReview(deck.id, card.id, r);
      const xp = r === 1 ? 2 : r === 2 ? 5 : r === 3 ? 8 : 10;
      addXp(xp);
      setUndo({ deckId: deck.id, cardId: card.id, prevSrs: card.srs, at, xp, queue, done });
      countAnswerTime();
      const back = r === 1;
      if (back) {
        setMissed((m) => (m.some((x) => x.deckId === deck.id && x.cardId === card.id) ? m : [...m, { deckId: deck.id, cardId: card.id }]));
      }
      setQueue((q) => (back ? [...q.slice(1), q[0]] : q.slice(1)));
      if (!back) setDone((n) => n + 1);
      setFlipped(false);
      setShowHint(false);
    },
    [card, deck, queue, done],
  );
  const swipeProps = useSwipe(phone && flipped && !editing && !scratch, rate);
  const takeBack = useCallback(() => {
    if (!undo) return;
    undoReview(undo.deckId, undo.cardId, undo.prevSrs, undo.at, undo.xp);
    setQueue(undo.queue);
    setDone(undo.done);
    setFlipped(false);
    setShowHint(false);
    setUndo(null);
  }, [undo]);

  const suspendCurrent = useCallback(() => {
    if (!card || !deck) return;
    toggleSuspendCard(deck.id, card.id);
    setQueue((q) => q.slice(1));
    setFlipped(false);
    setShowHint(false);
  }, [card, deck]);

  const undoBtn = undo && (
    <button type="button" className="btn ghost sm undo-btn" onClick={takeBack} title="Letzte Bewertung zurücknehmen (Taste Z)">
      ↶ Rückgängig
    </button>
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (editing || scratch || showHelp) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === ' ' && card) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
      else if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey) takeBack();
      else if ((e.key === 'h' || e.key === 'H') && card?.hint && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowHint((v) => !v);
      } else if ((e.key === 'e' || e.key === 'E') && card && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('keydown', k);
    };
  }, [card, flipped, rate, takeBack, editing, scratch, showHelp]);

  const head = (
    <div className="session-head">
      <b>{title}</b>
      <span className="muted small">
        {done} / {done + queue.length}
      </span>
      <span className="grow" />
      {undoBtn}
      {card && deck && (
        <>
          <button type="button" className="icon-btn" title="Schmierblatt / Notiz" aria-label="Schmierblatt öffnen" onClick={() => setScratch(true)}>
            <IconEdit size={15} />
          </button>
          <button type="button" className="icon-btn" title="Karte pausieren" aria-label="Karte pausieren" onClick={suspendCurrent}>
            <IconPause size={15} />
          </button>
          <button type="button" className="icon-btn" title="Tastenkürzel (?)" aria-label="Tastenkürzel" onClick={() => setShowHelp(true)}>
            <IconHelp size={15} />
          </button>
        </>
      )}
      <div className="seg ask-side compact" role="radiogroup" aria-label="Was wird gefragt?">
        {ASK_SIDES.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={side === o.id} className={side === o.id ? 'on' : ''} title={o.hint} onClick={() => setSide(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <FocusButton />
      <button type="button" className="icon-btn" aria-label="Runde beenden" onClick={onExit}>
        <IconClose size={18} />
      </button>
    </div>
  );

  if (!card || !deck) {
    const missedCards = missed
      .map((m) => {
        const d = data.decks.find((x) => x.id === m.deckId);
        const c = d?.cards.find((x) => x.id === m.cardId);
        return d && c ? { item: m, deck: d, card: c } : null;
      })
      .filter((x): x is { item: SessionItem; deck: typeof data.decks[number]; card: Card } => !!x);

    return (
      <div className="panel session">
        {head}
        <div className="empty">
          <b>{done ? `Geschafft! ${done} ${done === 1 ? 'Karte' : 'Karten'} wiederholt.` : 'Keine Karten in dieser Runde.'}</b>
          {missedCards.length > 0 && (
            <div className="learn-missed-box">
              <div className="learn-missed-head">
                <b>Noch unsicher ({missedCards.length})</b>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => {
                    setQueue(missedCards.map((x) => x.item));
                    setDone(0);
                    setMissed([]);
                    setFlipped(false);
                    setShowHint(false);
                    setUndo(null);
                  }}
                >
                  <IconRefresh size={14} /> Diese {missedCards.length} nochmal üben
                </button>
              </div>
              <ul>
                {missedCards.slice(0, 8).map(({ card: mc, deck: md }) => (
                  <li key={mc.id}>
                    <b>{cardFrontText(mc)}</b> <small className="muted">({md.name})</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="btn primary" onClick={onExit}>
            Fertig
          </button>
        </div>
      </div>
    );
  }

  const look = lookOf(deck, card);
  const qa = sidesFor(card, asksBack(side, card.id, seed));
  const qHasCloze = hasCloze(qa.question);
  const aHasCloze = hasCloze(qa.answer);
  const displayQ = qHasCloze ? renderClozeQuestion(qa.question, card.html) : qa.question;
  const displayA = aHasCloze
    ? renderClozeAnswer(qa.answer, card.html)
    : qHasCloze
      ? `${renderClozeAnswer(qa.question, card.html)}${qa.answer.trim() ? (card.html ? '<br><br>' : '\n\n') + qa.answer : ''}`
      : qa.answer;
  const say = (t: string) => (card.html ? htmlSpeech(t) : t);
  const preview = (r: Rating) => {
    if (card.srs.due > Date.now()) return `Taste ${r}`;
    const now = Date.now();
    return formatDelay(capForExam(schedule(card.srs, r, now), nextExamAt(data, deck.id, now), now).due - now);
  };
  return (
    <div className="panel session">
      <PhoneFullscreen on={phone} />
      {head}
      <span className="bar session-bar">
        <i style={{ width: `${(done / Math.max(1, done + queue.length)) * 100}%` }} />
      </span>
      <div className="row-gap between" style={{ marginBottom: 6 }}>
        <small className="muted">{deck.name}</small>
        <button type="button" className="btn ghost sm" onClick={() => setEditing(true)} title="Karte direkt bearbeiten (Taste E)">
          <IconEdit size={13} /> Bearbeiten
        </button>
      </div>
      <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)} {...swipeProps}>
        <MarkButton deckId={deck.id} card={card} className="fc-mark" />
        <small className="fc-label">
          Frage <SpeakButton text={say(displayQ)} label="Frage vorlesen" className="icon-btn fc-speak" />
        </small>
        <CardContent text={displayQ} html={card.html || qHasCloze} look={look} className="fc-front" />
        {card.hint && !flipped && (
          <div className="fc-clue" onClick={(e) => e.stopPropagation()}>
            {showHint ? (
              <div className="fc-clue-box">
                <IconBulb size={14} /> <b>Hinweis:</b> {card.hint}
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
              Antwort <SpeakButton text={say(displayA)} label="Antwort vorlesen" className="icon-btn fc-speak" />
            </small>
            <CardContent text={displayA} html={card.html || qHasCloze || aHasCloze} look={look} className="fc-back" />
            {card.hint && (
              <div className="fc-clue-box after">
                <IconBulb size={14} /> <b>Hinweis:</b> {card.hint}
              </div>
            )}
            {pdfFiles(deck.files).length > 0 && resolveCardPage(card, deck.source) && (
              <div className="fc-source-row" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="source-ref-chip" onClick={() => setSourceOpen(true)}>
                  <IconDoc size={13} /> S. {resolveCardPage(card, deck.source)} · Im Skript zeigen
                </button>
              </div>
            )}
          </>
        )}
        {!flipped && <span className="fc-hint">{phone ? 'Tippen zum Umdrehen – danach wischen: ← Nochmal, Gut →' : 'Klicken oder Leertaste zum Umdrehen'}</span>}
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
      {editing && <CardEditor deck={deck} card={card} onClose={() => setEditing(false)} />}
      {scratch && <DrawPad onClose={() => setScratch(false)} onSave={() => setScratch(false)} />}
      {sourceOpen && resolveCardPage(card, deck.source) && (
        <PdfSourceDrawer
          deck={deck}
          page={resolveCardPage(card, deck.source)!}
          fileId={card.sourceRef?.fileId}
          excerpt={card.sourceRef?.excerpt}
          onClose={() => setSourceOpen(false)}
        />
      )}
      {showHelp && (
        <Modal title="Tastenkürzel in der Lernrunde" onClose={() => setShowHelp(false)}>
          <div className="shortcuts-list">
            <kbd>Leertaste</kbd> <span>Karte umdrehen</span>
            <kbd>1</kbd> <span>Nochmal</span>
            <kbd>2</kbd> <span>Schwer</span>
            <kbd>3</kbd> <span>Gut</span>
            <kbd>4</kbd> <span>Einfach</span>
            <kbd>H</kbd> <span>Hinweis ein-/ausblenden</span>
            <kbd>E</kbd> <span>Aktuelle Karte bearbeiten</span>
            <kbd>Z</kbd> <span>Letzte Bewertung rückgängig machen</span>
            <kbd>?</kbd> <span>Diese Hilfe öffnen</span>
          </div>
        </Modal>
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
