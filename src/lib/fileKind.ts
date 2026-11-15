/** What kind of material file this is (for the icon and the viewer). Pure – tested in scripts/test-srs.mts. */
export type FileKind = 'pdf' | 'word' | 'powerpoint' | 'odt' | 'odp' | 'markdown' | 'csv' | 'html' | 'text' | 'other';

export function fileKind(name: string, type = ''): FileKind {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/) ?? [])[1] ?? '';
  const t = type.toLowerCase();
  if (ext === 'pdf' || t === 'application/pdf') return 'pdf';
  if (ext === 'docx' || t.includes('wordprocessingml')) return 'word';
  if (ext === 'pptx' || t.includes('presentationml')) return 'powerpoint';
  if (ext === 'odt') return 'odt';
  if (ext === 'odp') return 'odp';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'csv') return 'csv';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'txt' || t.startsWith('text/')) return 'text';
  return 'other';
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  word: 'Word',
  powerpoint: 'PowerPoint',
  odt: 'Text-Dokument',
  odp: 'Präsentation',
  markdown: 'Markdown',
  csv: 'Tabelle',
  html: 'Webseite',
  text: 'Text',
  other: 'Datei',
};

const MIME: Partial<Record<FileKind, string>> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  powerpoint: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  markdown: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  text: 'text/plain',
};
export const mimeOf = (name: string, type = '') => type || MIME[fileKind(name, type)] || 'application/octet-stream';
