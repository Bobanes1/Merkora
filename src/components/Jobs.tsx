import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { askNotifications, cancelRun, canSurviveClose, dismissToast, getToasts, JOB_LABEL, JOB_TAB, JOB_VERB, runProgress, subscribeToasts, retryJob } from '../lib/jobs';
import { deckUrl, getState, removeJob, useStore, type Job, type JobKind } from '../lib/store';
import { IconBell, IconCheck, IconClose, IconSparkle, IconStop } from './Icons';
import { Mascot } from './Mascot';
import { etaText, JOB_STEPS, jobStep, overallProgress } from '../lib/jobProgress';

export function useJob(deckId: string, kind: JobKind): Job | undefined {
  return useStore((s) => {
    const list = s.data.jobs.filter((j) => j.deckId === deckId && j.kind === kind);
    // a part still working wins over a newer one that is already done (follow-ups of long material)
    return list.filter(isActive).pop() ?? list[list.length - 1];
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
/** Long material is processed in parts: which part a card job is working on. */
const partOf = (job: Job) => {
  const p = (job.params as { part?: { i: number; n: number } }).part;
  return p && p.n > 1 ? p : null;
};

export function JobBanner({ job }: { job: Job }) {
  // several parts of long material run at the same time: one line for all of them
  // (selected as text, so the same progress gives the same value and React does not redraw endlessly)
  const runText = useStore((s) => JSON.stringify(runProgress(s.data.jobs, job)));
  const run = useMemo(() => JSON.parse(runText) as ReturnType<typeof runProgress>, [runText]);
  const elapsed = useElapsed(run?.since ?? job.createdAt);
  const remote = job.mode === 'openai-bg' || job.mode === 'anthropic-batch' || (!job.mode && canSurviveClose());
  return (
    <div className="job-banner" role="status">
      <Mascot className="job-mascot" mood="think" size={58} />
      <div className="job-text">
        <b>
          {JOB_LABEL[job.kind]} {JOB_VERB[job.kind].is} im Hintergrund erstellt …{' '}
          <span className="muted">({elapsed})</span>
        </b>
        {run ? (
          <>
            <small className="job-parts-text">
              Langes Material in {run.n} Teilen, {run.running > 1 ? `${run.running} gleichzeitig` : 'nacheinander'} – {run.done} von {run.n} fertig
            </small>
            <span className="bar job-parts" aria-hidden="true">
              <i style={{ width: `${Math.max(4, (run.done / run.n) * 100)}%` }} />
            </span>
          </>
        ) : (
          partOf(job) && (
            <span className="bar job-parts" aria-hidden="true">
              <i style={{ width: `${((partOf(job)!.i - 1) / partOf(job)!.n) * 100}%` }} />
            </span>
          )
        )}
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
          <button type="button" className="btn ghost sm" onClick={() => cancelRun(job.id)} title={run ? 'Alle Teile stoppen – fertige Karten bleiben' : 'Auftrag stoppen'}>
            <IconStop size={14} /> Stoppen
          </button>
        </div>
      </div>
    </div>
  );
}

export function JobError({ job }: { job?: Job }) {
  if (!job || job.status !== 'error') return null;
  return (
    <div className="form-error" role="alert">
      {job.title.split(' · ')[0] || JOB_LABEL[job.kind]} {JOB_VERB[job.kind].could} nicht erstellt werden: {job.error}{' '}
      <button type="button" className="link-btn" onClick={() => retryJob(job.id)}>
        Erneut versuchen
      </button>{' '}
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
  // the estimates move on every few seconds while something runs
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [running.length]);
  const prog = overallProgress(jobs, now);
  const recent = [...jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  if (!recent.length) return null;
  return (
    <div className="jobs-ind" ref={ref}>
      <button type="button" className={`jobs-btn ${running.length ? 'busy' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title="KI-Aufträge">
        <span className="job-spinner small" aria-hidden="true">
          {running.length ? <IconSparkle size={14} /> : <IconCheck size={14} />}
        </span>
        <span className="grow">
          {running.length ? `${running.length} KI-Auftrag${running.length > 1 ? 'e' : ''} läuft` : 'KI-Aufträge'}
          {running.length > 0 && (
            <span className="jobs-progress" aria-label={`etwa ${Math.round(prog.share * 100)} % geschafft`}>
              <i style={{ width: `${Math.round(prog.share * 100)}%` }} />
            </span>
          )}
        </span>
      </button>
      {running.length > 0 && !open && <small className="jobs-hint">Du kannst währenddessen ganz normal weiterarbeiten.</small>}
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
                  {isActive(j) && (
                    <span className="job-steps" aria-label={`Schritt ${jobStep(j) + 1} von 3: ${JOB_STEPS[jobStep(j)]}`}>
                      {JOB_STEPS.map((label, k) => (
                        <span key={label} className={k < jobStep(j) ? 'done' : k === jobStep(j) ? 'now' : ''}>
                          {label}
                        </span>
                      ))}
                    </span>
                  )}
                  <small>
                    {j.status === 'done'
                      ? 'fertig'
                      : j.status === 'cancelled'
                        ? 'gestoppt'
                      : j.status === 'error'
                        ? `Fehler: ${j.error}`
                        : `${etaText(j, jobs, now)} · ${j.mode === 'tab' ? 'läuft in diesem Fenster' : 'läuft beim Anbieter – auch wenn du die App schließt'}`}
                  </small>
                </span>
                {isActive(j) ? (
                  <button type="button" className="icon-btn" aria-label="Stoppen" title="Stoppen – fertige Karten bleiben" onClick={() => cancelRun(j.id)}>
                    <IconStop size={14} />
                  </button>
                ) : (
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
            {t.to && (
              <Link to={t.to} onClick={() => dismissToast(t.id)}>
                {t.toLabel ?? 'Ansehen'}
              </Link>
            )}
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
