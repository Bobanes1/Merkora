import { netFetch } from './desktop';
import { sideText } from './content';
import { CARD_GRAPHIC_RULE } from './graphics';
import { getState, type ChatMsg, type Provider } from './store';
import { SECOND_MODEL } from '../config';

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
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = cleanReply(await completeOnce(messages, opts));
    if (text && !looksBroken(text, messages, opts.system)) return text;
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

async function completeOnce(messages: ChatMsg[], opts: Opts = {}): Promise<string> {
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
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system: opts.system, messages }),
      });
      if (!res.ok) await fail(res);
      const j = await res.json();
      return (j.content || []).map((b: { text?: string }) => b.text || '').join('');
    }
    if (cfg.provider === 'gemini') {
      const res = await netFetch(`${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: 'POST',
        signal: opts.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
        body: JSON.stringify({
          systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: maxTokens, ...(opts.json ? { responseMimeType: 'application/json' } : {}) },
        }),
      });
      if (!res.ok) await fail(res);
      const j = await res.json();
      return (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
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
        messages: [...(opts.system ? [{ role: 'system', content: opts.system }] : []), ...messages],
        ...(cfg.provider === 'openai'
          ? { max_completion_tokens: maxTokens }
          : // OpenRouter: thinking models need room for their thinking and must not return it instead of the answer
            cfg.provider === 'openrouter'
            ? cfg.model.endsWith(':free')
              ? // free OpenRouter models answer reliably only without thinking (tested: otherwise often empty replies)
                { max_tokens: maxTokens, reasoning: { effort: 'none' } }
              : { max_tokens: maxTokens + 3000, reasoning: { exclude: true } }
            : { max_tokens: maxTokens }),
        ...(opts.json && cfg.provider === 'openai' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) await fail(res);
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(
      `Keine Verbindung zum KI-Anbieter (${(e as Error).message}). Prüfe Internet und Adresse.`,
    );
  }
}

export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const endObj = cleaned.lastIndexOf('}');
    const endArr = cleaned.lastIndexOf(']');
    const end = Math.max(endObj, endArr);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new AiError('Die Antwort der KI war nicht im erwarteten Format. Bitte versuche es noch einmal.');
  }
}

export async function completeJson<T>(system: string, user: string, maxTokens = 6000, purpose: Purpose = 'gen'): Promise<T> {
  const text = await complete([{ role: 'user', content: user }], {
    purpose,
    system: system + '\nAntworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.',
    json: true,
    maxTokens,
  });
  return parseJson<T>(text);
}

export const LANG_RULE =
  'Antworte in der Sprache des Lernmaterials (falls unklar: Deutsch). Sei fachlich korrekt, klar und prägnant.';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n[…gekürzt]' : s);

export function materialFrom(source: string, cards: { front: string; back: string; html?: boolean }[], limit = 24000) {
  const parts: string[] = [];
  if (source.trim()) parts.push('LERNMATERIAL:\n' + clip(source.trim(), limit));
  if (cards.length)
    parts.push(
      'KARTEIKARTEN:\n' +
        clip(cards.map((c, i) => `${i + 1}. F: ${sideText(c, c.front)}\n   A: ${sideText(c, c.back)}`).join('\n'), source.trim() ? limit / 2 : limit),
    );
  return parts.join('\n\n') || '(Noch kein Material vorhanden.)';
}

// ---------- prompts for the bigger tasks (run as background jobs) ----------
export type Prompt = { system: string; user: string; maxTokens: number; json: boolean };
const JSON_RULE = '\nAntworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.';

export function cardsPrompt(text: string, count: number, focus = '', graphics = false): Prompt {
  return {
    system: `Du bist ein erfahrener Lerncoach und erstellst hochwertige Karteikarten. ${LANG_RULE}
Regeln: Eine Idee pro Karte. Vorderseite = präzise Frage oder Begriff. Rückseite = kurze, vollständige Antwort (max. 2–3 Sätze).
${graphics ? CARD_GRAPHIC_RULE + '\n' : ''}Format: {"cards":[{"front":"...","back":"..."${graphics ? ',"svg":"<svg …>…</svg> (optional)"' : ''}}]}${JSON_RULE}`,
    user: `Erstelle genau ${count} Karteikarten zu diesem Material.${focus ? ` Schwerpunkt: ${focus}.` : ''}\n\n${clip(text, 60000)}`,
    maxTokens: Math.min(32000, 400 + count * (graphics ? 900 : 220)),
    json: true,
  };
}
export function parseCards(text: string) {
  const res = parseJson<{ cards: { front: string; back: string; svg?: string }[] }>(text);
  const cards = (res.cards || []).filter((c) => c && c.front && c.back);
  if (!cards.length) throw new AiError('Die KI hat keine Karten geliefert. Versuche es mit mehr Text.');
  return cards.map((c) => ({ front: String(c.front).trim(), back: String(c.back).trim(), ...(c.svg ? { svg: String(c.svg) } : {}) }));
}

export function summaryPrompt(material: string): Prompt {
  return {
    system: `Du bist ein hilfreicher Lerncoach. ${LANG_RULE}`,
    user: `Erstelle eine gut strukturierte Lern-Zusammenfassung in Markdown (Überschriften mit ##, Aufzählungen, **Fettdruck** für Schlüsselbegriffe, am Ende ein Abschnitt „## Das Wichtigste in Kürze“ mit 3–5 Punkten).\n\n${material}`,
    maxTokens: 4000,
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
export function runPrompt(p: Prompt, signal?: AbortSignal) {
  return complete([{ role: 'user', content: p.user }], { system: p.system, maxTokens: p.maxTokens, json: p.json, signal });
}

export async function generateCards(text: string, count: number, focus = '', graphics = false) {
  return parseCards(await runPrompt(cardsPrompt(text, count, focus, graphics)));
}

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

export async function tutorReply(deckName: string, material: string, history: ChatMsg[]) {
  return complete(history.slice(-20), {
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
    const ids: string[] = ((await res.json()).data || []).map((m: { id: string }) => m.id);
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
