import { useState } from 'react';
import { MatchGame } from '../../components/MatchGame';
import { IconMatch, IconPlay } from '../../components/Icons';
import { cardBackText, cardFrontText, cardHasMedia } from '../../lib/content';
import { formatTime, matchableCount } from '../../lib/match';
import type { Deck } from '../../lib/store';

/** The matching game as its own tab: a start screen (best time, suitable cards), then the game; "Zurück" returns here. */
export default function MatchTab({ deck }: { deck: Deck }) {
  const [playing, setPlaying] = useState(false);
  const fit = matchableCount(deck.cards.map((c) => ({ front: cardFrontText(c), back: cardBackText(c), media: cardHasMedia(c) })));

  if (playing) return <MatchGame deck={deck} onClose={() => setPlaying(false)} />;
  return (
    <div className="empty match-start">
      <span className="match-start-icon">
        <IconMatch size={34} />
      </span>
      <b>Zuordnen</b>
      <p className="muted">
        Klicke Fragen und Antworten so schnell wie möglich zu Paaren zusammen. Fällige Karten und Problemkarten kommen bevorzugt dran; jeder Fehler kostet eine Sekunde. Dein Lernplan bleibt dabei unverändert.
      </p>
      {deck.matchBest ? <p className="match-best">Bestzeit: {formatTime(deck.matchBest)}</p> : null}
      <button type="button" className="btn primary" onClick={() => setPlaying(true)} disabled={fit < 2}>
        <IconPlay size={13} /> Spiel starten
      </button>
      <p className="muted small">
        {fit < 2
          ? 'Dafür braucht es mindestens 2 Karten mit kurzem Text (ohne Bilder).'
          : `${fit} von ${deck.cards.length} Karten eignen sich (kurzer Text, ohne Bilder).`}
      </p>
    </div>
  );
}
