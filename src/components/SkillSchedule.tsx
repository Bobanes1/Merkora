import { useEffect, useState } from 'react';
import { minutesPerLesson, openLessons, planLessons, remainingText, skillComplete, type Skill } from '../lib/skills';
import { addTodo, getState, updateSkill } from '../lib/store';
import { playUi } from '../lib/uiSound';
import { dayKey } from '../lib/util';
import { IconCalendar, IconTrophy } from './Icons';
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
