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

export const isPdf = (file: File) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

async function loadPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return { pdfjs, doc: await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise };
}

/**
 * PDF with the text of every slide and what each slide draws (pictures by size, number of shapes) –
 * used to find slides that show a model or figure (see lib/slides.ts).
 */
export async function readPdfDetailed(file: File): Promise<{ pages: string[]; stats: { images: string[]; paths: number }[] }> {
  const { pdfjs, doc } = await loadPdf(file);
  const OPS = pdfjs.OPS as Record<string, number>;
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat].filter((x) => x !== undefined));
  const pages: string[] = [];
  const stats: { images: string[]; paths: number }[] = [];
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
    pages.push(lines.join('\n').replace(/[ \t]+\n/g, '\n').trim());
    const ops = await page.getOperatorList();
    const images: string[] = [];
    let paths = 0;
    ops.fnArray.forEach((fn, k) => {
      if (imageOps.has(fn)) {
        const a = ops.argsArray[k] as unknown[];
        // a logo has the same size on every slide; the size is a stable key (object ids change per slide)
        const w = typeof a?.[1] === 'number' ? a[1] : (a?.[0] as { width?: number })?.width;
        const h = typeof a?.[2] === 'number' ? a[2] : (a?.[0] as { height?: number })?.height;
        images.push(`${w ?? '?'}x${h ?? '?'}`);
      } else if (fn === OPS.constructPath) paths++;
    });
    stats.push({ images, paths });
    page.cleanup();
  }
  if (!pages.some((p) => p)) throw new Error('In diesem PDF wurde kein Text gefunden (vielleicht ist es eingescannt).');
  return { pages, stats };
}

/** A picture of one PDF slide (JPEG, about 1400 px wide). */
export async function renderPdfPage(file: File, pageNo: number, width = 1400): Promise<Blob> {
  const { doc } = await loadPdf(file);
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
  page.cleanup();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Folie konnte nicht als Bild gespeichert werden.'))), 'image/jpeg', 0.85));
}
