import { useState } from 'react';
import { CostHint } from '../../components/CostHint';
import { estimate } from '../../lib/costs';
import { materialFrom } from '../../lib/ai';
import { IconDownload, IconEdit, IconRefresh, IconSparkle } from '../../components/Icons';
import { isActive, JobBanner, JobError, useJob } from '../../components/Jobs';
import { Markdown } from '../../components/Markdown';
import { NoKeyNotice } from '../../components/NoKey';
import { aiReady } from '../../lib/ai';
import { startJob } from '../../lib/jobs';
import { updateDeck, useStore, type Deck } from '../../lib/store';
import { download, slugify } from '../../lib/util';
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
            <button type="button" className="btn ghost sm" onClick={() => download(`${slugify(deck.name)}-zusammenfassung.md`, deck.summary!, 'text/markdown')}>
              <IconDownload size={14} /> Herunterladen
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
          <Markdown text={deck.summary} />
        </article>
      )}
    </div>
  );
}
