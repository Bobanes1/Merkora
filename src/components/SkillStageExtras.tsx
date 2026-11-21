import { useEffect, useState } from 'react';
import { gradeStageProject, makeStageProject, makeStageSheet, useSkillTask } from '../lib/skillRun';
import { projectPassed, type Skill } from '../lib/skills';
import { CodeEditor } from './CodeEditor';
import { IconCheck, IconSparkle } from './Icons';
import { Markdown } from './Markdown';
import { Mascot } from './Mascot';

/** Points with a German decimal comma („4,5“). */
const pts = (n: number) => String(Math.round(n * 2) / 2).replace('.', ',');

const Busy = ({ text }: { text: string }) => (
  <div className="skill-busy">
    <Mascot mood="think" size={64} />
    <p className="muted">{text}</p>
  </div>
);

/** The mini project of a stage: brief, steps, your solution, grading with the rubric. */
export function ProjectView({ skill, stageId, onBack }: { skill: Skill; stageId: string; onBack: () => void }) {
  const stage = skill.stages.find((st) => st.id === stageId);
  const project = stage?.project;
  const t = useSkillTask(skill.id + ':project:' + stageId);
  const [answer, setAnswer] = useState(() => project?.submission ?? project?.starter ?? '');
  useEffect(() => {
    if (stage && !project && !t.busy) void makeStageProject(skill.id, stageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, !!project]);
  useEffect(() => {
    if (project && !answer) setAnswer(project.submission ?? project.starter ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!project]);
  if (!stage) return null;
  const g = project?.grade;
  return (
    <div className="practice skill-project">
      <button type="button" className="btn ghost sm" onClick={onBack}>
        ‹ {skill.title}
      </button>
      {!project && (t.busy || !t.error) && <Busy text={`Pip entwirft dein Projekt zur Stufe „${stage.name}“ …`} />}
      {t.error && !project && (
        <p className="err-msg">
          {t.error}{' '}
          <button type="button" className="link-btn" onClick={() => void makeStageProject(skill.id, stageId)}>
            Nochmal versuchen
          </button>
        </p>
      )}
      {project && (
        <>
          <section className="panel">
            <span className="badge">Mini-Projekt · {stage.name}</span>
            <h2>{project.title}</h2>
            <Markdown text={project.brief} />
            {project.steps.length > 0 && (
              <ol className="project-steps">
                {project.steps.map((s, k) => (
                  <li key={k}>{s}</li>
                ))}
              </ol>
            )}
            <details className="project-rubric">
              <summary>So wird bewertet ({project.rubric.reduce((n, r) => n + r.points, 0)} Punkte, ab 70 % geschafft)</summary>
              <ul>
                {project.rubric.map((r, k) => (
                  <li key={k}>
                    {r.criterion} <small className="muted">({r.points} P.)</small>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section className="panel">
            <h2>Deine Lösung</h2>
            {project.deliverable === 'code' ? (
              <CodeEditor value={answer} onChange={setAnswer} label="Dein Code" />
            ) : (
              <textarea className="input project-answer" rows={12} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Schreib hier deine Lösung …" />
            )}
            <div className="row-gap">
              <button type="button" className="btn primary" disabled={t.busy || !answer.trim()} onClick={() => void gradeStageProject(skill.id, stageId, answer)}>
                <IconSparkle size={15} /> {t.busy ? 'Pip bewertet …' : g ? 'Nochmal einreichen' : 'Einreichen'}
              </button>
              {t.error && <small className="err-msg">{t.error}</small>}
            </div>
          </section>
          {g && (
            <section className={`panel project-grade ${projectPassed(g) ? 'ok' : ''}`}>
              <h2>
                {projectPassed(g) ? <IconCheck size={18} /> : null} {pts(g.total)} von {pts(g.max)} Punkten
                {projectPassed(g) ? ' – geschafft!' : ''}
              </h2>
              <ul className="project-criteria">
                {g.criteria.map((c, k) => (
                  <li key={k}>
                    <b>
                      {c.criterion}: {pts(c.points)}/{pts(c.max)}
                    </b>
                    <span className="muted">{c.feedback}</span>
                  </li>
                ))}
              </ul>
              {g.summary && <p>{g.summary}</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** The cheat sheet of a passed stage: one page to look things up – also printable. */
export function SheetView({ skill, stageId, onBack }: { skill: Skill; stageId: string; onBack: () => void }) {
  const stage = skill.stages.find((st) => st.id === stageId);
  const t = useSkillTask(skill.id + ':sheet:' + stageId);
  useEffect(() => {
    if (stage && !stage.sheet && !t.busy) void makeStageSheet(skill.id, stageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, !!stage?.sheet]);
  if (!stage) return null;
  return (
    <div className="practice skill-sheet">
      <div className="row-gap no-print">
        <button type="button" className="btn ghost sm" onClick={onBack}>
          ‹ {skill.title}
        </button>
        {stage.sheet && (
          <button type="button" className="btn outline sm" onClick={() => window.print()}>
            Drucken
          </button>
        )}
      </div>
      {!stage.sheet && (t.busy || !t.error) && <Busy text={`Pip fasst die Stufe „${stage.name}“ zusammen …`} />}
      {t.error && !stage.sheet && (
        <p className="err-msg">
          {t.error}{' '}
          <button type="button" className="link-btn" onClick={() => void makeStageSheet(skill.id, stageId)}>
            Nochmal versuchen
          </button>
        </p>
      )}
      {stage.sheet && (
        <article className="panel sheet-page">
          <small className="muted">
            Spickzettel · {skill.title} · Stufe {stage.name}
          </small>
          <Markdown text={stage.sheet} />
        </article>
      )}
    </div>
  );
}
