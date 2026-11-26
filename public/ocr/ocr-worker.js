// Merkora Offline-OCR Worker (Tesseract 5 LSTM WebAssembly – 100% offline, zero external requests)
/* eslint-disable no-restricted-globals */

let corePromise = null;
let loadedLangs = new Set();
let activeLang = null;
let api = null;

async function getCore() {
  if (!corePromise) {
    importScripts('./tesseract-core-lstm.js');
    corePromise = self.TesseractCore({
      locateFile: (file) => './' + file,
    });
  }
  return corePromise;
}

async function ensureLang(m, langCode) {
  const parts = langCode.split('+').filter(Boolean);
  try {
    m.FS.mkdir('/tessdata');
  } catch {
    // directory already exists
  }
  for (const code of parts) {
    if (loadedLangs.has(code)) continue;
    const res = await fetch(`./${code}.traineddata`);
    if (!res.ok) throw new Error(`OCR-Sprachpaket "${code}" fehlt (${res.status}).`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    m.FS.writeFile(`/tessdata/${code}.traineddata`, bytes);
    loadedLangs.add(code);
  }
  if (!api || activeLang !== langCode) {
    if (api) {
      try {
        api.End();
        m.destroy(api);
      } catch {
        // ignore cleanup error
      }
      api = null;
    }
    api = new m.TessBaseAPI();
    // OEM_LSTM_ONLY = 1 (matches tessdata_fast LSTM models)
    const rc = api.Init('/tessdata', langCode, 1);
    if (rc !== 0) throw new Error(`OCR-Initialisierung fehlgeschlagen (Code ${rc}).`);
    // PSM_AUTO = 3: automatic page segmentation (works great for textbook pages, slides & notes)
    if (typeof api.SetPageSegMode === 'function') api.SetPageSegMode(3);
    activeLang = langCode;
  }
}

/**
 * Converts RGBA pixels into a contrast-normalized binary PGM (P5) buffer for Leptonica/Tesseract.
 * Stretching the 2nd–98th luminance percentiles dramatically improves recognition on dim phone photos.
 */
function rgbaToNormalizedPgm(rgba, width, height) {
  const n = width * height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // Composite over white if alpha < 255 (important for transparent PNG screenshots)
    const a = rgba[p + 3];
    let lum = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
    if (a < 255) {
      lum = ((lum * a) + 255 * (255 - a)) / 255;
    }
    const g = lum < 0 ? 0 : lum > 255 ? 255 : lum | 0;
    gray[i] = g;
    hist[g]++;
  }

  // Find 2% low and 98% high percentiles for gentle contrast normalization
  const lowCut = Math.floor(n * 0.02);
  const highCut = Math.floor(n * 0.98);
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= lowCut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= highCut) {
      hi = v;
      break;
    }
  }

  // Detect dark-mode screenshots (mostly dark background with light text) and invert them
  let darkPixels = 0;
  for (let v = 0; v < 110; v++) darkPixels += hist[v];
  const invert = darkPixels > n * 0.62;

  const span = Math.max(24, hi - lo);
  const scale = 255 / span;
  for (let i = 0; i < n; i++) {
    let val = (gray[i] - lo) * scale;
    if (val < 0) val = 0;
    else if (val > 255) val = 255;
    if (invert) val = 255 - val;
    gray[i] = val | 0;
  }

  const headerStr = `P5\n${width} ${height}\n255\n`;
  const header = new Uint8Array(headerStr.length);
  for (let i = 0; i < headerStr.length; i++) header[i] = headerStr.charCodeAt(i);
  const pgm = new Uint8Array(header.length + n);
  pgm.set(header, 0);
  pgm.set(gray, header.length);
  return pgm;
}

self.onmessage = async (ev) => {
  const { id, type, rgba, width, height, lang = 'deu+eng' } = ev.data || {};
  if (type !== 'recognize') return;
  try {
    const m = await getCore();
    await ensureLang(m, lang);
    const pgm = rgbaToNormalizedPgm(new Uint8Array(rgba), width, height);
    m.FS.writeFile('/input', pgm);
    api.SetImageFile();
    if (typeof api.SetSourceResolution === 'function') api.SetSourceResolution(300);
    const text = api.GetUTF8Text() || '';
    const confidence = typeof api.MeanTextConf === 'function' ? api.MeanTextConf() : 0;
    api.Clear();
    try {
      m.FS.unlink('/input');
    } catch {
      // ignore
    }
    self.postMessage({ id, ok: true, text, confidence });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
