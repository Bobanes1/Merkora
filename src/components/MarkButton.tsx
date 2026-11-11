import { toggleMark, type Card } from '../lib/store';
import { IconStar, IconStarLine } from './Icons';

/** ★ – mark a card to find or learn it again later (key M while learning). */
export function MarkButton({ deckId, card, className = '' }: { deckId: string; card: Card; className?: string }) {
  const on = !!card.marked;
  return (
    <button
      type="button"
      className={`icon-btn mark-btn ${on ? 'on' : ''} ${className}`}
      aria-pressed={on}
      aria-label={on ? 'Markierung entfernen' : 'Karte markieren'}
      title={on ? 'Markierung entfernen (M)' : 'Karte markieren (M)'}
      onClick={(e) => {
        e.stopPropagation();
        toggleMark(deckId, card.id);
      }}
    >
      {on ? <IconStar size={16} /> : <IconStarLine size={16} />}
    </button>
  );
}
