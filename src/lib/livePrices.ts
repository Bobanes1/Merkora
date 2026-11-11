/**
 * Current OpenRouter prices (public list, no key and no personal data sent), loaded at most once a day
 * and only while the cost estimate is switched on. Prices in US-$ per 1M tokens.
 */
import { netFetch } from './desktop';

const KEY = 'merkora-openrouter-prices';
type Cache = { at: number; prices: Record<string, { in: number; out: number }> };
let mem: Cache | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function readCache(): Cache | null {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    mem = null;
  }
  return mem;
}

export function openRouterPrices(): Record<string, { in: number; out: number }> | undefined {
  return readCache()?.prices;
}

export function subscribePrices(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Loads the list if it is missing or older than a day. Errors are ignored (the table is used then). */
export function ensureOpenRouterPrices() {
  const c = readCache();
  if ((c && Date.now() - c.at < 86_400_000) || loading) return;
  loading = (async () => {
    try {
      const res = await netFetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) return;
      const data = ((await res.json()).data ?? []) as { id: string; pricing?: { prompt?: string; completion?: string } }[];
      const prices: Cache['prices'] = {};
      for (const m of data) {
        const pIn = Number(m.pricing?.prompt);
        const pOut = Number(m.pricing?.completion);
        if (Number.isFinite(pIn) && Number.isFinite(pOut) && pIn >= 0 && pOut >= 0) prices[m.id] = { in: pIn * 1e6, out: pOut * 1e6 };
      }
      mem = { at: Date.now(), prices };
      try {
        localStorage.setItem(KEY, JSON.stringify(mem));
      } catch {
        /* storage full or blocked */
      }
      listeners.forEach((l) => l());
    } catch {
      /* offline – the price table is used */
    } finally {
      loading = null;
    }
  })();
}
