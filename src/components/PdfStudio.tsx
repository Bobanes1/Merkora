/**
 * Living Script Studio: Interactive PDF reader with selectable text layer, rectangular diagram snipping
 * (direct to Image Occlusion or flashcard), bidirectional source anchors (`Card.sourceRef`),
 * saved highlights, and a live 0-token FSRS mastery heatmap per page.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { explainTerm, hasKey } from '../lib/ai';
import { deckFileBlob, pdfFiles, removeDeckFile } from '../lib/deckFiles';
import { openPdf, type PdfTextSpan } from '../lib/files';
import { cleanCardText, pageMasteryHeatmap, type PageHeat } from '../lib/interference';
import {
  addCards,
  addDeckHighlight,
  removeDeckHighlight,
  type CardSourceRef,
  type Deck,
} from '../lib/store';
import { IconBulb, IconChevron, IconClose, IconDoc, IconPlus, IconSparkle, IconTrash } from './Icons';
import { Markdown } from './Markdown';
import { Modal } from './Modal';
import { OcclusionEditor } from './OcclusionEditor';
import { storeImage } from './RichField';

type OpenedPdf = Awaited<ReturnType<typeof openPdf>>;
type Rect = { x: number; y: number; w: number; h: number };

const HEAT_LABEL: Record<PageHeat['level'], string> = {
  none: 'Noch keine Karten',
  weak: 'Schwach / Problemkarten',
  mid: 'Im Aufbau',
  strong: 'Sitzt sicher',
};

export function PdfStudio({
  deck,
  initialFileId,
  initialPage = 1,
  onStudyCards,
}: {
  deck: Deck;
  initialFileId?: string;
  initialPage?: number;
  onStudyCards?: (ids: string[], label: string) => void;
}) {
  const files = pdfFiles(deck.files);
  const [curId, setCurId] = useState(initialFileId ?? files[0]?.id);
  const file = files.find((f) => f.id === curId) ?? files[0];

  const [pdf, setPdf] = useState<OpenedPdf | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [page, setPage] = useState(initialPage);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [spans, setSpans] = useState<PdfTextSpan[]>([]);
  const [tool, setTool] = useState<'select' | 'snip'>('select');
  const [onlyWeak, setOnlyWeak] = useState(false);

  // Selection & quick actions
  const [selectedText, setSelectedText] = useState('');
  const [quickCard, setQuickCard] = useState<{ front: string; back: string; excerpt: string; imageId?: string; imageUrl?: string } | null>(null);
  const [occlusionImg, setOcclusionImg] = useState<{ id: string; url: string } | null>(null);
  const [pipNote, setPipNote] = useState<{ excerpt: string; text: string; busy: boolean; error: string } | null>(null);
  const [askRemove, setAskRemove] = useState(false);

  // Snip drag state
  const stageRef = useRef<HTMLDivElement>(null);
  const snipStart = useRef<{ x: number; y: number } | null>(null);
  const [snipDraft, setSnipDraft] = useState<Rect | null>(null);
  const [snipReady, setSnipReady] = useState<{ img: { id: string; url: string }; rect: Rect } | null>(null);
  const [snipBusy, setSnipBusy] = useState(false);

  // Image URL cache per file:page
  const imgCache = useRef(new Map<string, string>());
  const spanCache = useRef(new Map<string, PdfTextSpan[]>());

  useEffect(() => {
    if (!file) return;
    let alive = true;
    let opened: OpenedPdf | null = null;
    setStatus('loading');
    setPdf(null);
    setPageUrl(null);
    setSpans([]);
    setSelectedText('');
    setSnipReady(null);
    setAskRemove(false);
    setPage(initialFileId === file.id ? initialPage : 1);

    void (async () => {
      try {
        const blob = await deckFileBlob(file.id);
        if (!blob) {
          if (alive) setStatus('missing');
          return;
        }
        opened = await openPdf(blob);
        if (!alive) {
          opened.close();
          return;
        }
        setPdf(opened);
        setPage((p) => Math.max(1, Math.min(opened!.pages, p)));
        setStatus('ok');
      } catch {
        if (alive) setStatus('error');
      }
    })();

    return () => {
      alive = false;
      opened?.close();
    };
  }, [file?.id, initialFileId, initialPage]);

  useEffect(() => {
    const cache = imgCache.current;
    return () => cache.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  useEffect(() => {
    if (!pdf || !file) return;
    let alive = true;
    const key = `${file.id}:${page}`;
    setSelectedText('');
    setSnipReady(null);

    const loadPage = async () => {
      let url = imgCache.current.get(key);
      if (!url) {
        const blob = await pdf.render(page, 1400);
        url = URL.createObjectURL(blob);
        imgCache.current.set(key, url);
      }
      if (!alive) return;
      setPageUrl(url);

      let items = spanCache.current.get(key);
      if (!items) {
        items = await pdf.getPageTextItems(page).catch(() => []);
        spanCache.current.set(key, items);
      }
      if (alive) setSpans(items);
    };

    void loadPage().catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [pdf, page, file?.id]);

  const totalPages = pdf?.pages ?? 0;
  const heatmap = useMemo(
    () => (totalPages ? pageMasteryHeatmap(deck.cards, totalPages, deck.source, file?.id) : []),
    [deck.cards, deck.source, totalPages, file?.id],
  );
  const weakPages = useMemo(() => heatmap.filter((h) => h.level === 'weak'), [heatmap]);
  const weakCardIds = useMemo(() => [...new Set(weakPages.flatMap((h) => h.cardIds))], [weakPages]);
  const currentHeat = heatmap[page - 1];
  const pageCards = useMemo(() => {
    if (!currentHeat?.cardIds.length) return [];
    const set = new Set(currentHeat.cardIds);
    return deck.cards.filter((c) => set.has(c.id));
  }, [currentHeat, deck.cards]);
  const pageHighlights = useMemo(
    () => (deck.highlights ?? []).filter((h) => h.fileId === file?.id && h.page === page),
    [deck.highlights, file?.id, page],
  );

  if (!file) return null;

  const go = (n: number) => totalPages && setPage(Math.max(1, Math.min(totalPages, n)));
  const currentSourceRef = (excerpt?: string): CardSourceRef => ({
    fileId: file.id,
    fileName: file.name,
    page,
    ...(excerpt ? { excerpt: excerpt.slice(0, 220) } : {}),
  });

  const readSelection = () => {
    const sel = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (sel.length >= 3) setSelectedText(sel);
  };

  // Snip pointer handlers
  const stagePos = (e: PointerEvent) => {
    const b = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  };

  const onSnipDown = (e: PointerEvent) => {
    if (tool !== 'snip') return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = stagePos(e);
    snipStart.current = p;
    setSnipReady(null);
    setSnipDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onSnipMove = (e: PointerEvent) => {
    if (!snipStart.current) return;
    const p = stagePos(e);
    const s = snipStart.current;
    setSnipDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const onSnipUp = async () => {
    const d = snipDraft;
    snipStart.current = null;
    setSnipDraft(null);
    if (!d || d.w < 0.03 || d.h < 0.03 || !pdf) return;
    setSnipBusy(true);
    try {
      const blob = await pdf.cropPageRect(page, d, 1600);
      const stored = await storeImage(new File([blob], `folie-${page}.jpg`, { type: 'image/jpeg' }));
      setSnipReady({ img: stored, rect: d });
    } finally {
      setSnipBusy(false);
    }
  };

  const openQuickCardFromSelection = (asCloze: boolean) => {
    const txt = selectedText.trim();
    if (!txt) return;
    if (asCloze) {
      const words = txt.split(/\s+/);
      const mid = words.length > 4 ? `${words.slice(0, 2).join(' ')} {{c1::${words.slice(2, Math.min(words.length, 6)).join(' ')}}} ${words.slice(6).join(' ')}`.trim() : `{{c1::${txt}}}`;
      setQuickCard({ front: mid, back: txt, excerpt: txt });
    } else {
      setQuickCard({ front: '', back: txt, excerpt: txt });
    }
  };

  const saveQuickCard = () => {
    if (!quickCard) return;
    const front = quickCard.front.trim();
    const back = quickCard.back.trim();
    if (!front || !back) return;
    if (quickCard.imageId) {
      const htmlFront = `${front}<div class="card-img"><img data-media="${quickCard.imageId}"></div>`;
      addCards(deck.id, [{ front: htmlFront, back, html: true, sourceRef: currentSourceRef(quickCard.excerpt) }]);
    } else {
      addCards(deck.id, [{ front, back, sourceRef: currentSourceRef(quickCard.excerpt) }]);
    }
    setQuickCard(null);
    setSelectedText('');
    setSnipReady(null);
  };

  const askPipSelection = async () => {
    const excerpt = selectedText.trim();
    if (!excerpt || !hasKey('chat')) return;
    setPipNote({ excerpt, text: '', busy: true, error: '' });
    try {
      const text = await explainTerm(excerpt.slice(0, 120), `Seite ${page} (${file.name})`, deck.name, excerpt);
      setPipNote({ excerpt, text, busy: false, error: '' });
    } catch (e) {
      setPipNote({ excerpt, text: '', busy: false, error: (e as Error).message });
    }
  };

  const visibleRail = onlyWeak ? heatmap.filter((h) => h.level === 'weak') : heatmap;

  return (
    <div className="pdf-studio">
      {/* Compact studio bar */}
      <div className="pdf-studio-bar">
        {files.length > 1 ? (
          <select className="input sm pdf-file-select" value={file.id} onChange={(e) => setCurId(e.target.value)} aria-label="PDF wählen">
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="pdf-studio-name" title={file.name}>
            <IconDoc size={15} /> {file.name}
          </span>
        )}

        <div className="seg compact" role="radiogroup" aria-label="Werkzeug">
          <button type="button" className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>
            Text wählen
          </button>
          <button type="button" className={tool === 'snip' ? 'on' : ''} onClick={() => setTool('snip')}>
            Ausschnitt (Snip)
          </button>
        </div>

        <span className="grow" />

        {weakCardIds.length > 0 && onStudyCards && (
          <button
            type="button"
            className="btn outline sm"
            onClick={() => onStudyCards(weakCardIds, `Schwache Seiten · ${file.name}`)}
            title={`${weakPages.length} Seiten mit niedrigem FSRS-Stand`}
          >
            Schwache Seiten lernen ({weakCardIds.length})
          </button>
        )}

        <div className="pdf-pager">
          <button type="button" className="icon-btn sm" aria-label="Vorherige Seite" disabled={page <= 1} onClick={() => go(page - 1)}>
            <IconChevron size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <span className="small muted">
            S. {page} / {totalPages || '…'}
          </span>
          <button type="button" className="icon-btn sm" aria-label="Nächste Seite" disabled={page >= totalPages} onClick={() => go(page + 1)}>
            <IconChevron size={14} />
          </button>
        </div>

        {askRemove ? (
          <span className="row-gap">
            <button type="button" className="btn danger sm" onClick={() => void removeDeckFile(deck.id, file.id)}>
              Entfernen
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setAskRemove(false)}>
              Abbrechen
            </button>
          </span>
        ) : (
          <button type="button" className="icon-btn sm" title="PDF entfernen" aria-label="PDF entfernen" onClick={() => setAskRemove(true)}>
            <IconTrash size={14} />
          </button>
        )}
      </div>

      {/* Floating selection / snip action bar */}
      {selectedText && tool === 'select' && (
        <div className="pdf-action-bar" role="region" aria-label="Aktionen für markierten Text">
          <span className="pdf-action-quote" title={selectedText}>
            „{selectedText.slice(0, 72)}{selectedText.length > 72 ? '…' : ''}“
          </span>
          <div className="row-gap">
            <button type="button" className="btn primary sm" onClick={() => openQuickCardFromSelection(false)}>
              <IconPlus size={13} /> Karte
            </button>
            <button type="button" className="btn outline sm" onClick={() => openQuickCardFromSelection(true)}>
              Lückentext
            </button>
            <button
              type="button"
              className="btn outline sm"
              onClick={() => {
                addDeckHighlight(deck.id, { fileId: file.id, page, text: selectedText, color: 'yellow' });
                setSelectedText('');
              }}
            >
              Markieren
            </button>
            {hasKey('chat') && (
              <button type="button" className="btn ghost sm" onClick={() => void askPipSelection()}>
                <IconSparkle size={13} /> Pip fragen
              </button>
            )}
            <button type="button" className="icon-btn sm" aria-label="Auswahl schließen" onClick={() => setSelectedText('')}>
              <IconClose size={13} />
            </button>
          </div>
        </div>
      )}

      {snipReady && (
        <div className="pdf-action-bar" role="region" aria-label="Aktionen für Bildausschnitt">
          <img src={snipReady.img.url} alt="Ausschnitt" className="pdf-snip-thumb" />
          <span className="small">Ausschnitt von Seite {page} bereit</span>
          <span className="grow" />
          <button type="button" className="btn primary sm" onClick={() => setOcclusionImg(snipReady.img)}>
            Bildverdeckung erstellen
          </button>
          <button
            type="button"
            className="btn outline sm"
            onClick={() => setQuickCard({ front: `Beschreibe diese Abbildung (S. ${page}):`, back: '', excerpt: `Abbildung S. ${page}`, imageId: snipReady.img.id, imageUrl: snipReady.img.url })}
          >
            Als Bild-Karte
          </button>
          <button type="button" className="icon-btn sm" aria-label="Ausschnitt verwerfen" onClick={() => setSnipReady(null)}>
            <IconClose size={13} />
          </button>
        </div>
      )}

      {status === 'missing' ? (
        <p className="muted small">Die PDF-Datei liegt nicht lokal auf diesem Gerät (nur der Text wurde synchronisiert).</p>
      ) : status === 'error' ? (
        <p className="form-error">Das PDF konnte nicht gerendert werden.</p>
      ) : (
        <div className="pdf-studio-grid">
          {/* Left Heatmap Rail */}
          <aside className="pdf-heat-rail" aria-label="Seiten-Heatmap">
            <div className="pdf-rail-head">
              <span className="small muted">Seiten</span>
              {weakPages.length > 0 && (
                <button
                  type="button"
                  className={'chip sm' + (onlyWeak ? ' on' : '')}
                  onClick={() => setOnlyWeak((v) => !v)}
                  title="Nur schwache Seiten anzeigen"
                >
                  Rot ({weakPages.length})
                </button>
              )}
            </div>
            <div className="pdf-rail-list">
              {visibleRail.map((h) => (
                <button
                  key={h.page}
                  type="button"
                  className={`pdf-rail-item heat-${h.level}${h.page === page ? ' active' : ''}`}
                  onClick={() => go(h.page)}
                  title={`Seite ${h.page}: ${HEAT_LABEL[h.level]}${h.avgRetention !== null ? ` (${h.avgRetention} %)` : ''}`}
                >
                  <i className={`heat-dot heat-${h.level}`} />
                  <b>S. {h.page}</b>
                  {h.cardIds.length > 0 && <span className="muted">{h.cardIds.length}</span>}
                </button>
              ))}
            </div>
          </aside>

          {/* Interactive PDF Canvas */}
          <div className="pdf-stage-wrap">
            {tool === 'snip' && (
              <p className="pdf-tool-hint small muted">
                {snipBusy ? 'Ausschnitt wird erstellt …' : 'Ziehe ein Rechteck über ein Diagramm, eine Formel oder Abbildung.'}
              </p>
            )}
            <div
              ref={stageRef}
              className={`pdf-stage${tool === 'snip' ? ' snip-mode' : ''}`}
              onMouseUp={tool === 'select' ? readSelection : undefined}
              onPointerDown={onSnipDown}
              onPointerMove={onSnipMove}
              onPointerUp={() => void onSnipUp()}
            >
              {pageUrl ? (
                <img src={pageUrl} alt={`Seite ${page} · ${file.name}`} className="pdf-stage-img" draggable={false} />
              ) : (
                <div className="pdf-stage-loading">
                  <span className="spinner" />
                </div>
              )}

              {/* Selectable text overlay */}
              {tool === 'select' && spans.length > 0 && (
                <div className="pdf-text-layer">
                  {spans.map((sp, i) => (
                    <span
                      key={i}
                      style={{
                        left: `${sp.x * 100}%`,
                        top: `${sp.y * 100}%`,
                        width: `${sp.w * 100}%`,
                        height: `${sp.h * 100}%`,
                      }}
                    >
                      {sp.str}{' '}
                    </span>
                  ))}
                </div>
              )}

              {/* Snip selection box */}
              {snipDraft && (
                <div
                  className="pdf-snip-box"
                  style={{
                    left: `${snipDraft.x * 100}%`,
                    top: `${snipDraft.y * 100}%`,
                    width: `${snipDraft.w * 100}%`,
                    height: `${snipDraft.h * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          {/* Right Context Panel: Cards & Highlights on this page */}
          <aside className="pdf-side-panel">
            <div className="pdf-side-section">
              <div className="row-gap between">
                <b className="small">Karten zu Seite {page}</b>
                {currentHeat?.avgRetention !== null && currentHeat?.avgRetention !== undefined && (
                  <span className={`heat-pill heat-${currentHeat.level}`}>{currentHeat.avgRetention} %</span>
                )}
              </div>
              {pageCards.length ? (
                <ul className="pdf-card-list">
                  {pageCards.slice(0, 8).map((c) => (
                    <li key={c.id} className="pdf-card-item">
                      <span>{cleanCardText(c.front).slice(0, 72)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Markiere Text auf dieser Seite oder ziehe einen Ausschnitt, um direkt verknüpfte Karten zu erstellen.</p>
              )}
              <button
                type="button"
                className="btn outline sm"
                onClick={() => setQuickCard({ front: '', back: '', excerpt: `Seite ${page}` })}
              >
                <IconPlus size={13} /> Karte für S. {page}
              </button>
            </div>

            {pageHighlights.length > 0 && (
              <div className="pdf-side-section">
                <b className="small">Markierungen (S. {page})</b>
                <ul className="pdf-hl-list">
                  {pageHighlights.map((h) => (
                    <li key={h.id} className="pdf-hl-item">
                      <span>„{h.text.slice(0, 120)}{h.text.length > 120 ? '…' : ''}“</span>
                      <button
                        type="button"
                        className="icon-btn sm"
                        aria-label="Markierung löschen"
                        onClick={() => removeDeckHighlight(deck.id, h.id)}
                      >
                        <IconClose size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pipNote && (
              <div className="pdf-side-section pdf-pip-box">
                <div className="row-gap between">
                  <b className="small">
                    <IconBulb size={13} /> Pip erklärt
                  </b>
                  <button type="button" className="icon-btn sm" onClick={() => setPipNote(null)} aria-label="Schließen">
                    <IconClose size={12} />
                  </button>
                </div>
                {pipNote.busy ? (
                  <p className="muted small">Pip liest die Stelle …</p>
                ) : pipNote.error ? (
                  <p className="form-error small">{pipNote.error}</p>
                ) : (
                  <div className="small">
                    <Markdown text={pipNote.text} />
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Quick Card Creation Modal */}
      {quickCard && (
        <Modal
          title={`Neue Karte zu Seite ${page}`}
          onClose={() => setQuickCard(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setQuickCard(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn primary" onClick={saveQuickCard} disabled={!quickCard.front.trim() || !quickCard.back.trim()}>
                Karte speichern
              </button>
            </>
          }
        >
          {quickCard.imageUrl && <img src={quickCard.imageUrl} alt="Ausschnitt" className="pdf-modal-img" />}
          <label className="field-label" htmlFor="pdf-qc-front">
            Frage (Vorderseite)
          </label>
          <textarea
            id="pdf-qc-front"
            className="input"
            rows={2}
            placeholder="z. B. Was beschreibt dieser Abschnitt?"
            value={quickCard.front}
            onChange={(e) => setQuickCard({ ...quickCard, front: e.target.value })}
            autoFocus
          />
          <label className="field-label" htmlFor="pdf-qc-back">
            Antwort (Rückseite)
          </label>
          <textarea
            id="pdf-qc-back"
            className="input"
            rows={4}
            value={quickCard.back}
            onChange={(e) => setQuickCard({ ...quickCard, back: e.target.value })}
          />
          <p className="muted small">Quellen-Anker wird automatisch gespeichert: {file.name} · Seite {page}</p>
        </Modal>
      )}

      {/* Image Occlusion from Snip */}
      {occlusionImg && (
        <OcclusionEditor
          deck={deck}
          initialImage={occlusionImg}
          sourceRef={currentSourceRef(`Abbildung S. ${page}`)}
          onClose={() => {
            setOcclusionImg(null);
            setSnipReady(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Compact modal/drawer opened directly from LearnTab or StudySession when clicking "📄 S. N · Im Skript zeigen".
 */
export function PdfSourceDrawer({
  deck,
  page,
  fileId,
  excerpt,
  onClose,
}: {
  deck: Deck;
  page: number;
  fileId?: string;
  excerpt?: string;
  onClose: () => void;
}) {
  const files = pdfFiles(deck.files);
  const file = files.find((f) => f.id === fileId) ?? files[0];
  const [curPage, setCurPage] = useState(page);
  const [total, setTotal] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const pdfRef = useRef<OpenedPdf | null>(null);

  useEffect(() => {
    if (!file) {
      setErr('Keine PDF-Datei in diesem Deck gespeichert.');
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const blob = await deckFileBlob(file.id);
        if (!blob) {
          if (alive) setErr('Die PDF-Datei liegt nicht lokal auf diesem Gerät.');
          return;
        }
        const opened = await openPdf(blob);
        if (!alive) {
          opened.close();
          return;
        }
        pdfRef.current = opened;
        setTotal(opened.pages);
        const clamped = Math.max(1, Math.min(opened.pages, page));
        setCurPage(clamped);
        const imgBlob = await opened.render(clamped, 1400);
        if (!alive) return;
        setUrl(URL.createObjectURL(imgBlob));
      } catch {
        if (alive) setErr('PDF-Seite konnte nicht geladen werden.');
      }
    })();
    return () => {
      alive = false;
      pdfRef.current?.close();
      pdfRef.current = null;
    };
  }, [file?.id, page]);

  const jump = async (next: number) => {
    const opened = pdfRef.current;
    if (!opened) return;
    const clamped = Math.max(1, Math.min(opened.pages, next));
    setCurPage(clamped);
    const imgBlob = await opened.render(clamped, 1400);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(imgBlob);
    });
  };

  return (
    <Modal wide title={file ? `${file.name} · Seite ${curPage}${total ? ` / ${total}` : ''}` : 'Quellen-Ansicht'} onClose={onClose}>
      {excerpt && (
        <div className="pdf-source-excerpt">
          <IconDoc size={14} /> <span>„{excerpt}“</span>
        </div>
      )}
      {err ? (
        <p className="muted">{err}</p>
      ) : (
        <>
          <div className="row-gap between" style={{ marginBottom: 10 }}>
            <button type="button" className="btn outline sm" disabled={curPage <= 1} onClick={() => void jump(curPage - 1)}>
              <IconChevron size={14} style={{ transform: 'rotate(180deg)' }} /> Vorherige
            </button>
            <span className="muted small">
              Seite {curPage} von {total || '…'}
            </span>
            <button type="button" className="btn outline sm" disabled={!total || curPage >= total} onClick={() => void jump(curPage + 1)}>
              Nächste <IconChevron size={14} />
            </button>
          </div>
          {url ? (
            <img src={url} alt={`Seite ${curPage}`} className="pdf-drawer-img" />
          ) : (
            <div className="pdf-stage-loading">
              <span className="spinner" />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
