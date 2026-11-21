import { dismissUndo, useUndoOffer } from '../lib/undo';
import { IconClose } from './Icons';

/** The „Rückgängig“ bar after deleting (decks, courses, cards, skills, exams …). */
export function UndoToast() {
  const offer = useUndoOffer();
  if (!offer) return null;
  return (
    <div className="undo-toast" role="status" key={offer.id}>
      <span className="grow">{offer.text}</span>
      <button type="button" className="btn sm undo-btn" onClick={offer.undo}>
        Rückgängig
      </button>
      <button type="button" className="icon-btn sm" aria-label="Schließen" onClick={dismissUndo}>
        <IconClose size={14} />
      </button>
    </div>
  );
}
