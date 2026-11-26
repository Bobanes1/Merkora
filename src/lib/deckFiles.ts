/** The original material files of decks, skills, and courses (PDF, Word, PowerPoint, text …): stored once in media store, linkable everywhere without duplicating blobs. */
import { mediaGet, mediaPutMany } from './db';
import { fileKind, mimeOf } from './fileKind';
import { readFileText } from './files';
import { addCourseMaterials, collectMediaGarbage, updateDeck, updateSkill, type CourseMaterial, type DeckFile } from './store';
import { uid } from './util';

/** Stores the material files with the deck (a file with the same name replaces the older one). Returns how many. */
export async function attachFiles(deckId: string, files: File[]): Promise<number> {
  const keep = files.filter((f) => fileKind(f.name, f.type) !== 'other');
  if (!keep.length) return 0;
  const recs = keep.map((f) => ({ id: 'mat-' + uid(), f, type: mimeOf(f.name, f.type) }));
  await mediaPutMany(recs.map(({ id, f, type }) => ({ id, rec: { blob: f, name: f.name, type } })));
  const added: DeckFile[] = recs.map(({ id, f, type }) => ({ id, name: f.name, size: f.size, addedAt: Date.now(), type }));
  // a replaced file is cleaned up later (not now: pictures of cards being made may not be saved on a card yet)
  updateDeck(deckId, (d) => ({ files: [...(d.files ?? []).filter((x) => !added.some((a) => a.name === x.name)), ...added] }));
  return added.length;
}
/** @deprecated older name – all material files are kept now */
export const attachPdfs = attachFiles;

/** Links already-stored media files to a deck without copying the binary blobs. */
export function linkExistingFilesToDeck(deckId: string, files: DeckFile[]) {
  if (!files.length) return;
  updateDeck(deckId, (d) => {
    const existing = d.files ?? [];
    const next = [...existing];
    for (const f of files) {
      if (next.some((x) => x.id === f.id || x.name === f.name)) continue;
      next.push(f);
    }
    return { files: next };
  });
}

/** PDFs of a deck (for the slide view and slide pictures on cards). */
export const pdfFiles = (files: DeckFile[] = []) => files.filter((f) => fileKind(f.name, f.type ?? 'application/pdf') === 'pdf');

/** Removes a file from the deck (the text taken from it stays in the material). */
export function removeDeckFile(deckId: string, id: string) {
  updateDeck(deckId, (d) => ({ files: (d.files ?? []).filter((x) => x.id !== id) }));
  void collectMediaGarbage();
}

/** The stored file, or null if it is missing (e.g. not synced to this device yet). */
export async function deckFileBlob(id: string): Promise<Blob | null> {
  const r = await mediaGet(id).catch(() => undefined);
  return r?.blob ?? null;
}

/** Stores the material files of a skill (same as for decks; a file with the same name replaces the older one). */
export async function attachSkillFiles(skillId: string, files: File[]): Promise<number> {
  const keep = files.filter((f) => fileKind(f.name, f.type) !== 'other');
  if (!keep.length) return 0;
  const recs = keep.map((f) => ({ id: 'mat-' + uid(), f, type: mimeOf(f.name, f.type) }));
  await mediaPutMany(recs.map(({ id, f, type }) => ({ id, rec: { blob: f, name: f.name, type } })));
  const added: DeckFile[] = recs.map(({ id, f, type }) => ({ id, name: f.name, size: f.size, addedAt: Date.now(), type }));
  updateSkill(skillId, (s) => ({ files: [...(s.files ?? []).filter((x) => !added.some((a) => a.name === x.name)), ...added] }));
  return added.length;
}

/** Links already-stored media files to a skill without copying the binary blobs. */
export function linkExistingFilesToSkill(skillId: string, files: DeckFile[]) {
  if (!files.length) return;
  updateSkill(skillId, (s) => {
    const existing = s.files ?? [];
    const next = [...existing];
    for (const f of files) {
      if (next.some((x) => x.id === f.id || x.name === f.name)) continue;
      next.push(f);
    }
    return { files: next };
  });
}

/** Removes a file from the skill (the text taken from it stays in the material). */
export function removeSkillFile(skillId: string, id: string) {
  updateSkill(skillId, (s) => ({ files: (s.files ?? []).filter((x) => x.id !== id) }));
  void collectMediaGarbage();
}

/**
 * Uploads files directly into a course/module Materialbox:
 * extracts their text once and stores each binary file once in the media store.
 */
export async function uploadCourseFiles(
  courseId: string,
  files: File[],
  onProgress?: (done: number, total: number, name: string, detail?: string) => void,
): Promise<{ added: CourseMaterial[]; failed: string[] }> {
  const added: CourseMaterial[] = [];
  const failed: string[] = [];
  const mediaBatch: { id: string; rec: { blob: Blob; name: string; type: string } }[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i, files.length, f.name);
    let text = '';
    try {
      text = (await readFileText(f, (detail) => onProgress?.(i, files.length, f.name, detail))).trim();
    } catch (e) {
      failed.push(`${f.name}: ${(e as Error).message}`);
      continue;
    }
    const kind = fileKind(f.name, f.type);
    const id = 'mat-' + uid();
    const type = mimeOf(f.name, f.type);
    const isFile = kind !== 'other';
    if (isFile) {
      mediaBatch.push({ id, rec: { blob: f, name: f.name, type } });
    }
    added.push({
      id,
      name: f.name,
      size: f.size,
      addedAt: Date.now(),
      type,
      text,
      isFile,
    });
  }

  if (mediaBatch.length) {
    await mediaPutMany(mediaBatch);
  }
  if (added.length) {
    addCourseMaterials(courseId, added);
  }
  return { added, failed };
}

/** Saves a pasted text / lecture notes block into the course's Materialbox. */
export function addCourseTextNote(courseId: string, title: string, rawText: string): CourseMaterial | null {
  const text = rawText.trim();
  if (!text) return null;
  const item: CourseMaterial = {
    id: 'txt-' + uid(),
    name: title.trim() || 'Notizen',
    size: text.length,
    addedAt: Date.now(),
    type: 'text/plain',
    text,
    isFile: false,
  };
  addCourseMaterials(courseId, [item]);
  return item;
}

/** Converts a file-backed CourseMaterial into a DeckFile reference (reusing the same media ID). */
export function materialAsDeckFile(m: { id: string; name: string; size: number; addedAt?: number; type?: string; isFile?: boolean }): DeckFile | null {
  if (!m.isFile) return null;
  return { id: m.id, name: m.name, size: m.size, addedAt: m.addedAt ?? Date.now(), type: m.type };
}
