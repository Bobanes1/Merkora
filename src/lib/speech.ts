/**
 * Reading aloud with two seamless layers:
 * 1. Local Offline Neural-TTS (Piper ONNX voices on Desktop) with WAV caching and playback speed.
 * 2. Smart System SpeechSynthesis (all platforms, including Android/Web) prioritizing Natural/Enhanced voices.
 * Both layers support automatic language detection (DE, EN, FR, ES, IT) per card/segment.
 */
import { useEffect, useState } from 'react';
import {
  isAndroid,
  isDesktop,
  ttsInstallVoice,
  ttsRemoveVoice,
  ttsSpeakWavB64,
  ttsStatus,
  ttsUninstallAll,
  type TtsProgress,
  type TtsStatus,
} from './desktop';
import {
  detectSpeechLang,
  pickBestSystemVoice,
  pickPiperVoiceForLang,
  scoreSystemVoice,
  type SpeechLang,
} from './speechLang';
import { getState } from './store';

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

// ---------- reactive Piper Neural-TTS status ----------
let cachedStatus: TtsStatus | null = null;
let statusLoaded = false;
const statusListeners = new Set<() => void>();

function notifyStatus(next: TtsStatus | null) {
  cachedStatus = next;
  statusLoaded = true;
  statusListeners.forEach((fn) => fn());
}

export async function refreshNeuralTts(): Promise<TtsStatus | null> {
  if (!isDesktop || isAndroid) {
    notifyStatus(null);
    return null;
  }
  const st = await ttsStatus();
  notifyStatus(st);
  return st;
}

if (typeof window !== 'undefined' && isDesktop && !isAndroid) {
  void refreshNeuralTts();
}

export function useNeuralTtsStatus(): TtsStatus | null {
  const [st, setSt] = useState<TtsStatus | null>(cachedStatus);
  useEffect(() => {
    const onChange = () => setSt(cachedStatus);
    statusListeners.add(onChange);
    if (!statusLoaded && isDesktop && !isAndroid) void refreshNeuralTts();
    else setSt(cachedStatus);
    return () => {
      statusListeners.delete(onChange);
    };
  }, []);
  return st;
}

export async function installNeuralVoice(voiceId: string, onProgress?: (p: TtsProgress) => void): Promise<TtsStatus> {
  const st = await ttsInstallVoice(voiceId, onProgress);
  notifyStatus(st);
  return st;
}

export async function removeNeuralVoice(voiceId: string): Promise<TtsStatus> {
  const st = await ttsRemoveVoice(voiceId);
  notifyStatus(st);
  return st;
}

export async function uninstallAllNeuralTts(): Promise<TtsStatus> {
  clearAudioCache();
  const st = await ttsUninstallAll();
  notifyStatus(st);
  return st;
}

// ---------- system voices ----------
/** The voices of this device (they load asynchronously in some browsers). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth?.getVoices() ?? []);
  useEffect(() => {
    if (!synth) return;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

/** Sorts system voices with German & highest-quality (Natural/Enhanced) voices first. */
export function sortSystemVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const aDe = Number(a.lang.toLowerCase().startsWith('de'));
    const bDe = Number(b.lang.toLowerCase().startsWith('de'));
    if (aDe !== bDe) return bDe - aDe;
    const langA = (a.lang.slice(0, 2).toLowerCase() || 'de') as SpeechLang;
    const langB = (b.lang.slice(0, 2).toLowerCase() || 'de') as SpeechLang;
    const sa = scoreSystemVoice(a, langA);
    const sb = scoreSystemVoice(b, langB);
    if (sa !== sb) return sb - sa;
    return a.name.localeCompare(b.name);
  });
}

// ---------- audio playback & in-memory WAV cache ----------
let playToken = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeOnEnd: (() => void) | null = null;
const wavUrlCache = new Map<string, string>();

function clearAudioCache() {
  for (const url of wavUrlCache.values()) URL.revokeObjectURL(url);
  wavUrlCache.clear();
}

function b64WavToUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

function getCachedWavUrl(key: string, b64: string): string {
  const hit = wavUrlCache.get(key);
  if (hit) return hit;
  if (wavUrlCache.size >= 60) {
    const oldest = wavUrlCache.keys().next().value;
    if (oldest) {
      URL.revokeObjectURL(wavUrlCache.get(oldest)!);
      wavUrlCache.delete(oldest);
    }
  }
  const url = b64WavToUrl(b64);
  wavUrlCache.set(key, url);
  return url;
}

function playUrl(url: string, rate: number, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (token !== playToken) return resolve();
    const audio = new Audio(url);
    audio.playbackRate = Math.max(0.5, Math.min(2, rate));
    // Preserve natural pitch when speeding up or slowing down
    const pitched = audio as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    if ('preservesPitch' in pitched) pitched.preservesPitch = true;
    if ('webkitPreservesPitch' in pitched) pitched.webkitPreservesPitch = true;
    activeAudio = audio;
    const done = () => {
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

function speakSystemOne(text: string, lang: SpeechLang, rate: number, token: number, preferredURI?: string, autoLang = true): Promise<void> {
  return new Promise((resolve) => {
    if (!synth || token !== playToken) return resolve();
    const all = synth.getVoices();
    const voice = pickBestSystemVoice(all, lang, preferredURI, !autoLang || !preferredURI || (all.find((v) => v.voiceURI === preferredURI)?.lang.toLowerCase().startsWith(lang) ?? false));
    const u = new SpeechSynthesisUtterance(text);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : lang === 'it' ? 'it-IT' : 'de-DE';
    }
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export type SpeakOverride = {
  neuralVoiceId?: string;
  forceSystem?: boolean;
  lang?: SpeechLang;
};

/**
 * Reads parts one after another (stops whatever was being read). Calls `onEnd` when done or stopped.
 * Automatically picks installed Piper Neural-TTS voices when available, with automatic language detection
 * and smooth fallback to the highest-quality OS voice.
 */
export function speak(parts: string | string[], onEnd?: () => void, override?: SpeakOverride) {
  stopSpeaking();
  const list = (Array.isArray(parts) ? parts : [parts]).map((p) => p.trim()).filter(Boolean);
  if (!list.length) return onEnd?.();

  const token = ++playToken;
  activeOnEnd = onEnd ?? null;
  const settings = getState().data.settings;
  const rate = settings.speechRate ?? 1;
  const autoLang = settings.speechAutoLang !== false;
  const useNeural = !override?.forceSystem && settings.speechEngine !== 'system' && Boolean(cachedStatus?.engineInstalled && cachedStatus.installedVoices.length);
  const installed = cachedStatus?.installedVoices ?? [];
  const defaultLang: SpeechLang = (settings.speechNeuralVoice?.slice(0, 2).toLowerCase() as SpeechLang) || 'de';

  void (async () => {
    try {
      for (const text of list) {
        if (token !== playToken) return;
        const lang: SpeechLang = override?.lang ?? (autoLang ? detectSpeechLang(text, defaultLang) : defaultLang);

        const piperId =
          override?.neuralVoiceId && installed.includes(override.neuralVoiceId)
            ? override.neuralVoiceId
            : useNeural
              ? pickPiperVoiceForLang(installed, lang, settings.speechNeuralVoice, autoLang)
              : undefined;

        if (piperId) {
          try {
            const cacheKey = `${piperId}\n${text}`;
            let url = wavUrlCache.get(cacheKey);
            if (!url) {
              const b64 = await ttsSpeakWavB64(piperId, text);
              if (token !== playToken) return;
              url = getCachedWavUrl(cacheKey, b64);
            }
            await playUrl(url, rate, token);
            continue;
          } catch {
            // Fall through gracefully to system voice if Piper fails
            if (token !== playToken) return;
          }
        }

        await speakSystemOne(text, lang, rate, token, settings.speechVoice, autoLang);
      }
    } finally {
      if (token === playToken) {
        const done = activeOnEnd;
        activeOnEnd = null;
        done?.();
      }
    }
  })();
}

export function stopSpeaking() {
  playToken++;
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  synth?.cancel();
  const prev = activeOnEnd;
  activeOnEnd = null;
  prev?.();
}

/** Can this device read aloud (has at least one system voice OR an installed Neural-TTS voice)? */
export function useCanSpeak(): boolean {
  const sysVoices = useVoices();
  const neural = useNeuralTtsStatus();
  return sysVoices.length > 0 || Boolean(neural?.engineInstalled && neural.installedVoices.length > 0);
}

const wavBytesCache = new Map<string, { bytes: Uint8Array; url: string }>();

/**
 * Synthesizes a single line to WAV bytes + ObjectURL using a specific Piper voice (cached in memory).
 * Used by the Offline 2-Voice Learning Podcast for seamless pre-buffering and local WAV export.
 */
export async function synthesizeLineWav(text: string, voiceId: string): Promise<{ bytes: Uint8Array; url: string }> {
  const key = `${voiceId}\n${text.trim()}`;
  const hit = wavBytesCache.get(key);
  if (hit) return hit;
  const b64 = await ttsSpeakWavB64(voiceId, text.trim());
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  if (wavBytesCache.size >= 120) {
    const oldest = wavBytesCache.keys().next().value;
    if (oldest) {
      URL.revokeObjectURL(wavBytesCache.get(oldest)!.url);
      wavBytesCache.delete(oldest);
    }
  }
  const entry = { bytes, url };
  wavBytesCache.set(key, entry);
  return entry;
}

/** Picks two distinct installed Piper voices for Podcast Host A & B (falls back cleanly if < 2 installed). */
export function pickPodcastVoices(installed: string[], lang: SpeechLang): { voiceA?: string; voiceB?: string } {
  const sameLang = installed.filter((id) => id.toLowerCase().startsWith(lang));
  const pool = sameLang.length ? sameLang : installed;
  if (!pool.length) return {};
  if (pool.length === 1) return { voiceA: pool[0], voiceB: pool[0] };
  // Prefer pairing distinct voice names (e.g. thorsten + kerstin, amy + alba)
  const voiceA = pool[0];
  const baseA = voiceA.split('-')[1] ?? voiceA;
  const distinct = pool.find((id) => (id.split('-')[1] ?? id) !== baseA) ?? pool[1];
  return { voiceA, voiceB: distinct };
}
