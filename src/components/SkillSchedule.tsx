import { useEffect, useState } from 'react';
import { GOALS, minutesPerLesson, openLessons, planLessons, remainingText, skillComplete, skillStreak, skillToday, type Skill } from '../lib/skills';
import { addTodo, getState, updateSkill } from '../lib/store';
import { playUi } from '../lib/uiSound';
import { dayKey } from '../lib/util';
import { IconCalendar, IconCheck, IconFlame, IconTrophy } from './Icons';
import { Confetti, Mascot } from './Mascot';

/** Remaining time and an optional target date; „In To-dos planen“ spreads the open lessons over the days until then. */
export function SkillSchedule({ skill }: { skill: Skill }) {
  const [note, setNote] = useState('');
  const open = openLessons(skill);
  const plan = () => {
    if (!skill.targetDate || !open.length) return;
    const today = dayKey(Date.now());
    const days = planLessons(open.length, today, skill.targetDate < today ? today : skill.targetDate, 3);
    const existing = new Set((getState().data.todos ?? []).filter((t) => !t.doneAt).map((t) => t.text));
    let n = 0;
    open.forEach((l, k) => {
      const text = `${skill.title}: ${l.title}`;
      if (existing.has(text)) return;
      addTodo({ text, due: days[k], minutes: minutesPerLesson(skill), note: `Skill-Lektion · ${skill.title}` });
      n++;
    });
    setNote(n ? `${n} ${n === 1 ? 'Lektion' : 'Lektionen'} in deine To-dos eingeplant.` : 'Die Lektionen stehen schon in deinen To-dos.');
  };
  return (
    <div className="skill-schedule">
      <span className="skill-remaining">{remainingText(skill)}</span>
      {open.length > 0 && (
        <span className="skill-target">
          <label>
            <IconCalendar size={14} /> Ziel bis
            <input
              type="date"
              className="input sm"
              value={skill.targetDate ?? ''}
              min={dayKey(Date.now())}
              onChange={(e) => (updateSkill(skill.id, { targetDate: e.target.value || undefined }), setNote(''))}
            />
          </label>
          {skill.targetDate && (
            <button type="button" className="btn outline sm" onClick={plan}>
              In To-dos planen
            </button>
          )}
        </span>
      )}
      {note && <small className="muted">{note}</small>}
    </div>
  );
}

/** The big celebration once the whole skill is done (shown once). */
export function SkillCelebration({ skill }: { skill: Skill }) {
  const show = skillComplete(skill) && !skill.celebrated;
  useEffect(() => {
    if (show) playUi('level');
  }, [show]);
  if (!show) return null;
  const lessons = skill.stages.flatMap((st) => st.lessons).filter((l) => !l.known).length;
  const minutes = Math.round(skill.stages.flatMap((st) => st.lessons).reduce((a, l) => a + (l.minutes ?? 0), 0));
  const close = () => updateSkill(skill.id, { celebrated: Date.now() });
  return (
    <div className="skill-party" role="dialog" aria-modal="true" aria-labelledby="party-title">
      <Confetti count={90} />
      <div className="skill-party-card">
        <Mascot mood="cheer" size={120} />
        <span className="party-trophy">
          <IconTrophy size={28} />
        </span>
        <h2 id="party-title">Geschafft: {skill.title}!</h2>
        <p>Du hast dein Ziel „{skill.levels[skill.targetLevel] ?? skill.stages[skill.stages.length - 1]?.name}“ erreicht. Pip ist mächtig stolz auf dich.</p>
        <div className="party-stats">
          <span>
            <b>{skill.stages.length}</b> Stufen
          </span>
          <span>
            <b>{lessons}</b> Lektionen
          </span>
          {minutes > 0 && (
            <span>
              <b>{minutes < 90 ? `${minutes} Min.` : `${String(Math.round(minutes / 6) / 10).replace('.', ',')} Std.`}</b> gelernt
            </span>
          )}
        </div>
        <p className="muted small">In deinem Aquarium schwimmt jetzt ein Goldfisch für diesen Skill.</p>
        <button type="button" className="btn primary" onClick={close} autoFocus>
          Weiter
        </button>
      </div>
    </div>
  );
}

/** Today's goal as a small ring („4/6 Aufgaben“) and the streak of this skill; a click chooses the goal. */
export function SkillGoal({ skill, compact = false }: { skill: Skill; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = skillToday(skill);
  const streak = skillStreak(skill);
  const share = Math.min(1, t.done / t.goal);
  const R = compact ? 9 : 13;
  const C = 2 * Math.PI * R;
  const size = (R + 3) * 2;
  return (
    <div className={`skill-goal ${compact ? 'compact' : ''} ${t.reached ? 'reached' : ''}`}>
      <button
        type="button"
        className="skill-goal-btn"
        onClick={() => !compact && setOpen(!open)}
        aria-expanded={compact ? undefined : open}
        title={compact ? 'Tagesziel dieses Skills' : 'Tagesziel ändern'}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={R} className="sg-track" />
          <circle cx={size / 2} cy={size / 2} r={R} className="sg-fill" strokeDasharray={C} strokeDashoffset={C * (1 - share)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
        <span className="sg-text">
          {t.reached ? (
            <b>
              <IconCheck size={13} /> Tagesziel geschafft
            </b>
          ) : (
            <b>
              Heute {t.done}/{t.goal} Aufgaben
            </b>
          )}
          <small className={streak ? 'sg-streak on' : 'sg-streak'}>
            <IconFlame size={13} /> {streak ? `Serie ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : 'Noch keine Serie'}
          </small>
        </span>
      </button>
      {open && (
        <div className="skill-goal-pick" role="radiogroup" aria-label="Tagesziel">
          {GOALS.map((g) => (
            <button
              key={g.n}
              type="button"
              role="radio"
              aria-checked={t.goal === g.n}
              className={'chip' + (t.goal === g.n ? ' on' : '')}
              onClick={() => (updateSkill(skill.id, { dailyGoal: g.n }), setOpen(false))}
            >
              {g.label} · {g.n} Aufgaben{g.hint ? ` (${g.hint})` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
