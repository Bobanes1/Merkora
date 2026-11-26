import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deckFileBlob } from '../lib/deckFiles';
import { inTauri, isAndroid } from '../lib/desktop';
import { FILE_KIND_LABEL, fileKind } from '../lib/fileKind';
import { openPdf } from '../lib/files';
import type { Slide } from '../lib/officeHtml';
import type { Deck, DeckFile } from '../lib/store';
import { download } from '../lib/util';
import { IconClose, IconDownload } from './Icons';
import { Markdown } from './Markdown';
import { SlideViewer } from './SlideViewer';

type Content =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; text: string }
  | { kind: 'pdf'; blob: Blob }
  | { kind: 'image'; blob: Blob }
  | { kind: 'html'; html: string }
  | { kind: 'slides'; slides: Slide[] }
  | { kind: 'markdown'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'text'; text: string };

async function load(file: DeckFile): Promise<Content> {
  const blob = await deckFileBlob(file.id);
  if (!blob) return { kind: 'missing' };
  const k = fileKind(file.name, file.type ?? 'application/pdf');
  if (k === 'pdf') return { kind: 'pdf', blob };
  if (k === 'image') return { kind: 'image', blob };
  if (k === 'word' || k === 'powerpoint' || k === 'odt' || k === 'odp') {
    const [{ unzipSync }, office, text] = await Promise.all([import('fflate'), import('../lib/officeHtml'), import('../lib/officeText')]);
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    if (k === 'word') return { kind: 'html', html: office.docxHtml(zip) };
    if (k === 'powerpoint') return { kind: 'slides', slides: office.pptxSlides(zip) };
    return { kind: 'text', text: text.odfText(zip) };
  }
  const t = await blob.text();
  if (k === 'markdown') return { kind: 'markdown', text: t };
  if (k === 'csv') {
    const { csvRows } = await import('../lib/officeHtml');
    return { kind: 'table', rows: csvRows(t) };
  }
  if (k === 'html') return { kind: 'text', text: new DOMParser().parseFromString(t, 'text/html').body.innerText };
  return { kind: 'text', text: t };
}

/** A PDF as a document: every page below each other, drawn only when it comes into view; zoom. */
function PdfDocument({ blob }: { blob: Blob }) {
  const [doc, setDoc] = useState<Awaited<ReturnType<typeof openPdf>> | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    let opened: Awaited<ReturnType<typeof openPdf>> | null = null;
    openPdf(blob)
      .then((d) => (alive ? (opened = d, setDoc(d)) : d.close()))
      .catch(() => alive && setError('Dieses PDF konnte nicht geöffnet werden.'));
    return () => {
      alive = false;
      opened?.close();
    };
  }, [blob]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // draw pages close to the view (sharp for the current zoom)
  useEffect(() => {
    if (!doc || !box.current) return;
    const width = Math.min(2400, Math.round((box.current.clientWidth * zoom * (window.devicePixelRatio || 1)) / 100));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.page);
          if (e.isIntersecting && e.intersectionRatio > 0.4) setPage(n);
          const key = `${n}:${width}`;
          if (!e.isIntersecting || pending.current.has(key)) continue;
          pending.current.add(key);
          void doc.render(n, width).then((b) => setUrls((u) => ({ ...u, [n]: URL.createObjectURL(b) })));
        }
      },
      { root: box.current, rootMargin: '600px 0px', threshold: [0, 0.4] },
    );
    box.current.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc, zoom]);

  if (error) return <p className="fv-msg">{error}</p>;
  if (!doc) return <p className="fv-msg">PDF wird geöffnet …</p>;
  const go = (n: number) => box.current?.querySelector(`[data-page="${Math.max(1, Math.min(doc.pages, n))}"]`)?.scrollIntoView({ block: 'start' });
  return (
    <div className="fv-pdf">
      <div className="fv-bar">
        <button type="button" className="icon-btn" aria-label="Kleiner" onClick={() => setZoom((z) => Math.max(50, z - 25))}>
          −
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setZoom(100)} title="Auf Breite">
          {zoom} %
        </button>
        <button type="button" className="icon-btn" aria-label="Größer" onClick={() => setZoom((z) => Math.min(250, z + 25))}>
          +
        </button>
        <span className="grow" />
        <label className="fv-page">
          Seite{' '}
          <input
            type="number"
            min={1}
            max={doc.pages}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value);
              setPage(n);
              go(n);
            }}
          />{' '}
          / {doc.pages}
        </label>
      </div>
      <div className="fv-scroll" ref={box}>
        {Array.from({ length: doc.pages }, (_, i) => i + 1).map((n) => (
          <div key={n} className="fv-page-box" data-page={n} style={{ width: `${zoom}%` }}>
            {urls[n] ? <img src={urls[n]} alt={`Seite ${n}`} draggable={false} /> : <div className="fv-page-ph">Seite {n}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-screen view of a material file: PDF (document or slides), Word, PowerPoint, text, Markdown, CSV. */
export function FileViewer({ file, deck, onClose }: { file: DeckFile; deck?: Deck; onClose: () => void }) {
  const [content, setContent] = useState<Content>({ kind: 'loading' });
  const [mode, setMode] = useState<'doc' | 'slides'>('doc');
  const [msg, setMsg] = useState('');
  const kind = fileKind(file.name, file.type ?? 'application/pdf');

  useEffect(() => {
    let alive = true;
    load(file)
      .then((c) => alive && setContent(c))
      .catch((e) => alive && setContent({ kind: 'error', text: `Die Datei konnte nicht angezeigt werden: ${(e as Error).message}` }));
    return () => {
      alive = false;
    };
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const save = async () => {
    const blob = await deckFileBlob(file.id);
    if (blob) download(file.name, blob, file.type);
  };
  const openOutside = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('open_media_file', { id: file.id, name: file.name });
    } catch (e) {
      setMsg(String(e));
    }
  };

  return createPortal(
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={file.name}>
      <header className="fv-head">
        <span className={'fv-kind k-' + kind}>{FILE_KIND_LABEL[kind]}</span>
        <b className="fv-name" title={file.name}>
          {file.name}
        </b>
        {kind === 'pdf' && deck && content.kind === 'pdf' && (
          <div className="seg compact fv-mode" role="radiogroup" aria-label="Ansicht">
            <button type="button" role="radio" aria-checked={mode === 'doc'} className={mode === 'doc' ? 'on' : ''} onClick={() => setMode('doc')}>
              Dokument
            </button>
            <button type="button" role="radio" aria-checked={mode === 'slides'} className={mode === 'slides' ? 'on' : ''} onClick={() => setMode('slides')}>
              Folien
            </button>
          </div>
        )}
        {inTauri && !isAndroid && (
          <button type="button" className="btn ghost sm" onClick={() => void openOutside()} title="Mit dem Standard-Programm des Computers öffnen">
            Extern öffnen
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={() => void save()}>
          <IconDownload size={14} /> Herunterladen
        </button>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          <IconClose size={20} />
        </button>
      </header>
      {msg && <p className="form-error fv-note">{msg}</p>}
      <div className="fv-body">
        {content.kind === 'loading' && <p className="fv-msg">Wird geöffnet …</p>}
        {content.kind === 'missing' && <p className="fv-msg">Diese Datei ist auf diesem Gerät nicht gespeichert (vielleicht noch nicht synchronisiert).</p>}
        {content.kind === 'error' && <p className="fv-msg">{content.text}</p>}
        {content.kind === 'pdf' && (mode === 'slides' && deck ? <div className="fv-slides-wrap"><SlideViewer deck={deck} fileId={file.id} /></div> : <PdfDocument blob={content.blob} />)}
        {content.kind === 'image' && <ImageDocument blob={content.blob} alt={file.name} />}
        {content.kind === 'html' && <article className="fv-doc" dangerouslySetInnerHTML={{ __html: content.html }} />}
        {content.kind === 'slides' && (
          <div className="fv-deck">
            <p className="muted small">Vereinfachte Ansicht – das genaue Layout zeigt PowerPoint{inTauri && !isAndroid ? ' („Extern öffnen“)' : ''}.</p>
            {content.slides.map((s) => (
              <section key={s.n} className="fv-slide">
                <small className="muted">Folie {s.n}</small>
                {s.title && <h3>{s.title}</h3>}
                {s.points.length > 0 && (
                  <ul>
                    {s.points.map((p, i) => (
                      <li key={i} style={{ marginLeft: p.level * 18 }}>
                        {p.text}
                      </li>
                    ))}
                  </ul>
                )}
                {s.images.map((src, i) => (
                  <img key={i} src={src} alt="" />
                ))}
                {!s.title && !s.points.length && !s.images.length && <p className="muted small">(leere Folie)</p>}
              </section>
            ))}
          </div>
        )}
        {content.kind === 'markdown' && (
          <article className="fv-doc">
            <Markdown text={content.text} />
          </article>
        )}
        {content.kind === 'table' && (
          <div className="fv-doc fv-table">
            <table>
              <tbody>
                {content.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {content.kind === 'text' && <pre className="fv-doc fv-text">{content.text}</pre>}
      </div>
    </div>,
    document.body,
  );
}

function ImageDocument({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return (
    <div className="fv-doc" style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
      <img src={url} alt={alt} style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 10, objectFit: 'contain' }} />
    </div>
  );
}
