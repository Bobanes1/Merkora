import { makeReview, useSkillTask } from '../lib/skillRun';
import { competenceMap, weakLessons, type CompetenceState, type Skill } from '../lib/skills';
import { IconSparkle } from './Icons';

const LABEL: Record<CompetenceState, string> = { good: 'sitzt', ok: 'fast', weak: 'wackelt', new: 'noch offen', skipped: 'übersprungen' };

/** How well each topic (lesson) sits – from first tries, hints and the stage test; weak topics can be trained at once. */
export function SkillCompetence({ skill, onOpen, onTrain }: { skill: Skill; onOpen: (lessonId: string) => void; onTrain: () => void }) {
  const t = useSkillTask(skill.id + ':review');
  const map = competenceMap(skill);
  const rows = map.flatMap((g) => g.rows);
  const tried = rows.filter((r) => r.state !== 'new' && r.state !== 'skipped');
  if (!tried.length) return null;
  const weak = weakLessons(skill);
  const count = (s: CompetenceState) => rows.filter((r) => r.state === s).length;
  const train = () => {
    void makeReview(
      skill.id,
      weak.map((l) => l.id),
    );
    onTrain();
  };
  return (
    <details className="panel skill-competence" open>
      <summary>
        Kompetenz-Karte
        <span className="sc-sum">
          <i className="good" /> {count('good')} sitzen
          <i className="ok" /> {count('ok')} fast
          <i className="weak" /> {count('weak')} wackeln
        </span>
      </summary>
      {weak.length > 0 && (
        <div className="sc-weak">
          <span className="grow">
            Am unsichersten: <b>{weak.map((l) => l.title).join(', ')}</b>
          </span>
          <button type="button" className="btn primary sm" onClick={train} disabled={t.busy}>
            <IconSparkle size={14} /> Schwachstellen üben
          </button>
        </div>
      )}
      {map.map((g) => (
        <div key={g.stage.id} className="sc-stage">
          <h3>{g.stage.name}</h3>
          {g.rows.map((r) => (
            <button key={r.lesson.id} type="button" className={'sc-row ' + r.state} onClick={() => onOpen(r.lesson.id)} title={`${r.lesson.title}: ${LABEL[r.state]}`}>
              <span className="sc-title">{r.lesson.title}</span>
              <span className="sc-bar">
                <i style={{ width: r.state === 'new' ? '0%' : `${Math.round(r.share * 100)}%` }} />
              </span>
              <small>{r.state === 'new' || r.state === 'skipped' ? LABEL[r.state] : `${Math.round(r.share * 100)} % · ${LABEL[r.state]}`}</small>
            </button>
          ))}
        </div>
      ))}
      <p className="muted small">Grundlage: deine ersten Versuche, Hinweise und angezeigte Lösungen – und der Stufentest, falls gemacht.</p>
    </details>
  );
}

/**
 * The competence map at a glance, right under the skill header: one small field per lesson
 * (green = sitzt, yellow = fast, orange = wackelt, grey = offen), counts and „Schwachstellen üben“.
 */
export function CompetenceStrip({ skill, onOpen, onTrain }: { skill: Skill; onOpen: (lessonId: string) => void; onTrain: () => void }) {
  const t = useSkillTask(skill.id + ':review');
  const map = competenceMap(skill);
  const rows = map.flatMap((g) => g.rows);
  if (!rows.some((r) => r.state !== 'new' && r.state !== 'skipped')) return null;
  const weak = weakLessons(skill);
  const count = (s: CompetenceState) => rows.filter((r) => r.state === s).length;
  const train = () => {
    void makeReview(
      skill.id,
      weak.map((l) => l.id),
    );
    onTrain();
  };
  return (
    <div className="comp-strip skill-competence">
      <div className="comp-cells" role="list" aria-label="Kompetenz je Lektion">
        {map.map((g, gi) => (
          <span key={g.stage.id} className="comp-stage" title={g.stage.name}>
            {gi > 0 && <i className="comp-sep" aria-hidden="true" />}
            {g.rows.map((r) => (
              <button
                key={r.lesson.id}
                type="button"
                role="listitem"
                className={'comp-cell ' + r.state}
                onClick={() => onOpen(r.lesson.id)}
                title={`${r.lesson.title}: ${r.state === 'new' || r.state === 'skipped' ? LABEL[r.state] : `${Math.round(r.share * 100)} % · ${LABEL[r.state]}`}`}
                aria-label={`${r.lesson.title}: ${LABEL[r.state]}`}
              />
            ))}
          </span>
        ))}
      </div>
      <span className="comp-sum">
        <i className="good" /> {count('good')} sitzen <i className="ok" /> {count('ok')} fast <i className="weak" /> {count('weak')} wackeln
      </span>
      {weak.length > 0 && (
        <button type="button" className="btn outline sm" onClick={train} disabled={t.busy}>
          <IconSparkle size={13} /> Schwachstellen üben
        </button>
      )}
    </div>
  );
}
