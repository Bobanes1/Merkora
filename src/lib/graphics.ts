/** Graphics on cards: SVG diagrams made by the AI, stored like any other card picture. */
import DOMPurify from 'dompurify';
import { complete, LANG_RULE, AiError } from './ai';
import { escapeHtml } from './content';
import { mediaPutMany } from './db';
import type { NewCard } from './store';
import { uid } from './util';

/** Pulls the <svg>…</svg> out of an AI answer and removes anything active (scripts, links, events). */
export function cleanSvg(text: string): string | null {
  const m = /<svg[\s\S]*<\/svg>/i.exec(text.replace(/```(?:svg|xml|html)?/gi, ''));
  if (!m) return null;
  let svg = DOMPurify.sanitize(m[0], { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['a', 'foreignObject', 'image', 'use', 'script'] });
  if (!/^<svg/i.test(svg.trim())) return null;
  if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}

export async function storeSvg(svg: string): Promise<string> {
  const id = uid();
  await mediaPutMany([{ id, rec: { blob: new Blob([svg], { type: 'image/svg+xml' }), name: 'grafik.svg', type: 'image/svg+xml' } }]);
  return id;
}

export const GRAPHIC_STYLES = [
  { id: 'diagramm', label: 'Diagramm / Schaubild', hint: 'ein klares, beschriftetes Schaubild mit Pfeilen und Kästen' },
  { id: 'abbildung', label: 'Beschriftete Abbildung', hint: 'eine vereinfachte, beschriftete Abbildung (z. B. Aufbau eines Objekts)' },
  { id: 'mindmap', label: 'Mindmap', hint: 'eine Mindmap mit dem Begriff in der Mitte und 4–6 Ästen' },
  { id: 'zeitstrahl', label: 'Zeitstrahl / Ablauf', hint: 'einen Zeitstrahl oder Ablauf mit nummerierten Schritten' },
  { id: 'kurve', label: 'Graph / Kurve', hint: 'ein Koordinatensystem mit beschrifteten Achsen und der passenden Kurve' },
  { id: 'vergleich', label: 'Vergleich / Tabelle', hint: 'eine Gegenüberstellung in zwei oder drei Spalten' },
] as const;

const SVG_RULES = `Regeln für das SVG: Nur ein einziges <svg>-Element mit xmlns und viewBox="0 0 800 500", keine Skripte, keine externen Bilder oder Schriften, keine <foreignObject>.
Nutze font-family="Arial, sans-serif", gut lesbare Schriftgrößen (mindestens 18), freundliche Farben (Lila #09817e, Hellviolett #d8f0ef, Gelb #f2b84b, Grün #02b6b2, Blau #4aa8ff, Text #002a29) auf weißem Hintergrund.
Beschriftungen kurz halten, nichts darf sich überlappen oder aus dem Bild ragen.`;

/** Asks the AI for one SVG graphic. */
export async function generateGraphic(topic: string, style: string): Promise<string> {
  const s = GRAPHIC_STYLES.find((x) => x.id === style) ?? GRAPHIC_STYLES[0];
  const text = await complete([{ role: 'user', content: `Zeichne ${s.hint} zu: ${topic}` }], {
    system: `Du bist ein Illustrator für Lernkarten und antwortest ausschließlich mit SVG-Code, ohne Erklärtext. ${LANG_RULE}\n${SVG_RULES}`,
    maxTokens: 6000,
  });
  const svg = cleanSvg(text);
  if (!svg) throw new AiError('Die KI hat keine gültige Grafik geliefert. Versuch es noch einmal oder wähle eine andere Darstellung.');
  return svg;
}

export const CARD_GRAPHIC_RULE = `Wo eine Grafik das Verständnis wirklich verbessert (etwa bei jeder dritten Karte), ergänze das Feld "svg" mit einer kleinen SVG-Grafik für die Rückseite (viewBox="0 0 400 260", xmlns, keine Skripte, Schrift Arial ab Größe 14, Farben #09817e, #f2b84b, #02b6b2, #002a29 auf Weiß, kurze Beschriftungen). Sonst lass "svg" weg.`;

/** Turns AI cards that may carry an SVG into stored, picture-carrying cards. */
export async function withGraphics(cards: { front: string; back: string; svg?: string }[]): Promise<NewCard[]> {
  const out: NewCard[] = [];
  for (const c of cards) {
    const svg = c.svg ? cleanSvg(c.svg) : null;
    if (!svg) {
      out.push({ front: c.front, back: c.back });
      continue;
    }
    const id = await storeSvg(svg);
    out.push({
      front: escapeHtml(c.front).replace(/\n/g, '<br>'),
      back: `${escapeHtml(c.back).replace(/\n/g, '<br>')}<br><img data-media="${id}" alt="Grafik">`,
      html: true,
    });
  }
  return out;
}
