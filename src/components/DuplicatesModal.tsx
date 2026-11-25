import { useMemo } from 'react';
import { cardBackText, cardFrontText } from '../lib/content';
import { findDuplicateGroups } from '../lib/deckTools';
import { bulkDeleteCards, type Deck } from '../lib/store';
import { undoable } from '../lib/undo';
import { IconCheck, IconTrash } from './Icons';
import { Modal } from './Modal';

/**
 * Finds duplicate flashcards (same normalised front) and lets the user remove duplicates in 1 click,
 * keeping the copy with the best learning progress.
 */
export function DuplicatesModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const groups = useMemo(() => findDuplicateGroups(deck.cards), [deck.cards]);
  const extraIds = useMemo(() => groups.flatMap((g) => g.slice(1).map((c) => c.id)), [groups]);

  const cleanAll = () => {
    if (!extraIds.length) return;
    undoable(`${extraIds.length} doppelte ${extraIds.length === 1 ? 'Karte' : 'Karten'} entfernt`, () => bulkDeleteCards(deck.id, extraIds));
    onClose();
  };

  return (
    <Modal
      title="Duplikate prüfen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Schließen
          </button>
          {extraIds.length > 0 && (
            <button type="button" className="btn primary" onClick={cleanAll}>
              <IconTrash size={14} /> Alle {extraIds.length} Duplikate bereinigen
            </button>
          )}
        </>
      }
    >
      {groups.length === 0 ? (
        <div className="dup-empty">
          <IconCheck size={28} />
          <b>Keine Duplikate gefunden!</b>
          <p className="muted small">Alle {deck.cards.length} Karten in diesem Deck haben eine eindeutige Vorderseite.</p>
        </div>
      ) : (
        <div className="dup-list">
          <p className="muted small">
            <b>{groups.length}</b> {groups.length === 1 ? 'Gruppe' : 'Gruppen'} mit doppelten Vorderseiten gefunden. Beim Bereinigen bleibt jeweils die Karte mit dem besten Lernstand erhalten.
          </p>
          {groups.map((g, gi) => (
            <div key={gi} className="dup-group">
              <div className="dup-group-head">
                <b>{cardFrontText(g[0]).slice(0, 120)}</b>
                <span className="badge">{g.length}×</span>
              </div>
              <ul>
                {g.map((c, ci) => (
                  <li key={c.id} className={ci === 0 ? 'dup-keep' : 'dup-drop'}>
                    <span className={`badge ${ci === 0 ? 'ok' : ''}`}>{ci === 0 ? 'Behalten' : 'Entfernen'}</span>
                    <span className="grow">{cardBackText(c).slice(0, 120)}</span>
                    <small className="muted">{c.srs.reps} Wdh.</small>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
