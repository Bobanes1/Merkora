import { useEffect, useState } from 'react';
import { AI_STEPS, aiProgress, aiStep, typicalAiSeconds, type AiKind } from '../lib/aiTiming';
import { IconCheck } from './Icons';
import { Mascot } from './Mascot';

/** „12 s“, „1:05 Min.“ */
const clock = (s: number) => (s < 60 ? `${Math.floor(s)} s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')} Min.`);

/**
 * While the AI works: what Pip is doing right now (steps), a bar that follows the usual duration on this device,
 * the time so far – and a calm note when it takes longer than usual. So a wait never looks like nothing happens.
 */
export function AiProgress({ kind, text, since }: { kind: AiKind; text: string; since?: number }) {
  const [start] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(t);
  }, []);
  const from = since ?? start;
  const elapsed = (now - from) / 1000;
  const typical = typicalAiSeconds(kind);
  const share = aiProgress(elapsed, typical);
  const steps = AI_STEPS[kind];
  const step = aiStep(share, steps.length);
  const long = elapsed > typical * 1.4;
  return (
    <div className="skill-busy ai-progress" role="status" aria-live="polite">
      <Mascot mood="think" size={56} />
      <b className="ai-progress-title">{text}</b>
      <ol className="ai-steps">
        {steps.map((s, k) => (
          <li key={s} className={k < step ? 'done' : k === step ? 'now' : ''}>
            <span className="ai-step-dot">{k < step ? <IconCheck size={10} /> : null}</span>
            {s}
          </li>
        ))}
      </ol>
      <span className="bar ai-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(3, share * 100)}%` }} />
      </span>
      <small className="muted">
        {clock(elapsed)} · {long ? 'heute dauert es etwas länger – Pip ist noch dran' : `meist ca. ${clock(typical)}`}
      </small>
      <small className="muted ai-hint">Du kannst währenddessen woanders hin – Pip arbeitet im Hintergrund weiter.</small>
    </div>
  );
}
