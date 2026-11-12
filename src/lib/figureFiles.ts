/**
 * The PDF files of one "Mit KI erstellen" run, kept for this session so that also background jobs can
 * turn a slide into a picture once the AI has named it. After a restart the files are gone – then the
 * card simply has no slide picture.
 */
import { mediaPutMany } from './db';
import { renderPdfPage } from './files';
import { figureHtml, figureLabel, type FigureRef } from './slides';
import { uid } from './util';

type FigureSet = { files: Record<string, File>; figures: Record<number, FigureRef>; stored: Map<number, Promise<string | null>> };
const sets = new Map<string, FigureSet>();

export function registerFigures(files: Record<string, File>, figures: Record<number, FigureRef>): string {
  const id = uid();
  sets.set(id, { files, figures, stored: new Map() });
  return id;
}

/** HTML with the picture of slide `num`, or '' if it is unknown or cannot be made. Each slide is stored once. */
export async function figureForCard(setId: string | undefined, num: unknown): Promise<string> {
  const set = setId ? sets.get(setId) : undefined;
  const n = Number(num);
  const ref = set?.figures[n];
  if (!set || !ref) return '';
  const file = set.files[ref.file];
  if (!file) return '';
  if (!set.stored.has(n))
    set.stored.set(
      n,
      (async () => {
        try {
          const blob = await renderPdfPage(file, ref.page);
          const id = uid();
          await mediaPutMany([{ id, rec: { blob, name: `folie-${ref.page}.jpg`, type: 'image/jpeg' } }]);
          return id;
        } catch {
          return null;
        }
      })(),
    );
  const id = await set.stored.get(n)!;
  return id ? figureHtml(id, figureLabel(ref)) : '';
}

/** Label of a figure (for the review list before saving). */
export function figureInfo(setId: string | undefined, num: unknown): FigureRef | null {
  return (setId && sets.get(setId)?.figures[Number(num)]) || null;
}

/** A picture of the slide for a quick look (not stored). */
export async function figurePreview(setId: string | undefined, num: unknown): Promise<Blob | null> {
  const set = setId ? sets.get(setId) : undefined;
  const ref = set?.figures[Number(num)];
  const file = ref && set?.files[ref.file];
  return file ? renderPdfPage(file, ref.page, 700).catch(() => null) : null;
}
