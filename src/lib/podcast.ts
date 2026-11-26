/**
 * Offline 2-voice Learning Podcast engine:
 * - Single compact AI call creates a structured 2-speaker episode with chapters.
 * - Audio synthesis & seamless WAV export run 100% locally via Piper ONNX (0 extra API tokens).
 * Pure helpers (`parsePodcast`, `podcastChapters`, `concatWavPcm`) are tested in scripts/test-srs.mts.
 */
import { stripPageMarkers } from './pdfText';
import type { PodcastLine } from './store';

export type PodcastLength = 3 | 6 | 10;

export type PodcastPromptResult = {
  system: string;
  user: string;
  maxTokens: number;
};

/** Builds the single-shot prompt for a natural 2-host learning podcast (Host A: explainer, Host B: curious learner). */
export function podcastPrompt(title: string, material: string, minutes: PodcastLength = 6): PodcastPromptResult {
  const clean = stripPageMarkers(material).slice(0, 22000);
  const turns = minutes === 3 ? '12–16' : minutes === 6 ? '22–28' : '34–42';
  const chapters = minutes === 3 ? '2–3' : minutes === 6 ? '3–4' : '4–6';
  return {
    system: `Du schreibst ein lebendiges, gut verständliches 2-Stimmen-Lernpodcast-Skript in der Sprache des Lernmaterials.
- Sprecher "A" (Host): strukturiert, warmherzig, erklärt Zusammenhänge klar mit kurzen Alltagsbeispielen.
- Sprecher "B" (Co-Host): neugierig, stellt kluge Rückfragen, fasst Kernpunkte griffig zusammen und hilft beim Merken.
- Schreibe wie echte gesprochene Sprache: kurze, flüssige Sätze (1–3 Sätze pro Beitrag), KEIN Markdown, KEINE Aufzählungszeichen, KEINE Sternchen, KEINE Formeln in LaTeX (sprich Formeln natürlich aus).
- Gliedere das Gespräch in ${chapters} kurze Kapitel (setze "chapter" immer nur bei der ersten Zeile eines neuen Kapitels).
- Umfang: ${turns} Dialogzeilen, abwechslungsreich zwischen A und B, mit kurzem Einstieg und griffigem Abschluss-Recap.
Antworte ausschließlich als JSON:
{"title":"Kurzer Episodentitel","lines":[{"speaker":"A","chapter":"Einstieg","text":"..."},{"speaker":"B","text":"..."}]}`,
    user: `Thema / Deck: ${title}\nZiel-Dauer: ca. ${minutes} Minuten\n\nLernmaterial:\n${clean}`,
    maxTokens: minutes === 3 ? 1600 : minutes === 6 ? 2800 : 4200,
  };
}

/** Parses and sanitizes the AI response into a clean `PodcastLine[]` array + optional episode title. */
export function parsePodcast(raw: unknown): { title?: string; lines: PodcastLine[] } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { title?: unknown; lines?: unknown; script?: unknown };
  const arr = Array.isArray(raw) ? raw : Array.isArray(obj.lines) ? obj.lines : Array.isArray(obj.script) ? obj.script : [];
  const lines: PodcastLine[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { speaker?: unknown; text?: unknown; chapter?: unknown };
    const sp = String(o.speaker ?? '').trim().toUpperCase();
    const speaker: 'A' | 'B' = sp === 'B' || sp.startsWith('B') || sp === '2' ? 'B' : 'A';
    const text = String(o.text ?? '')
      .replace(/[*_`#]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const chapter = typeof o.chapter === 'string' && o.chapter.trim() ? o.chapter.trim() : undefined;
    lines.push({ speaker, text, ...(chapter ? { chapter } : {}) });
  }
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : undefined;
  return { title, lines };
}

/** Returns all chapter markers with their starting line index. */
export function podcastChapters(lines: PodcastLine[]): { index: number; title: string }[] {
  const out: { index: number; title: string }[] = [];
  lines.forEach((l, i) => {
    if (l.chapter?.trim()) out.push({ index: i, title: l.chapter.trim() });
  });
  return out;
}

/** Estimates playback duration in minutes from word count (~145 words/min). */
export function estimatePodcastMinutes(lines: PodcastLine[]): number {
  const words = lines.reduce((sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 145));
}

type ParsedWav = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Uint8Array;
};

function parseWav(bytes: Uint8Array): ParsedWav | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let offset = 12;
  let sampleRate = 22050;
  let channels = 1;
  let bitsPerSample = 16;
  let pcm: Uint8Array | null = null;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    const bodyEnd = Math.min(bytes.length, bodyStart + size);
    if (id === 'fmt ' && bodyStart + 16 <= bytes.length) {
      channels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (id === 'data') {
      pcm = bytes.subarray(bodyStart, bodyEnd);
    }
    offset = bodyStart + size + (size % 2);
  }
  if (!pcm) return null;
  return { sampleRate, channels, bitsPerSample, pcm };
}

/** Linearly resamples mono 16-bit PCM when two Piper voices happen to use different sample rates (e.g. 16 kHz vs 22.05 kHz). */
function resample16Mono(pcm: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  if (fromRate === toRate) return pcm;
  const srcView = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const srcSamples = Math.floor(pcm.byteLength / 2);
  const dstSamples = Math.max(1, Math.round((srcSamples * toRate) / fromRate));
  const out = new Uint8Array(dstSamples * 2);
  const dstView = new DataView(out.buffer);
  const ratio = srcSamples / dstSamples;
  for (let i = 0; i < dstSamples; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = srcView.getInt16(Math.min(srcSamples - 1, idx) * 2, true);
    const s1 = srcView.getInt16(Math.min(srcSamples - 1, idx + 1) * 2, true);
    dstView.setInt16(i * 2, Math.round(s0 + (s1 - s0) * frac), true);
  }
  return out;
}

/**
 * Concatenates multiple Piper WAV buffers into a single valid PCM WAV file with natural pauses between speakers.
 * Automatically resamples if Speaker A and Speaker B use different sample rates (e.g. low 16 kHz vs medium 22.05 kHz).
 */
export function concatWavPcm(buffers: Uint8Array[], pauseMs = 280): Uint8Array {
  const parsed = buffers.map(parseWav).filter((x): x is ParsedWav => x !== null);
  if (!parsed.length) return new Uint8Array(0);
  const targetRate = Math.max(...parsed.map((p) => p.sampleRate));
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const pauseBytes = Math.round((targetRate * pauseMs) / 1000) * channels * bytesPerSample;
  const silence = new Uint8Array(pauseBytes);

  const chunks: Uint8Array[] = [];
  parsed.forEach((p, idx) => {
    const pcm = p.bitsPerSample === 16 && p.channels === 1 ? resample16Mono(p.pcm, p.sampleRate, targetRate) : p.pcm;
    chunks.push(pcm);
    if (idx < parsed.length - 1 && pauseBytes > 0) chunks.push(silence);
  });

  const dataSize = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i);
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let pos = 44;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}
