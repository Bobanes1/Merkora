import { useState } from 'react';
import { diagramForCard, hasKey } from '../lib/ai';
import { cardBackText, cardFrontText, textToHtml } from '../lib/content';
import { tokensOf } from '../lib/costs';
import { cardGraphic, DIAGRAM_KINDS, PALETTES, renderDiagram, stripGraphics, withDiagram, type Diagram } from '../lib/diagram';
import { updateCard, type Card, type Deck } from '../lib/store';
import { useResolvedTheme } from '../lib/theme';
import { CardContent, lookOf } from './CardContent';
import { CostHint } from './CostHint';
import { IconRefresh, IconSparkle, IconTrash } from './Icons';
import { Modal } from './Modal';

const KIND_TEXT = { diagram: 'Merkora-Grafik', slide: 'Folienbild aus dem PDF', image: 'ältere KI-Grafik' } as const;

/** Improve the graphic of one card: make a new one (small AI request), replace or remove it. */
export function GraphicDialog({ deck, card, onClose }: { deck: Deck; card: Card; onClose: () => void }) {
  const theme = useResolvedTheme();
  const current = cardGraphic(card.html ? card.back : '');
  const [kind, setKind] = useState('');
  const [next, setNext] = useState<Diagram | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askRemove, setAskRemove] = useState(false);
  const front = cardFrontText(card);
  const back = cardBackText(card);

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      setNext(await diagramForCard(front, back, DIAGRAM_KINDS.find((k) => k.id === kind)?.label));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const asHtml = (s: string) => (card.html ? s : textToHtml(s));
  const apply = () => {
    if (!next) return;
    updateCard(deck.id, card.id, { front: asHtml(card.front), back: withDiagram(asHtml(card.back), next), html: true });
    onClose();
  };
  const remove = () => {
    updateCard(deck.id, card.id, { back: stripGraphics(card.back) });
    onClose();
  };

  return (
    <Modal
      title="Grafik für diese Karte"
      onClose={onClose}
      footer={
        <>
          {current.kind && !next && (
            <button type="button" className="btn ghost danger-text" onClick={() => setAskRemove(true)}>
              <IconTrash size={15} /> Grafik entfernen
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          {next && (
            <button type="button" className="btn primary" onClick={apply}>
              {current.kind ? 'Ersetzen' : 'Übernehmen'}
            </button>
          )}
        </>
      }
    >
      <p className="graphic-q">{front}</p>
      {askRemove ? (
        <div className="form-warn">
          Die {KIND_TEXT[current.kind!]} wird von der Karte entfernt. Der Text bleibt.{' '}
          <button type="button" className="link-btn" onClick={remove}>
            Ja, entfernen
          </button>{' '}
          <button type="button" className="link-btn" onClick={() => setAskRemove(false)}>
            Nein
          </button>
        </div>
      ) : null}
      {next ? (
        <>
          <span className="field-label">Neue Grafik</span>
          <div className="diagram graphic-preview" dangerouslySetInnerHTML={{ __html: renderDiagram(next, PALETTES[theme]) }} />
          {current.kind && <p className="muted small">„Ersetzen“ tauscht die bisherige {KIND_TEXT[current.kind]} gegen diese Grafik.</p>}
        </>
      ) : current.kind ? (
        <>
          <span className="field-label">Aktuell: {KIND_TEXT[current.kind]}</span>
          <div className="graphic-current">
            <CardContent text={card.back} html={card.html} look={lookOf(deck, card)} />
          </div>
        </>
      ) : (
        <p className="muted">Diese Karte hat noch keine Grafik.</p>
      )}

      {hasKey() ? (
        <div className="graphic-make">
          <label className="field-label" htmlFor="graphic-kind">
            Art der Grafik
          </label>
          <div className="input-row">
            <select id="graphic-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Automatisch – die KI wählt</option>
              {DIAGRAM_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn outline" onClick={() => void make()} disabled={busy}>
              {next ? <IconRefresh size={15} /> : <IconSparkle size={15} />} {busy ? 'Wird erstellt …' : next || current.kind ? 'Neu erstellen' : 'Grafik erstellen'}
            </button>
          </div>
          <CostHint est={{ input: 450 + tokensOf(front.length + back.length), output: 250 }} />
        </div>
      ) : (
        <p className="muted small">Für eine neue Grafik brauchst du einen API-Key (Einstellungen › KI). Entfernen geht auch ohne.</p>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
