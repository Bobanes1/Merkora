import { useEffect, useState } from 'react';
import { IconDownload } from './Icons';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let saved: PromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    saved = e as PromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    saved = null;
    listeners.forEach((l) => l());
  });
}

/** "Install as app" (desktop icon, own window, works offline) – shown when the browser offers it. */
export function InstallButton() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (!saved) return null;
  return (
    <button
      type="button"
      className="btn outline sm install-btn"
      onClick={async () => {
        const ev = saved;
        if (!ev) return;
        await ev.prompt();
        await ev.userChoice.catch(() => undefined);
        saved = null;
        force((n) => n + 1);
      }}
    >
      <IconDownload size={14} /> Als App installieren
    </button>
  );
}
