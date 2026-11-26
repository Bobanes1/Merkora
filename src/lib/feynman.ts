/**
 * Token-efficient Feynman ("Erklär es Pip") learning engine.
 * - Extracts key concepts 100% locally (0 tokens).
 * - Sends only a compact concept + card context (~5,000 chars) via `purpose: 'chat'` instead of dumping full scripts.
 * Pure helpers (`extractKeyConcepts`, `buildFeynmanContext`, `parseFeynmanReply`) are tested in scripts/test-srs.mts.
 */
import { completeJson } from './ai';
import { cleanCardText } from './interference';
import { stripPageMarkers } from './pdfText';
import type { Deck } from './store';

export type FeynmanMessage = {
  role: 'user' | 'assistant';
  text: string;
};

export type FeynmanAssessment = {
  reply: string;
  covered: string[];
  missing: string[];
  misconceptions: string[];
  score: number;
  done: boolean;
  gapCards: { front: string; back: string }[];
};

/**
 * Extracts 4–8 concise key concepts from a deck 100% offline (mindmap branches, tags, or top cards).
 */
export function extractKeyConcepts(deck: Pick<Deck, 'name' | 'cards' | 'mindmap' | 'source'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const clean = cleanCardText(raw).replace(/[?:!]+$/, '').trim();
    if (clean.length < 3 || clean.length > 72) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  if (deck.mindmap?.type === 'mindmap' && deck.mindmap.branches?.length) {
    for (const b of deck.mindmap.branches) {
      push(b.label);
      if (out.length >= 8) return out;
    }
  }

  const active = deck.cards.filter((c) => !c.suspended);
  // Prefer tags if meaningful
  const tagCounts = new Map<string, number>();
  for (const c of active) {
    for (const t of c.tags ?? []) {
      const clean = t.trim();
      if (!clean || clean === 'Tutor') continue;
      tagCounts.set(clean, (tagCounts.get(clean) ?? 0) + 1);
    }
  }
  for (const [tag] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    push(tag);
  }

  // Fill up from card fronts (prioritizing harder / leech cards first)
  const prioritized = [...active].sort((a, b) => b.srs.lapses - a.srs.lapses);
  for (const c of prioritized) {
    if (out.length >= 7) break;
    const front = cleanCardText(c.front);
    const short = front.length > 56 ? front.slice(0, 55).replace(/\s+\S*$/, '') + '…' : front;
    push(short);
  }

  // Fallback from headings/lines of source text
  if (!out.length && deck.source.trim()) {
    const lines = stripPageMarkers(deck.source)
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .filter((l) => l.length >= 4 && l.length <= 64);
    for (const l of lines) {
      push(l);
      if (out.length >= 6) break;
    }
  }

  return out.length ? out : [deck.name];
}

/** Builds a compact (~5,000 char max) reference context so multi-turn Feynman stays very token-efficient. */
export function buildFeynmanContext(deck: Pick<Deck, 'name' | 'cards' | 'source' | 'mindmap'>, concepts: string[], maxChars = 5000): string {
  const parts: string[] = [`THEMA: ${deck.name}`, `SCHLÜSSELKONZEPTE: ${concepts.join(' · ')}`];
  const active = deck.cards.filter((c) => !c.suspended).slice(0, 18);
  if (active.length) {
    parts.push(
      'KERNKARTEN:\n' +
        active
          .map((c) => `- ${cleanCardText(c.front).slice(0, 120)} => ${cleanCardText(c.back).slice(0, 180)}`)
          .join('\n'),
    );
  }
  let joined = parts.join('\n\n');
  if (joined.length < maxChars - 400 && deck.source.trim()) {
    const room = maxChars - joined.length - 30;
    const excerpt = stripPageMarkers(deck.source).slice(0, room);
    if (excerpt) joined += `\n\nSKRIPT-AUSZUG:\n${excerpt}`;
  }
  return joined.slice(0, maxChars);
}

/** Parses and validates the AI JSON response for a Feynman dialogue turn. */
export function parseFeynmanReply(raw: unknown, concepts: string[]): FeynmanAssessment {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const strList = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 10);
  const covered = strList(o.covered);
  const missingRaw = strList(o.missing);
  const coveredLow = new Set(covered.map((c) => c.toLowerCase()));
  const missing = missingRaw.length ? missingRaw : concepts.filter((c) => !coveredLow.has(c.toLowerCase()));
  const misconceptions = strList(o.misconceptions);
  const scoreNum = typeof o.score === 'number' && Number.isFinite(o.score) ? Math.max(0, Math.min(100, Math.round(o.score))) : Math.round((covered.length / Math.max(1, concepts.length)) * 100);
  const gapCards = (Array.isArray(o.gapCards) ? o.gapCards : [])
    .map((g) => {
      const item = (g ?? {}) as { front?: unknown; back?: unknown };
      return { front: String(item.front ?? '').trim(), back: String(item.back ?? '').trim() };
    })
    .filter((g) => g.front && g.back)
    .slice(0, 4);
  const reply = String(o.reply ?? '').trim() || 'Spannend! Kannst du mir den wichtigsten Zusammenhang noch an einem kleinen Beispiel erklären?';
  return {
    reply,
    covered,
    missing,
    misconceptions,
    score: scoreNum,
    done: Boolean(o.done) || scoreNum >= 90,
    gapCards,
  };
}

/** Runs one token-efficient Feynman dialogue turn with Pip (uses `purpose: 'chat'`). */
export async function feynmanTurn(
  deck: Pick<Deck, 'name' | 'cards' | 'source' | 'mindmap'>,
  concepts: string[],
  history: FeynmanMessage[],
  prevCovered: string[],
): Promise<FeynmanAssessment> {
  const context = buildFeynmanContext(deck, concepts, 5000);
  const recent = history.slice(-8);
  const transcript = recent.map((m) => `${m.role === 'user' ? 'Lernende/r' : 'Pip'}: ${m.text}`).join('\n');

  const system = `Du bist Pip, ein neugieriger, freundlicher Lernpartner für die Feynman-Methode ("Erklär es mir in einfachen Worten").
Regeln:
- Lobe kurz, was schon richtig erklärt wurde, und stelle genau EINE gezielte, verständliche Nachfrage zu einem noch offenen Schlüsselkonzept oder einer Unklarheit.
- Halte deine Antwort ("reply") kurz & natürlich gesprochen (2–4 Sätze, kein Markdown-Overkill).
- Aktualisiere "covered" (alle bisher sauber erklärten Begriffe aus der Konzeptliste), "missing" (noch offene Konzepte), "misconceptions" (falls etwas fachlich falsch erklärt wurde, max. 2 kurze Hinweise), "score" (0–100 Verständnisgrad) und "done" (true ab >= 85 % Abdeckung).
- Wenn Lücken oder Fehlvorstellungen auffallen, liefere bis zu 3 präzise "gapCards" ({"front":"...","back":"..."}), die genau diese Lücken schließen.
Antworte ausschließlich als JSON:
{"reply":"...","covered":["..."],"missing":["..."],"misconceptions":[],"score":45,"done":false,"gapCards":[{"front":"...","back":"..."}]}`;

  const user = `${context}\n\nBisher schon abgedeckt: ${prevCovered.length ? prevCovered.join(', ') : 'noch nichts'}\n\nBisheriges Gespräch:\n${transcript}`;
  const raw = await completeJson<Record<string, unknown>>(system, user, 900, 'chat');
  return parseFeynmanReply(raw, concepts);
}
