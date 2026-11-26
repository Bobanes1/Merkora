/**
 * 100% Offline OCR (Tesseract 5 LSTM WebAssembly, German + English) for Merkora.
 * Reads textbook photos, whiteboard snapshots, screenshots, and scanned PDFs locally on the device
 * without any cloud API or internet connection.
 */

export type OcrLang = 'deu+eng' | 'deu' | 'eng';

export type OcrResult = {
  text: string;
  confidence: number;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

export function isImageFile(file: { name: string; type?: string }): boolean {
  return IMAGE_EXT.test(file.name) || (!!file.type && file.type.startsWith('image/') && file.type !== 'image/svg+xml');
}

/**
 * Cleans typical OCR artefacts: repairs soft line-break hyphenation (`Zell-\nmembran` -> `Zellmembran`),
 * strips form-feed characters, collapses stray spaces and excessive blank lines.
 * Pure – unit-tested in scripts/test-srs.mts.
 */
export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    // Rejoin German/English words split by a hyphen at end of line
    .replace(/([A-Za-zÄÖÜäöüß]{2,})-\n([a-zäöüß]{2,})/g, '$1$2')
    // Remove stray single-character noise lines (scanner specks like "|" or "~")
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter((line, idx, arr) => {
      if (!line) return idx > 0 && arr[idx - 1] !== '';
      if (line.length === 1 && !/[0-9A-Za-zÄÖÜäöüß]/.test(line)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- Persistent Worker Queue ----------

type Pending = { resolve: (r: OcrResult) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('Offline-OCR wird in dieser Umgebung nicht unterstützt.');
  }
  if (!worker) {
    worker = new Worker('/ocr/ocr-worker.js');
    worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; text?: string; confidence?: number; error?: string }>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve({ text: cleanOcrText(msg.text ?? ''), confidence: msg.confidence ?? 0 });
      else p.reject(new Error(msg.error || 'Offline-OCR fehlgeschlagen.'));
    };
    worker.onerror = (ev) => {
      const err = new Error(ev.message || 'Offline-OCR-Worker konnte nicht gestartet werden.');
      for (const [, p] of pending) p.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/** Releases the background OCR worker to free WASM memory when no longer needed. */
export function terminateOcrWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, p] of pending) p.reject(new Error('OCR abgebrochen.'));
  pending.clear();
}

/** Runs Offline-OCR on a rendered HTMLCanvasElement. */
export async function ocrCanvas(canvas: HTMLCanvasElement, lang: OcrLang = 'deu+eng'): Promise<OcrResult> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas-Kontext für OCR nicht verfügbar.');
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const copy = new Uint8Array(imgData.data.buffer.slice(0));
  const id = ++seq;
  const w = getWorker();
  return new Promise<OcrResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: 'recognize', rgba: copy.buffer, width, height, lang }, [copy.buffer]);
  });
}

/** Decodes an image Blob/File onto a crisp OCR-scaled canvas and recognizes text offline. */
export async function ocrImageBlob(
  blob: Blob,
  opts?: { lang?: OcrLang; onProgress?: (status: string) => void },
): Promise<OcrResult> {
  opts?.onProgress?.('Offline-OCR bereitet Bild vor …');
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Bild konnte für OCR nicht geladen werden.'));
      el.src = url;
    });
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) throw new Error('Leeres Bild.');

    // Optimal OCR scale: upscale small screenshots (< 1000px) and cap huge camera photos at 2400px
    const maxDim = Math.max(natW, natH);
    let scale = 1;
    if (maxDim < 1000) scale = Math.min(2.2, 1200 / maxDim);
    else if (maxDim > 2400) scale = 2400 / maxDim;

    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    opts?.onProgress?.('Offline-OCR erkennt Text …');
    return await ocrCanvas(canvas, opts?.lang ?? 'deu+eng');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Renders specific pages of a loaded pdf.js document to canvas and extracts text via Offline-OCR.
 * Used automatically when a PDF is scanned (contains images without an embedded text layer).
 */
export async function ocrPdfPages(
  doc: {
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number };
      render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
    }>;
  },
  pageNumbers: number[],
  opts?: { lang?: OcrLang; onProgress?: (status: string) => void },
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const total = pageNumbers.length;
  for (let i = 0; i < total; i++) {
    const pageNum = pageNumbers[i];
    opts?.onProgress?.(`Offline-OCR: Seite ${i + 1} / ${total} …`);
    const page = await doc.getPage(pageNum);
    const baseVp = page.getViewport({ scale: 1 });
    // Target ~1800px wide for crisp LSTM recognition without excessive memory usage
    const scale = Math.max(1.5, Math.min(2.6, 1800 / Math.max(baseVp.width, baseVp.height, 1)));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const res = await ocrCanvas(canvas, opts?.lang ?? 'deu+eng');
    if (res.text) results.set(pageNum, res.text);
  }
  return results;
}
