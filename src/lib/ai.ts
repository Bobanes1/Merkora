import { netFetch } from './desktop';
import { SLIDE_IMAGE_RULE } from './slideImages';
import { cardBackText, sideText } from './content';
import { sampleCards, spreadClip } from './sample';
import { splitMaterial } from './chunks';
import { DIAGRAM_KINDS, DIAGRAM_RULE, parseDiagram, type Diagram } from './diagram';
import { ICON_NAMES } from './diagramIcons';
import { EMPHASIS_RULE } from './emphasis';
import { FIGURE_RULE } from './slides';
import { getState, type Card, type ChatMsg, type Provider } from './store';
import { SECOND_MODEL } from '../config';
import { autoCardInstruction, CARD_MATERIAL_LIMIT } from './cardCount';
import { repairJsonInfo } from './jsonRepair';

export const PROVIDERS: Record<
  Provider,
  { label: string; short: string; defaultModel: string; models: string[]; keyUrl: string; keyHint: string; baseUrl: string; steps: string[] }
> = {
  openai: {
    label: 'OpenAI (ChatGPT)',
    short: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'beginnt mit sk-',
    baseUrl: 'https://api.openai.com/v1',
    steps: [
      'Melde dich auf platform.openai.com an.',
      'Öffne „API keys“ und klicke auf „Create new secret key“.',
      'Kopiere den Key (beginnt mit „sk-“) und füge ihn hier ein.',
      'Unter „Billing“ brauchst du etwas Guthaben.',
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    short: 'Claude',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'beginnt mit sk-ant-',
    baseUrl: 'https://api.anthropic.com/v1',
    steps: [
      'Melde dich in der Anthropic Console an.',
      'Öffne „API Keys“ und klicke auf „Create Key“.',
      'Kopiere den Key (beginnt mit „sk-ant-“) und füge ihn hier ein.',
      'Unter „Billing“ brauchst du etwas Guthaben.',
    ],
  },
  gemini: {
    label: 'Google Gemini',
    short: 'Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'beginnt mit AIza',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    steps: [
      'Öffne Google AI Studio und melde dich mit deinem Google-Konto an.',
      'Klicke auf „Get API key“ und dann „Create API key“.',
      'Kopiere den Key (beginnt mit „AIza“) und füge ihn hier ein.',
    ],
  },
  openrouter: {
    label: 'OpenRouter (viele Modelle)',
    short: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['nvidia/nemotron-3.5-super-vl:free', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-5-5', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'beginnt mit sk-or-',
    baseUrl: 'https://openrouter.ai/api/v1',
    steps: [
      'Melde dich auf openrouter.ai an.',
      'Öffne „Keys“ und klicke auf „Create Key“.',
      'Kopiere den Key (beginnt mit „sk-or-“) und füge ihn hier ein.',
    ],
  },
  custom: {
    label: 'Eigener Server (OpenAI-kompatibel)',
    short: 'Eigener Server',
    defaultModel: 'llama3.1',
    models: [],
    keyUrl: 'https://ollama.com/download',
    keyHint: 'bei lokalen Servern oft beliebig',
    baseUrl: 'http://localhost:11434/v1',
    steps: [
      'Starte einen OpenAI-kompatiblen Server, z. B. Ollama oder LM Studio.',
      'Trage in den Einstellungen die Adresse ein (z. B. http://localhost:11434/v1).',
      'Als Key reicht bei lokalen Servern meist ein beliebiger Text.',
    ],
  },
};

export class AiError extends Error {}

/**
 * What a request is for: "gen" = creating content (cards, summaries, quiz, graphics),
 * "chat" = talking with the learner (tutor chat, explanations, grading typed answers).
 * The chat can use its own provider/model (Einstellungen › KI für den Chat).
 */
export type Purpose = 'gen' | 'chat';

type Snap = ReturnType<typeof getState>;

/** Provider, model, address and key used for a purpose (before falling back to the free model). */
function rawConfig(purpose: Purpose, s: Snap = getState()) {
  const st = s.data.settings;
  if (purpose === 'chat' && SECOND_MODEL && st.chatSeparate) {
    const p = st.chatProvider;
    const info = PROVIDERS[p];
    // Same provider as for generating: the main key can be reused.
    const key = s.chatKey || (p === st.provider ? s.apiKey : '');
    return { provider: p, info, key, model: st.chatModel.trim() || info.defaultModel, baseUrl: (st.chatBaseUrl.trim() || info.baseUrl).replace(/\/+$/, '') };
  }
  const p = st.provider;
  const info = PROVIDERS[p];
  return { provider: p, info, key: s.apiKey, model: st.model.trim() || info.defaultModel, baseUrl: (st.baseUrl.trim() || info.baseUrl).replace(/\/+$/, '') };
}

export function aiConfig(purpose: Purpose = 'gen') {
  return rawConfig(purpose, getState());
}

/** Whether AI features can be used right now: an own API key (or a local server) is required. */
export const aiReady = (s: Snap = getState(), purpose: Purpose = 'gen') => {
  const c = rawConfig(purpose, s);
  return !!c.key || c.provider === 'custom';
};
export const hasKey = (purpose: Purpose = 'gen') => aiReady(getState(), purpose);
type Opts = { system?: string; maxTokens?: number; json?: boolean; signal?: AbortSignal; purpose?: Purpose };

async function fail(res: Response): Promise<never> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    msg = j?.error?.message || j?.error?.type || j?.message || msg;
  } catch {
    /* keep status */
  }
  if (res.status === 401 || res.status === 403) msg = `Der API-Key wurde abgelehnt (${msg}).`;
  if (res.status === 429)
    msg = `Zu viele Anfragen oder kein Guthaben beim Anbieter (${msg}).`;
  throw new AiError(msg);
}

/**
 * Sends a conversation and returns the reply text. Empty or garbled replies (some models return only their
 * hidden "thinking" or word salad when overloaded) are retried twice before a clear error is shown.
 */
export async function complete(messages: ChatMsg[], opts: Opts = {}): Promise<string> {
  return (await completeInfo(messages, opts)).text;
}

/** Like complete, and tells whether the answer stopped at the length limit (`cut`). */
export async function completeInfo(messages: ChatMsg[], opts: Opts = {}): Promise<{ text: string; cut: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await completeOnce(messages, opts);
    const text = cleanReply(r.text);
    if (text && !looksBroken(text, messages, opts.system)) return { text, cut: r.cut };
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw new AiError('Die KI hat keine brauchbare Antwort geliefert. Bitte versuch es nochmal – oder wähle in den Einstellungen ein anderes Modell.');
}

/** Share of letters in Latin script (German, English, French …). */
const latinShare = (t: string) => {
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  return letters ? (t.match(/\p{Script=Latin}/gu)?.length ?? 0) / letters : 1;
};
/**
 * Detects word salad (seen with overloaded free models: random words in many alphabets).
 * Only when the material itself is in Latin script, so e.g. Japanese cards are not affected.
 */
function looksBroken(reply: string, messages: ChatMsg[], system?: string) {
  const input = [system ?? '', ...messages.map((m) => m.content)].join(' ');
  return latinShare(input) > 0.97 && latinShare(reply) < 0.95;
}

/** Removes visible "thinking" some models put into the answer. */
const cleanReply = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

type ApiKind = 'anthropic' | 'gemini' | 'openai';
const b64Of = (url: string) => url.slice(url.indexOf(',') + 1);
const mimeOf = (url: string) => /^data:([^;,]+)/.exec(url)?.[1] ?? 'image/jpeg';
/**
 * Messages in the form each provider expects; pictures of a message go along as image parts.
 * Pure – tested in scripts/test-srs.mts.
 */
export function providerMessages(kind: ApiKind, messages: ChatMsg[]): unknown[] {
  return messages.map((m) => {
    const imgs = m.role === 'user' ? (m.images ?? []) : [];
    if (kind === 'gemini')
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [...imgs.map((u) => ({ inline_data: { mime_type: mimeOf(u), data: b64Of(u) } })), { text: m.content }],
      };
    if (!imgs.length) return { role: m.role, content: m.content };
    if (kind === 'anthropic')
      return {
        role: m.role,
        content: [...imgs.map((u) => ({ type: 'image', source: { type: 'base64', media_type: mimeOf(u), data: b64Of(u) } })), { type: 'text', text: m.content }],
      };
    return { role: m.role, content: [{ type: 'text', text: m.content }, ...imgs.map((u) => ({ type: 'image_url', image_url: { url: u } }))] };
  });
}

/** OpenRouter tells per model whether it reads images (loaded with the model list). */
const VISION_KEY = 'merkora.visionModels';
let visionModels: Record<string, boolean> | null = null;
function knownVision(): Record<string, boolean> {
  if (visionModels) return visionModels;
  try {
    visionModels = JSON.parse(localStorage.getItem(VISION_KEY) || '{}') as Record<string, boolean>;
  } catch {
    visionModels = {};
  }
  return visionModels;
}
export function rememberVision(list: { id: string; architecture?: { input_modalities?: string[] } }[]) {
  const map: Record<string, boolean> = {};
  for (const m of list) if (m.architecture?.input_modalities) map[m.id] = m.architecture.input_modalities.includes('image');
  visionModels = map;
  try {
    localStorage.setItem(VISION_KEY, JSON.stringify(map));
  } catch {
    /* no storage */
  }
}
/** Loads OpenRouter's model list once in the background (for supportsImages). */
export async function loadVisionInfo(): Promise<void> {
  const cfg = aiConfig('gen');
  if (cfg.provider !== 'openrouter' || Object.keys(knownVision()).length) return;
  try {
    const res = await netFetch(`${cfg.baseUrl}/models`);
    if (res.ok) rememberVision(((await res.json()).data || []) as { id: string }[]);
  } catch {
    /* offline: the name rule below decides */
  }
}

/** Can the model for creating cards read pictures? Pure apart from the settings – tested. */
export function supportsImages(c: { provider: string; model: string } = aiConfig('gen'), customVision = !!getState().data.settings.customVision): boolean {
  const m = c.model.toLowerCase();
  if (c.provider === 'anthropic' || c.provider === 'gemini') return true;
  if (c.provider === 'openai') return /gpt-4o|gpt-4\.1|gpt-5|^o\d|chatgpt-4o/.test(m) && !/audio|realtime|search/.test(m);
  if (c.provider === 'custom') return customVision;
  const known = knownVision()[c.model];
  if (known !== undefined) return known;
  return /(^|[-/:._])vl([-/:._]|$)|vision|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|gemma-3|llama-4|pixtral|grok-4|qwen.*vl/.test(m);
}

/** The provider refused the pictures (model without image input) – then it is tried with text only. */
export const imagesRejected = (e: unknown) =>
  e instanceof AiError && !/API-Key|Anfragen|Guthaben/.test(e.message) && /image|vision|multimodal|modalit|bild/i.test(e.message);

/** Models that think before answering: their thinking counts against the answer limit. Pure – tested. */
export function thinkingModel(provider: string, model: string): boolean {
  const m = model.toLowerCase();
  if (provider === 'gemini') return /gemini-(2\.5|[3-9])/.test(m);
  if (provider === 'openai') return /^(gpt-5|o\d)/.test(m);
  if (provider === 'openrouter') return /gemini-(2\.5|[3-9])|gpt-5|\/o\d|deepseek-r1|-r1\b|qwq|thinking|reasoner|glm-(4\.[5-9]|[5-9])|kimi-k2/.test(m);
  return false;
}
/** Small tasks (explaining, grading, one graphic): little thinking is enough – cheaper, faster, no empty answers. */
export const SMALL_TASK = 2000;
/** Extra answer room for a thinking model, so the thinking does not eat the answer. */
export const THINKING_ROOM = 2000;

/**
 * Answer limit and thinking settings per provider (the request fields). Thinking models get extra room;
 * for small tasks they think less. Pure – tested.
 */
export function tokenSettings(provider: string, model: string, maxTokens: number): Record<string, unknown> {
  const thinks = thinkingModel(provider, model);
  const small = maxTokens <= SMALL_TASK;
  if (provider === 'gemini')
    return {
      maxOutputTokens: thinks ? maxTokens + THINKING_ROOM : maxTokens,
      ...(thinks && small && /flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
    };
  if (provider === 'openai') return { max_completion_tokens: thinks ? maxTokens + THINKING_ROOM : maxTokens, ...(thinks && small ? { reasoning_effort: 'low' } : {}) };
  if (provider === 'openrouter')
    return model.endsWith(':free')
      ? // free OpenRouter models answer reliably only without thinking (tested: otherwise often empty replies)
        { max_tokens: maxTokens, reasoning: { effort: 'none' } }
      : // thinking models need room and must not return their thinking instead of the answer
        { max_tokens: maxTokens + 3000, reasoning: small ? { effort: 'low', exclude: true } : { exclude: true } };
  return { max_tokens: maxTokens };
}

/** Long fixed instructions (material in the chat, rules for every card part) are worth caching. */
export const CACHE_FROM_CHARS = 4000;
/**
 * The system text, marked for prompt caching where the provider needs it: Claude (directly, or on OpenRouter
 * for anthropic/… and google/… models) then bills a repeated system text at about a tenth. OpenAI and Gemini
 * cache by themselves when the start stays the same. Short texts stay plain (caching them would cost extra).
 * Pure – tested.
 */
export function systemFor(kind: 'anthropic' | 'openrouter' | 'openai', model: string, system?: string): unknown {
  if (!system) return undefined;
  const long = system.length >= CACHE_FROM_CHARS;
  const marked = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  if (kind === 'anthropic') return long ? marked : system;
  if (kind === 'openrouter' && long && /^(anthropic|google)\//.test(model)) return marked;
  return system;
}

/** Did the provider stop the answer at the length limit? Pure – tested. */
export function wasCut(kind: ApiKind, j: unknown): boolean {
  const o = (j ?? {}) as Record<string, any>;
  if (kind === 'anthropic') return o.stop_reason === 'max_tokens';
  if (kind === 'gemini') return o.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  return o.choices?.[0]?.finish_reason === 'length';
}

async function completeOnce(messages: ChatMsg[], opts: Opts = {}): Promise<{ text: string; cut: boolean }> {
  const purpose = opts.purpose ?? 'gen';
  const cfg = aiConfig(purpose);
  if (!cfg.key && cfg.provider !== 'custom') throw new AiError('Kein API-Key hinterlegt. Trage ihn in den Einstellungen ein.');
  const maxTokens = opts.maxTokens ?? 4000;
  try {
    if (cfg.provider === 'anthropic') {
      const res = await netFetch(`${cfg.baseUrl}/messages`, {
        method: 'POST',
        signal: opts.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system: systemFor('anthropic', cfg.model, opts.system), messages: providerMessages('anthropic', messages) }),
      });
      if (!res.ok) await fail(res);
      const j = await res.json();
      return { text: (j.content || []).map((b: { text?: string }) => b.text || '').join(''), cut: wasCut('anthropic', j) };
    }
    if (cfg.provider === 'gemini') {
      const res = await netFetch(`${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: 'POST',
        signal: opts.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
        body: JSON.stringify({
          systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
          contents: providerMessages('gemini', messages),
          generationConfig: { ...(tokenSettings('gemini', cfg.model, maxTokens) as object), ...(opts.json ? { responseMimeType: 'application/json' } : {}) },
        }),
      });
      if (!res.ok) await fail(res);
      const j = await res.json();
      return { text: (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join(''), cut: wasCut('gemini', j) };
    }
    // OpenAI and OpenAI-compatible servers
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cfg.key) headers.authorization = `Bearer ${cfg.key}`;
    if (cfg.provider === 'openrouter') headers['X-Title'] = 'Merkora';
    const res = await netFetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: opts.signal,
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [...(opts.system ? [{ role: 'system', content: systemFor(cfg.provider === 'openrouter' ? 'openrouter' : 'openai', cfg.model, opts.system) }] : []), ...providerMessages('openai', messages)],
        ...tokenSettings(cfg.provider, cfg.model, maxTokens),
        ...(opts.json && cfg.provider === 'openai' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) await fail(res);
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content;
    // some servers answer with parts instead of plain text
    const text = Array.isArray(content) ? content.map((c: { text?: string }) => c?.text ?? '').join('') : String(content ?? '');
    return { text, cut: wasCut('openai', j) };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(
      `Keine Verbindung zum KI-Anbieter (${(e as Error).message}). Prüfe Internet und Adresse.`,
    );
  }
}

/** The AI answered, but not in a readable form (Merkora tries once more by itself). */
export class AiFormatError extends AiError {}

export function parseJson<T>(text: string, key?: string): T {
  return parseJsonInfo<T>(text, key).value;
}

/**
 * Reads the JSON of an AI answer. `cut`: it was cut off and repaired (only the complete part is kept).
 * With `key`, the JSON holding that key is searched, also behind text the AI wrote first.
 */
export function parseJsonInfo<T>(text: string, key?: string): { value: T; cut: boolean } {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    const v = JSON.parse(cleaned) as T;
    if (!key || (v && typeof v === 'object' && key in (v as object))) return { value: v, cut: false };
  } catch {
    /* repaired below */
  }
  // small mistakes and answers cut off at the length limit are repaired (everything complete is kept)
  const r = repairJsonInfo(cleaned, key);
  if (r && r.value && typeof r.value === 'object') return { value: r.value as T, cut: r.cut };
  throw new AiFormatError('Die Antwort der KI war nicht im erwarteten Format. Bitte versuche es noch einmal.');
}

export async function completeJson<T>(system: string, user: string, maxTokens = 6000, purpose: Purpose = 'gen'): Promise<T> {
  const ask = (tokens: number, extra = '') =>
    complete([{ role: 'user', content: user }], {
      purpose,
      system: system + '\nAntworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.' + extra,
      json: true,
      maxTokens: tokens,
    });
  try {
    return parseJson<T>(await ask(maxTokens));
  } catch (e) {
    if (!(e instanceof AiFormatError)) throw e;
    // one more try with more room and a clear reminder
    return parseJson<T>(await ask(Math.round(maxTokens * 1.5), '\nWICHTIG: Deine letzte Antwort war kein vollständiges, gültiges JSON. Antworte jetzt nur mit dem JSON-Objekt; halte die Antworttexte kürzer, damit es vollständig ist (Grafiken behalten).'));
  }
}

export const LANG_RULE =
  'Antworte in der Sprache des Lernmaterials (falls unklar: Deutsch). Sei fachlich korrekt, klar und prägnant.';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n[…gekürzt]' : s);

/**
 * The deck as material for the AI, from the whole deck: long text is taken evenly from start to end
 * (spreadClip), and when not all cards fit, the hard and marked ones plus an even sample go along.
 */
export function materialFrom(
  source: string,
  cards: { front: string; back: string; html?: boolean; marked?: boolean; srs?: { lapses?: number } }[],
  limit = 24000,
) {
  const parts: string[] = [];
  if (source.trim()) parts.push('LERNMATERIAL:\n' + spreadClip(source.trim(), limit));
  if (cards.length) {
    const budget = source.trim() ? limit / 2 : limit;
    const line = (c: (typeof cards)[number]) => `F: ${sideText(c, c.front)}\n   A: ${c.html ? cardBackText(c as Card) : c.back}`;
    const lines = cards.map(line);
    const avg = lines.reduce((n, l) => n + l.length + 6, 0) / lines.length;
    const fits = Math.max(1, Math.floor(budget / avg));
    const chosen = sampleCards(cards, fits);
    const text = chosen.map((c) => lines[cards.indexOf(c)]).map((l, i) => `${i + 1}. ${l}`).join('\n');
    const note = chosen.length < cards.length ? ` (Auswahl: ${chosen.length} von ${cards.length}, über das ganze Deck verteilt)` : '';
    parts.push(`KARTEIKARTEN${note}:\n` + clip(text, budget));
  }
  return parts.join('\n\n') || '(Noch kein Material vorhanden.)';
}

/** Like runPrompt, and tells whether the answer stopped at the length limit. */
export async function runPromptInfo(p: Prompt, signal?: AbortSignal) {
  return completeInfo([{ role: 'user', content: p.user }], { system: p.system, maxTokens: p.maxTokens, json: p.json, signal });
}

/** Material up to this size is summarized in one go; longer material first section by section. */
export const SUMMARY_ONE_GO = 36000;

/**
 * Summary of the whole deck: long material is first summarized per section (up to 3 at once), then one
 * summary is written from those. An answer cut off at the length limit is continued once.
 */
export async function makeSummary(source: string, cards: Parameters<typeof materialFrom>[1], signal?: AbortSignal): Promise<string> {
  const finish = async (p: Prompt) => {
    const r = await runPromptInfo(p, signal);
    if (!r.cut) return r.text;
    const more = await completeInfo(
      [
        { role: 'user', content: p.user },
        { role: 'assistant', content: r.text },
        { role: 'user', content: 'Deine Antwort wurde abgeschnitten. Fahre genau an der Stelle fort, ohne etwas zu wiederholen.' },
      ],
      { system: p.system, maxTokens: p.maxTokens, signal },
    );
    return r.text + more.text;
  };
  if (source.trim().length + cards.length * 120 <= SUMMARY_ONE_GO) return finish(summaryPrompt(materialFrom(source, cards, 24000)));
  const chunks = splitMaterial([{ name: 'Material', text: source }], 30000).map((c) => c.text);
  const notes: string[] = new Array(chunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const i = next++;
        notes[i] = await complete([{ role: 'user', content: `Fasse Teil ${i + 1} von ${chunks.length} des Lernmaterials knapp, aber vollständig als Stichpunkte zusammen (alle prüfungsrelevanten Begriffe, Modelle, Zusammenhänge).\n\n${chunks[i]}` }], {
          system: `Du bist ein hilfreicher Lerncoach. ${LANG_RULE}`,
          maxTokens: 3000,
          signal,
        });
      }
    }),
  );
  const material = 'NOTIZEN ZU DEN TEILEN DES LERNMATERIALS:\n' + notes.map((n, i) => `### Teil ${i + 1}\n${n}`).join('\n\n') + '\n\n' + materialFrom('', cards, 12000);
  return finish(summaryPrompt(material));
}

/** Quiz questions; when the answer was cut off, the missing ones are asked for once more. Returns the JSON text. */
export async function makeQuiz(material: string, count: number, signal?: AbortSignal): Promise<string> {
  const p = quizPrompt(material, count);
  const r = await runPromptInfo(p, signal);
  const first = parseJsonInfo<{ questions?: unknown[] }>(r.text, 'questions');
  const qs = Array.isArray(first.value.questions) ? first.value.questions : [];
  if ((r.cut || first.cut) && qs.length < count) {
    const asked = qs.map((q) => String((q as { question?: unknown })?.question ?? '')).filter(Boolean);
    const p2 = quizPrompt(material, count - qs.length);
    const r2 = await runPromptInfo({ ...p2, user: p2.user + `\n\nDiese Fragen gibt es schon – stelle andere:\n- ${asked.join('\n- ')}` }, signal);
    try {
      const more = parseJsonInfo<{ questions?: unknown[] }>(r2.text, 'questions').value.questions;
      if (Array.isArray(more)) qs.push(...more);
    } catch {
      /* keep the questions there are */
    }
  }
  return JSON.stringify({ questions: qs });
}

// ---------- prompts for the bigger tasks (run as background jobs) ----------
export type Prompt = { system: string; user: string; maxTokens: number; json: boolean; /** Slide pictures (data addresses) sent along. */ images?: string[] };
const JSON_RULE = '\nAntworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.';

/** For long material processed in steps: which part this is, and the questions of the cards made so far. */
export type PartInfo = {
  i: number;
  n: number;
  avoid?: string[];
  /** A continuation: the previous answer was cut off. */
  more?: boolean;
  /** Second try: a lot of material gave very few cards. */
  few?: boolean;
  /** The topic list of this part (made by the first answer) – continuations number their cards by it. */
  topics?: string[];
  /** Topics that got no card yet – this request makes cards for exactly those. */
  gaps?: string[];
};

export function cardsPrompt(text: string, count: number, focus = '', graphics = false, part?: PartInfo, figures = false, slides: string[] = []): Prompt {
  const slideNote = slides.length ? `\n\nAngehängte Folienbilder (in dieser Reihenfolge): ${slides.map((l, i) => `Bild ${i + 1} = ${l}`).join('; ')}.` : '';
  const known = part?.avoid?.length ? `:\n- ${part.avoid.join('\n- ')}` : '.';
  const moreNote = part?.more
    ? `\n\nDie vorige Antwort zu diesem Material war zu lang und wurde abgeschnitten. Erstelle jetzt die übrigen Karten – nicht die schon vorhandenen${known}`
    : part?.few
      ? `\n\nDas Material enthält mehr prüfungsrelevante Inhalte, als bisher Karten haben. Erstelle Karten zu allen prüfungsrelevanten Konzepten – nicht zu den schon vorhandenen${known}`
      : '';
  const auto = count <= 0;
  // continuations keep the numbering of the part's topic list; the first answer makes the list
  const listed = auto && !!part?.topics?.length;
  const topicNote = part?.gaps?.length
    ? `\n\nZu diesen Themen des Materials gibt es noch keine Karte. Erstelle für JEDES genau eine Karte, mit der man es versteht (ohne "topics"/"topic"):\n- ${part.gaps.join('\n- ')}`
    : listed
      ? `\n\nThemenliste dieses Materials (nicht neu auflisten, kein "topics"): ${part!.topics!.map((t, k) => `${k + 1}. ${t}`).join('; ')}. Gib bei jeder Karte die Nummer ihres Themas an ("topic").`
      : '';
  const withTopics = auto && !listed && !part?.gaps?.length;
  const partNote = part && part.n > 1
    ? `\n\nDies ist Teil ${part.i} von ${part.n} des Lernmaterials. Erstelle Karten nur zu diesem Teil${count > 0 ? '' : ' und entscheide die Anzahl nur nach seinem Inhalt'}.${
        part.avoid?.length && !part.more && !part.few
          ? ` Zu diesen Fragen gibt es schon Karten – nicht wiederholen, auch nicht anders formuliert:\n- ${part.avoid.join('\n- ')}`
          : ''
      }`
    : '';
  return {
    system: `Du bist ein erfahrener Lerncoach und erstellst hochwertige Karteikarten. ${LANG_RULE}
Regeln: Eine Idee pro Karte. Vorderseite = präzise Frage oder Begriff. Rückseite = kurze, vollständige Antwort (max. 2–3 Sätze).
${TERM_RULE}
${FORMULA_RULE}
Wähle prüfungsorientiert aus: Karten zu dem, was in einer Prüfung zu diesem Stoff gefragt werden kann – nicht zu Organisatorischem, Agenda oder Literaturlisten.${boldOn() ? '\n' + EMPHASIS_RULE : ''}
${graphics ? DIAGRAM_RULE + '\n' : ''}${figures ? FIGURE_RULE + '\n' : ''}${slides.length ? SLIDE_IMAGE_RULE + '\n' : ''}Format: {${withTopics ? '"topics":["Thema 1","Thema 2"],' : ''}"cards":[{"front":"...","back":"..."${auto && !part?.gaps?.length ? ',"topic":1' : ''}${graphics ? ',"diagram":{"type":"flow","title":"…","steps":["…","…","…"]}' : ''}${figures ? ',"figure":7 (optional)' : ''}}]}${graphics ? ' – "diagram" bei den Karten, zu denen eine Grafik passt (etwa jede dritte Karte), sonst weglassen.' : ''}${JSON_RULE}`,
    user: `${
      count > 0
        ? `Erstelle genau ${count} Karteikarten zu diesem Material.`
        : part?.gaps?.length
          ? 'Ergänze die fehlenden Karten.'
          : listed
            ? 'Erstelle die Karten zu den Themen dieses Materials – Qualität vor Menge, Dopplungen weglassen.'
            : autoCardInstruction(text.length)
    }${focus ? ` Schwerpunkt: ${focus}.` : ''}${partNote}${moreNote}${topicNote}\n\n${clip(text, CARD_MATERIAL_LIMIT)}${slideNote}`,
    // automatic: generous room so the limit never decides the number (only written tokens are billed)
    maxTokens: count > 0 ? Math.min(32000, 400 + count * (graphics ? 500 : 220)) : 16000,
    json: true,
  };
}
/**
 * After long material (several parts made side by side): which cards are duplicates, too small-grained or
 * unimportant? The AI sees all questions with a short answer and names the numbers to remove.
 */
export function curatePrompt(cards: { front: string; back: string }[], topics: string[] = []): Prompt {
  const short = (t: string, n: number) => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    system: `Du bist ein erfahrener Lerncoach und sortierst einen Kartensatz aus, der aus mehreren Teilen eines langen Lernmaterials entstanden ist. Ziel: weniger, aber hochwertige Karten.
Nenne die Nummern der Karten, die WEG sollen:
- Dopplungen (gleiche Frage oder gleicher Inhalt, auch anders formuliert) – behalte jeweils die beste Karte;
- zu kleinteilige Karten (Detailfakten, einzelne Beispiele, Zahlen ohne Lernwert), die eine andere Karte schon abdeckt;
- Unwichtiges oder Organisatorisches.
Behalte alles, was für eine Prüfung wichtig ist. Im Zweifel behalten. Höchstens 40 % der Karten.${topics.length ? `\nZu jedem dieser Themen des Materials muss mindestens eine Karte bleiben: ${topics.slice(0, 120).join('; ')}.` : ''}
Format: {"drop":[3,17,22]}${JSON_RULE}`,
    user: cards.map((c, i) => `${i + 1}. ${short(c.front, 160)} → ${short(c.back, 120)}`).join('\n'),
    maxTokens: 1500,
    json: true,
  };
}

/**
 * `allowEmpty`: one part of long material may hold nothing exam-relevant (e.g. only a literature list) –
 * then no cards is a valid answer, not an error.
 */
export function parseCards(text: string, allowEmpty = false) {
  return parseCardsInfo(text, allowEmpty).cards;
}

export type AiCard = ReturnType<typeof parseCards>[number];

/** The cards of an answer, and whether it was cut off (then a continuation makes the rest). */
export function parseCardsInfo(text: string, allowEmpty = false) {
  const { value: res, cut } = parseJsonInfo<{ topics?: unknown; cards: { front: string; back: string; svg?: string; diagram?: unknown; figure?: unknown; icons?: unknown; topic?: unknown }[] }>(text, 'cards');
  // the topic list (like the outline of a summary) – for checking that every topic got a card
  const topics = (Array.isArray(res.topics) ? res.topics : []).map((t) => String(t ?? '').trim().slice(0, 120)).filter(Boolean).slice(0, 60);
  const cards = (Array.isArray(res.cards) ? res.cards : []).filter((c) => c && c.front && c.back);
  // cut off before the first complete card: nothing usable, but a continuation may still bring cards
  if (!cards.length && !allowEmpty && !cut)
    throw new AiError('Die KI hat in diesem Material nichts Prüfungsrelevantes gefunden (z. B. nur Literaturliste oder Organisatorisches) und keine Karten erstellt.');
  return { cut, topics, cards: cards.map((c) => ({
    front: String(c.front).trim(),
    back: String(c.back).trim(),
    ...(Number.isInteger(Number(c.topic)) && Number(c.topic) > 0 ? { topic: Number(c.topic) } : {}),
    // symbols written next to the diagram instead of inside it still count
    // a diagram sent as JSON text still counts
    ...(typeof c.diagram === 'string' && c.diagram.trim().startsWith('{') ? { diagram: c.diagram } : {}),
    ...(c.diagram && typeof c.diagram === 'object'
      ? { diagram: c.icons && typeof c.icons === 'object' && !(c.diagram as { icons?: unknown }).icons ? { ...(c.diagram as object), icons: c.icons } : c.diagram }
      : {}),
    // a slide of the PDF that shows the answer (see lib/slides.ts)
    ...(Number.isInteger(Number(c.figure)) && Number(c.figure) > 0 ? { figure: Number(c.figure) } : {}),
    // older answers may still carry raw SVG
    ...(c.svg ? { svg: String(c.svg) } : {}),
  })) };
}

export function summaryPrompt(material: string): Prompt {
  return {
    system: `Du bist ein hilfreicher Lerncoach. ${LANG_RULE}`,
    user: `Erstelle eine gut strukturierte Lern-Zusammenfassung in Markdown (Überschriften mit ##, Aufzählungen, **Fettdruck** für Schlüsselbegriffe, am Ende ein Abschnitt „## Das Wichtigste in Kürze“ mit 3–5 Punkten).\n\n${material}`,
    maxTokens: 8000,
    json: false,
  };
}
export function parseSummary(text: string) {
  const s = text.trim();
  if (!s) throw new AiError('Die KI hat keine Zusammenfassung geliefert.');
  return s;
}

export function quizPrompt(material: string, count: number): Prompt {
  return {
    system: `Du erstellst prüfungsähnliche Multiple-Choice-Fragen. ${LANG_RULE}
Jede Frage hat genau 4 Antwortmöglichkeiten, genau eine ist richtig. "answer" ist der Index (0–3) der richtigen Antwort.
Format: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}${JSON_RULE}`,
    user: `Erstelle ${count} Fragen zu diesem Material. Mische die Position der richtigen Antwort.\n\n${material}`,
    maxTokens: Math.min(12000, 500 + count * 350),
    json: true,
  };
}
export function parseQuiz(text: string) {
  const res = parseJson<{ questions: { question: string; options: string[]; answer: number; explanation: string }[] }>(text);
  const qs = (res.questions || []).filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2);
  if (!qs.length) throw new AiError('Die KI hat keine Fragen geliefert.');
  return qs.map((q) => ({
    question: q.question,
    options: q.options.map(String),
    answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)),
    explanation: q.explanation || '',
  }));
}

/** Runs a prompt right here in the tab. */
/**
 * Runs a prepared prompt. With slide pictures: if the model refuses pictures, once more with text only
 * (`onImagesDropped` tells the caller, so the person learns why).
 */
export async function runPrompt(p: Prompt, signal?: AbortSignal, onImagesDropped?: () => void) {
  const opts = { system: p.system, maxTokens: p.maxTokens, json: p.json, signal };
  if (!p.images?.length) return complete([{ role: 'user', content: p.user }], opts);
  try {
    return await complete([{ role: 'user', content: p.user, images: p.images }], opts);
  } catch (e) {
    if (!imagesRejected(e)) throw e;
    onImagesDropped?.();
    return complete([{ role: 'user', content: p.user }], opts);
  }
}

/**
 * Runs a card prompt and reads the cards. With slide pictures: if the model refuses pictures or answers
 * unreadably with them, once more with text only (`onImagesDropped` tells why).
 */
export async function runCards(
  p: Prompt,
  allowEmpty: boolean,
  onImagesDropped?: (why: 'rejected' | 'format') => void,
  signal?: AbortSignal,
): Promise<{ cards: AiCard[]; cut: boolean; topics: string[] }> {
  const opts = { system: p.system, maxTokens: p.maxTokens, json: p.json, signal };
  const textOnly = async () => {
    const r = await completeInfo([{ role: 'user', content: p.user }], { ...opts, maxTokens: p.images?.length ? p.maxTokens - IMAGE_TOKENS : p.maxTokens });
    const c = parseCardsInfo(r.text, allowEmpty);
    return { cards: c.cards, cut: r.cut || c.cut, topics: c.topics };
  };
  if (!p.images?.length) return textOnly();
  let r: { text: string; cut: boolean };
  try {
    r = await completeInfo([{ role: 'user', content: p.user, images: p.images }], opts);
  } catch (e) {
    if (!imagesRejected(e)) throw e;
    onImagesDropped?.('rejected');
    return textOnly();
  }
  try {
    const c = parseCardsInfo(r.text, allowEmpty);
    return { cards: c.cards, cut: r.cut || c.cut, topics: c.topics };
  } catch (e) {
    if (!(e instanceof AiFormatError)) throw e;
    onImagesDropped?.('format');
    return textOnly();
  }
}

/** Extra answer room when slide pictures go along (some models count picture tokens against the limit). */
export const IMAGE_TOKENS = 2000;

export async function generateCards(
  text: string,
  count: number,
  focus = '',
  graphics = false,
  part?: PartInfo,
  figures = false,
  slides?: { label: string; url: string }[],
  onImagesDropped?: () => void,
) {
  return (await generateCardsInfo(text, count, focus, graphics, part, figures, slides, onImagesDropped)).cards;
}

export async function generateCardsInfo(
  text: string,
  count: number,
  focus = '',
  graphics = false,
  part?: PartInfo,
  figures = false,
  slides?: { label: string; url: string }[],
  onImagesDropped?: (why: 'rejected' | 'format') => void,
  signal?: AbortSignal,
) {
  // with several parts (or a continuation, or missing topics), a part without exam-relevant content may give no cards
  const p = cardsPrompt(text, count, focus, graphics, part, figures, slides?.map((s) => s.label));
  return runCards(withSlideImages(p, slides), (!!part && part.n > 1) || !!part?.more || !!part?.gaps?.length, onImagesDropped, signal);
}

/** The prompt with slide pictures attached (and room for them). */
export const withSlideImages = (p: Prompt, slides?: { url: string }[]): Prompt =>
  slides?.length ? { ...p, images: slides.map((s) => s.url), maxTokens: p.maxTokens + IMAGE_TOKENS } : p;

// ---------- work that keeps running on the provider's servers ----------
export type RemoteMode = 'openai-bg' | 'anthropic-batch';

/** Which providers can keep working after this window is closed. */
export function remoteModeFor(): RemoteMode | null {
  const { data } = getState();
  if (data.settings.provider === 'openai') return 'openai-bg';
  if (data.settings.provider === 'anthropic' && data.settings.claudeBatch) return 'anthropic-batch';
  return null;
}

const anthropicHeaders = (key: string) => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
});

/** Not supported (fall back to running in the tab) vs. a real error (stop). */
export class RemoteUnsupported extends Error {}

/** Hands the prompt to the provider as a background job and returns its id. */
export async function startRemote(mode: RemoteMode, p: Prompt, customId: string): Promise<string> {
  const cfg = aiConfig();
  let res: Response;
  try {
    if (mode === 'openai-bg') {
      res = await netFetch(`${cfg.baseUrl}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: cfg.model,
          instructions: p.system,
          input: p.user,
          max_output_tokens: p.maxTokens,
          background: true,
          store: true,
          ...(p.json ? { text: { format: { type: 'json_object' } } } : {}),
        }),
      });
    } else {
      res = await netFetch(`${cfg.baseUrl}/messages/batches`, {
        method: 'POST',
        headers: anthropicHeaders(cfg.key),
        body: JSON.stringify({
          requests: [
            { custom_id: customId, params: { model: cfg.model, max_tokens: p.maxTokens, system: p.system, messages: [{ role: 'user', content: p.user }] } },
          ],
        }),
      });
    }
  } catch (e) {
    throw new RemoteUnsupported((e as Error).message);
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) await fail(res);
  if (!res.ok) throw new RemoteUnsupported(`${res.status}`);
  const j = await res.json();
  if (!j.id) throw new RemoteUnsupported('keine Auftrags-ID');
  return String(j.id);
}

/** Asks the provider whether the background job is finished. Returns the text when done, null while it's still working. */
export async function pollRemote(mode: RemoteMode, id: string, customId: string): Promise<string | null> {
  const cfg = aiConfig();
  if (mode === 'openai-bg') {
    const res = await netFetch(`${cfg.baseUrl}/responses/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${cfg.key}` } });
    if (!res.ok) await fail(res);
    const j = await res.json();
    if (j.status === 'queued' || j.status === 'in_progress') return null;
    const text: string =
      j.output_text ??
      (j.output || [])
        .flatMap((o: { type: string; content?: { type: string; text?: string }[] }) => (o.type === 'message' ? o.content || [] : []))
        .filter((c: { type: string }) => c.type === 'output_text')
        .map((c: { text?: string }) => c.text || '')
        .join('');
    if (j.status === 'completed' || (j.status === 'incomplete' && text)) return text;
    throw new AiError(j.error?.message || `Der Auftrag wurde beim Anbieter abgebrochen (${j.status}).`);
  }
  const res = await netFetch(`${cfg.baseUrl}/messages/batches/${encodeURIComponent(id)}`, { headers: anthropicHeaders(cfg.key) });
  if (!res.ok) await fail(res);
  const j = await res.json();
  if (j.processing_status !== 'ended') return null;
  if (!j.results_url) throw new AiError('Der Auftrag ist abgelaufen oder wurde abgebrochen.');
  const r = await netFetch(j.results_url, { headers: anthropicHeaders(cfg.key) });
  if (!r.ok) await fail(r);
  const lines = (await r.text()).split('\n').filter(Boolean);
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.custom_id !== customId && lines.length > 1) continue;
    if (item.result?.type === 'succeeded')
      return (item.result.message?.content || []).map((b: { text?: string }) => b.text || '').join('');
    throw new AiError(item.result?.error?.error?.message || `Der Auftrag ist fehlgeschlagen (${item.result?.type ?? 'unbekannt'}).`);
  }
  throw new AiError('Kein Ergebnis gefunden.');
}

export async function gradeAnswer(front: string, back: string, answer: string) {
  return completeJson<{ score: number; verdict: string; feedback: string }>(
    `Du bewertest die Antwort eines Lernenden auf eine Karteikarte freundlich und fair. ${LANG_RULE}
"score" ist 1 (falsch), 2 (teilweise), 3 (richtig) oder 4 (perfekt). "verdict" ist ein kurzes Urteil (2–4 Wörter). "feedback" erklärt in 1–3 Sätzen, was fehlt oder gut war.
Format: {"score":3,"verdict":"...","feedback":"..."}`,
    `Frage: ${front}\nMusterlösung: ${back}\nAntwort des Lernenden: ${answer || '(keine Antwort)'}`,
    800,
    'chat',
  );
}

export async function explainCard(front: string, back: string) {
  return complete(
    [
      {
        role: 'user',
        content: `Erkläre mir diese Karteikarte verständlich, mit einem Beispiel und einer Eselsbrücke. Kurz halten (max. 150 Wörter), Markdown erlaubt.\n\nFrage: ${front}\nAntwort: ${back}`,
      },
    ],
    { system: `Du bist ein geduldiger Tutor. ${LANG_RULE}`, maxTokens: 1200, purpose: 'chat' },
  );
}

/** The part of the conversation sent along: the last 12 messages, starting with a question (some providers refuse otherwise). Pure – tested. */
export function chatWindow(history: ChatMsg[], max = 12): ChatMsg[] {
  const w = history.slice(-max);
  const first = w.findIndex((m) => m.role === 'user');
  return first < 0 ? w : w.slice(first);
}

export async function tutorReply(deckName: string, material: string, history: ChatMsg[]) {
  // the system text (rules + material) stays the same for the whole chat: cached by the provider
  return complete(chatWindow(history), {
    system: `Du bist „Pip“, ein freundlicher KI-Lerntutor. Der Lernende arbeitet am Deck „${deckName}“. Nutze das folgende Material als Grundlage, sag ehrlich, wenn etwas nicht darin steht. Antworte kurz und hilfreich, Markdown erlaubt. ${LANG_RULE}\n\n${material}`,
    maxTokens: 2000,
    purpose: 'chat',
  });
}

export async function listModels(purpose: Purpose = 'gen'): Promise<string[]> {
  const cfg = aiConfig(purpose);
  try {
    if (cfg.provider === 'anthropic') {
      const res = await netFetch(`${cfg.baseUrl}/models?limit=100`, {
        headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      if (!res.ok) await fail(res);
      return ((await res.json()).data || []).map((m: { id: string }) => m.id);
    }
    if (cfg.provider === 'gemini') {
      const res = await netFetch(`${cfg.baseUrl}/models?pageSize=200`, { headers: { 'x-goog-api-key': cfg.key } });
      if (!res.ok) await fail(res);
      return ((await res.json()).models || [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''));
    }
    const res = await netFetch(`${cfg.baseUrl}/models`, { headers: cfg.key ? { authorization: `Bearer ${cfg.key}` } : {} });
    if (!res.ok) await fail(res);
    const list = ((await res.json()).data || []) as { id: string }[];
    if (cfg.provider === 'openrouter') rememberVision(list);
    const ids: string[] = list.map((m) => m.id);
    return cfg.provider === 'openai' ? ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/audio|realtime|tts|transcribe|image|search/.test(id)).sort() : ids.sort();
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError(`Keine Verbindung (${(e as Error).message}).`);
  }
}

export async function testConnection(purpose: Purpose = 'gen'): Promise<string> {
  const reply = await complete([{ role: 'user', content: 'Antworte nur mit dem Wort: OK' }], { maxTokens: 300, purpose });
  return reply.trim() || 'OK';
}

/**
 * A graphic for one card (improve per card): the AI only describes it (see DIAGRAM_RULE), Merkora draws it.
 * Small request – the card text in, one short description out.
 */
export async function diagramForCard(front: string, back: string, kind?: string): Promise<Diagram> {
  const raw = await completeJson<Record<string, unknown>>(
    `Du veranschaulichst Lernkarten mit einer einfachen Grafik. ${LANG_RULE}
${DIAGRAM_RULE}
Antworte nur mit dem einen Grafik-Objekt (z. B. {"type":"flow",...}), ohne "diagram"-Hülle.`,
    `Beschreibe eine Grafik, die diese Karte am besten veranschaulicht${kind ? ` – als Art „${kind}“ ("type":"${DIAGRAM_KINDS.find((k) => k.label === kind)?.id ?? ''}")` : ''}.\n\nFrage: ${front}\nAntwort: ${back}`,
    800,
  );
  const d = parseDiagram((raw as { diagram?: unknown }).diagram ?? raw);
  if (!d) throw new AiError('Die KI hat keine brauchbare Grafik beschrieben. Versuch es noch einmal oder wähle eine andere Art.');
  return d;
}

export type CardImprovement = { rewrite: { front: string; back: string }; mnemonic: string; split: { front: string; back: string }[] };

/** A card that is forgotten again and again: clearer wording, a memory hook, or smaller cards. */
export async function improveCard(front: string, back: string, lapses: number): Promise<CardImprovement> {
  const r = await completeJson<Partial<CardImprovement>>(
    `Du hilfst bei einer Lernkarte, die jemand immer wieder vergisst (${lapses}× vergessen). ${LANG_RULE}
Schlage drei Wege vor:
- "rewrite": dieselbe Karte klarer – eindeutige, konkrete Frage, kurze Antwort mit dem Kern zuerst.
- "mnemonic": eine kurze, einprägsame Eselsbrücke oder ein Bild zum Merken (1–2 Sätze).
- "split": 2–3 kleinere Karten, die zusammen dasselbe abfragen (je eine Sache pro Karte).
${TERM_RULE}
${FORMULA_RULE}${boldOn() ? '\n' + EMPHASIS_RULE : ''}
Format: {"rewrite":{"front":"...","back":"..."},"mnemonic":"...","split":[{"front":"...","back":"..."}]}`,
    `Frage: ${front}\nAntwort: ${back}`,
    1500,
    'chat',
  );
  const pair = (x: unknown) => {
    const o = (x ?? {}) as { front?: unknown; back?: unknown };
    return { front: String(o.front ?? '').trim(), back: String(o.back ?? '').trim() };
  };
  const rewrite = pair(r.rewrite);
  const split = (Array.isArray(r.split) ? r.split : []).map(pair).filter((p) => p.front && p.back).slice(0, 4);
  const mnemonic = String(r.mnemonic ?? '').trim();
  if (!rewrite.front && !mnemonic && !split.length) throw new AiError('Die KI hat keinen brauchbaren Vorschlag geliefert. Versuch es noch einmal.');
  return { rewrite, mnemonic, split };
}

/** A mind map of the whole material: centre, 3–8 branches with up to 5 points each (drawn by Merkora). */
export async function mindmapFor(deckName: string, material: string): Promise<Diagram> {
  const raw = await completeJson<Record<string, unknown>>(
    `Du erstellst aus Lernmaterial eine übersichtliche Mindmap zum Lernen. ${LANG_RULE}
Die Mitte ist das Thema. 3–8 Äste sind die Hauptthemen in sinnvoller Reihenfolge, jeder mit 2–5 kurzen Unterpunkten (Stichworte, höchstens 6 Wörter, keine Sätze).
Optional "icons":{"Beschriftung":"symbol"} für einige Äste; erlaubte Symbole: ${ICON_NAMES.join(', ')}.
Format: {"center":"…","branches":[{"label":"…","children":["…","…"]}],"icons":{}}`,
    `Deck: ${deckName}\n\nLernmaterial:\n${material}`,
    2000,
  );
  const d = parseDiagram({ ...raw, type: 'mindmap' });
  if (!d) throw new AiError('Die KI hat keine brauchbare Mindmap geliefert. Versuch es noch einmal.');
  return d;
}

/** Bold key words on AI cards (setting, on by default). */
export const boldOn = () => getState().data.settings.boldKeywords !== false;

/** A new version of one card about the same topic (optionally with a wish like "kürzer"), from the matching material. */
export async function regenerateCard(
  front: string,
  back: string,
  material: string,
  wish: string,
  graphic = false,
): Promise<{ front: string; back: string; diagram?: Diagram }> {
  const r = await completeJson<{ front?: unknown; back?: unknown; diagram?: unknown }>(
    `Du schreibst eine Lernkarte neu – zum selben Thema, aber besser: eine präzise Frage und eine kurze, vollständige Antwort (max. 2–3 Sätze). ${LANG_RULE}
${TERM_RULE}
${FORMULA_RULE}${boldOn() ? '\n' + EMPHASIS_RULE : ''}${graphic ? '\n' + DIAGRAM_RULE : ''}
Format: {"front":"...","back":"..."${graphic ? ',"diagram":{…} (optional)' : ''}}`,
    `Bisherige Karte:\nFrage: ${front}\nAntwort: ${back}${wish.trim() ? `\n\nWunsch (hat Vorrang): ${wish.trim()}` : ''}${material ? `\n\nPassendes Lernmaterial:\n${material}` : ''}`,
    graphic ? 1400 : 900,
    'chat',
  );
  const f = String(r.front ?? '').trim(), b = String(r.back ?? '').trim();
  if (!f || !b) throw new AiError('Die KI hat keine brauchbare Karte geliefert. Versuch es noch einmal.');
  const diagram = graphic && r.diagram ? (parseDiagram(r.diagram) ?? undefined) : undefined;
  return { front: f, back: b, diagram };
}

/** Real formulas as LaTeX – the card shows them typeset (KaTeX). In JSON the backslash is doubled. */
export const FORMULA_RULE =
  String.raw`Schreibe echte Formeln (Mathe, Statistik, Physik, Chemie, Ökonomie) in LaTeX zwischen \\( und \\), z. B. "\\( s^2 = \\frac{1}{n-1}\\sum (x_i-\\bar{x})^2 \\)" – im JSON mit doppeltem Backslash. Einfache Zahlen, Einheiten und Prozentwerte schreibst du normal, ohne LaTeX.` +
  ' Programmcode schreibst du als Codeblock mit drei Backticks (z. B. ```java … ```, Zeilenumbrüche im JSON als \\n), kurze Bezeichner im Text als `name`.';

/** Single terms: a short, still understandable definition – the 2–3 sentences are for explanations. */
export const TERM_RULE =
  'Geht es um einen einzelnen Begriff, antworte mit einer klaren Definition in eigenen, verständlichen Worten (meist ein Satz). Ist der Begriff ohne Vorwissen schwer greifbar, ergänze einen kurzen Halbsatz zur Bedeutung oder ein kleines Beispiel („z. B. …“). Lass Füllwörter, Einleitungen und die Wiederholung der Frage weg – die Antwort soll knapp, aber für jemanden ohne das Lernmaterial verständlich sein. Die 2–3 Sätze sind für Erklärungen und Zusammenhänge gedacht.';

/** A short explanation of a term of the mind map, in the context of the deck and its branch. */
export async function explainTerm(term: string, branch: string, deckName: string, material: string): Promise<string> {
  return complete(
    [
      {
        role: 'user',
        content: `Erkläre kurz das Unterthema „${term}“${branch && branch !== term ? ` (gehört zu „${branch}“)` : ''} aus dem Deck „${deckName}“: 3–5 Sätze, verständlich, mit einem kleinen Beispiel, und wie es mit dem übergeordneten Thema zusammenhängt. Stütze dich auf den Kontext aus dem Deck unten und erkläre den Begriff so, wie er in diesem Deck gemeint ist. Gibt der Kontext wenig her, erkläre ihn fachlich passend zum Thema des Decks. Schreibe nie, dass du keinen Zugriff auf das Deck hast. Markdown erlaubt, keine Überschrift.${material ? `\n\nKontext aus dem Deck:\n${material}` : ''}`,
      },
    ],
    { system: `Du bist Pip, ein geduldiger Lerntutor. ${LANG_RULE}`, maxTokens: 700, purpose: 'chat' },
  );
}
