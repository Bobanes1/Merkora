import { useEffect, useMemo, useRef, useState } from 'react';
import { attachSkillFiles, materialAsDeckFile } from '../lib/deckFiles';
import { combineMaterialsText, unifiedCourseMaterials } from '../lib/courseDocs';
import { Link, useNavigate } from 'react-router-dom';
import { IconClose, IconEdit, IconFlame, IconFolder, IconNote, IconSearch, IconShuffle, IconSparkle, IconStar, IconStarLine, IconTrash, IconUpload } from '../components/Icons';
import { Mascot } from '../components/Mascot';
import { PromptModal } from '../components/Modal';
import { undoable } from '../lib/undo';
import { pokeMove, type PokeMove } from '../lib/pipLines';
import { NoKeyNotice } from '../components/NoKey';
import { hasKey } from '../lib/ai';
import { MATERIAL_ACCEPT, readFileText } from '../lib/files';
import { DOMAIN_LABEL } from '../lib/practice';
import { startMiniSkill, startSkill } from '../lib/skillRun';
import { levelLabel } from '../lib/mockExamCore';
import { nextLesson, pageTopics, skillProgress, skillStreak, skillToday } from '../lib/skills';
import { deleteSkill, setSettings, updateSkill, useData, type DeckFile } from '../lib/store';
import type { Skill } from '../lib/skills';
import { CAT_LABEL, MINI_IDEAS, SKILL_IDEAS, TOPIC_CATS, type TopicCat, type TopicIdea } from '../lib/topicPool';

const today = () => Math.floor(Date.now() / 86_400_000);
type SkillStatusFilter = 'all' | 'active' | 'done';

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
  const [myQuery, setMyQuery] = useState('');
  const [myStatus, setMyStatus] = useState<SkillStatusFilter>('all');
  const [renaming, setRenaming] = useState<Skill | null>(null);
  const st = data.settings;
  const [onboard, setOnboard] = useState(() => !st.skillOnboarded && skills.length === 0);
  // suggestions: a fixed order per day; each „Andere“ shows the next block of its own section only
  const seed = useMemo(today, []);
  const [skillPage, setSkillPage] = useState(0);
  const [miniPage, setMiniPage] = useState(0);
  const [skillCat, setSkillCatRaw] = useState<TopicCat | ''>(() => readCat('merkora.skillCat'));
  const [miniCat, setMiniCatRaw] = useState<TopicCat | ''>(() => readCat('merkora.miniCat'));
  const setSkillCat = (c: TopicCat | '') => (setSkillCatRaw(c), setSkillPage(0), saveCat('merkora.skillCat', c));
  const setMiniCat = (c: TopicCat | '') => (setMiniCatRaw(c), setMiniPage(0), saveCat('merkora.miniCat', c));
  const have = skills.flatMap((s) => [s.title, s.topic]);
  const interests = st.skillInterests ?? [];
  const pool = (ideas: TopicIdea[], cat: TopicCat | '') => ideas.filter((x) => !cat || x.cat === cat);
  const preferred = (ideas: TopicIdea[]) => ideas.filter((x) => interests.includes(x.cat)).map((x) => x.t);
  const skillIdeas = pool(SKILL_IDEAS, skillCat);
  const miniIdeas = pool(MINI_IDEAS, miniCat);
  const examples = pageTopics(skillIdeas.map((x) => x.t), 6, seed, skillPage, have, skillCat ? [] : preferred(SKILL_IDEAS));
  const minis = pageTopics(miniIdeas.map((x) => x.t), 4, seed * 7 + 3, miniPage, have, miniCat ? [] : preferred(MINI_IDEAS));
  const ideaOf = (t: string) => SKILL_IDEAS.find((x) => x.t === t) ?? MINI_IDEAS.find((x) => x.t === t);
  const picked = ideaOf(topic);
  const [ownMini, setOwnMini] = useState('');
  const withGoal = (lv: string) => (st.skillGoal ? [lv, `Ziel: ${GOAL_LABEL[st.skillGoal]}`].filter(Boolean).join(' – ') : lv);
  const startMini = (t: string) => {
    if (!t.trim()) return;
    navigate(`/skills/${startMiniSkill(t, level)}`);
  };

  const filterAndSort = (list: Skill[]) => {
    const q = myQuery.trim().toLocaleLowerCase('de');
    return list
      .filter((s) => {
        if (q && !`${s.title} ${s.topic} ${DOMAIN_LABEL[s.domain]}`.toLocaleLowerCase('de').includes(q)) return false;
        if (myStatus === 'all') return true;
        const p = skillProgress(s);
        const isDone = s.status === 'active' && p.total > 0 && p.done >= p.total;
        return myStatus === 'done' ? isDone : !isDone;
      })
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  };

  const allBig = skills.filter((s) => !s.mini);
  const allSmall = skills.filter((s) => s.mini);
  const big = filterAndSort(allBig);
  const small = filterAndSort(allSmall);

  const [material, setMaterial] = useState('');
  const [fileNote, setFileNote] = useState('');
  // the documents themselves are kept too (not only their text), so they stay visible in the skill
  const [files, setFiles] = useState<File[]>([]);
  const [linkedCourseId, setLinkedCourseId] = useState('');
  const [linkedFiles, setLinkedFiles] = useState<DeckFile[]>([]);

  const selectedCourse = linkedCourseId ? data.courses.find((c) => c.id === linkedCourseId) : undefined;
  const selectedCourseMats = useMemo(
    () => (selectedCourse ? unifiedCourseMaterials(selectedCourse, data.decks) : []),
    [selectedCourse, data.decks],
  );

  const start = () => {
    if (!topic.trim()) return;
    setSettings({ skillLevel: level });
    const id = startSkill(topic, withGoal(level), material, {
      courseId: linkedCourseId || undefined,
      files: linkedFiles.length ? linkedFiles : undefined,
    });
    if (files.length) void attachSkillFiles(id, files);
    navigate(`/skills/${id}`);
  };
  const pullCourseMaterials = () => {
    if (!selectedCourse || !selectedCourseMats.length) return;
    const text = combineMaterialsText(selectedCourseMats, 60000);
    const dfs = selectedCourseMats.map((m) => materialAsDeckFile(m)).filter((f): f is DeckFile => f !== null);
    if (text) setMaterial((m) => [m, text].filter(Boolean).join('\n\n'));
    if (dfs.length) setLinkedFiles((cur) => [...cur.filter((x) => !dfs.some((d) => d.id === x.id)), ...dfs]);
    if (!topic.trim()) setTopic(selectedCourse.name);
    setFileNote(`${selectedCourseMats.length} ${selectedCourseMats.length === 1 ? 'Datei / Notiz' : 'Dateien & Notizen'} aus „${selectedCourse.name}“ übernommen.`);
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

  const [poke, setPoke] = useState<{ move: PokeMove; n: number; active: boolean } | null>(null);
  const pokeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (pokeTimer.current) window.clearTimeout(pokeTimer.current); }, []);
  const pokePip = () => {
    const n = (poke?.n ?? 0) + 1;
    const move = pokeMove(n);
    setPoke({ move, n, active: true });
    if (pokeTimer.current) window.clearTimeout(pokeTimer.current);
    pokeTimer.current = window.setTimeout(() => setPoke((p) => (p && p.n === n ? { ...p, active: false } : p)), 1500);
  };
  const pipSay = topic.trim()
    ? `Klingt spannend – soll ich dir einen Lernpfad zu „${topic.trim()}“ bauen?`
    : skills.length > 0
      ? 'Schön dich zu sehen! Mach an einem Skill weiter oder starte etwas Neues.'
      : 'Sag mir, was du lernen willst – ich baue dir einen Lernpfad zum Anfassen!';

  return (
    <div className="page skills-page">
      <header className="page-head skills-pip-head">
        <button
          type="button"
          className={`skills-pip-btn${poke?.active && poke.move === 'flip' ? ' poke-flip' : ''}`}
          aria-label="Pip anstupsen"
          title="Pip anstupsen"
          onClick={pokePip}
        >
          <Mascot
            who="pip"
            mood={poke?.active ? (poke.move === 'flip' ? 'happy' : poke.move) : topic.trim() ? 'think' : 'wave'}
            pulse={poke ? `${poke.n}${poke.active ? 'a' : 'r'}` : undefined}
            size={84}
          />
        </button>
        <div className="skills-pip-copy">
          <h1>Skills</h1>
          <p className="muted" style={{ margin: 0 }}>
            Lernen durch Tun: Du gibst ein Thema an, Pip plant mit dir einen Lernpfad bis zu deinem Ziel – und dann übst du aktiv, Lektion für Lektion.
          </p>
          <span className="skills-pip-bubble">{pipSay}</span>
        </div>
      </header>

      {hasKey() && onboard && (
        <SkillOnboard
          onDone={(lv) => {
            setOnboard(false);
            if (lv !== undefined) setLevel(lv);
            setSkillCat('');
            setMiniCat('');
          }}
        />
      )}

      <section className="panel skill-new">
        <div className="mini-head">
          <h2 className="grow">Was willst du können?</h2>
          {hasKey() && (
            <button type="button" className="btn ghost sm" onClick={() => setSkillPage((x) => x + 1)} title="Andere Themen vorschlagen">
              <IconShuffle size={14} /> Andere
            </button>
          )}
        </div>
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
            <CatFilter value={skillCat} onChange={setSkillCat} label="Themen filtern" />
            <div className="chips">
              {examples.map((e) => (
                <button key={e} type="button" className={`chip${topic === e ? ' on' : ''}`} onClick={() => setTopic(e)}>
                  {e}
                </button>
              ))}
            </div>
            {picked && (
              <p className="skill-idea-info">
                <span className="skill-cat-badge">{CAT_LABEL[picked.cat]}</span> {picked.info}
              </p>
            )}
            <div className="skill-new-foot">
              <details className="skill-more">
                <summary>Mehr Angaben &amp; Material (optional)</summary>
                <label className="field-label" htmlFor="skill-level">
                  Wo lernst du gerade?
                </label>
                <input id="skill-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="z. B. Gymnasium 11. Klasse, Jura-Studium 2. Semester, Hobby" />
                {data.courses.length > 0 && (
                  <>
                    <label className="field-label" htmlFor="skill-course">
                      Mit Modul / Kurs verknüpfen (optional)
                    </label>
                    <div className="input-row">
                      <select
                        id="skill-course"
                        className="input"
                        value={linkedCourseId}
                        onChange={(e) => setLinkedCourseId(e.target.value)}
                      >
                        <option value="">Keinem Modul zugeordnet</option>
                        {data.courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {selectedCourseMats.length > 0 && (
                        <button type="button" className="btn outline sm" onClick={pullCourseMaterials}>
                          <IconFolder size={14} /> Modul-Material übernehmen ({selectedCourseMats.length})
                        </button>
                      )}
                    </div>
                  </>
                )}
                <label className="field-label" htmlFor="skill-material">
                  Eigenes Material (Skript, Folien, Notizen) – dann richtet sich der Lernpfad danach
                </label>
                <textarea id="skill-material" className="input" rows={4} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Text einfügen …" />
                <label className="btn outline sm">
                  <IconUpload size={14} /> Dateien wählen
                  <input type="file" multiple accept={MATERIAL_ACCEPT} hidden onChange={(e) => void onFiles(e.target.files)} />
                </label>
                {fileNote && <small className="muted"> {fileNote}</small>}
                {(files.length > 0 || linkedFiles.length > 0) && (
                  <ul className="skill-file-list">
                    {linkedFiles.map((f) => (
                      <li key={f.id}>
                        <IconNote size={14} /> <span className="grow">{f.name}</span>
                        <button type="button" className="icon-btn sm" aria-label={`${f.name} entfernen`} onClick={() => setLinkedFiles((x) => x.filter((y) => y.id !== f.id))}>
                          <IconClose size={12} />
                        </button>
                      </li>
                    ))}
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
              {!onboard && (
                <button type="button" className="link-btn small" onClick={() => setOnboard(true)}>
                  Interessen ändern
                </button>
              )}
            </div>
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
            <button type="button" className="btn ghost sm" onClick={() => setMiniPage((x) => x + 1)} title="Andere Mini-Skills vorschlagen">
              <IconShuffle size={14} /> Andere
            </button>
          </div>
          <CatFilter value={miniCat} onChange={setMiniCat} label="Mini-Skills filtern" />
          <div className="mini-cards">
            {minis.map((m) => (
              <button key={m} type="button" className="mini-card" onClick={() => startMini(m)}>
                <IconSparkle size={16} />
                <b>{m}</b>
                {ideaOf(m) && <span className="mini-teaser">{ideaOf(m)!.info}</span>}
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

      {skills.length > 0 && (
        <div className="lib-filterbar" style={{ marginTop: 6 }}>
          <div className="lib-search">
            <IconSearch size={15} />
            <input
              value={myQuery}
              onChange={(e) => setMyQuery(e.target.value)}
              placeholder="Meine Skills durchsuchen …"
              aria-label="Meine Skills durchsuchen"
            />
            {myQuery && (
              <button type="button" className="icon-btn sm" aria-label="Suche leeren" onClick={() => setMyQuery('')}>
                <IconClose size={13} />
              </button>
            )}
          </div>
          <div className="row-gap">
            {([
              ['all', 'Alle'],
              ['active', 'Aktiv'],
              ['done', 'Abgeschlossen'],
            ] as [SkillStatusFilter, string][]).map(([id, label]) => (
              <button key={id} type="button" className={`tag${myStatus === id ? ' on' : ''}`} onClick={() => setMyStatus(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {allBig.length > 0 && (
        <section className="panel">
          <h2>Deine Skills {big.length !== allBig.length && <small className="muted">({big.length}/{allBig.length})</small>}</h2>
          {big.length > 0 ? (
            <div className="skill-grid">
              {big.map((s) => (
                <SkillTile key={s.id} skill={s} onRename={() => setRenaming(s)} />
              ))}
            </div>
          ) : (
            <p className="muted small">Keine passenden Skills gefunden.</p>
          )}
        </section>
      )}
      {allSmall.length > 0 && (
        <section className="panel">
          <h2>Mini-Skills {small.length !== allSmall.length && <small className="muted">({small.length}/{allSmall.length})</small>}</h2>
          {small.length > 0 ? (
            <div className="skill-grid">
              {small.map((s) => (
                <SkillTile key={s.id} skill={s} onRename={() => setRenaming(s)} />
              ))}
            </div>
          ) : (
            <p className="muted small">Keine passenden Mini-Skills gefunden.</p>
          )}
        </section>
      )}

      {renaming && (
        <PromptModal
          title="Skill umbenennen"
          label="Neuer Titel"
          initial={renaming.title}
          onClose={() => setRenaming(null)}
          onSubmit={(v) => {
            if (v.trim()) updateSkill(renaming.id, { title: v.trim() });
          }}
        />
      )}
    </div>
  );
}

function SkillTile({ skill, onRename }: { skill: Skill; onRename: () => void }) {
  const data = useData();
  const p = skillProgress(skill);
  const next = nextLesson(skill);
  const course = skill.courseId ? data.courses.find((c) => c.id === skill.courseId) : undefined;
  return (
    <Link to={`/skills/${skill.id}`} className={`skill-tile${skill.pinned ? ' pinned' : ''}`} data-domain={skill.domain}>
      <div className="skill-tile-top">
        <span className="tile-badges">
          <span className={'badge ' + skill.domain} data-domain={skill.domain}>{DOMAIN_LABEL[skill.domain]}</span>
          {skill.mini && <span className="badge mini-badge">Mini</span>}
          {course && <span className="badge course-badge">{course.name}</span>}
        </span>
        <span className="skill-tile-tools">
          <button
            type="button"
            className={`icon-btn sm${skill.pinned ? ' pin-star' : ''}`}
            aria-label={skill.pinned ? 'Nicht mehr anheften' : 'Skill anheften'}
            title={skill.pinned ? 'Lösen' : 'Anheften'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateSkill(skill.id, { pinned: skill.pinned ? undefined : true });
            }}
          >
            {skill.pinned ? <IconStar size={14} /> : <IconStarLine size={14} />}
          </button>
          <button
            type="button"
            className="icon-btn sm"
            aria-label={`Skill „${skill.title}“ umbenennen`}
            title="Umbenennen"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRename();
            }}
          >
            <IconEdit size={13} />
          </button>
          <button
            type="button"
            className="icon-btn sm"
            aria-label={`Skill „${skill.title}“ löschen`}
            title="Löschen"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              undoable(`Skill „${skill.title}“ gelöscht`, () => deleteSkill(skill.id));
            }}
          >
            <IconTrash size={13} />
          </button>
        </span>
      </div>
      <b>{skill.title}</b>
      {skill.status === 'planning' ? (
        <small className="muted">{skill.mini ? 'Mini-Skill wird gebaut …' : 'Lernpfad wird geplant …'}</small>
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

const GOAL_LABEL = { exam: 'Prüfung bestehen', job: 'Für den Job', fun: 'Aus Neugier' } as const;
const STAGES = ['Schule', 'Ausbildung', 'Studium', 'Beruf', 'Hobby'];

const readCat = (key: string): TopicCat | '' => {
  try {
    const v = localStorage.getItem(key) ?? '';
    return (TOPIC_CATS as string[]).includes(v) ? (v as TopicCat) : '';
  } catch {
    return '';
  }
};
const saveCat = (key: string, c: string) => {
  try {
    localStorage.setItem(key, c);
  } catch {
    // no storage: the filter is simply not remembered
  }
};

/** A slim row of category chips: „Alle“ plus one per category. */
function CatFilter({ value, onChange, label }: { value: TopicCat | ''; onChange: (c: TopicCat | '') => void; label: string }) {
  const row = useRef<HTMLDivElement>(null);
  // the chosen category stays visible in the scrolling row
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('.skill-cat.on');
    const box = row.current;
    if (el && box) box.scrollLeft = Math.max(0, el.offsetLeft - box.offsetLeft - 24);
  }, [value]);
  return (
    <div className="skill-cats" role="group" aria-label={label} ref={row}>
      {(['', ...TOPIC_CATS] as (TopicCat | '')[]).map((c) => (
        <button key={c || 'all'} type="button" className={`skill-cat${value === c ? ' on' : ''}`} aria-pressed={value === c} onClick={() => onChange(c)}>
          {c ? CAT_LABEL[c] : 'Alle'}
        </button>
      ))}
    </div>
  );
}

/** Three short questions so the suggestions fit: interests, where one learns, what for. */
function SkillOnboard({ onDone }: { onDone: (level?: string) => void }) {
  const st = useData().settings;
  const [cats, setCats] = useState<TopicCat[]>(st.skillInterests ?? []);
  const [stage, setStage] = useState('');
  const [detail, setDetail] = useState('');
  const [goal, setGoal] = useState<keyof typeof GOAL_LABEL | undefined>(st.skillGoal);
  const toggle = (c: TopicCat) => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  const finish = () => {
    const level = stage ? (detail.trim() ? `${stage} (${detail.trim()})` : stage) : undefined;
    setSettings({ skillInterests: cats, skillGoal: goal, skillOnboarded: true, ...(level !== undefined ? { skillLevel: level } : {}) });
    onDone(level);
  };
  const skip = () => {
    setSettings({ skillOnboarded: true });
    onDone();
  };
  return (
    <section className="panel skill-onboard">
      <h2>Kurz zu dir – dann passen die Vorschläge</h2>
      <div className="onb-q">
        <b>1. Was interessiert dich?</b> <small className="muted">(mehrere möglich)</small>
        <div className="onb-chips">
          {TOPIC_CATS.map((c) => (
            <button key={c} type="button" className={`chip${cats.includes(c) ? ' on' : ''}`} aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>
              {CAT_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="onb-q">
        <b>2. Wo lernst du gerade?</b>
        <div className="onb-chips">
          {STAGES.map((s) => (
            <button key={s} type="button" className={`chip${stage === s ? ' on' : ''}`} aria-pressed={stage === s} onClick={() => setStage(stage === s ? '' : s)}>
              {s}
            </button>
          ))}
        </div>
        {stage && stage !== 'Hobby' && <input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Genauer (optional), z. B. Jura, 2. Semester" aria-label="Genauer" />}
      </div>
      <div className="onb-q">
        <b>3. Wofür lernst du?</b>
        <div className="onb-chips">
          {(Object.keys(GOAL_LABEL) as (keyof typeof GOAL_LABEL)[]).map((g) => (
            <button key={g} type="button" className={`chip${goal === g ? ' on' : ''}`} aria-pressed={goal === g} onClick={() => setGoal(goal === g ? undefined : g)}>
              {GOAL_LABEL[g]}
            </button>
          ))}
        </div>
      </div>
      <div className="onb-actions">
        <button type="button" className="btn primary" onClick={finish}>
          Fertig
        </button>
        <button type="button" className="btn ghost" onClick={skip}>
          Überspringen
        </button>
      </div>
    </section>
  );
}
