import { useState } from 'react';
import { moveCards, useData, type Deck } from '../lib/store';
import { Modal } from './Modal';

/** Choose the deck the selected cards move to (grouped by course). */
export function MoveCardsDialog({ deck, cardIds, onClose, onMoved }: { deck: Deck; cardIds: string[]; onClose: () => void; onMoved: (n: number, target: Deck) => void }) {
  const data = useData();
  const others = data.decks.filter((d) => d.id !== deck.id);
  const [target, setTarget] = useState(() => others.find((d) => d.courseId === deck.courseId)?.id ?? others[0]?.id ?? '');
  const move = () => {
    const to = data.decks.find((d) => d.id === target);
    if (!to) return;
    const n = moveCards(deck.id, cardIds, to.id);
    onMoved(n, to);
    onClose();
  };
  const n = cardIds.length;
  return (
    <Modal
      title={n === 1 ? 'Karte verschieben' : `${n} Karten verschieben`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={move} disabled={!target}>
            Verschieben
          </button>
        </>
      }
    >
      {others.length ? (
        <>
          <label className="field-label" htmlFor="move-target">
            In welches Deck?
          </label>
          <select id="move-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            {data.courses.map((c) => {
              const decks = others.filter((d) => d.courseId === c.id);
              if (!decks.length) return null;
              return (
                <optgroup key={c.id} label={c.name}>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.cards.length} Karten)
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <p className="muted small">Der Lernstand und die Lerngeschichte der Karten ziehen mit um.</p>
        </>
      ) : (
        <p className="muted">Es gibt noch kein anderes Deck. Lege zuerst ein Deck an, in das die Karten sollen.</p>
      )}
    </Modal>
  );
}
