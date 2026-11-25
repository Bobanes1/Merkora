import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ASK_SIDES } from '../lib/askSide';
import {
  deckUrl,
  duplicateDeck,
  mergeDecks,
  toggleArchiveDeck,
  togglePinDeck,
  updateDeck,
  useData,
  type Deck,
} from '../lib/store';
import { IconCopy, IconStar } from './Icons';
import { Modal } from './Modal';

/**
 * Per-deck settings & management modal:
 * - Daily new cards override & max reviews per day
 * - Default ask side (front / back / mixed)
 * - Pin & Archive toggles
 * - Duplicate deck (with or without SRS progress)
 * - Merge this deck into another deck
 */
export function DeckSettingsModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const globalNew = data.settings.newPerDay ?? 20;

  const [newPerDay, setNewPerDay] = useState(deck.newPerDay !== undefined ? String(deck.newPerDay) : '');
  const [maxRev, setMaxRev] = useState(deck.maxReviewsPerDay !== undefined ? String(deck.maxReviewsPerDay) : '');
  const [mergeTarget, setMergeTarget] = useState('');
  const [keepProg, setKeepProg] = useState(false);

  const others = data.decks.filter((d) => d.id !== deck.id && !d.archived);

  const saveLimits = () => {
    const nVal = newPerDay.trim() === '' ? undefined : Math.max(0, Math.min(500, Math.round(Number(newPerDay) || 0)));
    const rVal = maxRev.trim() === '' ? undefined : Math.max(0, Math.min(2000, Math.round(Number(maxRev) || 0)));
    updateDeck(deck.id, { newPerDay: nVal, maxReviewsPerDay: rVal });
    onClose();
  };

  const doDuplicate = () => {
    const copy = duplicateDeck(deck.id, keepProg);
    onClose();
    if (copy) navigate(deckUrl(data, copy));
  };

  const doMerge = () => {
    if (!mergeTarget) return;
    const dst = data.decks.find((d) => d.id === mergeTarget);
    mergeDecks(deck.id, mergeTarget);
    onClose();
    if (dst) navigate(deckUrl(data, dst));
  };

  return (
    <Modal
      title={`Einstellungen: ${deck.name}`}
      className="deck-settings-modal"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Schließen
          </button>
          <button type="button" className="btn primary" onClick={saveLimits}>
            Speichern
          </button>
        </>
      }
    >
      <div className="dset-section">
        <h3>Tageslimits (nur für dieses Deck)</h3>
        <div className="form-grid">
          <label>
            <span className="field-label">Neue Karten pro Tag</span>
            <input
              type="number"
              min={0}
              max={500}
              className="input"
              placeholder={`Standard (${globalNew} im Kurs)`}
              value={newPerDay}
              onChange={(e) => setNewPerDay(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Max. Wiederholungen / Tag</span>
            <input
              type="number"
              min={0}
              max={2000}
              className="input"
              placeholder="Unbegrenzt"
              value={maxRev}
              onChange={(e) => setMaxRev(e.target.value)}
            />
          </label>
        </div>
        <small className="muted">Leer lassen, um den globalen Standardwert aus den Einstellungen zu nutzen.</small>
      </div>

      <div className="dset-section">
        <h3>Standard-Abfragerichtung</h3>
        <div className="seg" role="radiogroup" aria-label="Abfragerichtung">
          {ASK_SIDES.map((o) => {
            const on = (deck.askSide ?? 'front') === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={on ? 'on' : ''}
                onClick={() => updateDeck(deck.id, { askSide: o.id === 'front' ? undefined : o.id })}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dset-section">
        <h3>Organisation</h3>
        <div className="row-gap">
          <button type="button" className={`btn sm ${deck.pinned ? 'primary' : 'outline'}`} onClick={() => togglePinDeck(deck.id)}>
            <IconStar size={14} /> {deck.pinned ? 'Angeheftet' : 'Oben anheften'}
          </button>
          <button type="button" className={`btn sm ${deck.archived ? 'primary' : 'outline'}`} onClick={() => toggleArchiveDeck(deck.id)}>
            {deck.archived ? 'Aus Archiv holen' : 'Deck archivieren'}
          </button>
        </div>
        <small className="muted">Archivierte Decks blenden sich aus fälligen Karten aus, bleiben aber im Archiv der Bibliothek erhalten.</small>
      </div>

      <div className="dset-section">
        <h3>Duplizieren</h3>
        <div className="row-gap">
          <label className="check-row small">
            <input type="checkbox" checked={keepProg} onChange={(e) => setKeepProg(e.target.checked)} />
            Lernstand mitkopieren
          </label>
          <button type="button" className="btn outline sm" onClick={doDuplicate}>
            <IconCopy size={14} /> Deck duplizieren
          </button>
        </div>
      </div>

      {others.length > 0 && (
        <div className="dset-section">
          <h3>Mit anderem Deck zusammenführen</h3>
          <p className="muted small">Alle {deck.cards.length} Karten (inkl. Lernstand) wandern ins Ziel-Deck, dieses Deck wird danach entfernt.</p>
          <div className="input-row">
            <select className="input sm" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} aria-label="Ziel-Deck">
              <option value="">Ziel-Deck wählen …</option>
              {others.map((d) => {
                const c = data.courses.find((x) => x.id === d.courseId);
                return (
                  <option key={d.id} value={d.id}>
                    {c ? `${c.name} › ` : ''}
                    {d.name} ({d.cards.length})
                  </option>
                );
              })}
            </select>
            <button type="button" className="btn outline sm" disabled={!mergeTarget} onClick={doMerge}>
              Zusammenführen
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
