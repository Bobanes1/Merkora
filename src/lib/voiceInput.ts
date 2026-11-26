/**
 * Browser / WebView Speech-to-Text layer (Web Speech API) with graceful fallback.
 * Pure helpers (`parseVoiceRating`, `speechLocaleFor`) are tested in scripts/test-srs.mts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rating } from './srs';
import type { SpeechLang } from './speechLang';

export type VoiceCommand =
  | { type: 'rate'; rating: Rating }
  | { type: 'reveal' }
  | { type: 'repeat' }
  | { type: 'hint' }
  | { type: 'stop' }
  | null;

export function speechLocaleFor(lang: SpeechLang): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'fr') return 'fr-FR';
  if (lang === 'es') return 'es-ES';
  if (lang === 'it') return 'it-IT';
  return 'de-DE';
}

/** Recognizes short German/English hands-free voice commands during audio study mode. */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const t = transcript
    .toLowerCase()
    .replace(/[.,!?;:„“"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.split(' ').length > 4) return null;
  if (/^(nochmal|noch mal|falsch|vergessen|wiederholen|again|wrong|1)$/.test(t)) return { type: 'rate', rating: 1 };
  if (/^(schwer|knapp|unsicher|hard|2)$/.test(t)) return { type: 'rate', rating: 2 };
  if (/^(gut|richtig|korrekt|passt|weiter|good|correct|next|3)$/.test(t)) return { type: 'rate', rating: 3 };
  if (/^(einfach|leicht|super|perfekt|easy|4)$/.test(t)) return { type: 'rate', rating: 4 };
  if (/^(lösung|antwort|umdrehen|auflösen|zeigen|show|reveal|flip)$/.test(t)) return { type: 'reveal' };
  if (/^(vorlesen|nochmal vorlesen|repeat|wiederhole)$/.test(t)) return { type: 'repeat' };
  if (/^(tipp|hinweis|hint)$/.test(t)) return { type: 'hint' };
  if (/^(stopp|stop|pause|beenden)$/.test(t)) return { type: 'stop' };
  return null;
}

type SpeechRecLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecCtor = new () => SpeechRecLike;

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceInputSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export type VoiceInputState = {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string;
  start: (locale?: string) => void;
  stop: () => void;
  toggle: (locale?: string) => void;
};

/**
 * React hook wrapping Web Speech API recognition.
 * Safe on platforms without SpeechRecognition (returns `supported: false` with no-op controls).
 */
export function useVoiceInput(opts: {
  lang?: SpeechLang;
  continuous?: boolean;
  onFinal: (text: string) => void;
}): VoiceInputState {
  const { lang = 'de', continuous = false, onFinal } = opts;
  const supported = isVoiceInputSupported();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      try {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        r.stop();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(
    (localeOverride?: string) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError('Spracherkennung wird in diesem Browser nicht unterstützt – nutze einfach die Tastatur.');
        return;
      }
      stop();
      setError('');
      try {
        const rec = new Ctor();
        rec.lang = localeOverride ?? speechLocaleFor(lang);
        rec.continuous = continuous;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onstart = () => setListening(true);
        rec.onresult = (ev) => {
          let finalChunk = '';
          let liveChunk = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            const txt = res[0]?.transcript ?? '';
            if (res.isFinal) finalChunk += (finalChunk ? ' ' : '') + txt.trim();
            else liveChunk += (liveChunk ? ' ' : '') + txt;
          }
          setInterim(liveChunk.trim());
          if (finalChunk.trim()) {
            setInterim('');
            onFinalRef.current(finalChunk.trim());
          }
        };
        rec.onerror = (ev) => {
          const code = ev.error ?? '';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setError('Mikrofon-Zugriff wurde abgelehnt. Bitte im Browser/System erlauben oder tippen.');
          } else if (code === 'no-speech') {
            setError('');
          } else if (code && code !== 'aborted') {
            setError(`Spracherkennung unterbrochen (${code}).`);
          }
          setListening(false);
        };
        rec.onend = () => {
          if (recRef.current === rec) {
            recRef.current = null;
            setListening(false);
            setInterim('');
          }
        };
        recRef.current = rec;
        rec.start();
      } catch {
        setError('Mikrofon konnte nicht gestartet werden.');
        setListening(false);
      }
    },
    [continuous, lang, stop],
  );

  const toggle = useCallback(
    (localeOverride?: string) => {
      if (listening) stop();
      else start(localeOverride);
    },
    [listening, start, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}
