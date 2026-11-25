import { useMemo, useRef, useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { estimate } from '../../lib/costs';
import { materialFrom, aiReady } from '../../lib/ai';
import { buildSummaryPrintHtml, extractMarkdownHeadings } from '../../lib/appExtras';
import { IconCheck, IconCopy, IconDownload, IconEdit, IconRefresh, IconSparkle } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { Markdown } from '../../components/Markdown';
import { NoKeyNotice } from '../../components/NoKey';
import { startJob } from '../../lib/jobs';
import { updateDeck, useStore, type Deck } from '../../lib/store';
import { SpeakButton } from '../../components/SpeakButton';
import { markdownSpeech } from '../../lib/speechText';

export function useAiReady() {
  return useStore((s) => aiReady(s));
}

export default function SummaryTab({ deck }: { deck: Deck }) {
  const job = useJob(deck.id, 'summary');
  const busy = isActive(job);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ready = useAiReady();
  // "Kopieren": formatted (headings, bold, lists) for Word / notes apps, plain text everywhere else
  const textRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const headings = useMemo(() => (deck.summary ? extractMarkdownHeadings(deck.summary) : []), [deck.summary]);

  const copySummary = async () => {
    const el = textRef.current;
    const plain = el?.innerText ?? deck.summary ?? '';
    try {
      if (el && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': new Blob([el.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) }),
        ]);
      } else await navigator.clipboard.writeText(plain);
    } catch {
      await navigator.clipboard?.writeText(plain).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const printSummary = () => {
    const html = textRef.current?.innerHTML;
    if (!html) return;
    const doc = buildSummaryPrintHtml(deck.name, html);
    const win = window.open('', '_blank', 'width=860,height=920');
    if (!win) return;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 250);
  };

  const jumpToHeading = (idx: number) => {
    const els = textRef.current?.querySelectorAll('h2, h3');
    els?.[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasMaterial = deck.source.trim() || deck.cards.length;

  const run = () => {
    startJob('summary', deck);
  };

  if (editing)
    return (
      <div className="panel">
        <textarea className="input mono" rows={22} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              updateDeck(deck.id, { summary: draft });
              setEditing(false);
            }}
          >
            Speichern
          </button>
        </div>
      </div>
    );

  return (
    <div>
      {busy && job && <JobBanner job={job} />}
      <JobError job={job} />
      {!deck.summary ? (
        <div className="empty">
          <b>Noch keine Zusammenfassung</b>
          <p className="muted">Die KI fasst dein Lernmaterial und deine Karten übersichtlich zusammen.</p>
          {!ready ? (
            <NoKeyNotice compact />
          ) : (
            <>
              <button type="button" className="btn primary" onClick={run} disabled={busy || !hasMaterial}>
                <IconSparkle size={16} /> {busy ? 'Zusammenfassung wird geschrieben …' : 'Zusammenfassung erstellen'}
              </button>
              {hasMaterial && <CostHint est={estimate.summary(materialFrom(deck.source, deck.cards).length)} />}
            </>
          )}
          {!hasMaterial && <p className="muted small">Füge zuerst Lernmaterial oder Karten hinzu.</p>}
        </div>
      ) : (
        <article className="panel summary">
          <div className="toolbar">
            <SpeakButton text={markdownSpeech(deck.summary)} label="Vorlesen" className="btn outline sm" withText />
            <span className="grow" />
            <button type="button" className="btn ghost sm" onClick={printSummary} title="Zusammenfassung drucken oder als PDF speichern">
              <IconDownload size={14} /> Drucken / PDF
            </button>
            <button type="button" className="btn ghost sm" onClick={() => void copySummary()}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />} {copied ? 'Kopiert' : 'Kopieren'}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setDraft(deck.summary!);
                setEditing(true);
              }}
            >
              <IconEdit size={14} /> Bearbeiten
            </button>
            {ready && (
              <button type="button" className="btn outline sm" onClick={run} disabled={busy}>
                <IconRefresh size={14} /> {busy ? 'Wird neu erstellt …' : 'Neu erstellen'}
              </button>
            )}
          </div>
          {headings.length >= 2 && (
            <nav className="summary-toc" aria-label="Inhaltsverzeichnis">
              <small className="muted">Inhalt:</small>
              {headings.map((h) => (
                <button
                  key={h.index}
                  type="button"
                  className={`toc-chip${h.level === 3 ? ' sub' : ''}`}
                  onClick={() => jumpToHeading(h.index)}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}
          <div ref={textRef}>
            <Markdown text={deck.summary} />
          </div>
        </article>
      )}
    </div>
  );
}
