/**
 * The uploaded documents and module-level materials of a whole course.
 * Pure – tested in scripts/test-srs.mts.
 */
type DocDeck = { id: string; name: string; courseId: string; folderId?: string; source?: string; files?: { id: string; name: string; size: number; type?: string }[] };
type CourseMatLike = { id: string; name: string; size: number; addedAt: number; type?: string; text: string; isFile?: boolean };

export type CourseDoc = { fileId: string; name: string; size: number; type?: string; deckId: string; deckName: string; folder?: string };
export type TextMaterial = { deckId: string; deckName: string; folder?: string; chars: number };

/** Unified selectable material item inside a course's Materialbox (module-level or deck-attached). */
export type ModuleMaterialItem = {
  /** Unique selection key ('mat:<id>' for course material, 'deck:<deckId>:<fileId>' or 'text:<deckId>'). */
  key: string;
  id: string;
  name: string;
  size: number;
  type?: string;
  text: string;
  isFile: boolean;
  origin: 'course' | 'deck';
  deckId?: string;
  deckName?: string;
  folder?: string;
  addedAt?: number;
};

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
  const files = ordered.flatMap((d) => (d.files ?? []).map((f) => ({ fileId: f.id, name: f.name, size: f.size, type: f.type, deckId: d.id, deckName: d.name, folder: folderName(d) })));
  const texts = ordered
    .filter((d) => !(d.files ?? []).length && (d.source ?? '').trim())
    .map((d) => ({ deckId: d.id, deckName: d.name, folder: folderName(d), chars: (d.source ?? '').trim().length }));
  return { files, texts };
}

/**
 * Combines course-level materials (`course.materials`) with deck-attached files/texts,
 * deduplicating any file ID that already lives in the course's Materialbox.
 */
export function unifiedCourseMaterials(
  course: { id: string; folders?: { id: string; name: string }[]; materials?: CourseMatLike[] },
  decks: DocDeck[],
): ModuleMaterialItem[] {
  const out: ModuleMaterialItem[] = [];
  const seenFileIds = new Set<string>();

  for (const m of course.materials ?? []) {
    if (m.isFile) seenFileIds.add(m.id);
    out.push({
      key: `mat:${m.id}`,
      id: m.id,
      name: m.name,
      size: m.size,
      type: m.type,
      text: m.text,
      isFile: Boolean(m.isFile),
      origin: 'course',
      addedAt: m.addedAt,
    });
  }

  const { files, texts } = courseDocs(course, decks);
  const deckById = new Map(decks.map((d) => [d.id, d]));

  for (const f of files) {
    if (seenFileIds.has(f.fileId)) continue;
    seenFileIds.add(f.fileId);
    const d = deckById.get(f.deckId);
    out.push({
      key: `deck:${f.deckId}:${f.fileId}`,
      id: f.fileId,
      name: f.name,
      size: f.size,
      type: f.type,
      text: (d?.source ?? '').trim(),
      isFile: true,
      origin: 'deck',
      deckId: f.deckId,
      deckName: f.deckName,
      folder: f.folder,
    });
  }

  for (const t of texts) {
    const d = deckById.get(t.deckId);
    out.push({
      key: `text:${t.deckId}`,
      id: t.deckId,
      name: `${t.deckName} (Text)`,
      size: t.chars,
      type: 'text/plain',
      text: (d?.source ?? '').trim(),
      isFile: false,
      origin: 'deck',
      deckId: t.deckId,
      deckName: t.deckName,
      folder: t.folder,
    });
  }

  return out;
}

/** Strips file extensions for clean deck or skill titles ("VL01_Biologie.pdf" -> "VL01_Biologie"). */
export const stemOfName = (name: string) => name.replace(/\.[^.]{1,8}$/, '').trim() || name.trim();

/** Combines selected material items into one deduplicated text block for AI deck or skill generation. */
export function combineMaterialsText(items: readonly { name: string; text: string }[], maxChars?: number): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const it of items) {
    const t = it.text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    parts.push(items.length > 1 ? `=== ${it.name} ===\n${t}` : t);
  }
  const joined = parts.join('\n\n');
  return maxChars ? joined.slice(0, maxChars) : joined;
}

/** "2,4 MB" / "830 KB" */
export const fileSize = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
