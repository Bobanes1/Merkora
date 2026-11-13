import { useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { IconDownload, IconRefresh, IconSparkle } from '../../components/Icons';
import { MindmapView } from '../../components/MindmapView';
import { NoKeyNotice } from '../../components/NoKey';
import { materialFrom, mindmapFor } from '../../lib/ai';
import { estimate } from '../../lib/costs';
import { PALETTES, renderDiagram } from '../../lib/diagram';
import { updateDeck, type Deck } from '../../lib/store';
import { download, slugify } from '../../lib/util';
import { useAiReady } from './SummaryTab';

/** Mind map of the deck's material: made by the AI once, drawn by Merkora (light / dark), saved with the deck. */
export default function MindmapTab({ deck, onCards }: { deck: Deck; onCards: (term: string) => void }) {
  const ready = useAiReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const material = materialFrom(deck.source, deck.cards);
  const hasMaterial = !!material.trim();
  const map = deck.mindmap?.type === 'mindmap' ? deck.mindmap : null;

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      updateDeck(deck.id, { mindmap: await mindmapFor(deck.name, material) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!map) return;
    download(`${slugify(deck.name)}-mindmap.svg`, renderDiagram(map, { ...PALETTES.light, bg: '#ffffff' }), 'image/svg+xml');
  };

  const err = error && (
    <div className="form-error" role="alert">
      {error}
    </div>
  );

  if (!map)
    return (
      <div className="empty">
        <b>Noch keine Mindmap</b>
        <p className="muted">Die KI ordnet dein Lernmaterial in eine Mindmap: das Thema in der Mitte, die Hauptthemen als farbige Äste mit ihren wichtigsten Punkten.</p>
        {!ready ? (
          <NoKeyNotice compact />
        ) : (
          <>
            <button type="button" className="btn primary" onClick={() => void make()} disabled={busy || !hasMaterial}>
              <IconSparkle size={16} /> {busy ? 'Mindmap wird erstellt …' : 'Mindmap erstellen'}
            </button>
            {hasMaterial && <CostHint est={estimate.mindmap(material.length)} />}
          </>
        )}
        {!hasMaterial && <p className="muted small">Füge zuerst Lernmaterial oder Karten hinzu.</p>}
        {err}
      </div>
    );

  return (
    <div className="panel mindmap-panel">
      <div className="toolbar">
        <b className="toolbar-title">Mindmap</b>
        <span className="grow" />
        {ready && (
          <button type="button" className="btn ghost sm" onClick={() => void make()} disabled={busy}>
            <IconRefresh size={15} /> {busy ? 'Wird neu erstellt …' : 'Neu erstellen'}
          </button>
        )}
        <button type="button" className="btn outline sm" onClick={save}>
          <IconDownload size={15} /> Als Bild speichern
        </button>
      </div>
      {err}
      <MindmapView map={map} deck={deck} onCards={onCards} />
    </div>
  );
}
