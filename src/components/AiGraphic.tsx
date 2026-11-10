import { useState } from 'react';
import { aiReady } from '../lib/ai';
import { generateGraphic, GRAPHIC_STYLES } from '../lib/graphics';
import { IconSparkle } from './Icons';
import { Mascot } from './Mascot';
import { Modal } from './Modal';
import { NoKeyNotice } from './NoKey';

/** Let the AI draw a diagram, labelled figure, mind map, timeline or graph for a card. */
export function AiGraphic({ topic, onClose, onSave }: { topic: string; onClose: () => void; onSave: (svg: Blob) => void }) {
  const [prompt, setPrompt] = useState(topic);
  const [style, setStyle] = useState<string>(GRAPHIC_STYLES[0].id);
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setSvg(await generateGraphic(prompt, style));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!aiReady())
    return (
      <Modal title="Grafik mit KI" onClose={onClose}>
        <NoKeyNotice />
      </Modal>
    );

  return (
    <Modal
      wide
      title="Grafik mit KI erstellen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn outline" onClick={run} disabled={busy || !prompt.trim()}>
            <IconSparkle size={15} /> {svg ? 'Neu zeichnen' : busy ? 'Wird gezeichnet …' : 'Zeichnen'}
          </button>
          <button type="button" className="btn primary" disabled={!svg || busy} onClick={() => onSave(new Blob([svg], { type: 'image/svg+xml' }))}>
            Auf die Karte setzen
          </button>
        </>
      }
    >
      <label className="field-label" htmlFor="g-topic">
        Was soll die Grafik zeigen?
      </label>
      <textarea id="g-topic" className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="z. B. Aufbau einer Pflanzenzelle" />
      <div className="g-styles" role="radiogroup" aria-label="Art der Darstellung">
        {GRAPHIC_STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={`chip-btn ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="g-preview">
        {busy ? (
          <Mascot mood="think" size={90} side="right" say="Ich zeichne gerade …" />
        ) : svg ? (
          <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} alt="Vorschau der Grafik" />
        ) : (
          <Mascot mood="wave" size={80} side="right" say="Sag mir, was ich zeichnen soll!" />
        )}
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
