import { useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { aiConfig, aiReady } from '../lib/ai';
import { costOf, formatCost, formatTokens, priceFor, PRICES_DATE, type Estimate } from '../lib/costs';
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
  const total = est.input + est.output;
  const tip =
    `${formatTokens(est.input)} Tokens Eingabe · ${formatTokens(est.output)} Tokens Ausgabe – grobe Schätzung (±30 %).` +
    (price
      ? ` Preis: ${price.in.toString().replace('.', ',')} $ / ${price.out.toString().replace('.', ',')} $ pro 1 Mio. Tokens (${
          price.source === 'custom' ? 'eigener Preis' : price.source === 'live' ? 'aktuell von OpenRouter' : `Preisliste, Stand ${PRICES_DATE}`
        }).`
      : '');

  return (
    <p className={`cost-hint ${className}`} title={tip}>
      {label && <b>{label}: </b>}≈ {formatTokens(total)} Tokens ·{' '}
      {price ? (
        <>
          ca. {formatCost(costOf(est, price))} <span className="muted">({cfg.model})</span>
        </>
      ) : (
        <>
          Preis unbekannt – <Link to="/settings">eigenen Preis eintragen</Link>
        </>
      )}
    </p>
  );
}
