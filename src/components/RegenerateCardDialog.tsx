import { useState } from 'react';
import { boldOn, hasKey, regenerateCard } from '../lib/ai';
import { cardBackText, cardFrontText } from '../lib/content';
import { tokensOf } from '../lib/costs';
import { cardGraphic, withDiagram } from '../lib/diagram';
import { emphasisHtml, stripEmphasis } from '../lib/emphasis';
import { materialAbout } from '../lib/related';
import { updateCard, type Card, type Deck } from '../lib/store';
import { CardContent } from './CardContent';
import { CostHint } from './CostHint';
import { IconRefresh, IconSparkle } from './Icons';
import { Modal } from './Modal';

const WISHES = ['Kürzer', 'Mit Beispiel', 'Einfacher', 'Prüfungsnäher'];

/** One card written anew by the AI (same topic, optional wish); the learning state stays when it is replaced. */
export function RegenerateCardDialog({ deck, card, onClose }: { deck: Deck; card: Card; onClose: () => void }) {
  const front = cardFrontText(card);
  const back = cardBackText(card);
  const [wish, setWish] = useState('');
  const [next, setNext] = useState<{ front: string; back: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // the parts of the material about this card keep the request small
  const material = materialAbout(deck.source ?? '', front, 3000) || materialAbout(deck.source ?? '', back, 3000);

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      setNext(await regenerateCard(front, back, material, wish));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const html = (s: string) => emphasisHtml(boldOn() ? s : stripEmphasis(s));
  const apply = () => {
    if (!next) return;
    // a Merkora graphic on the card stays
    const d = card.html ? cardGraphic(card.back).diagram : undefined;
    updateCard(deck.id, card.id, { front: html(next.front), back: d ? withDiagram(html(next.back), d) : html(next.back), html: true });
    onClose();
  };

  return (
    <Modal
      title="Karte neu generieren"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          {next && (
            <button type="button" className="btn primary" onClick={apply}>
              Ersetzen
            </button>
          )}
        </>
      }
    >
      <div className="improve-current">
        <b>{front}</b>
        <span>{back}</span>
      </div>
      {!hasKey('chat') ? (
        <p className="muted small">Dafür brauchst du einen API-Key (Einstellungen › KI).</p>
      ) : (
        <>
          <label className="field-label" htmlFor="regen-wish">
            Wunsch (optional)
          </label>
          <div className="regen-wishes">
            {WISHES.map((w) => (
              <button key={w} type="button" className={'chip' + (wish === w ? ' active' : '')} onClick={() => setWish(wish === w ? '' : w)}>
                {w}
              </button>
            ))}
          </div>
          <div className="input-row">
            <input id="regen-wish" className="input" placeholder="z. B. als Frage nach der Ursache" value={wish} onChange={(e) => setWish(e.target.value)} />
            <button type="button" className="btn outline" onClick={() => void make()} disabled={busy}>
              {next ? <IconRefresh size={15} /> : <IconSparkle size={15} />} {busy ? 'Wird geschrieben …' : next ? 'Noch einmal' : 'Neu generieren'}
            </button>
          </div>
          <CostHint est={{ input: 300 + tokensOf(front.length + back.length + material.length), output: 200 }} />
        </>
      )}
      {next && (
        <div className="regen-preview">
          <span className="field-label">Neue Fassung</span>
          <CardContent text={html(next.front)} html className="regen-front" />
          <hr />
          <CardContent text={html(next.back)} html className="regen-back" />
          <p className="muted small">Beim Ersetzen bleibt dein Lernstand erhalten{card.html && cardGraphic(card.back).diagram ? ', ebenso die Grafik' : ''}.</p>
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
