import { useState } from 'react';
import { attachSkillFiles } from '../lib/deckFiles';
import { Link, useNavigate } from 'react-router-dom';
import { IconClose, IconFlame, IconNote, IconShuffle, IconSparkle, IconTrash, IconUpload } from '../components/Icons';
import { undoable } from '../lib/undo';
import { NoKeyNotice } from '../components/NoKey';
import { hasKey } from '../lib/ai';
import { MATERIAL_ACCEPT, readFileText } from '../lib/files';
import { DOMAIN_LABEL } from '../lib/practice';
import { startMiniSkill, startSkill } from '../lib/skillRun';
import { levelLabel } from '../lib/mockExamCore';
import { MINI_POOL, TOPIC_POOL, nextLesson, pickTopics, skillProgress, skillStreak, skillToday } from '../lib/skills';
import { deleteSkill, setSettings, useData } from '../lib/store';
import type { Skill } from '../lib/skills';

const today = () => Math.floor(Date.now() / 86_400_000);

/** The level for skills: what was typed here, else the one from the mock exam – as its name, not its key („bachelor“). */
function defaultLevel(st: { skillLevel?: string; eduLevel?: string; eduDetail?: string }) {
  if (st.skillLevel !== undefined) return st.skillLevel;
  if (!st.eduLevel) return '';
  return levelLabel(st.eduLevel) + (st.eduDetail ? ` (${st.eduDetail})` : '');
}

/** „Skills“: learn a topic by doing it – without flashcards. */
export default function Skills() {
  const data = useData();
  const navigate = useNavigate();
  const skills = data.skills ?? [];
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState(() => defaultLevel(data.settings));
  // suggestions: a new few every day, „Andere Vorschläge“ shuffles on
  const [seed, setSeed] = useState(today);
  const have = skills.flatMap((s) => [s.title, s.topic]);
  const examples = pickTopics(TOPIC_POOL, 6, seed, have);
  const minis = pickTopics(MINI_POOL, 4, seed * 7 + 3, have);
  const [ownMini, setOwnMini] = useState('');
  const startMini = (t: string) => {
    if (!t.trim()) return;
    navigate(`/skills/${startMiniSkill(t, level)}`);
  };
  const big = skills.filter((s) => !s.mini);
  const small = skills.filter((s) => s.mini);
  const [material, setMaterial] = useState('');
  const [fileNote, setFileNote] = useState('');
  // the documents themselves are kept too (not only their text), so they stay visible in the skill
  const [files, setFiles] = useState<File[]>([]);

  const start = () => {
    if (!topic.trim()) return;
    setSettings({ skillLevel: level });
    const id = startSkill(topic, level, material);
    if (files.length) void attachSkillFiles(id, files);
    navigate(`/skills/${id}`);
  };
  const onFiles = async (list: FileList | null) => {
    const texts: string[] = [];
    for (const f of Array.from(list ?? [])) {
      try {
        texts.push(await readFileText(f));
        setFiles((x) => [...x.filter((y) => y.name !== f.name), f]);
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
              {examples.map((e) => (
                <button key={e} type="button" className="chip" onClick={() => setTopic(e)}>
                  {e}
                </button>
              ))}
              <button type="button" className="chip ghost-chip" onClick={() => setSeed((x) => x + 1)} title="Andere Themen vorschlagen">
                <IconShuffle size={13} /> Andere Vorschläge
              </button>
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
              {files.length > 0 && (
                <ul className="skill-file-list">
                  {files.map((f) => (
                    <li key={f.name}>
                      <IconNote size={14} /> <span className="grow">{f.name}</span>
                      <button type="button" className="icon-btn sm" aria-label={`${f.name} entfernen`} onClick={() => setFiles((x) => x.filter((y) => y !== f))}>
                        <IconClose size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </>
        )}
      </section>

      {hasKey() && (
        <section className="panel mini-new">
          <div className="mini-head">
            <div className="grow">
              <h2>Mal was Neues – in 20 Minuten</h2>
              <p className="muted small">Kleine Mini-Skills zum Spaß und Horizont-Erweitern: drei kurze Lektionen, sofort los, ohne Planung.</p>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setSeed((x) => x + 1)}>
              <IconShuffle size={14} /> Andere
            </button>
          </div>
          <div className="mini-cards">
            {minis.map((m) => (
              <button key={m} type="button" className="mini-card" onClick={() => startMini(m)}>
                <IconSparkle size={16} />
                <b>{m}</b>
                <small>Los geht's ›</small>
              </button>
            ))}
          </div>
          <div className="input-row mini-own">
            <input className="input" value={ownMini} onChange={(e) => setOwnMini(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startMini(ownMini)} placeholder="Eigenes Thema als Mini-Skill, z. B. Jonglieren, Wie Vulkane entstehen …" aria-label="Eigenes Mini-Skill-Thema" />
            <button type="button" className="btn outline" onClick={() => startMini(ownMini)} disabled={!ownMini.trim()}>
              Mini-Skill starten
            </button>
          </div>
        </section>
      )}

      {big.length > 0 && (
        <section className="panel">
          <h2>Deine Skills</h2>
          <div className="skill-grid">
            {big.map((s) => (
              <SkillTile key={s.id} skill={s} />
            ))}
          </div>
        </section>
      )}
      {small.length > 0 && (
        <section className="panel">
          <h2>Mini-Skills</h2>
          <div className="skill-grid">
            {small.map((s) => (
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
    <Link to={`/skills/${skill.id}`} className="skill-tile" data-domain={skill.domain}>
      <span className="tile-badges">
        <span className={'badge ' + skill.domain} data-domain={skill.domain}>{DOMAIN_LABEL[skill.domain]}</span>
        {skill.mini && <span className="badge mini-badge">Mini</span>}
      </span>
      <b>{skill.title}</b>
      {skill.status === 'planning' ? (
        <>
          <small className="muted">{skill.mini ? 'Mini-Skill wird gebaut …' : 'Lernpfad wird geplant …'}</small>
          <button
            type="button"
            className="icon-btn skill-tile-del"
            aria-label={`Skill „${skill.title}“ löschen`}
            title="Löschen"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              undoable(`Skill „${skill.title}“ gelöscht`, () => deleteSkill(skill.id));
            }}
          >
            <IconTrash size={15} />
          </button>
        </>
      ) : (
        <>
          <small className="muted">
            {p.done} von {p.total} Lektionen · Ziel: {skill.levels[skill.targetLevel] ?? '–'}
          </small>
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${Math.round(p.share * 100)}%` }} />
          </span>
          {next && <small>Weiter: {next.lesson.title}</small>}
          <SkillTileGoal skill={skill} />
        </>
      )}
    </Link>
  );
}


/** Today's goal and the streak on a skill tile. */
function SkillTileGoal({ skill }: { skill: Skill }) {
  const t = skillToday(skill);
  const streak = skillStreak(skill);
  if (!t.done && !streak) return null;
  return (
    <small className={'tile-goal' + (t.reached ? ' reached' : '')}>
      {streak > 0 && (
        <span className="sg-streak on">
          <IconFlame size={12} /> {streak}
        </span>
      )}
      heute {t.done}/{t.goal}
    </small>
  );
}
