import { useEffect, useRef, useState } from 'react';
import { deckFileBlob, removeDeckFile } from '../lib/deckFiles';
import { openPdf } from '../lib/files';
import type { Deck } from '../lib/store';
import { openLightbox } from './CardContent';
import { IconChevron, IconDoc, IconTrash } from './Icons';

type Pdf = Awaited<ReturnType<typeof openPdf>>;

/** The deck's presentations to leaf through (arrow keys work too); a click on a slide shows it big. */
export function SlideViewer({ deck, fileId }: { deck: Deck; fileId?: string }) {
  const files = deck.files ?? [];
  const [cur, setCur] = useState(fileId ?? files[0]?.id);
  const file = files.find((f) => f.id === cur) ?? files[0];
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState<string | null>(null);
  const [askRemove, setAskRemove] = useState(false);
  const cache = useRef(new Map<string, string>());

  // open the chosen file once
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let opened: Pdf | null = null;
    setState('loading');
    setPdf(null);
    setPage(1);
    setAskRemove(false);
    void (async () => {
      try {
        const blob = await deckFileBlob(file.id);
        if (!blob) return alive && setState('missing');
        opened = await openPdf(blob);
        if (!alive) return opened.close();
        setPdf(opened);
        setState('ok');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
      opened?.close();
    };
  }, [file?.id]);

  // slides as pictures, each rendered once (also the ones being prepared in the background)
  const pending = useRef(new Map<string, Promise<string>>());
  const slide = (n: number): Promise<string> => {
    const key = `${file!.id}:${n}`;
    const hit = cache.current.get(key);
    if (hit) return Promise.resolve(hit);
    let p = pending.current.get(key);
    if (!p) {
      p = pdf!.render(n, 1400).then((b) => {
        const u = URL.createObjectURL(b);
        cache.current.set(key, u);
        pending.current.delete(key);
        return u;
      });
      pending.current.set(key, p);
    }
    return p;
  };

  // the current slide; the previous one stays visible until the new one is ready (no jumping)
  useEffect(() => {
    if (!pdf || !file) return;
    let alive = true;
    void slide(page)
      .then((u) => {
        if (!alive) return;
        setUrl(u);
        // prepare the neighbours, so leafing on is instant
        for (const n of [page + 1, page + 2, page - 1]) if (n >= 1 && n <= pdf.pages) void slide(n).catch(() => undefined);
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, page, file?.id]);

  useEffect(() => {
    const c = cache.current;
    return () => c.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  // a new file: start with an empty stage, but keep its height
  useEffect(() => setUrl(null), [file?.id]);
  const [ratio, setRatio] = useState<number | null>(null);
  const waiting = !!url && !cache.current.has(`${file?.id}:${page}`);

  if (!file) return null;
  const pages = pdf?.pages ?? 0;
  const go = (n: number) => pages && setPage(Math.min(pages, Math.max(1, n)));
  const alt = `Folie ${page} · ${file.name}`;

  return (
    <section
      className="slides-view"
      tabIndex={0}
      aria-label={`Präsentation ${file.name}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') (e.preventDefault(), go(page + 1));
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') (e.preventDefault(), go(page - 1));
      }}
    >
      <div className="slides-files">
        {files.map((f) => (
          <button key={f.id} type="button" className={'chip' + (f.id === file.id ? ' active' : '')} onClick={() => setCur(f.id)} title={f.name}>
            <IconDoc size={14} /> <span className="slides-file-name">{f.name.replace(/\.pdf$/i, '')}</span>
          </button>
        ))}
        <span className="grow" />
        <button type="button" className="icon-btn" aria-label={`${file.name} entfernen`} title="Präsentation entfernen" onClick={() => setAskRemove(true)}>
          <IconTrash size={15} />
        </button>
      </div>
      {askRemove && (
        <div className="form-warn">
          „{file.name}“ wird aus dem Deck entfernt. Der Text daraus bleibt im Lernmaterial.{' '}
          <button type="button" className="link-btn" onClick={() => removeDeckFile(deck.id, file.id)}>
            Ja, entfernen
          </button>
          <button type="button" className="link-btn" onClick={() => setAskRemove(false)}>
            Nein
          </button>
        </div>
      )}
      {/* fixed shape (from the first slide), so the page never jumps while leafing */}
      <div className="slides-stage" style={ratio ? { aspectRatio: String(ratio), width: `min(100%, calc(70vh * ${ratio}))` } : undefined}>
        {state === 'missing' ? (
          <p className="muted small">Diese Präsentation ist auf diesem Gerät nicht gespeichert (vielleicht noch nicht synchronisiert).</p>
        ) : state === 'error' ? (
          <p className="muted small">Die Präsentation konnte nicht geöffnet werden.</p>
        ) : url ? (
          <img
            className={'slides-img' + (waiting ? ' waiting' : '')}
            src={url}
            alt={alt}
            onLoad={(e) => !ratio && setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            onClick={() => openLightbox(url, alt)}
          />
        ) : (
          <div className="slide-loading">Folie wird geladen …</div>
        )}
      </div>
      {pages > 0 && (
        <div className="slides-nav">
          <button type="button" className="btn outline sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Vorherige Folie">
            <IconChevron size={15} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <input type="range" min={1} max={pages} value={page} onChange={(e) => go(Number(e.target.value))} aria-label="Folie wählen" />
          <span className="slides-count">
            Folie {page} / {pages}
          </span>
          <button type="button" className="btn outline sm" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Nächste Folie">
            <IconChevron size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
