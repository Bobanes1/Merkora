import { useEffect, useState } from 'react';
import { explainTerm, hasKey } from '../lib/ai';
import { tokensOf } from '../lib/costs';
import type { Map } from '../lib/mindmapLayout';
import { branchCards, explainContext } from '../lib/related';
import { updateDeck, type Card, type Deck } from '../lib/store';
import { CardContent, lookOf } from './CardContent';
import { CostHint } from './CostHint';
import { IconRefresh, IconSparkle } from './Icons';
import { Markdown } from './Markdown';

/** Shown at first; "Alle n Karten anzeigen" opens the rest. */
const FIRST = 6;
/** An older explanation written without the deck's content ("Ich habe keinen Zugriff …") is made anew. */
const stale = (s?: string) => !!s && /keinen Zugriff/i.test(s);

/**
 * Under a clicked term of the mind map: the deck's cards about it (to quiz yourself, free) – for a branch also those
 * of all its sub-points – or a short explanation by the AI (kept with the deck, so opening it again costs nothing).
 */
export function MindmapInfo({
  deck,
  term,
  branch,
  subPoints,
  map,
  onCards,
}: {
  deck: Deck;
  term: string;
  branch: string;
  /** Set when a branch is clicked: its points. */
  subPoints?: string[];
  map?: Map;
  onCards: (term: string) => void;
}) {
  const [view, setView] = useState<'cards' | 'explain' | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const groups = branchCards(deck.cards, [term, ...(subPoints ?? [])]);
  const total = groups.reduce((a, g) => a + g.cards.length, 0);
  const saved = deck.mindmapNotes?.[term];
  const note = stale(saved) ? undefined : saved;
  const context = explainContext(deck, term, branch, map);

  const explain = async () => {
    setBusy(true);
    setError('');
    try {
      const text = await explainTerm(term, branch, deck.name, context);
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
  useEffect(() => setAll(false), [term]);

  // first FIRST cards over all groups, then the rest after "Alle anzeigen"
  let left = all ? Infinity : FIRST;
  const visible = groups
    .map((g) => {
      const cards = g.cards.slice(0, Math.max(0, left));
      left -= cards.length;
      return { ...g, cards };
    })
    .filter((g) => g.cards.length);
  const cardItem = (c: Card) => (
    <li key={c.id}>
      <button type="button" className="mm-card" aria-expanded={shown.has(c.id)} onClick={() => setShown((s) => new Set(s).add(c.id))}>
        <CardContent text={c.front} html={c.html} look={lookOf(deck, c)} className="mm-card-q" />
        {shown.has(c.id) ? <CardContent text={c.back} html={c.html} look={lookOf(deck, c)} className="mm-card-a" /> : <small className="muted">Antwort aufdecken</small>}
      </button>
    </li>
  );

  return (
    <div className={'mm-info' + (view ? ' open' : '')} role="region" aria-label={`Zu „${term}“`}>
      {view === 'cards' && (
        <div className="mm-info-body">
          {total ? (
            visible.map((g, i) => (
              <div key={g.label} className="mm-card-group">
                {subPoints && (i > 0 || g.label !== term) && <small className="mm-card-group-label">{g.label}</small>}
                <ul className="mm-cards">{g.cards.map(cardItem)}</ul>
              </div>
            ))
          ) : (
            <p className="muted small">Noch keine Karten zu diesem Begriff.</p>
          )}
          {total > FIRST && !all && (
            <button type="button" className="link-btn" onClick={() => setAll(true)}>
              Alle {total} Karten anzeigen
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => onCards(term)}>
            Alle in der Kartenliste{subPoints ? ' (Suche nach dem Ast-Namen)' : ''}
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
          Verwandte Karten{total ? ` (${total})` : ''}
        </button>
        <button type="button" className={'btn sm ' + (view === 'explain' ? 'primary' : 'outline')} onClick={() => (view === 'explain' ? setView(null) : openExplain())}>
          <IconSparkle size={13} /> Kurz erklären
        </button>
      </div>
      {view === 'explain' && !note && hasKey('chat') && <CostHint className="mm-info-cost" est={{ input: 260 + tokensOf(context.length), output: 250 }} />}
    </div>
  );
}
