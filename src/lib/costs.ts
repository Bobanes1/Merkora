/**
 * Rough estimate of AI tokens and costs before a task starts. Pure – tested in scripts/test-srs.mts.
 * Tokens are guessed from characters (German text ≈ 3.5 characters per token), output from the task.
 * Prices are US-$ per 1 million tokens (input / output).
 */
import { autoCardCount, CARD_MATERIAL_LIMIT } from './cardCount';

export type Estimate = { input: number; output: number };
export type Price = { in: number; out: number; source: 'table' | 'live' | 'custom' };

/** Characters → tokens (German ≈ 3.5 characters per token). */
export const tokensOf = (chars: number) => Math.ceil(Math.max(0, chars) / 3.5);

/** Limits the prompts apply to the material (see ai.ts). */
const MATERIAL_LIMIT = 36000; // materialFrom: 24k source + 12k cards

export const estimate = {
  cards: (chars: number, count: number, graphics = false): Estimate => ({
    input: 350 + tokensOf(Math.min(chars, CARD_MATERIAL_LIMIT)),
    output: (count > 0 ? count : autoCardCount(chars)) * (graphics ? 700 : 110),
  }),
  summary: (materialChars: number): Estimate => ({ input: 150 + tokensOf(Math.min(materialChars, MATERIAL_LIMIT)), output: 1500 }),
  quiz: (materialChars: number, count: number): Estimate => ({ input: 200 + tokensOf(Math.min(materialChars, MATERIAL_LIMIT)), output: count * 150 }),
  examCreate: (materialChars: number, tasks: number): Estimate => ({ input: 600 + tokensOf(Math.min(materialChars, 40000)), output: tasks * 250 }),
  /** Grading: questions, model answers and criteria in, feedback out (answers assumed ~400 characters each). */
  examGrade: (writtenTasks: number, answerChars = writtenTasks * 400): Estimate => ({
    input: 500 + writtenTasks * 220 + tokensOf(answerChars),
    output: 300 + writtenTasks * 90,
  }),
  chat: (materialChars: number, historyChars: number): Estimate => ({ input: 120 + tokensOf(Math.min(materialChars, MATERIAL_LIMIT) + historyChars), output: 400 }),
};

export const sumEstimates = (...e: Estimate[]): Estimate => e.reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output }), { input: 0, output: 0 });

/** Price list (US-$ per 1M tokens). Claude: Anthropic list prices 11/2026; OpenAI/Gemini: list prices as known, may be outdated. */
export const PRICES: Record<string, { in: number; out: number }> = {
  'claude-fable-5-2': { in: 8, out: 40 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'gemini-2.5-pro': { in: 1.25, out: 10 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
};
export const PRICES_DATE = '11/2026';

/**
 * Price for a model: own price from the settings first, then live OpenRouter prices, then the table
 * (also for "openai/gpt-4o-mini"-style names). null = unknown.
 */
export function priceFor(
  model: string,
  o: { custom?: { in?: number; out?: number }; live?: Record<string, { in: number; out: number }> } = {},
): Price | null {
  if (o.custom && (o.custom.in ?? 0) + (o.custom.out ?? 0) > 0) return { in: o.custom.in ?? 0, out: o.custom.out ?? 0, source: 'custom' };
  const m = model.trim();
  if (o.live?.[m]) return { ...o.live[m], source: 'live' };
  const bare = m.toLowerCase().replace(/^[\w-]+\//, '').replace(/:.*$/, '');
  if (/:free$/i.test(m)) return { in: 0, out: 0, source: 'table' };
  const hit = PRICES[bare] ?? Object.entries(PRICES).find(([k]) => bare.startsWith(k + '-'))?.[1];
  return hit ? { ...hit, source: 'table' } : null;
}

export const costOf = (e: Estimate, p: Price) => (e.input * p.in + e.output * p.out) / 1_000_000;

export function formatCost(usd: number): string {
  if (usd <= 0) return 'kostenlos';
  if (usd < 0.01) return '< 0,01 $';
  return `${usd.toFixed(2).replace('.', ',')} $`;
}
export const formatTokens = (n: number) => Math.round(n).toLocaleString('de-DE');
