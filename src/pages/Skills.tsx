import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconSparkle, IconUpload } from '../components/Icons';
import { NoKeyNotice } from '../components/NoKey';
import { hasKey } from '../lib/ai';
import { MATERIAL_ACCEPT, readFileText } from '../lib/files';
import { DOMAIN_LABEL } from '../lib/practice';
import { startSkill } from '../lib/skillRun';
import { nextLesson, skillProgress } from '../lib/skills';
import { setSettings, useData } from '../lib/store';
import type { Skill } from '../lib/skills';

const EXAMPLES = ['Stochastik', 'Java programmieren', 'Vertragsrecht – Fälle lösen', 'Musiktheorie: Akkorde und Intervalle', 'Lineare Algebra', 'Spanisch Grammatik'];

/** „Skills“: learn a topic by doing it – without flashcards. */
export default function Skills() {
  const data = useData();
  const navigate = useNavigate();
  const skills = data.skills ?? [];
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState(data.settings.eduLevel ?? '');
  const [material, setMaterial] = useState('');
  const [fileNote, setFileNote] = useState('');

  const start = () => {
    if (!topic.trim()) return;
    if (level) setSettings({ eduLevel: level });
    const id = startSkill(topic, level, material);
    navigate(`/skills/${id}`);
  };
  const onFiles = async (list: FileList | null) => {
    const texts: string[] = [];
    for (const f of Array.from(list ?? [])) {
      try {
        texts.push(await readFileText(f));
      } catch (e) {
        setFileNote(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (texts.length) {
      setMaterial((m) => [m, ...texts].filter(Boolean).join('\n\n'));
      setFileNote(`${texts.length} ${texts.length === 1 ? 'Datei' : 'Dateien'} übernommen.`);
    }
  };

  return (
    <div className="page skills-page">
      <header className="page-head">
        <h1>Skills</h1>
        <p className="muted">Lernen durch Tun: Du gibst ein Thema an, Pip plant mit dir einen Lernpfad bis zu deinem Ziel – und dann übst du aktiv, Lektion für Lektion.</p>
      </header>

      <section className="panel skill-new">
        <h2>Was willst du können?</h2>
        {!hasKey() ? (
          <NoKeyNotice compact />
        ) : (
          <>
            <div className="input-row">
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} placeholder="z. B. Stochastik, Strafrecht, Akkorde, Java …" aria-label="Thema" />
              <button type="button" className="btn primary" onClick={start} disabled={!topic.trim()}>
                <IconSparkle size={16} /> Lernpfad planen
              </button>
            </div>
            <div className="chips">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="chip" onClick={() => setTopic(e)}>
                  {e}
                </button>
              ))}
            </div>
            <details className="skill-more">
              <summary>Mehr Angaben (optional)</summary>
              <label className="field-label" htmlFor="skill-level">
                Wo lernst du gerade?
              </label>
              <input id="skill-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="z. B. Gymnasium 11. Klasse, Jura-Studium 2. Semester, Hobby" />
              <label className="field-label" htmlFor="skill-material">
                Eigenes Material (Skript, Folien, Notizen) – dann richtet sich der Lernpfad danach
              </label>
              <textarea id="skill-material" className="input" rows={4} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Text einfügen …" />
              <label className="btn outline sm">
                <IconUpload size={14} /> Dateien wählen
                <input type="file" multiple accept={MATERIAL_ACCEPT} hidden onChange={(e) => void onFiles(e.target.files)} />
              </label>
              {fileNote && <small className="muted"> {fileNote}</small>}
            </details>
          </>
        )}
      </section>

      {skills.length > 0 && (
        <section className="panel">
          <h2>Deine Skills</h2>
          <div className="skill-grid">
            {skills.map((s) => (
              <SkillTile key={s.id} skill={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SkillTile({ skill }: { skill: Skill }) {
  const p = skillProgress(skill);
  const next = nextLesson(skill);
  return (
    <Link to={`/skills/${skill.id}`} className="skill-tile">
      <span className={'badge ' + skill.domain}>{DOMAIN_LABEL[skill.domain]}</span>
      <b>{skill.title}</b>
      {skill.status === 'planning' ? (
        <small className="muted">Lernpfad wird geplant …</small>
      ) : (
        <>
          <small className="muted">
            {p.done} von {p.total} Lektionen · Ziel: {skill.levels[skill.targetLevel] ?? '–'}
          </small>
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${Math.round(p.share * 100)}%` }} />
          </span>
          {next && <small>Weiter: {next.lesson.title}</small>}
        </>
      )}
    </Link>
  );
}

