import { useRef, useState } from 'react';
import { escapeHtml } from '../lib/content';
import { addCards, type Deck } from '../lib/store';
import { IconTrash, IconUpload } from './Icons';
import { Modal } from './Modal';
import { storeImage } from './RichField';

type Rect = { x: number; y: number; w: number; h: number };
const r3 = (n: number) => Math.round(n * 10000) / 10000;

/** One card per masked area – same HTML as imported Anki image occlusions, so the same display is used. */
export function occlusionHtml(mediaId: string, rects: Rect[], active: number, answer: boolean, hideAll: boolean, header: string, extra: string) {
  const shapes = rects
    .map((r, i) => {
      const cls = i === active ? (answer ? 'io-revealed' : 'io-active') : hideAll ? 'io-inactive' : '';
      if (!cls) return '';
      return `<rect class="${cls}" x="${r3(r.x)}" y="${r3(r.y)}" width="${r3(r.w)}" height="${r3(r.h)}" vector-effect="non-scaling-stroke"/>`;
    })
    .join('');
  return (
    (header ? `<div class="io-header">${escapeHtml(header)}</div>` : '') +
    `<div class="io-wrap"><img data-media="${mediaId}"><svg class="io-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">${shapes}</svg></div>` +
    (answer && extra ? `<div class="io-extra">${escapeHtml(extra)}</div>` : '')
  );
}

/** Image occlusion without AI: choose a picture, draw boxes over the parts to learn – each box becomes a card. */
export function OcclusionEditor({ deck, onClose, onText }: { deck: Deck; onClose: () => void; /** back to a normal card */ onText?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<{ id: string; url: string } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [header, setHeader] = useState('');
  const [extra, setExtra] = useState('');
  const [hideAll, setHideAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<Rect | null>(null);
  const setDraftBoth = (r: Rect | null) => {
    draftRef.current = r;
    setDraft(r);
  };

  const pick = async (f?: File | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    setBusy(true);
    try {
      setImg(await storeImage(f));
      setRects([]);
    } finally {
      setBusy(false);
    }
  };

  const pos = (e: React.PointerEvent) => {
    const b = areaRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.io-del')) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* not all pointers can be captured */
    }
    start.current = pos(e);
    setDraftBoth({ ...start.current, w: 0, h: 0 });
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = pos(e);
    const s = start.current;
    setDraftBoth({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = () => {
    const d = draftRef.current;
    if (d && d.w > 0.01 && d.h > 0.01) setRects((r) => [...r, d]);
    start.current = null;
    setDraftBoth(null);
  };

  const save = () => {
    if (!img || !rects.length) return;
    addCards(
      deck.id,
      rects.map((_, i) => ({
        front: occlusionHtml(img.id, rects, i, false, hideAll, header.trim(), extra.trim()),
        back: occlusionHtml(img.id, rects, i, true, hideAll, header.trim(), extra.trim()),
        html: true,
        tags: ['bildverdeckung'],
      })),
    );
    onClose();
  };

  return (
    <Modal
      wide={!onText}
      className={onText ? 'new-card-modal' : ''}
      title={onText ? 'Neue Karte' : 'Bildverdeckung erstellen'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!img || !rects.length}>
            {rects.length ? `${rects.length} ${rects.length === 1 ? 'Karte' : 'Karten'} erstellen` : 'Karten erstellen'}
          </button>
        </>
      }
    >
      {onText && (
        <div className="seg card-kind" role="tablist" aria-label="Art der Karte">
          <button type="button" role="tab" aria-selected={false} className={''} onClick={onText}>
            Text & Bilder
          </button>
          <button type="button" role="tab" aria-selected={true} className={'on'} title="Kästen über ein Bild ziehen – jede Stelle wird eine Karte">
            Bildverdeckung
          </button>
        </div>
      )}
      {!img ? (
        <div
          className="dropzone"
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files[0]);
          }}
          onPaste={(e) => void pick(Array.from(e.clipboardData.files)[0])}
        >
          <IconUpload size={26} />
          <b>{busy ? 'Bild wird geladen …' : 'Bild hierher ziehen oder klicken'}</b>
          <span>z. B. eine Folie, ein Diagramm oder eine Abbildung. Danach ziehst du Kästen über alles, was du lernen willst.</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
      ) : (
        <>
          <p className="muted small">Ziehe mit der Maus Kästen über die Stellen, die verdeckt werden sollen. Jeder Kasten wird eine eigene Karte.</p>
          <div className="occl-area" ref={areaRef} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            <img src={img.url} alt="" draggable={false} />
            {[...rects, ...(draft ? [draft] : [])].map((r, i) => (
              <div
                key={i}
                className={`occl-rect ${i >= rects.length ? 'draft' : ''}`}
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              >
                {i < rects.length && (
                  <>
                    <span>{i + 1}</span>
                    <button
                      type="button"
                      className="io-del"
                      aria-label={`Kasten ${i + 1} entfernen`}
                      onClick={() => setRects((all) => all.filter((_, k) => k !== i))}
                    >
                      <IconTrash size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="occl-header">
                Überschrift (optional)
              </label>
              <input id="occl-header" className="input" value={header} onChange={(e) => setHeader(e.target.value)} placeholder="z. B. Aufbau des Herzens" />
            </div>
            <div>
              <label className="field-label" htmlFor="occl-extra">
                Zusatz auf der Rückseite (optional)
              </label>
              <input id="occl-extra" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={hideAll} onChange={(e) => setHideAll(e.target.checked)} />
            <span>Alle Stellen verdecken, eine erraten (sonst ist nur die gefragte Stelle verdeckt)</span>
          </label>
          <button type="button" className="link-btn" onClick={() => setImg(null)}>
            Anderes Bild wählen
          </button>
        </>
      )}
    </Modal>
  );
}
