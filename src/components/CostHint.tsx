import { useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { aiConfig, aiReady } from '../lib/ai';
import { costOf, formatCostRange, formatTokens, priceFor, PRICES_DATE, type Estimate } from '../lib/costs';
import { ensureOpenRouterPrices, openRouterPrices, subscribePrices } from '../lib/livePrices';
import { useStore } from '../lib/store';

/**
 * Small grey line before an AI task: "≈ 14.200 Tokens · ca. 0,04 $ (gpt-4o-mini)".
 * Can be switched off in the settings (Einstellungen › KI › „Geschätzte Tokens und Kosten anzeigen“).
 */
export function CostHint({ est, label, className = '' }: { est: Estimate; label?: string; className?: string }) {
  const snap = useStore((s) => s);
  const show = snap.data.settings.showCosts ?? true;
  const cfg = aiConfig('gen');
  const live = useSyncExternalStore(subscribePrices, openRouterPrices);
  useEffect(() => {
    if (show && cfg.provider === 'openrouter') ensureOpenRouterPrices();
  }, [show, cfg.provider]);
  if (!show || !aiReady(snap)) return null;

  const st = snap.data.settings;
  const price = priceFor(cfg.model, {
    custom: { in: st.priceIn, out: st.priceOut },
    live: cfg.provider === 'openrouter' ? live : undefined,
  });
  // when the AI decides the number of cards itself, the output is a span
  const high = est.outputHigh !== undefined && est.outputHigh > est.output ? { input: est.input, output: est.outputHigh } : null;
  const total = high ? `${formatTokens(est.input + est.output)}–${formatTokens(est.input + high.output)}` : formatTokens(est.input + est.output);
  const out = high ? `${formatTokens(est.output)}–${formatTokens(high.output)}` : formatTokens(est.output);
  const tip =
    `${formatTokens(est.input)} Tokens Eingabe · ${out} Tokens Ausgabe – grobe Schätzung${
      high ? ', die Spanne kommt daher, dass die KI selbst entscheidet, wie viele Karten nötig sind' : ' (±30 %)'
    }.` +
    (price
      ? ` Preis: ${price.in.toString().replace('.', ',')} $ / ${price.out.toString().replace('.', ',')} $ pro 1 Mio. Tokens (${
          price.source === 'custom' ? 'eigener Preis' : price.source === 'live' ? 'aktuell von OpenRouter' : `Preisliste, Stand ${PRICES_DATE}`
        }).`
      : '');

  return (
    <p className={`cost-hint ${className}`} title={tip}>
      {label && <b>{label}: </b>}≈ {total} Tokens ·{' '}
      {price ? (
        <>
          ca. {formatCostRange(costOf(est, price), high ? costOf(high, price) : undefined)} <span className="muted">({cfg.model})</span>
        </>
      ) : (
        <>
          Preis unbekannt – <Link to="/settings">eigenen Preis eintragen</Link>
        </>
      )}
    </p>
  );
}
