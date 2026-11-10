import { useEffect, useState } from 'react';
import { desktop } from '../lib/desktop';
import { AnkiImport, isAnkiName } from './AnkiImport';

type Pending = { file?: File; path?: string; key: string };

/**
 * Anki packages can also be imported without a button: drop an .apkg file on the window,
 * or (desktop app) double-click it / "Öffnen mit › Merkora".
 */
export function AnkiDropHost() {
  const [item, setItem] = useState<Pending | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      // Allow dropping (and stop the window from opening the file itself).
      e.preventDefault();
      setHint(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setHint(false), 400);
    };
    const drop = (e: DragEvent) => {
      setHint(false);
      if (e.defaultPrevented) return; // a drop area on the page already took it
      const f = Array.from(e.dataTransfer?.files ?? []).find((x) => isAnkiName(x.name));
      e.preventDefault();
      if (f) setItem({ file: f, key: f.name + f.size });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    desktop?.onOpenFile((path) => {
      if (isAnkiName(path)) setItem({ path, key: path + Date.now() });
    });
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <>
      {hint && !item && <div className="drop-hint">Anki-Stapel (.apkg) einfach loslassen – er wird sofort importiert.</div>}
      {item && <AnkiImport key={item.key} file={item.file} path={item.path} onClose={() => setItem(null)} />}
    </>
  );
}
