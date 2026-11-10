import { useState } from 'react';
import { htmlToText, textToHtml } from '../lib/content';
import { exportApkg, inTauri } from '../lib/desktop';
import { pushToast } from '../lib/jobs';
import type { Deck } from '../lib/store';
import { download } from '../lib/util';
import { Modal } from './Modal';

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Export a deck: Anki package (desktop app) or CSV table. */
export function ExportDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const csv = () => {
    const text = (c: Deck['cards'][number], side: string) => (c.html ? htmlToText(side) : side);
    const rows = [['Vorderseite', 'Rückseite', 'Tags'], ...deck.cards.map((c) => [text(c, c.front), text(c, c.back), (c.tags ?? []).join(' ')])];
    download(`${deck.name}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv');
    onClose();
  };

  const apkg = async () => {
    setBusy(true);
    setError('');
    try {
      const path = await exportApkg({
        name: deck.name,
        cards: deck.cards.map((c) => ({
          front: c.html ? c.front : textToHtml(c.front),
          back: c.html ? c.back : textToHtml(c.back),
          tags: c.tags,
          styleId: c.styleId,
        })),
        styles: deck.styles ?? {},
      });
      pushToast({ text: `Anki-Paket gespeichert: ${path}`, ok: true });
      onClose();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`„${deck.name}“ exportieren`} onClose={onClose}>
      <div className="export-options">
        {inTauri && (
          <button type="button" className="start-option" onClick={() => void apkg()} disabled={busy}>
            <b>{busy ? 'Wird erstellt …' : 'Anki-Paket (.apkg)'}</b>
            <small>Mit Bildern, Tönen und Aussehen – in Anki über „Datei › Importieren“ öffnen.</small>
          </button>
        )}
        <button type="button" className="start-option" onClick={csv} disabled={busy}>
          <b>Tabelle (.csv)</b>
          <small>Nur Text: Vorderseite, Rückseite, Tags – für Excel, Numbers oder andere Apps.</small>
        </button>
      </div>
      <p className="muted small">Die Datei landet in deinem Download-Ordner. Der Lernfortschritt wird nicht mit exportiert.</p>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
