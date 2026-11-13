import { useState } from 'react';
import { explainTerm, hasKey } from '../lib/ai';
import { tokensOf } from '../lib/costs';
import { materialAbout, relatedCards } from '../lib/related';
import { updateDeck, type Deck } from '../lib/store';
import { CardContent, lookOf } from './CardContent';
import { CostHint } from './CostHint';
import { IconRefresh, IconSparkle } from './Icons';
import { Markdown } from './Markdown';

/**
 * Under a clicked term of the mind map: the deck's cards about it (to quiz yourself, free)
 * or a short explanation of the sub-topic by the AI (kept with the deck, so opening it again costs nothing).
 */
export function MindmapInfo({ deck, term, branch, onCards }: { deck: Deck; term: string; branch: string; onCards: (term: string) => void }) {
  const [view, setView] = useState<'cards' | 'explain' | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cards = relatedCards(deck.cards, term, 5);
  const note = deck.mindmapNotes?.[term];
  const material = materialAbout(deck.source ?? '', term, 3000);

  const explain = async () => {
    setBusy(true);
    setError('');
    try {
      const text = await explainTerm(term, branch, deck.name, material);
      updateDeck(deck.id, (d) => ({ mindmapNotes: { ...(d.mindmapNotes ?? {}), [term]: text.trim() } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openExplain = () => {
    setView('explain');
    if (!note && hasKey('chat') && !busy) void explain();
  };

  return (
    <div className={'mm-info' + (view ? ' open' : '')} role="region" aria-label={`Zu „${term}“`}>
      {view === 'cards' && (
        <div className="mm-info-body">
          {cards.length ? (
            <ul className="mm-cards">
              {cards.map((c) => (
                <li key={c.id}>
                  <button type="button" className="mm-card" aria-expanded={shown.has(c.id)} onClick={() => setShown((s) => new Set(s).add(c.id))}>
                    <CardContent text={c.front} html={c.html} look={lookOf(deck, c)} className="mm-card-q" />
                    {shown.has(c.id) ? (
                      <CardContent text={c.back} html={c.html} look={lookOf(deck, c)} className="mm-card-a" />
                    ) : (
                      <small className="muted">Antwort aufdecken</small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Noch keine Karten zu diesem Begriff.</p>
          )}
          <button type="button" className="link-btn" onClick={() => onCards(term)}>
            Alle in der Kartenliste
          </button>
        </div>
      )}
      {view === 'explain' && (
        <div className="mm-info-body">
          {note ? (
            <>
              <Markdown text={note} />
              {hasKey('chat') && (
                <button type="button" className="link-btn" onClick={() => void explain()} disabled={busy}>
                  <IconRefresh size={13} /> {busy ? 'Wird neu erklärt …' : 'Neu erklären'}
                </button>
              )}
            </>
          ) : !hasKey('chat') ? (
            <p className="muted small">Für eine Erklärung brauchst du einen API-Key (Einstellungen › KI).</p>
          ) : busy ? (
            <p className="muted small">
              <IconSparkle size={13} /> Pip erklärt …
            </p>
          ) : null}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
      <div className="mm-info-bar">
        <b title={term}>{term}</b>
        <span className="grow" />
        <button type="button" className={'btn sm ' + (view === 'cards' ? 'primary' : 'outline')} onClick={() => setView(view === 'cards' ? null : 'cards')}>
          Verwandte Karten{cards.length ? ` (${cards.length})` : ''}
        </button>
        <button type="button" className={'btn sm ' + (view === 'explain' ? 'primary' : 'outline')} onClick={() => (view === 'explain' ? setView(null) : openExplain())}>
          <IconSparkle size={13} /> Kurz erklären
        </button>
      </div>
      {view === 'explain' && !note && hasKey('chat') && <CostHint className="mm-info-cost" est={{ input: 200 + tokensOf(material.length), output: 250 }} />}
    </div>
  );
}
