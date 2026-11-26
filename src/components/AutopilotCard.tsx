/**
 * "Heute zählt" Study Autopilot card for the Dashboard (100% offline / 0 API tokens).
 * Picks an optimal 15 / 30 / 60-minute study mix from upcoming exams, FSRS forgetting risk,
 * leeches, closed-loop mock exam retests, and active skills.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildAutopilotPlan, type AutopilotBudget } from '../lib/autopilot';
import { useData } from '../lib/store';
import { IconPlay, IconSparkle, IconStar, IconTarget } from './Icons';
import type { SessionItem } from './StudySession';

const BUDGETS: AutopilotBudget[] = [15, 30, 60];

export function AutopilotCard({
  onStartSession,
}: {
  onStartSession: (title: string, items: SessionItem[]) => void;
}) {
  const data = useData();
  const [budget, setBudget] = useState<AutopilotBudget>(30);
  const plan = useMemo(() => buildAutopilotPlan(data, budget), [data, budget]);

  const hasAny = plan.cards.length > 0 || !!plan.nextSkill;
  if (!data.decks.some((d) => !d.archived && d.cards.length > 0) && !plan.nextSkill) return null;

  return (
    <section className="panel autopilot-card" aria-label="Heute zählt Lern-Autopilot">
      <div className="autopilot-head">
        <div className="autopilot-title-wrap">
          <span className="autopilot-kicker">
            <IconTarget size={13} /> Heute zählt · Autopilot
          </span>
          <b className="autopilot-headline">{plan.headline}</b>
          <p className="muted small autopilot-rationale">{plan.rationale}</p>
        </div>

        <div className="seg compact autopilot-budget" role="radiogroup" aria-label="Zeitbudget wählen">
          {BUDGETS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={budget === m}
              className={budget === m ? 'on' : ''}
              onClick={() => setBudget(m)}
            >
              {m} Min
            </button>
          ))}
        </div>
      </div>

      <div className="autopilot-foot">
        <div className="row-gap">
          {plan.cards.length > 0 && (
            <button
              type="button"
              className="btn primary sm"
              onClick={() =>
                onStartSession(
                  `Heute zählt (${budget} Min.)`,
                  plan.cards.map(({ deckId, cardId }) => ({ deckId, cardId })),
                )
              }
            >
              <IconPlay size={13} /> Fokus-Runde starten ({plan.cards.length} Karten)
            </button>
          )}
          {plan.nextSkill && (
            <Link className="btn outline sm" to={`/skills/${plan.nextSkill.skillId}`}>
              <IconStar size={13} /> Skill: {plan.nextSkill.lessonTitle.slice(0, 28)}
              {plan.nextSkill.lessonTitle.length > 28 ? '…' : ''}
            </Link>
          )}
          {plan.feynmanDeck && !hasAny && (
            <Link className="btn outline sm" to={plan.feynmanDeck.url}>
              <IconSparkle size={13} /> Erklär es Pip
            </Link>
          )}
        </div>
        {plan.timeHint && <span className="muted small autopilot-time-hint">{plan.timeHint}</span>}
      </div>
    </section>
  );
}
