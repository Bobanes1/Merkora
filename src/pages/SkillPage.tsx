import { useEffect, useRef, useState } from 'react';
import { SkillCelebration, SkillGoal, SkillSchedule } from '../components/SkillSchedule';
import { SkillCompetence } from '../components/SkillCompetence';
import { playUi } from '../lib/uiSound';
import { ProjectView, SheetView } from '../components/SkillStageExtras';
import { SkillMaterial } from '../components/SkillMaterial';
import { undoable } from '../lib/undo';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CardContent } from '../components/CardContent';
import { ConfirmModal } from '../components/Modal';
import { CostHint } from '../components/CostHint';
import { IconArrowDown, IconArrowUp, IconCheck, IconSkip, IconTools, IconLock, IconPlus, IconSparkle, IconStar, IconTrash, IconTrophy } from '../components/Icons';
import { FloorDecor, NodeDecor, PATH_OFFSETS, PathLink, SandFloor, SwimmingFish, themeFor, Waves } from '../components/PathDecor';
import { Mascot } from '../components/Mascot';
import { PracticeSetView, type SetHost } from '../components/practice/PracticeSetView';
import { askQuestions, ensureLesson, redoLesson, makePlacement, makeProposal, makeReview, makeStageTest, reviseProposal, useSkillTask } from '../lib/skillRun';
import {
  addLesson,
  canReview,
  lessonDone,
  lessonStars,
  mastered,
  moveLesson,
  nextLesson,
  reachedStage,
  recordSolved,
  removeLesson,
  skillToday,
  skillProgress,
  stageReady,
  toggleKnown,
  type Lesson,
  type Skill,
  type Stage,
} from '../lib/skills';
import { DOMAIN_LABEL, problemCount, solvedCount, type PracticeSet, type ProblemProgress } from '../lib/practice';
import { addCards, addCourse, addDeck, addWorkspace, addXp, deleteSkill, getState, updateSkill, useData } from '../lib/store';

/** Saves a task as a flashcard into the deck „{Skill} – Karten“ (made the first time). */
function cardHost(skill: Skill, progress: SetHost['progress'], updateSet?: SetHost['updateSet']): SetHost {
  return {
    progress,
    updateSet,
    level: skill.level,
    saveCard: (front, back, html) => {
      const name = `${skill.title} – Karten`;
      const d = getState().data;
      let deck = d.decks.find((x) => x.name === name);
      if (!deck) {
        let course = d.courses.find((c) => c.name === 'Skills') ?? d.courses[0];
        if (!course) course = addCourse((d.workspaces[0] ?? addWorkspace('Erster Workspace')).id, 'Skills');
        deck = addDeck(course.id, name);
      }
      addCards(deck.id, [{ front, back, ...(html ? { html: true } : {}) }]);
      return `Gespeichert in „${name}“`;
    },
  };
}

/** Updates the progress of one task inside a set that sits somewhere in the skill. */
const patchSet = (set: PracticeSet, i: number, patch: Partial<ProblemProgress>): PracticeSet => ({ ...set, progress: set.progress.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

/**
 * Wraps a progress update: a newly solved task counts for today's goal and the streak of the skill,
 * brings 5 XP, and reaching the daily goal plays a little fanfare.
 */
function tracked(skillId: string, setIn: (s: Skill) => PracticeSet | undefined, progress: SetHost['progress']): SetHost['progress'] {
  return (i, patch) => {
    const s = getState().data.skills?.find((x) => x.id === skillId);
    const rec = s ? recordSolved(s, setIn(s), i, patch) : {};
    progress(i, patch);
    if (!s || !rec.activity) return;
    const before = skillToday(s);
    updateSkill(skillId, { activity: rec.activity });
    addXp(5);
    if (!before.reached && before.done + 1 >= before.goal) playUi('level');
  };
}

export default function SkillPage() {
  const { id = '' } = useParams();
  const data = useData();
  const skill = data.skills?.find((s) => s.id === id);
  if (!skill)
    return (
      <div className="page">
        <p>Diesen Skill gibt es nicht (mehr).</p>
        <Link to="/skills" className="btn outline">
          Zu den Skills
        </Link>
      </div>
    );
  return <div className="page skill-page" data-domain={skill.domain}>{skill.status === 'planning' ? <Planner skill={skill} /> : <Path skill={skill} />}</div>;
}

function Busy({ text }: { text: string }) {
  return (
    <div className="skill-busy" role="status">
      <Mascot mood="think" size={56} />
      <span>{text}</span>
    </div>
  );
}
function Failed({ error, retry }: { error?: string; retry: () => void }) {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      {error}{' '}
      <button type="button" className="link-btn" onClick={retry}>
        Nochmal versuchen
      </button>
    </div>
  );
}

// ---------- planning ----------
function Planner({ skill }: { skill: Skill }) {
  const q = useSkillTask(skill.id + ':questions');
  const pl = useSkillTask(skill.id + ':placement');
  const pr = useSkillTask(skill.id + ':proposal');
  const [testing, setTesting] = useState(false);
  const questions = skill.plan.questions ?? [];

  return (
    <>
      <Link to="/skills" className="btn ghost sm">
        ‹ Skills
      </Link>
      <header className="page-head">
        <h1>{skill.title}</h1>
        <p className="muted">Pip plant mit dir den Lernpfad – beantworte ein paar Fragen, dann bekommst du einen Vorschlag, den du anpassen kannst.</p>
      </header>
      <SkillMaterial skill={skill} />

      {!questions.length && (q.busy || !q.error) && <Busy text="Pip überlegt sich Fragen zu deinem Ziel …" />}
      <Failed error={q.error} retry={() => void askQuestions(skill.id)} />

      {questions.length > 0 && !skill.stages.length && !testing && (
        <section className="panel">
          <h2>Ein paar Fragen</h2>
          {questions.map((qq, k) => (
            <Question key={k} skill={skill} index={k} />
          ))}
          <div className="plan-q">
            <b>Bis zu welchem Niveau willst du kommen?</b>
            <div className="chips">
              {skill.levels.map((l, k) => (
                <button key={l} type="button" className={'chip' + (skill.targetLevel === k ? ' on' : '')} onClick={() => updateSkill(skill.id, { targetLevel: k })}>
                  {k + 1}. {l}
                </button>
              ))}
            </div>
          </div>
          <div className="row-gap">
            <button type="button" className="btn primary" onClick={() => (setTesting(true), skill.plan.placement || void makePlacement(skill.id))} disabled={pl.busy || pr.busy}>
              Kurzer Einstufungstest (empfohlen)
            </button>
            <button type="button" className="btn outline" onClick={() => void makeProposal(skill.id)} disabled={pr.busy}>
              Ohne Test: Lernpfad vorschlagen
            </button>
          </div>
          <p className="muted small">Der Einstufungstest (5 kurze Aufgaben) zeigt, was du schon kannst – das überspringst du dann im Lernpfad.</p>
          {pr.busy && <Busy text="Pip plant deinen Lernpfad …" />}
          <Failed error={pr.error} retry={() => void makeProposal(skill.id)} />
        </section>
      )}

      {testing && !skill.stages.length && (
        <>
          {pl.busy && <Busy text="Pip stellt den Einstufungstest zusammen …" />}
          <Failed error={pl.error} retry={() => void makePlacement(skill.id)} />
          {skill.plan.placement && (
            <div className="practice">
              <PracticeSetView
                set={skill.plan.placement}
                host={cardHost(
                  skill,
                  (i, patch) => updateSkill(skill.id, (s) => ({ plan: { ...s.plan, placement: s.plan.placement && patchSet(s.plan.placement, i, patch) } })),
                  (patch) => updateSkill(skill.id, (s) => ({ plan: { ...s.plan, placement: s.plan.placement && { ...s.plan.placement, ...patch } } })),
                )}
                head={<p className="muted small">Einstufung – löse, was du kannst; überspringe, was du nicht weißt.</p>}
                onDone={<p className="form-ok">Fertig – jetzt plant Pip deinen Lernpfad.</p>}
              />
              <div className="row-gap">
                <button type="button" className="btn primary" onClick={() => (setTesting(false), void makeProposal(skill.id))} disabled={pr.busy}>
                  <IconSparkle size={16} /> Fertig – Lernpfad vorschlagen
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {skill.stages.length > 0 && <Proposal skill={skill} />}
    </>
  );
}

function Question({ skill, index }: { skill: Skill; index: number }) {
  const qq = skill.plan.questions![index];
  const answer = skill.plan.answers?.[index] ?? '';
  const chosen = answer ? answer.split(' · ') : [];
  const set = (v: string) => updateSkill(skill.id, (s) => ({ plan: { ...s.plan, answers: { ...(s.plan.answers ?? {}), [index]: v } } }));
  const toggle = (o: string) => set(qq.multi ? (chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o]).join(' · ') : chosen[0] === o ? '' : o);
  const own = chosen.find((c) => !qq.options.includes(c)) ?? '';
  return (
    <div className="plan-q">
      <b>{qq.q}</b>
      <div className="chips">
        {qq.options.map((o) => (
          <button key={o} type="button" className={'chip' + (chosen.includes(o) ? ' on' : '')} onClick={() => toggle(o)}>
            {o}
          </button>
        ))}
      </div>
      <input
        className="input sm"
        placeholder="Oder eigene Antwort …"
        value={own}
        onChange={(e) => set([...chosen.filter((c) => qq.options.includes(c)), e.target.value].filter(Boolean).join(' · '))}
      />
    </div>
  );
}

function Proposal({ skill }: { skill: Skill }) {
  const pr = useSkillTask(skill.id + ':proposal');
  const [wish, setWish] = useState('');
  const [adding, setAdding] = useState<Record<string, string>>({});
  const setStages = (stages: Stage[]) => updateSkill(skill.id, { stages });
  return (
    <section className="panel">
      <h2>Dein Lernpfad</h2>
      {skill.plan.approach && (
        <div className="skill-approach">
          <b>So meisterst du den Skill</b>
          <CardContent text={skill.plan.approach} />
          {skill.plan.duration && <small className="muted">{skill.plan.duration}</small>}
        </div>
      )}
      <div className="plan-q">
        <b>Zielniveau</b>
        <div className="chips">
          {skill.levels.map((l, k) => (
            <button
              key={l}
              type="button"
              className={'chip' + (skill.targetLevel === k ? ' on' : '')}
              disabled={pr.busy}
              onClick={() => {
                if (k === skill.targetLevel) return;
                updateSkill(skill.id, { targetLevel: k });
                void reviseProposal(skill.id, `Passe den Lernpfad an das neue Zielniveau „${l}“ an (Stufen bis einschließlich „${l}“).`);
              }}
            >
              {k + 1}. {l}
            </button>
          ))}
        </div>
      </div>
      {skill.stages.map((st) => (
        <div key={st.id} className="plan-stage">
          <h3>{st.name}</h3>
          {st.goal && <p className="muted small">{st.goal}</p>}
          <ol className="plan-lessons">
            {st.lessons.map((l, k) => (
              <li key={l.id} className={l.known ? 'known' : ''}>
                <span className="grow">
                  <b>{l.title}</b>
                  {l.goal && <small className="muted"> – {l.goal}</small>}
                </span>
                <label className="check-row small" title="Diese Lektion überspringen">
                  <input type="checkbox" checked={!!l.known} onChange={() => setStages(toggleKnown(skill.stages, l.id))} /> kann ich schon
                </label>
                <button type="button" className="icon-btn" aria-label="Nach oben" disabled={k === 0} onClick={() => setStages(moveLesson(skill.stages, l.id, -1))}>
                  <IconArrowUp size={14} />
                </button>
                <button type="button" className="icon-btn" aria-label="Nach unten" disabled={k === st.lessons.length - 1} onClick={() => setStages(moveLesson(skill.stages, l.id, 1))}>
                  <IconArrowDown size={14} />
                </button>
                <button type="button" className="icon-btn" aria-label="Lektion entfernen" onClick={() => setStages(removeLesson(skill.stages, l.id))}>
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ol>
          <div className="input-row">
            <input className="input sm" value={adding[st.id] ?? ''} onChange={(e) => setAdding({ ...adding, [st.id]: e.target.value })} placeholder="Eigene Lektion hinzufügen …" />
            <button
              type="button"
              className="btn ghost sm"
              disabled={!adding[st.id]?.trim()}
              onClick={() => (setStages(addLesson(skill.stages, st.id, adding[st.id])), setAdding({ ...adding, [st.id]: '' }))}
            >
              <IconPlus size={14} /> Hinzufügen
            </button>
          </div>
        </div>
      ))}
      <div className="plan-q">
        <b>Wünsche an den Lernpfad</b>
        <div className="input-row">
          <input className="input" value={wish} onChange={(e) => setWish(e.target.value)} placeholder="z. B. mehr Praxis zu Gutachtenstil, weniger Theorie, Klausurfälle am Ende" />
          <button type="button" className="btn outline" disabled={!wish.trim() || pr.busy} onClick={() => (void reviseProposal(skill.id, wish), setWish(''))}>
            Anpassen
          </button>
        </div>
      </div>
      {pr.busy && <Busy text="Pip passt den Lernpfad an …" />}
      <Failed error={pr.error} retry={() => void makeProposal(skill.id)} />
      <div className="row-gap">
        <button type="button" className="btn primary" disabled={pr.busy} onClick={() => updateSkill(skill.id, { status: 'active' })}>
          Los geht's ›
        </button>
        <CostHint label="pro Lektion" est={{ input: 3000, output: 4000 }} />
      </div>
    </section>
  );
}

// ---------- learning ----------
type View = { kind: 'lesson'; id: string } | { kind: 'test'; stageId: string } | { kind: 'project'; stageId: string } | { kind: 'sheet'; stageId: string } | { kind: 'review' } | null;

function Path({ skill }: { skill: Skill }) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>(null);
  const [confirm, setConfirm] = useState(false);
  const p = skillProgress(skill);
  const next = nextLesson(skill);
  const reached = reachedStage(skill);
  const stars = skill.stages.reduce((sum, st) => sum + st.lessons.reduce((a, l) => a + lessonStars(l), 0), 0);
  const currentRef = useRef<HTMLButtonElement>(null);
  // the lesson just finished: back on the path its station tips over, the stars pop in and Pip hops on
  const [justDone, setJustDone] = useState<string | null>(null);
  useEffect(() => {
    if (!view) currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [view]);
  useEffect(() => {
    if (!justDone) return;
    const t = window.setTimeout(() => setJustDone(null), 3200);
    return () => window.clearTimeout(t);
  }, [justDone]);
  let offIndex = 0;

  if (view?.kind === 'lesson')
    return (
      <LessonView
        skill={skill}
        lessonId={view.id}
        onBack={() => setView(null)}
        onPath={(lid) => (setJustDone(lid), setView(null))}
        onOpen={(lid) => setView({ kind: 'lesson', id: lid })}
      />
    );
  if (view?.kind === 'test') return <StageTestView skill={skill} stageId={view.stageId} onBack={() => setView(null)} />;
  if (view?.kind === 'review') return <ReviewView skill={skill} onBack={() => setView(null)} />;
  if (view?.kind === 'project') return <ProjectView skill={skill} stageId={view.stageId} onBack={() => setView(null)} />;
  if (view?.kind === 'sheet') return <SheetView skill={skill} stageId={view.stageId} onBack={() => setView(null)} />;

  return (
    <>
      <Link to="/skills" className="btn ghost sm">
        ‹ Skills
      </Link>
      <header className="page-head skill-head">
        <span className={'badge ' + skill.domain} data-domain={skill.domain}>{DOMAIN_LABEL[skill.domain]}</span>
        <h1>{skill.title}</h1>
        <p className="muted">
          {p.done} von {p.total} Lektionen{p.skipped ? ` · ${p.skipped} übersprungen` : ''} · erreicht: {reached >= 0 ? skill.stages[reached].name : 'noch keine Stufe'} · Ziel: {skill.levels[skill.targetLevel] ?? '–'}
        </p>
        <SkillSchedule skill={skill} />
        <SkillGoal skill={skill} />
        <span className="bar skill-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(p.share * 100)}%` }} />
        </span>
        <div className="row-gap">
          {next ? (
            <button type="button" className="btn primary" onClick={() => setView({ kind: 'lesson', id: next.lesson.id })}>
              Weiter: {next.lesson.title} ›
            </button>
          ) : (
            <p className="form-ok">Alle Lektionen geschafft! Mach die Stufentests oder erhöhe dein Ziel.</p>
          )}
          {canReview(skill) && (
            <button type="button" className="btn outline" onClick={() => setView({ kind: 'review' })}>
              Gemischte Wiederholung
            </button>
          )}
          <button type="button" className="btn ghost sm" onClick={() => updateSkill(skill.id, { status: 'planning' })}>
            Lernpfad ändern
          </button>
          <button type="button" className="icon-btn" aria-label="Skill löschen" title="Löschen" onClick={() => undoable(`Skill „${skill.title}“ gelöscht`, () => (deleteSkill(skill.id), navigate('/skills')))}>
            <IconTrash size={15} />
          </button>
        </div>
      </header>
      <SkillCelebration skill={skill} />
      <div className="path-summary">
        <span>
          <b>
            {p.done} / {p.total}
          </b>{' '}
          Lektionen geschafft
          {p.skipped > 0 && <small className="muted"> · {p.skipped} übersprungen</small>}
        </span>
        <span className="path-stars">
          <IconStar size={16} /> {stars} / {p.total * 3}
        </span>
      </div>
      <div className="path skill-path">
        {skill.stages.map((st, si) => {
          const theme = themeFor(si);
          const toLearn = st.lessons.filter((l) => !l.known);
          const doneHere = toLearn.filter(lessonDone).length;
          const skippedHere = st.lessons.length - toLearn.length;
          const ready = stageReady(st);
          // the stage test is the trophy at the end; Pip waits there once all lessons of the stage are done
          const testCurrent = ready && !st.passed && !next;
          // the lesson just finished was the last one of this stage: the stage test glows
          const unlocked = !!justDone && ready && !st.passed && st.lessons.some((l) => l.id === justDone);
          let prevOff: number | null = null;
          const nodes = [
            ...st.lessons.map((l) => ({ key: l.id, lesson: l as Lesson | null })),
            { key: st.id + ':test', lesson: null as Lesson | null },
            // the mini project: apply the whole stage once (after the stage test)
            { key: st.id + ':project', lesson: null as Lesson | null, project: true },
          ];
          return (
            <section
              key={st.id}
              className="path-unit scene"
              style={{ ['--scene-top' as string]: theme.top, ['--scene-bottom' as string]: theme.bottom, ['--scene-accent' as string]: theme.accent }}
            >
              <Waves color="var(--scene-wave)" />
              <span className="scene-bubbles" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <header className={'unit-banner' + (st.passed ? ' passed' : '') + (unlocked ? ' unlocked' : '')}>
                <span className="unit-no">{st.passed ? <IconTrophy size={18} /> : si + 1}</span>
                <span className="grow">
                  <b>
                    {st.name} {st.passed && <span className="badge ok">erreicht</span>}
                  </b>
                  {st.passed && (
                    <button type="button" className="btn ghost sm sheet-btn" onClick={() => setView({ kind: 'sheet', stageId: st.id })}>
                      Spickzettel
                    </button>
                  )}
                  {st.goal && <span className="unit-goal">{st.passed ? 'Das kannst du jetzt: ' : 'Danach kannst du: '}{st.goal}</span>}
                  <small>
                    {skippedHere ? `${skippedHere} übersprungen · ` : ''}
                    {doneHere} von {toLearn.length} geschafft{ready && !st.passed ? ' · Stufentest freigeschaltet' : ''}
                  </small>
                  <span className="unit-progress">
                    <i style={{ width: `${toLearn.length ? (doneHere / toLearn.length) * 100 : 100}%` }} />
                  </span>
                </span>
              </header>
              <div className="unit-nodes">
                {nodes.map((n, k) => {
                  const l = n.lesson;
                  const isProject = 'project' in n;
                  const state = isProject
                    ? st.project?.done
                      ? 'done'
                      : st.passed
                        ? 'open'
                        : 'locked'
                    : l
                    ? l.known
                      ? 'skipped'
                      : lessonDone(l)
                      ? 'done'
                      : next?.lesson.id === l.id
                        ? 'current'
                        : 'open'
                    : st.passed
                      ? 'done'
                      : testCurrent
                        ? 'current'
                        : ready
                          ? 'open'
                          : 'locked';
                  const off = PATH_OFFSETS[offIndex++ % PATH_OFFSETS.length];
                  const dx = prevOff === null ? null : prevOff - off;
                  prevOff = off;
                  const mascotSide = off > 0 ? 'left' : 'right';
                  let decoSide: 'left' | 'right' = off > 0 ? 'left' : off < 0 ? 'right' : k % 2 ? 'left' : 'right';
                  if (state === 'current') decoSide = mascotSide === 'left' ? 'right' : 'left';
                  const Icon = isProject ? (state === 'locked' ? IconLock : state === 'done' ? IconCheck : IconTools) : !l ? (state === 'locked' ? IconLock : IconTrophy) : state === 'skipped' ? IconSkip : state === 'done' ? IconCheck : IconStar;
                  const nStars = l ? lessonStars(l) : 0;
                  const sub = isProject ? (st.project?.done ? 'geschafft' : st.passed ? 'jetzt anwenden' : 'nach dem Stufentest') : l ? (l.known ? 'übersprungen – kannst du schon' : l.set ? `${solvedCount(l.set)}/${problemCount(l.set)} gelöst` : '') : st.passed ? 'bestanden' : ready ? 'Stufentest' : 'erst alle Lektionen';
                  return (
                    <div
                      key={n.key}
                      className={`path-node-wrap ${state}${l && l.id === justDone ? ' just-done' : ''}${justDone && state === 'current' ? ' arrived' : ''}`}
                      style={{ transform: `translateX(${off}px)`, animationDelay: `${Math.min(offIndex, 24) * 45}ms`, zIndex: 200 - k }}
                    >
                      {dx !== null && <PathLink dx={dx} height={state === 'current' ? 88 : 58} done={state === 'done' || state === 'current'} fill={!!justDone && state === 'current'} />}
                      <NodeDecor theme={theme} index={k + si * 2} side={decoSide} />
                      {state === 'current' && <span className="node-bubble">{l ? 'Start' : 'Test!'}</span>}
                      {state === 'current' && <Mascot className={`node-mascot ${mascotSide}`} mood="wave" size={64} />}
                      <button
                        ref={state === 'current' ? currentRef : undefined}
                        type="button"
                        className={`path-node ${l ? 'lesson' : 'final'} ${isProject ? 'project' : ''} ${state}`}
                        disabled={state === 'locked'}
                        onClick={() => setView(isProject ? { kind: 'project', stageId: st.id } : l ? { kind: 'lesson', id: l.id } : { kind: 'test', stageId: st.id })}
                        aria-label={`${isProject ? 'Mini-Projekt ' + st.name : l ? l.title : 'Stufentest ' + st.name}${state === 'locked' ? ' (gesperrt)' : state === 'done' && l ? ` (${nStars} Sterne)` : ''}`}
                      >
                        <Icon size={l ? 28 : 30} />
                      </button>
                      <span className="node-label">
                        {isProject ? 'Mini-Projekt' : l ? l.title : `Stufentest`}
                        {sub && <small className="node-sub">{sub}</small>}
                      </span>
                      {state === 'done' && l && (
                        <span className="node-stars" aria-hidden="true">
                          {[1, 2, 3].map((s) => (
                            <IconStar key={s} size={14} className={s <= nStars ? 'on' : ''} />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <SwimmingFish seed={si} />
              <SandFloor />
              <FloorDecor />
            </section>
          );
        })}
      </div>
      <div className="skill-below">
        <SkillCompetence skill={skill} onOpen={(lid) => setView({ kind: 'lesson', id: lid })} onTrain={() => setView({ kind: 'review' })} />
        {skill.plan.approach && (
          <details className="panel skill-approach">
            <summary>So meisterst du den Skill</summary>
            <CardContent text={skill.plan.approach} />
          </details>
        )}
        <SkillMaterial skill={skill} />
      </div>
      {confirm && (
        <ConfirmModal
          title="Skill löschen?"
          text={`„${skill.title}“ mit allen Lektionen und deinem Fortschritt wird gelöscht.`}
          onConfirm={() => (deleteSkill(skill.id), navigate('/skills'))}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}

function findLesson(skill: Skill, lessonId: string): { stage: Stage; lesson: Lesson } | null {
  for (const stage of skill.stages) for (const lesson of stage.lessons) if (lesson.id === lessonId) return { stage, lesson };
  return null;
}

function LessonView({ skill, lessonId, onBack, onPath, onOpen }: { skill: Skill; lessonId: string; onBack: () => void; onPath: (lessonId: string) => void; onOpen: (id: string) => void }) {
  const found = findLesson(skill, lessonId);
  const t = useSkillTask(skill.id + ':' + lessonId);
  useEffect(() => {
    void ensureLesson(skill.id, lessonId);
  }, [skill.id, lessonId]);
  // the time spent in the lesson (for „noch ca. … Std.“) – at most an hour per visit
  useEffect(() => {
    const start = Date.now();
    return () => {
      const m = Math.min(60, (Date.now() - start) / 60000);
      if (m < 0.5) return;
      updateSkill(skill.id, (s) => ({
        stages: s.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId ? { ...l, minutes: Math.round(((l.minutes ?? 0) + m) * 10) / 10 } : l)) })),
      }));
    };
  }, [skill.id, lessonId]);
  if (!found) return null;
  const { lesson } = found;
  const all = skill.stages.flatMap((st) => st.lessons);
  const after = all[all.findIndex((l) => l.id === lessonId) + 1];
  const host = cardHost(skill, tracked(skill.id, (s) => s.stages.flatMap((st) => st.lessons).find((l) => l.id === lessonId)?.set, (i, patch) =>
    updateSkill(skill.id, (s) => ({ stages: s.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId && l.set ? { ...l, set: patchSet(l.set, i, patch) } : l)) })) }))),
    (patch) => updateSkill(skill.id, (s) => ({ stages: s.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId && l.set ? { ...l, set: { ...l.set, ...patch } } : l)) })) })),
  );
  return (
    <div className="practice">
      <button type="button" className="btn ghost sm" onClick={onBack}>
        ‹ {skill.title}
      </button>
      {!lesson.set && (t.busy || !t.error) && <Busy text={`Pip bereitet die Lektion „${lesson.title}“ vor …`} />}
      <Failed error={t.error} retry={() => void ensureLesson(skill.id, lessonId)} />
      {lesson.set && (
        <PracticeSetView
          set={lesson.set}
          host={host}
          guided
          head={
            <div className="lesson-head">
              <p className="muted small grow">Lektion: {lesson.title}</p>
              <SkillGoal skill={skill} compact />
            </div>
          }
          onDone={<LessonEnd lesson={lesson} after={after} onPath={() => onPath(lessonId)} onNext={() => after && onOpen(after.id)} />}
        />
      )}
      {lesson.set && !lesson.set.theory && !lesson.set.bites?.length && (
        <p className="muted small redo-lesson">
          Zu schwer zum Einstieg?{' '}
          <button type="button" className="link-btn" onClick={() => void redoLesson(skill.id, lessonId)} disabled={t.busy}>
            Lektion neu erstellen – mit Grundlagen zuerst
          </button>{' '}
          (dein Fortschritt in dieser Lektion beginnt neu)
        </p>
      )}
    </div>
  );
}

/** The end of a lesson: what went well, what you can do now – and back onto the path, where you see yourself move on. */
function LessonEnd({ lesson, after, onPath, onNext }: { lesson: Lesson; after?: Lesson; onPath: () => void; onNext: () => void }) {
  const progress = lesson.set?.progress ?? [];
  const clean = progress.filter((p) => p.solved && !p.hints && !p.shown && !p.dunno && p.tries <= 1).length;
  return (
    <div className="lesson-end-card">
      <Mascot mood="cheer" size={76} />
      <div className="grow">
        <b className="lesson-end-title">Lektion geschafft!</b>
        <p className="lesson-end-clean">
          <IconCheck size={15} /> {clean} von {progress.length} ohne Hilfe gelöst
        </p>
        {lesson.goal && (
          <p className="lesson-end-goal">
            <b>Das kannst du jetzt:</b> {lesson.goal}
          </p>
        )}
        <div className="row-gap">
          <button type="button" className="btn primary" data-primary onClick={onPath}>
            Zurück zum Weg
          </button>
          {after && (
            <button type="button" className="btn outline" onClick={onNext}>
              Gleich weiter: {after.title} ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StageTestView({ skill, stageId, onBack }: { skill: Skill; stageId: string; onBack: () => void }) {
  const stage = skill.stages.find((st) => st.id === stageId);
  const t = useSkillTask(skill.id + ':test:' + stageId);
  useEffect(() => {
    if (stage && !stage.test) void makeStageTest(skill.id, stageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);
  if (!stage) return null;
  const host = cardHost(skill, tracked(skill.id, (s) => s.stages.find((st) => st.id === stageId)?.test, (i, patch) =>
    updateSkill(skill.id, (s) => ({
      stages: s.stages.map((st) => {
        if (st.id !== stageId || !st.test) return st;
        const test = patchSet(st.test, i, patch);
        const now = mastered(test);
        if (now && !st.passed) addXp(50);
        return { ...st, test, ...(now ? { passed: true } : {}) };
      }),
    }))),
  );
  return (
    <div className="practice">
      <button type="button" className="btn ghost sm" onClick={onBack}>
        ‹ {skill.title}
      </button>
      {!stage.test && (t.busy || !t.error) && <Busy text={`Pip stellt den Stufentest „${stage.name}“ zusammen …`} />}
      <Failed error={t.error} retry={() => void makeStageTest(skill.id, stageId)} />
      {stage.test && (
        <>
          <PracticeSetView set={stage.test} host={host} focus head={
                <div className="lesson-head">
                  <p className="muted small grow">Stufentest: {stage.name} – ab 80 % richtig ist die Stufe erreicht.</p>
                  <SkillGoal skill={skill} compact />
                </div>
              } onDone={<p className="form-ok">Stufe „{stage.name}“ erreicht! +50 XP</p>} />
          <button type="button" className="btn ghost sm" onClick={() => void makeStageTest(skill.id, stageId)} disabled={t.busy}>
            Neuen Stufentest erstellen
          </button>
        </>
      )}
    </div>
  );
}

function ReviewView({ skill, onBack }: { skill: Skill; onBack: () => void }) {
  const t = useSkillTask(skill.id + ':review');
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!t.busy && (!skill.review || skill.review.progress.every((p) => p.solved))) {
      setFresh(true);
      void makeReview(skill.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const host = cardHost(
    skill,
    tracked(skill.id, (s) => s.review, (i, patch) => updateSkill(skill.id, (s) => ({ review: s.review && patchSet(s.review, i, patch) }))),
    (patch) => updateSkill(skill.id, (s) => ({ review: s.review && { ...s.review, ...patch } })),
  );
  return (
    <div className="practice">
      <button type="button" className="btn ghost sm" onClick={onBack}>
        ‹ {skill.title}
      </button>
      {(t.busy || (fresh && !skill.review)) && <Busy text="Pip mischt Aufgaben aus deinen Lektionen …" />}
      <Failed error={t.error} retry={() => void makeReview(skill.id)} />
      {skill.review && !t.busy && (
        <PracticeSetView
          set={skill.review}
          host={host}
          focus
          head={
            <div className="lesson-head">
              <p className="muted small grow">{skill.reviewFocus?.length ? `Schwachstellen-Training: ${skill.reviewFocus.join(', ')}` : 'Gemischte Wiederholung'}</p>
              <SkillGoal skill={skill} compact />
            </div>
          }
        />
      )}
    </div>
  );
}
