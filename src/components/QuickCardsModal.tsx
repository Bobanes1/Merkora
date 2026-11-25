import { useState } from 'react';
import { createPortal } from 'react-dom';
import { addCards, type Deck } from '../lib/store';
import { parseTags } from '../lib/tags';
import { IconPlus, IconTrash } from './Icons';
import type { Embed } from './OcclusionEditor';

type Row = { id: number; front: string; back: string; hint: string };

const emptyRows = (start = 1): Row[] =>
  Array.from({ length: 5 }, (_, i) => ({ id: start + i, front: '', back: '', hint: '' }));

/**
 * Fast table-mode card entry: type pairs side-by-side (Tab jumps from question → answer → hint → next row)
 * and add many vocabulary / definition cards in one go.
 */
export function QuickCardsTable({ deck, onClose, embed }: { deck: Deck; onClose: () => void; embed?: Embed }) {
  const [rows, setRows] = useState<Row[]>(() => emptyRows(1));
  const [nextId, setNextId] = useState(6);
  const [tagText, setTagText] = useState('');

  const valid = rows.filter((r) => r.front.trim() && r.back.trim());

  const patch = (id: number, field: keyof Omit<Row, 'id'>, val: string) => {
    setRows((list) => {
      const next = list.map((r) => (r.id === id ? { ...r, [field]: val } : r));
      const last = next[next.length - 1];
      if (last && (last.front.trim() || last.back.trim())) {
        const nid = nextId;
        setNextId((n) => n + 1);
        return [...next, { id: nid, front: '', back: '', hint: '' }];
      }
      return next;
    });
  };

  const addRow = () => {
    setRows((list) => [...list, { id: nextId, front: '', back: '', hint: '' }]);
    setNextId((n) => n + 1);
  };

  const removeRow = (id: number) => {
    setRows((list) => (list.length <= 2 ? list.map((r) => (r.id === id ? { ...r, front: '', back: '', hint: '' } : r)) : list.filter((r) => r.id !== id)));
  };

  const save = () => {
    if (!valid.length) return;
    const tags = parseTags(tagText);
    addCards(
      deck.id,
      valid.map((r) => ({
        front: r.front.trim(),
        back: r.back.trim(),
        ...(r.hint.trim() ? { hint: r.hint.trim() } : {}),
        ...(tags.length ? { tags } : {}),
      })),
    );
    onClose();
  };

  const footer = (
    <>
      <span className="muted small">{valid.length} fertige {valid.length === 1 ? 'Karte' : 'Karten'}</span>
      <span className="grow" />
      <button type="button" className="btn ghost" onClick={onClose}>
        Abbrechen
      </button>
      <button type="button" className="btn primary" disabled={!valid.length} onClick={save}>
        Alle speichern ({valid.length})
      </button>
    </>
  );

  return (
    <div className="quick-table-wrap">
      <p className="muted small">
        Tippe mehrere Karten hintereinander ein – mit <kbd>Tab</kbd> springst du direkt weiter; neue Zeilen entstehen automatisch. Tipp: <code>{'{{Lücke}}'}</code> erzeugt Lückentexte.
      </p>
      <div className="quick-table-scroll">
        <table className="quick-table">
          <thead>
            <tr>
              <th>Vorderseite (Frage / Begriff)</th>
              <th>Rückseite (Antwort)</th>
              <th>Hinweis (optional)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <input
                    className="input sm"
                    autoFocus={i === 0}
                    placeholder="Begriff / Frage …"
                    value={r.front}
                    onChange={(e) => patch(r.id, 'front', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input sm"
                    placeholder="Antwort / Definition …"
                    value={r.back}
                    onChange={(e) => patch(r.id, 'back', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input sm"
                    placeholder="Eselsbrücke …"
                    value={r.hint}
                    onChange={(e) => patch(r.id, 'hint', e.target.value)}
                  />
                </td>
                <td>
                  <button type="button" className="icon-btn sm" aria-label="Zeile entfernen" onClick={() => removeRow(r.id)}>
                    <IconTrash size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="quick-table-bar">
        <button type="button" className="btn ghost sm" onClick={addRow}>
          <IconPlus size={13} /> Zeile hinzufügen
        </button>
        <input
          className="input sm"
          placeholder="Optional: gemeinsame Tags (z. B. Vokabeln Lektion3)"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
        />
      </div>
      {embed?.footerEl ? createPortal(footer, embed.footerEl) : <div className="row-gap">{footer}</div>}
    </div>
  );
}
