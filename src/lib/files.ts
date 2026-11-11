/** File types the AI card creation can read. */
export const MATERIAL_ACCEPT =
  '.pdf,.docx,.pptx,.odt,.odp,.txt,.md,.markdown,.csv,.html,.htm,text/*,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const MATERIAL_LABEL = 'PDF, Word, PowerPoint, Text oder Markdown';

/** Reads text from a PDF, Word, PowerPoint, OpenDocument, text or Markdown file on this device (nothing is uploaded). */
export async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (/\.(docx|pptx|odt|odp)$/.test(name)) {
    const [{ unzipSync }, { officeText }] = await Promise.all([import('fflate'), import('./officeText')]);
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new Error('Die Datei konnte nicht geöffnet werden (beschädigt oder mit Passwort geschützt?).');
    }
    return officeText(name, files);
  }
  if (/\.(doc|ppt)$/.test(name))
    throw new Error('Alte Word-/PowerPoint-Dateien (.doc/.ppt) werden nicht unterstützt. Speichere sie bitte als .docx bzw. .pptx (Datei › Speichern unter).');
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        line += item.str ?? '';
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\n'));
    }
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new Error('In diesem PDF wurde kein Text gefunden (vielleicht ist es eingescannt).');
    return text;
  }
  if (/\.(txt|md|markdown|csv|json|html?)$/.test(name) || file.type.startsWith('text/')) {
    const text = await file.text();
    return name.endsWith('.html') || name.endsWith('.htm')
      ? new DOMParser().parseFromString(text, 'text/html').body.innerText
      : text;
  }
  throw new Error('Dieses Dateiformat wird nicht unterstützt. Nutze PDF, Word (.docx), PowerPoint (.pptx), TXT oder Markdown.');
}
