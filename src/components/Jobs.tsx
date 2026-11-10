import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { askNotifications, canSurviveClose, dismissToast, getToasts, JOB_LABEL, JOB_TAB, subscribeToasts } from '../lib/jobs';
import { deckUrl, getState, removeJob, useStore, type Job, type JobKind } from '../lib/store';
import { IconBell, IconCheck, IconClose, IconSparkle } from './Icons';
import { Mascot } from './Mascot';

export function useJob(deckId: string, kind: JobKind): Job | undefined {
  return useStore((s) => {
    const list = s.data.jobs.filter((j) => j.deckId === deckId && j.kind === kind);
    return list[list.length - 1];
  });
}
export const isActive = (j?: Job) => !!j && (j.status === 'queued' || j.status === 'running');

function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - since) / 1000));
  return s < 60 ? `${s} Sek.` : `${Math.floor(s / 60)} Min. ${s % 60} Sek.`;
}

function NotifyButton() {
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  if (perm !== 'default') return null;
  return (
    <button type="button" className="btn ghost sm" onClick={async () => setPerm(await askNotifications())}>
      <IconBell size={14} /> Benachrichtigen, wenn fertig
    </button>
  );
}

/** Shows that an AI task is being created in the background and what the user may do meanwhile. */
export function JobBanner({ job }: { job: Job }) {
  const elapsed = useElapsed(job.createdAt);
  const remote = job.mode === 'openai-bg' || job.mode === 'anthropic-batch' || (!job.mode && canSurviveClose());
  return (
    <div className="job-banner" role="status">
      <Mascot className="job-mascot" mood="think" size={58} />
      <div className="job-text">
        <b>{JOB_LABEL[job.kind]} wird im Hintergrund erstellt … <span className="muted">({elapsed})</span></b>
        <p>
          {remote ? (
            <>
              Du musst nicht warten: Lerne weiter, öffne andere Seiten oder <b>schließ das Fenster ruhig</b> – die KI arbeitet auf den Servern
              deines Anbieters weiter. Beim nächsten Öffnen ist das Ergebnis automatisch da.
              {job.mode === 'anthropic-batch' && ' (Claude-Hintergrundaufträge brauchen meist ein paar Minuten.)'}
            </>
          ) : (
            <>
              Du musst nicht warten: Lerne weiter oder öffne andere Seiten – das Ergebnis erscheint automatisch. Wird die Website ganz
              geschlossen, startet der Auftrag beim nächsten Öffnen von selbst neu.
            </>
          )}
        </p>
        <div className="row-gap">
          <NotifyButton />
        </div>
      </div>
    </div>
  );
}

export function JobError({ job }: { job?: Job }) {
  if (!job || job.status !== 'error') return null;
  return (
    <div className="form-error" role="alert">
      {JOB_LABEL[job.kind]} konnte nicht erstellt werden: {job.error}{' '}
      <button type="button" className="link-btn" onClick={() => removeJob(job.id)}>
        Ausblenden
      </button>
    </div>
  );
}

/** Sidebar entry listing running and finished background tasks. */
export function JobsIndicator() {
  const jobs = useStore((s) => s.data.jobs);
  const data = useStore((s) => s.data);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const running = jobs.filter(isActive);
  const recent = [...jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  if (!recent.length) return null;
  return (
    <div className="jobs-ind" ref={ref}>
      <button type="button" className={`jobs-btn ${running.length ? 'busy' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="job-spinner small" aria-hidden="true">
          {running.length ? <IconSparkle size={14} /> : <IconCheck size={14} />}
        </span>
        <span>{running.length ? `${running.length} KI-Auftrag${running.length > 1 ? 'e' : ''} läuft` : 'KI-Aufträge'}</span>
      </button>
      {open && (
        <div className="jobs-pop">
          <b>Hintergrund-Aufträge</b>
          {recent.map((j) => {
            const deck = data.decks.find((d) => d.id === j.deckId);
            return (
              <div key={j.id} className={`job-row ${j.status}`}>
                <span className="job-dot" />
                <span className="job-row-text">
                  {deck ? (
                    <Link to={deckUrl(data, deck, JOB_TAB[j.kind])} onClick={() => setOpen(false)}>
                      {JOB_LABEL[j.kind]} · {deck.name}
                    </Link>
                  ) : (
                    j.title
                  )}
                  <small>
                    {j.status === 'done' ? 'fertig' : j.status === 'error' ? `Fehler: ${j.error}` : j.mode === 'tab' ? 'läuft in diesem Fenster' : 'läuft beim Anbieter'}
                  </small>
                </span>
                {!isActive(j) && (
                  <button type="button" className="icon-btn" aria-label="Entfernen" onClick={() => removeJob(j.id)}>
                    <IconClose size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Small pop-up messages ("Zusammenfassung ist fertig"). */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts);
  if (!toasts.length) return null;
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => {
        const job = t.jobId ? getState().data.jobs.find((j) => j.id === t.jobId) : undefined;
        const deck = job ? getState().data.decks.find((d) => d.id === job.deckId) : undefined;
        return (
          <div key={t.id} className={`toast ${t.ok ? 'ok' : 'bad'}`}>
            <span>{t.text}</span>
            {deck && job && t.ok && (
              <Link to={deckUrl(getState().data, deck, JOB_TAB[job.kind])} onClick={() => dismissToast(t.id)}>
                Ansehen
              </Link>
            )}
            <button type="button" className="icon-btn" aria-label="Schließen" onClick={() => dismissToast(t.id)}>
              <IconClose size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
