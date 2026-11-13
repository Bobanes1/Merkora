/**
 * The uploaded documents of a whole course (course page, "Dokumente").
 * Pure – tested in scripts/test-srs.mts.
 */
type DocDeck = { id: string; name: string; courseId: string; folderId?: string; source?: string; files?: { id: string; name: string; size: number }[] };

export type CourseDoc = { fileId: string; name: string; size: number; deckId: string; deckName: string; folder?: string };
export type TextMaterial = { deckId: string; deckName: string; folder?: string; chars: number };

/** PDFs of all decks in the course (folders first in their order, then decks without a folder), and decks with only text material. */
export function courseDocs(course: { id: string; folders?: { id: string; name: string }[] }, decks: DocDeck[]): { files: CourseDoc[]; texts: TextMaterial[] } {
  const folders = course.folders ?? [];
  const mine = decks.filter((d) => d.courseId === course.id);
  const inFolder = (d: DocDeck) => folders.findIndex((f) => f.id === d.folderId);
  const ordered = [
    ...folders.flatMap((f) => mine.filter((d) => d.folderId === f.id)),
    ...mine.filter((d) => inFolder(d) < 0),
  ];
  const folderName = (d: DocDeck) => folders.find((f) => f.id === d.folderId)?.name;
  const files = ordered.flatMap((d) => (d.files ?? []).map((f) => ({ fileId: f.id, name: f.name, size: f.size, deckId: d.id, deckName: d.name, folder: folderName(d) })));
  const texts = ordered
    .filter((d) => !(d.files ?? []).length && (d.source ?? '').trim())
    .map((d) => ({ deckId: d.id, deckName: d.name, folder: folderName(d), chars: (d.source ?? '').trim().length }));
  return { files, texts };
}

/** "2,4 MB" / "830 KB" */
export const fileSize = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
