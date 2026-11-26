import { isImageFile, ocrImageBlob, ocrPdfPages } from './ocr';
import { pagesToIndexedText, stripRepeatedLines } from './pdfText';

/** File types the AI card creation & Materialbox can read (including photos/scans via Offline-OCR). */
export const MATERIAL_ACCEPT =
  '.pdf,.docx,.pptx,.odt,.odp,.png,.jpg,.jpeg,.webp,.bmp,.txt,.md,.markdown,.csv,.html,.htm,text/*,image/png,image/jpeg,image/webp,image/bmp,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const MATERIAL_LABEL = 'PDF, Word, PowerPoint, Fotos/Scans (Offline-OCR), Text oder Markdown';

/** Reads text from a PDF, Word, PowerPoint, OpenDocument, photo/scan (Offline-OCR), text or Markdown file on this device. */
export async function readFileText(file: File, onProgress?: (status: string) => void): Promise<string> {
  const name = file.name.toLowerCase();
  if (isImageFile(file)) {
    const res = await ocrImageBlob(file, { onProgress });
    if (!res.text) throw new Error('Auf diesem Bild wurde kein lesbarer Text erkannt.');
    return res.text;
  }
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
    const { doc } = await loadPdf(file);
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
      pages.push(lines.join('\n').trim());
    }
    // Automatically run Offline-OCR on scanned/image-only pages when little or no embedded text exists
    const emptyPageNums = pages.map((p, idx) => (p.length < 25 ? idx + 1 : 0)).filter(Boolean);
    const totalChars = pages.reduce((n, p) => n + p.length, 0);
    if (emptyPageNums.length > 0 && (totalChars < 40 || emptyPageNums.length >= Math.ceil(doc.numPages * 0.5))) {
      const ocrPages = await ocrPdfPages(doc as never, emptyPageNums, { onProgress });
      for (const [pageNum, txt] of ocrPages) {
        if (txt && txt.length > pages[pageNum - 1].length) pages[pageNum - 1] = txt;
      }
    }
    // headers / footers repeated on every slide are left out; page anchors stay attached for Living Script Studio
    const text = pagesToIndexedText(stripRepeatedLines(pages));
    if (!text) throw new Error('In diesem PDF wurde auch per Offline-OCR kein Text gefunden.');
    return text;
  }
  if (/\.(txt|md|markdown|csv|json|html?)$/.test(name) || file.type.startsWith('text/')) {
    const text = await file.text();
    return name.endsWith('.html') || name.endsWith('.htm')
      ? new DOMParser().parseFromString(text, 'text/html').body.innerText
      : text;
  }
  throw new Error('Dieses Dateiformat wird nicht unterstützt. Nutze PDF, Word (.docx), PowerPoint (.pptx), Fotos/Scans (PNG/JPG), TXT oder Markdown.');
}

export const isPdf = (file: File) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

async function loadPdf(file: Blob) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return { pdfjs, doc: await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise };
}

/**
 * PDF with the text of every slide and what each slide draws (pictures by size, number of shapes) –
 * used to find slides that show a model or figure (see lib/slides.ts).
 */
export async function readPdfDetailed(
  file: File,
  onProgress?: (status: string) => void,
): Promise<{ pages: string[]; stats: { images: string[]; paths: number }[] }> {
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
  const emptyPageNums = pages.map((p, idx) => (p.length < 25 ? idx + 1 : 0)).filter(Boolean);
  if (emptyPageNums.length > 0 && (!pages.some((p) => p.length >= 25) || emptyPageNums.length >= Math.ceil(doc.numPages * 0.5))) {
    const ocrPages = await ocrPdfPages(doc as never, emptyPageNums, { onProgress });
    for (const [pageNum, txt] of ocrPages) {
      if (txt && txt.length > pages[pageNum - 1].length) pages[pageNum - 1] = txt;
    }
  }
  if (!pages.some((p) => p)) throw new Error('In diesem PDF wurde auch per Offline-OCR kein Text gefunden.');
  return { pages: stripRepeatedLines(pages), stats };
}

/** A picture of one PDF slide (JPEG, about 1400 px wide). */
export async function renderPdfPage(file: Blob, pageNo: number, width = 1400): Promise<Blob> {
  const { doc } = await loadPdf(file);
  return renderPage(doc, pageNo, width);
}

/** Normalized [0..1] text span for interactive selection inside Living Script Studio. */
export type PdfTextSpan = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** An opened PDF for leafing through its slides (loaded once, every slide rendered on demand). */
export async function openPdf(file: Blob): Promise<{
  pages: number;
  render: (pageNo: number, width?: number, background?: boolean) => Promise<Blob>;
  getPageTextItems: (pageNo: number) => Promise<PdfTextSpan[]>;
  cropPageRect: (pageNo: number, rect: { x: number; y: number; w: number; h: number }, width?: number) => Promise<Blob>;
  close: () => void;
}> {
  const { doc } = await loadPdf(file);
  return {
    pages: doc.numPages,
    render: (n, w = 1400, bg = false) => renderPage(doc, n, w, bg),
    getPageTextItems: (n) => extractPageSpans(doc, n),
    cropPageRect: (n, rect, w = 1600) => cropPage(doc, n, rect, w),
    close: () => void doc.destroy(),
  };
}

/** Extracts normalized [0..1] positioned text spans from a PDF page for selectable overlay. */
async function extractPageSpans(doc: Awaited<ReturnType<typeof loadPdf>>['doc'], pageNo: number): Promise<PdfTextSpan[]> {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const spans: PdfTextSpan[] = [];
  for (const raw of content.items as { str?: string; width?: number; height?: number; transform?: number[] }[]) {
    const str = raw.str ?? '';
    if (!str.trim() || !raw.transform) continue;
    const tx = raw.transform;
    const fontH = Math.hypot(tx[2], tx[3]) || Math.abs(raw.height ?? 12) || 12;
    const xPt = tx[4];
    const yPt = tx[5];
    const wPt = Math.max(fontH * 0.4, raw.width ?? str.length * fontH * 0.5);
    // PDF origin is bottom-left; convert to top-left normalized [0..1]
    const x = Math.max(0, Math.min(1, xPt / vp.width));
    const y = Math.max(0, Math.min(1, (vp.height - yPt - fontH * 0.9) / vp.height));
    const w = Math.max(0.005, Math.min(1 - x, wPt / vp.width));
    const h = Math.max(0.01, Math.min(1 - y, (fontH * 1.15) / vp.height));
    spans.push({ str, x, y, w, h });
  }
  page.cleanup();
  return spans;
}

/** Renders a cropped region [0..1] of a PDF page as a crisp JPEG Blob (for Snip → Card / Image Occlusion). */
async function cropPage(
  doc: Awaited<ReturnType<typeof loadPdf>>['doc'],
  pageNo: number,
  rect: { x: number; y: number; w: number; h: number },
  width: number,
): Promise<Blob> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const full = document.createElement('canvas');
  full.width = Math.round(viewport.width);
  full.height = Math.round(viewport.height);
  const fctx = full.getContext('2d')!;
  fctx.fillStyle = '#ffffff';
  fctx.fillRect(0, 0, full.width, full.height);
  await page.render({ canvasContext: fctx, viewport, canvas: full } as never).promise;
  page.cleanup();

  const sx = Math.max(0, Math.round(rect.x * full.width));
  const sy = Math.max(0, Math.round(rect.y * full.height));
  const sw = Math.max(16, Math.min(full.width - sx, Math.round(rect.w * full.width)));
  const sh = Math.max(16, Math.min(full.height - sy, Math.round(rect.h * full.height)));
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const octx = out.getContext('2d')!;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, sw, sh);
  octx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Ausschnitt konnte nicht gespeichert werden.'))), 'image/jpeg', 0.9));
}

/** `background`: drawn without waiting for screen frames (they stop while the app is hidden) – for pictures sent to the AI. */
async function renderPage(doc: Awaited<ReturnType<typeof loadPdf>>['doc'], pageNo: number, width: number, background = false): Promise<Blob> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas, ...(background ? { intent: 'print' } : {}) } as never).promise;
  page.cleanup();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Folie konnte nicht als Bild gespeichert werden.'))), 'image/jpeg', 0.85));
}
