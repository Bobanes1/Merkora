/**
 * Slide pictures for the AI: PDF slides that show a figure (diagram, model, chart, table) are marked in the
 * text ("[Abbildung 7 – Folie 12 aus Datei.pdf]", lib/slides.ts). For each part of the material, the marked
 * slides of that part are rendered as small JPEGs and sent along – so a model that can read images sees the
 * graphics instead of only their scattered words.
 * slidesInPart and the rule are pure – tested in scripts/test-srs.mts.
 */

/** At most this many slide pictures per request (cost and request size stay reasonable). */
export const MAX_SLIDE_IMAGES = 8;

export type SlideRef = { file: string; page: number };

/** The marked slides of one part of the material, in order, without repeats (at most `max`). */
export function slidesInPart(text: string, max = MAX_SLIDE_IMAGES): SlideRef[] {
  const out: SlideRef[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[Abbildung \d+ – Folie (\d+) aus ([^\]\n]+)\]/g)) {
    const ref = { file: m[2].trim(), page: Number(m[1]) };
    const key = ref.file + '#' + ref.page;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
}

export const slideLabel = (s: SlideRef) => `Folie ${s.page} aus ${s.file}`;

/** What the AI is told when slide pictures are attached. */
export const SLIDE_IMAGE_RULE =
  'Angehängt sind Bilder von Folien aus dem Material (welche, steht am Ende der Anfrage). Nutze, was sie zeigen – Diagramme, Modelle, Abläufe, Tabellen, Kurven –, auch wenn es im Text nur bruchstückhaft steht. Zeigt eine Folie ein Modell, einen Ablauf, eine Gliederung oder Zahlen, mache dazu eine Karte und zeichne es als "diagram" nach (passende Form wählen, Beschriftungen von der Folie).';

const toBase64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/**
 * Renders the slides as JPEG data addresses (1024 px wide). Files are looked up by name; a missing file or
 * slide is skipped. Returns the pictures with their labels in the same order.
 */
export async function renderSlides(
  slides: SlideRef[],
  fileByName: (name: string) => Promise<Blob | null | undefined>,
  width = 1024,
): Promise<{ label: string; url: string }[]> {
  if (!slides.length) return [];
  const { openPdf } = await import('./files');
  const out: { label: string; url: string }[] = [];
  const docs = new Map<string, Awaited<ReturnType<typeof openPdf>> | null>();
  try {
    for (const s of slides) {
      if (!docs.has(s.file)) {
        const blob = await fileByName(s.file).catch(() => null);
        docs.set(s.file, blob ? await openPdf(blob).catch(() => null) : null);
      }
      const doc = docs.get(s.file);
      if (!doc || s.page < 1 || s.page > doc.pages) continue;
      try {
        const jpg = await doc.render(s.page, width, true);
        out.push({ label: slideLabel(s), url: 'data:image/jpeg;base64,' + toBase64(new Uint8Array(await jpg.arrayBuffer())) });
      } catch {
        /* this slide cannot be drawn: leave it out */
      }
    }
  } finally {
    for (const d of docs.values()) d?.close();
  }
  return out;
}
