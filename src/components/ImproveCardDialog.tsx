import { useEffect, useState } from 'react';
import { hasKey, improveCard, type CardImprovement } from '../lib/ai';
import { cardBackText, cardFrontText, escapeHtml, textToHtml } from '../lib/content';
import { tokensOf } from '../lib/costs';
import { cardGraphic, withDiagram } from '../lib/diagram';
import { addCards, deleteCard, updateCard, type Card, type Deck } from '../lib/store';
import { CostHint } from './CostHint';
import { IconRefresh, IconSparkle } from './Icons';
import { Modal } from './Modal';

type Way = 'rewrite' | 'mnemonic' | 'split';

/** A problem card (forgotten again and again): the AI suggests clearer wording, a memory hook or smaller cards. */
export function ImproveCardDialog({ deck, card, onClose }: { deck: Deck; card: Card; onClose: () => void }) {
  const front = cardFrontText(card);
  const back = cardBackText(card);
  const [tip, setTip] = useState<CardImprovement | null>(null);
  const [way, setWay] = useState<Way>('rewrite');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      const t = await improveCard(front, back, card.srs.lapses);
      setTip(t);
      setWay(t.rewrite.front ? 'rewrite' : t.mnemonic ? 'mnemonic' : 'split');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (hasKey('chat')) void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const side = (s: string) => (card.html ? textToHtml(s) : s);
  // the card counts as fixed: it is no longer a problem card
  const fixedSrs = { ...card.srs, lapses: 0 };
  const apply = () => {
    if (!tip) return;
    if (way === 'rewrite') {
      // a Merkora graphic on the card stays
      const d = card.html ? cardGraphic(card.back).diagram : undefined;
      const newBack = d ? withDiagram(side(tip.rewrite.back), d) : side(tip.rewrite.back);
      updateCard(deck.id, card.id, { front: side(tip.rewrite.front), back: newBack, srs: fixedSrs });
    } else if (way === 'mnemonic') {
      const extra = card.html ? `<br><br><i>Eselsbrücke: ${escapeHtml(tip.mnemonic)}</i>` : `\n\nEselsbrücke: ${tip.mnemonic}`;
      updateCard(deck.id, card.id, { back: card.back + extra, srs: fixedSrs });
    } else {
      addCards(deck.id, tip.split.map((p) => ({ front: p.front, back: p.back, ...(card.tags?.length ? { tags: card.tags } : {}) })));
      deleteCard(deck.id, card.id);
    }
    onClose();
  };

  const option = (id: Way, title: string, body: React.ReactNode, ok: boolean) =>
    ok && (
      <label className={'improve-way' + (way === id ? ' on' : '')}>
        <input type="radio" name="improve-way" checked={way === id} onChange={() => setWay(id)} />
        <span>
          <b>{title}</b>
          {body}
        </span>
      </label>
    );

  return (
    <Modal
      title="Karte verbessern"
      onClose={onClose}
      footer={
        <>
          {tip && (
            <button type="button" className="btn ghost" onClick={() => void ask()} disabled={busy}>
              <IconRefresh size={15} /> Neue Vorschläge
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={apply} disabled={!tip || busy}>
            Übernehmen
          </button>
        </>
      }
    >
      <p className="muted small">
        Diese Karte hast du schon {card.srs.lapses}× vergessen. Oft liegt es an der Karte selbst: zu viel auf einmal, unklare Frage oder nichts, woran man sich festhalten kann.
      </p>
      <div className="improve-current">
        <b>{front}</b>
        <span>{back}</span>
      </div>
      {!hasKey('chat') ? (
        <p className="muted small">Für Vorschläge brauchst du einen API-Key (Einstellungen › KI). Du kannst die Karte aber auch selbst bearbeiten.</p>
      ) : busy ? (
        <div className="slide-loading">
          <IconSparkle size={14} /> Die KI sucht bessere Wege …
        </div>
      ) : tip ? (
        <div className="improve-ways">
          {option(
            'rewrite',
            'Klarer formulieren',
            <>
              <small>Frage: {tip.rewrite.front}</small>
              <small>Antwort: {tip.rewrite.back}</small>
              <small className="muted">Dein Lernstand bleibt.</small>
            </>,
            !!tip.rewrite.front && !!tip.rewrite.back,
          )}
          {option('mnemonic', 'Eselsbrücke anhängen', <small>{tip.mnemonic}</small>, !!tip.mnemonic)}
          {option(
            'split',
            `In ${tip.split.length} kleinere Karten aufteilen`,
            <>
              {tip.split.map((p, i) => (
                <small key={i}>
                  {i + 1}. {p.front} → {p.back}
                </small>
              ))}
              <small className="muted">Die neuen Karten starten neu, die alte Karte wird gelöscht.</small>
            </>,
            tip.split.length > 1,
          )}
        </div>
      ) : null}
      {hasKey('chat') && <CostHint est={{ input: 500 + tokensOf(front.length + back.length), output: 450 }} />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
