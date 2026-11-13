/** Reading aloud with the device's own voices (offline, free). Hidden where the device has none. */
import { useEffect, useState } from 'react';
import { getState } from './store';

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

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

function pickVoice(): SpeechSynthesisVoice | undefined {
  const all = synth?.getVoices() ?? [];
  const want = getState().data.settings.speechVoice;
  return all.find((v) => v.voiceURI === want) ?? all.find((v) => v.lang.toLowerCase().startsWith('de')) ?? all[0];
}

/** Reads the parts one after another (stops whatever was being read). Calls `onEnd` when done or stopped. */
export function speak(parts: string | string[], onEnd?: () => void) {
  if (!synth) return onEnd?.();
  synth.cancel();
  const list = (Array.isArray(parts) ? parts : [parts]).map((p) => p.trim()).filter(Boolean);
  if (!list.length) return onEnd?.();
  const voice = pickVoice();
  const rate = getState().data.settings.speechRate ?? 1;
  list.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else u.lang = 'de-DE';
    u.rate = rate;
    if (i === list.length - 1) {
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
    }
    synth.speak(u);
  });
}

export function stopSpeaking() {
  synth?.cancel();
}

/** Can this device read aloud (has at least one voice)? */
export function useCanSpeak(): boolean {
  return useVoices().length > 0;
}
