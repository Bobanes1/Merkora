import { useEffect, useState } from 'react';
import { speak, stopSpeaking, useCanSpeak } from '../lib/speech';
import { IconSpeaker, IconStop } from './Icons';

/** Read aloud / stop. Not shown on devices without a voice. */
export function SpeakButton({ text, label = 'Vorlesen', className = 'icon-btn', withText = false }: { text: string | string[]; label?: string; className?: string; withText?: boolean }) {
  const can = useCanSpeak();
  const [on, setOn] = useState(false);
  // stop when the content changes or the button goes away
  const key = Array.isArray(text) ? text.join('\n') : text;
  useEffect(() => () => {
    if (on) stopSpeaking();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!can) return null;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (on) {
      stopSpeaking();
      setOn(false);
    } else {
      setOn(true);
      speak(text, () => setOn(false));
    }
  };
  return (
    <button type="button" className={className} aria-label={on ? 'Vorlesen stoppen' : label} title={on ? 'Stopp' : label} aria-pressed={on} onClick={toggle}>
      {on ? <IconStop size={withText ? 15 : 16} /> : <IconSpeaker size={withText ? 15 : 16} />}
      {withText && <> {on ? 'Stopp' : label}</>}
    </button>
  );
}
