import { useEffect, useRef, useState } from 'react';
import { sanitize } from '../lib/content';
import { mediaPutMany } from '../lib/db';
import { uid } from '../lib/util';
import { hydrateMedia } from './CardContent';
import { DrawPad } from './DrawPad';

const MAX_SIDE = 1600;

/** Shrinks big photos so they don't fill up the browser storage. */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export async function storeImage(file: File): Promise<{ id: string; url: string }> {
  const blob = await shrink(file);
  const id = uid();
  await mediaPutMany([{ id, rec: { blob, name: file.name || 'bild', type: blob.type || file.type } }]);
  return { id, url: URL.createObjectURL(blob) };
}

/** Reads the editor's HTML back, without the temporary blob: addresses. */
export function serialize(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-media]').forEach((m) => m.removeAttribute('src'));
  return sanitize(copy.innerHTML)
    .replace(/(<br\s*\/?>\s*)+$/i, '')
    .trim();
}

/** Text field for one card side that also accepts pictures (button, paste or drag & drop) – like the Anki editor. */
export function RichField({
  id,
  label,
  initialHtml,
  onChange,
  autoFocus,
  minHeight = 84,
}: {
  id: string;
  label: string;
  initialHtml: string;
  onChange: (html: string, isEmpty: boolean) => void;
  autoFocus?: boolean;
  minHeight?: number;
  /** Text to suggest as the topic of an AI graphic (e.g. the card's question). */
  /** Unused since the AI graphic button was removed; kept so callers need no change. */
  contextText?: () => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'draw' | null>(null);

  useEffect(() => {
    const el = ref.current!;
    el.innerHTML = sanitize(initialHtml);
    void hydrateMedia(el);
    if (autoFocus) el.focus();
    // initialHtml is only the starting value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const el = ref.current!;
    const html = serialize(el);
    const empty = !el.textContent?.trim() && !el.querySelector('img,audio');
    onChange(html, empty);
  };

  const insertImages = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setBusy(true);
    setError('');
    try {
      const el = ref.current!;
      el.focus();
      for (const f of imgs) {
        const { id: mid, url } = await storeImage(f);
        const img = document.createElement('img');
        img.setAttribute('data-media', mid);
        img.alt = '';
        img.src = url;
        const sel = window.getSelection();
        if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
          const r = sel.getRangeAt(0);
          r.deleteContents();
          r.insertNode(img);
          r.setStartAfter(img);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        } else el.appendChild(img);
      }
      emit();
    } catch (e) {
      setError(`Bild konnte nicht gespeichert werden (${(e as Error).message}).`);
    } finally {
      setBusy(false);
    }
  };

  const cmd = (c: string) => {
    ref.current?.focus();
    document.execCommand(c);
    emit();
  };

  return (
    <div className="rich-field">
      <div className="rich-head">
        <label className="field-label" htmlFor={id} onClick={() => ref.current?.focus()}>
          {label}
        </label>
        <div className="rich-tools">
          <button type="button" className="tool-btn" title="Fett" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')}>
            <b>F</b>
          </button>
          <button type="button" className="tool-btn" title="Kursiv" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')}>
            <i>K</i>
          </button>
          <button type="button" className="tool-btn" title="Liste" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')}>
            •≡
          </button>
          <button type="button" className="tool-btn img" onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Lädt …' : '+ Bild'}
          </button>
          <button type="button" className="tool-btn img" onMouseDown={(e) => e.preventDefault()} onClick={() => setDialog('draw')} disabled={busy}>
            ✎ Zeichnen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void insertImages(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div
        id={id}
        ref={ref}
        className="input rich-input"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        onInput={emit}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            void insertImages(files);
            return;
          }
          // Paste plain text to avoid foreign styles.
          const t = e.clipboardData.getData('text/plain');
          if (t) {
            e.preventDefault();
            document.execCommand('insertText', false, t);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files);
          if (files.length) {
            e.preventDefault();
            void insertImages(files);
          }
        }}
      />
      <small className="muted rich-hint">Bilder einfügen: „+ Bild“, Strg+V oder hineinziehen – oder mit „Zeichnen“ selbst eine Skizze machen.</small>
      {error && <div className="form-error">{error}</div>}
      {dialog === 'draw' && (
        <DrawPad
          onClose={() => setDialog(null)}
          onSave={(b) => {
            setDialog(null);
            void insertImages([new File([b], 'zeichnung.png', { type: 'image/png' })]);
          }}
        />
      )}
    </div>
  );
}
