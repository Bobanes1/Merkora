import { useEffect, useState } from 'react';
import { pickTip, type TipMemory } from '../lib/pipTips';
import { setSettings, useStore } from '../lib/store';
import { dayKey } from '../lib/util';
import { Mascot } from './Mascot';

const KEY = 'merkora.pipTips';
const load = (): TipMemory => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
};

/** Pip with a short tip for the area you are in – a moment after you arrive, at most once a day per area. */
export function PipTip({ area }: { area: string }) {
  const on = useStore((s) => s.data.settings.pipTips !== false && s.data.settings.setupDone && !!s.data.settings.tourDone);
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => {
    setTip(null);
    if (!on) return;
    const t = window.setTimeout(() => {
      const r = pickTip(area, load(), dayKey(Date.now()));
      if (!r) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(r.mem));
      } catch {
        return; // without memory it would repeat on every visit – then rather no tip
      }
      setTip(r.text);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [area, on]);
  if (!tip || !on) return null;
  return (
    <div className="pip-tip" role="status">
      <Mascot mood="wave" size={56} />
      <div className="pip-tip-bubble">
        <p>{tip}</p>
        <div className="row-gap">
          <button type="button" className="btn primary sm" onClick={() => setTip(null)}>
            Verstanden
          </button>
          <button type="button" className="btn ghost sm" onClick={() => (setSettings({ pipTips: false }), setTip(null))}>
            Keine Tipps mehr
          </button>
        </div>
      </div>
    </div>
  );
}
