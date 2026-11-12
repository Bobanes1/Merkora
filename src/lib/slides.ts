/**
 * Models and figures straight from PDF lecture slides: Merkora finds the slides that show a figure,
 * marks them in the text for the AI, and the AI only names the figure a card belongs to ("figure": 7).
 * Merkora then attaches a picture of exactly that slide. No pictures are sent to the AI.
 * Pure – tested in scripts/test-srs.mts.
 */

/** What pdf.js tells about one slide: its pictures (by size, so a logo is the same everywhere) and how many shapes it draws. */
export type PageStats = { images: string[]; paths: number };

/**
 * Slides that show a figure (a picture or many drawn shapes). Things of the slide template are ignored:
 * a picture that appears on more than half of the slides (logo, header) and the usual amount of lines.
 */
export function pickFigurePages(stats: PageStats[]): number[] {
  const n = stats.length;
  if (!n) return [];
  const seen = new Map<string, number>();
  for (const s of stats) for (const k of new Set(s.images)) seen.set(k, (seen.get(k) ?? 0) + 1);
  const template = new Set([...seen].filter(([, c]) => n >= 4 && c > n / 2).map(([k]) => k));
  const sorted = stats.map((s) => s.paths).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = median + Math.max(12, median * 0.5);
  const out: number[] = [];
  stats.forEach((s, i) => {
    const ownImage = s.images.some((k) => !template.has(k));
    if (ownImage || s.paths >= threshold) out.push(i + 1);
  });
  return out;
}

export type FigureRef = { file: string; page: number };
export type PdfDoc = { name: string; pages: string[]; figures: number[] };

/**
 * Puts a marker like "[Abbildung 7 – Folie 12 aus Sitzung1.pdf]" before every slide with a figure.
 * Numbers run through all files. Returns the text per file and which number is which slide.
 */
export function markFigures(docs: PdfDoc[]): { texts: { name: string; text: string }[]; figures: Record<number, FigureRef> } {
  const figures: Record<number, FigureRef> = {};
  let k = 0;
  const texts = docs.map((d) => {
    const figs = new Set(d.figures);
    const pages = d.pages.map((p, i) => {
      if (!figs.has(i + 1)) return p;
      k++;
      figures[k] = { file: d.name, page: i + 1 };
      return `[Abbildung ${k} – Folie ${i + 1} aus ${d.name}]\n${p}`;
    });
    return { name: d.name, text: pages.filter((p) => p.trim()).join('\n\n') };
  });
  return { texts, figures };
}

export const FIGURE_RULE = `Im Material sind Folien mit Abbildungen markiert, z. B. „[Abbildung 7 – Folie 12 aus Datei.pdf]“. Wenn die Antwort einer Karte ein Modell, Schaubild, Diagramm oder eine Abbildung von so einer markierten Folie betrifft und die Folie diese Antwort zeigt, ergänze "figure": 7 (die Nummer der Abbildung). Merkora hängt dann ein Bild genau dieser Folie an. Sonst lass "figure" weg. Wenn "figure" passt, lass "diagram" weg.`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const figureLabel = (f: FigureRef) => `Folie ${f.page} · ${f.file}`;

/** The slide picture on a card's back. */
export const figureHtml = (mediaId: string, label: string) =>
  `<figure class="slide-figure"><img class="slide-img" data-media="${esc(mediaId)}" alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>`;
