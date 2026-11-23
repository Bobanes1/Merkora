/**
 * Runs the AI requests of skills (questions, placement test, proposal, lessons, level tests, reviews).
 * They keep running when you change pages; the result is saved into the skill. One request per key at a time.
 */
import { useSyncExternalStore } from 'react';
import { completeJson } from './ai';
import { parsePractice, taskList, toDomain, type PracticeSet, type Task } from './practice';
import { applyVerify, codeSelfCheck, parseVerify, plausibility, verifyPrompt } from './taskCheck';
import {
  lessonAfter,
  jurisdictionOf,
  JURISDICTION_RULE,
  lessonPrompt,
  miniPrompt,
  nextSkillsPrompt,
  parseNextIdeas,
  newId,
  parseProposal,
  parseQuestions,
  placementNote,
  placementPrompt,
  proposalPrompt,
  questionsPrompt,
  reviewPrompt,
  revisePrompt,
  stageTestPrompt,
  parseProject,
  projectAsCase,
  projectPassed,
  projectPrompt,
  sheetPrompt,
  type Skill,
  type Stage,
} from './skills';
import { LANG_RULE } from './ai';
import { caseGradePrompt, fullGrade, matchesSolution, parseCaseGrade } from './tasks';
import { addSkill, getState, updateSkill } from './store';

type Status = { busy: boolean; error?: string };
const status = new Map<string, Status>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const EMPTY: Status = { busy: false };

export function useSkillTask(key: string): Status {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => status.get(key) ?? EMPTY,
    () => EMPTY,
  );
}

/** Runs `fn` once per key; errors are kept for the page to show („Nochmal versuchen“). */
async function run(key: string, fn: () => Promise<void>) {
  if (status.get(key)?.busy) return;
  status.set(key, { busy: true });
  emit();
  try {
    await fn();
    status.delete(key);
  } catch (e) {
    status.set(key, { busy: false, error: (e as Error).message || 'Unbekannter Fehler' });
  }
  emit();
}

/** The skill for an AI call – a law skill always knows its legal system (also older ones). */
const skill = (id: string) => {
  const s = getState().data.skills?.find((x) => x.id === id);
  if (!s || s.domain !== 'law' || s.jurisdiction) return s;
  const j = jurisdictionOf(s, getState().data.settings.gradeScale);
  return j ? { ...s, jurisdiction: j } : s;
};
const ask = <T>(p: { system: string; user: string; maxTokens: number }) => completeJson<T>(p.system, p.user, p.maxTokens);
const setOf = (raw: unknown) => {
  const set = parsePractice(raw, newId(), Date.now());
  if (!set) throw new Error('Die KI hat keine brauchbaren Aufgaben geliefert. Bitte versuche es noch einmal.');
  return set;
};

/** A mini skill: one AI call makes the short path (3 lessons) – then it can be learned right away. Returns the id at once. */
export function startMiniSkill(topic: string, level = ''): string {
  const id = newId();
  const now = Date.now();
  addSkill({ id, topic: topic.trim(), title: topic.trim(), domain: 'general', levels: ['Mini-Skill'], targetLevel: 0, level, mini: true, status: 'planning', plan: {}, stages: [], createdAt: now, updatedAt: now });
  void buildMini(id);
  return id;
}
export function buildMini(id: string) {
  return run(id + ':mini', async () => {
    const s = skill(id);
    if (!s) return;
    const raw = (await ask(miniPrompt(s.topic, s.level))) as Record<string, unknown>;
    const p = parseProposal(raw);
    if (!p) throw new Error('Die KI hat keinen Mini-Skill geliefert. Bitte versuche es noch einmal.');
    const stages = p.stages.slice(0, 1).map((st) => ({ ...st, lessons: st.lessons.slice(0, 4).map((l) => ({ ...l, known: undefined })) }));
    updateSkill(id, { title: p.title || s.title, domain: toDomain(raw?.domain), stages, status: 'active', plan: { approach: p.approach } });
  });
}

/** „Wie geht's weiter?“: three ideas for the next skill, made once and kept. */
export function makeNextIdeas(id: string) {
  return run(id + ':next', async () => {
    const s = skill(id);
    if (!s) return;
    const existing = (getState().data.skills ?? []).filter((x) => x.id !== id).map((x) => x.title);
    const ideas = parseNextIdeas(await ask(nextSkillsPrompt(s, existing)));
    if (!ideas.length) throw new Error('Pip hat gerade keine Ideen geliefert. Bitte versuche es noch einmal.');
    updateSkill(id, { nextIdeas: ideas });
  });
}

// ---------- counter-check of new tasks (lib/taskCheck.ts) ----------
/** Where a set lives inside the skill: how to read it and how to put it back. */
type SetSpot = { get: (s: Skill) => PracticeSet | undefined; put: (s: Skill, set: PracticeSet) => Partial<Skill> };
const lessonSpot = (lessonId: string): SetSpot => ({
  get: (s) => s.stages.flatMap((st) => st.lessons).find((l) => l.id === lessonId)?.set,
  put: (s, set) => ({ stages: s.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId ? { ...l, set } : l)) })) }),
});
/** The key of a running check (the lesson shows „Pip prüft die Aufgaben …“ meanwhile). */
export const checkKey = (id: string, setId: string) => id + ':check:' + setId;

/**
 * Checks a freshly made set in the background: plausibility and the AI's own code solutions first, then the
 * AI looks at every task and repairs broken ones. Only untouched tasks are changed; a failing check changes nothing.
 */
function checkSet(id: string, setId: string, spot: SetSpot) {
  return run(checkKey(id, setId), async () => {
    try {
      const s = skill(id);
      const set = s && spot.get(s);
      if (!s || !set || set.id !== setId || set.checked) return;
      const notes: Record<number, string> = {};
      const tasks = taskList(set);
      for (let k = 0; k < tasks.length; k++) {
        const note = plausibility(tasks[k]) ?? (await codeSelfCheck(tasks[k]));
        if (note) notes[k + 1] = note;
      }
      const extra = s.domain === 'law' && s.jurisdiction ? JURISDICTION_RULE[s.jurisdiction] : '';
      const verdict = parseVerify(await ask(verifyPrompt(set, notes, extra)), set);
      const now = skill(id);
      const cur = now && spot.get(now);
      if (!now || !cur || cur.id !== setId) return;
      updateSkill(id, (x) => {
        const latest = spot.get(x);
        if (!latest || latest.id !== setId) return {};
        // applied to the newest state, so progress made meanwhile is kept
        const fresh = applyVerify(latest, verdict);
        return spot.put(x, { ...latest, ...(fresh.fixed || fresh.dropped ? fresh.patch : {}), checked: { at: Date.now(), fixed: fresh.fixed, dropped: fresh.dropped } });
      });
    } catch {
      // the check is a help, never a hurdle: without it the tasks stay as they are
    }
  });
}

/** Step 1: a new skill from a broad topic – the AI asks its questions. Returns the skill id at once. */
export function startSkill(topic: string, level: string, material?: string): string {
  const id = newId();
  const now = Date.now();
  const draft: Skill = { id, topic: topic.trim(), title: topic.trim(), domain: 'general', levels: [], targetLevel: 0, level, ...(material?.trim() ? { material: material.trim().slice(0, 60000) } : {}), status: 'planning', plan: {}, stages: [], createdAt: now, updatedAt: now };
  addSkill(draft);
  void askQuestions(id);
  return id;
}
export function askQuestions(id: string) {
  return run(id + ':questions', async () => {
    const s = skill(id);
    if (!s) return;
    const q = parseQuestions(await ask(questionsPrompt(s.topic, s.level, s.material)));
    if (!q) throw new Error('Die KI hat keine Fragen geliefert. Bitte versuche es noch einmal.');
    updateSkill(id, (x) => ({
      title: q.title || x.title,
      domain: q.domain,
      levels: q.levels,
      // default goal: the second highest level (ambitious, but not „expert“)
      targetLevel: Math.max(0, q.levels.length - 2),
      plan: { ...x.plan, questions: q.questions, answers: {} },
    }));
  });
}

/** A short label for a task (for the placement note). */
export function taskLabel(t: Task): string {
  const text = t.type === 'calc' ? t.problem : t.type === 'code' ? t.title || t.task : t.type === 'case' ? t.question : t.prompt;
  return text.replace(/\s+/g, ' ').slice(0, 70);
}

/** Step 2 (optional): placement test. */
export function makePlacement(id: string) {
  return run(id + ':placement', async () => {
    const s = skill(id);
    if (!s) return;
    const set = setOf(await ask(placementPrompt(s)));
    updateSkill(id, (x) => ({ plan: { ...x.plan, placement: set } }));
    void checkSet(id, set.id, { get: (x) => x.plan.placement, put: (x, v) => ({ plan: { ...x.plan, placement: v } }) });
  });
}

/** Step 3: the proposal (with what the placement test showed). */
export function makeProposal(id: string) {
  return run(id + ':proposal', async () => {
    const s = skill(id);
    if (!s) return;
    const placement = s.plan.placement;
    const note = placement ? placementNote(placement, taskList(placement).map((t) => ({ label: taskLabel(t) }))) : undefined;
    const withNote = note ? { ...s, plan: { ...s.plan, placementNote: note } } : s;
    const p = parseProposal(await ask(proposalPrompt(withNote)), s.stages);
    if (!p) throw new Error('Die KI hat keinen Lernpfad geliefert. Bitte versuche es noch einmal.');
    updateSkill(id, (x) => ({ title: p.title || x.title, stages: p.stages, plan: { ...x.plan, ...(note ? { placementNote: note } : {}), approach: p.approach, duration: p.duration } }));
  });
}

/** Step 4: change the path on request (free text, or a new target level). */
export function reviseProposal(id: string, request: string) {
  return run(id + ':proposal', async () => {
    const s = skill(id);
    if (!s) return;
    const p = parseProposal(await ask(revisePrompt(s, request)), s.stages);
    if (!p) throw new Error('Die KI konnte den Lernpfad nicht anpassen. Bitte versuche es noch einmal.');
    updateSkill(id, (x) => ({ stages: p.stages, plan: { ...x.plan, approach: p.approach || x.plan.approach, duration: p.duration || x.plan.duration } }));
  });
}

/** A lesson's tasks (made once); afterwards the next lesson is prepared in the background. */
export function ensureLesson(id: string, lessonId: string) {
  return run(id + ':' + lessonId, async () => {
    const s = skill(id);
    const stage = s?.stages.find((st) => st.lessons.some((l) => l.id === lessonId));
    const lesson = stage?.lessons.find((l) => l.id === lessonId);
    if (!s || !stage || !lesson) return;
    if (!lesson.set) {
      const set = setOf(await ask(lessonPrompt(s, stage, lesson)));
      updateSkill(id, (x) => ({ stages: x.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId ? { ...l, set } : l)) })) }));
      void checkSet(id, set.id, lessonSpot(lessonId));
    }
    const next = lessonAfter(skill(id)!, lessonId);
    if (next) void run(id + ':' + next.lesson.id, async () => ensureLessonQuiet(id, next.lesson.id));
  });
}
/** Makes a lesson again (new explanation and tasks) – its progress starts over. */
export function redoLesson(id: string, lessonId: string) {
  updateSkill(id, (x) => ({ stages: x.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId ? { ...l, set: undefined } : l)) })) }));
  return ensureLesson(id, lessonId);
}
async function ensureLessonQuiet(id: string, lessonId: string) {
  const s = skill(id);
  const stage = s?.stages.find((st) => st.lessons.some((l) => l.id === lessonId));
  const lesson = stage?.lessons.find((l) => l.id === lessonId);
  if (!s || !stage || !lesson || lesson.set) return;
  const set = setOf(await ask(lessonPrompt(s, stage, lesson)));
  updateSkill(id, (x) => ({ stages: x.stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId ? { ...l, set } : l)) })) }));
  void checkSet(id, set.id, lessonSpot(lessonId));
}

export function makeStageTest(id: string, stageId: string) {
  return run(id + ':test:' + stageId, async () => {
    const s = skill(id);
    const stage = s?.stages.find((st) => st.id === stageId);
    if (!s || !stage) return;
    const set = setOf(await ask(stageTestPrompt(s, stage)));
    updateSkill(id, (x) => ({ stages: x.stages.map((st) => (st.id === stageId ? { ...st, test: set, passed: undefined } : st)) }));
    void checkSet(id, set.id, { get: (x) => x.stages.find((st) => st.id === stageId)?.test, put: (x, v) => ({ stages: x.stages.map((st) => (st.id === stageId ? { ...st, test: v } : st)) }) });
  });
}

const patchStage = (id: string, stageId: string, patch: (st: Stage) => Partial<Stage>) =>
  updateSkill(id, (x) => ({ stages: x.stages.map((st) => (st.id === stageId ? { ...st, ...patch(st) } : st)) }));

/** The mini project at the end of a stage (made once). */
export function makeStageProject(id: string, stageId: string) {
  return run(id + ':project:' + stageId, async () => {
    const s = skill(id);
    const stage = s?.stages.find((st) => st.id === stageId);
    if (!s || !stage) return;
    const project = parseProject(await ask(projectPrompt(s, stage)));
    if (!project) throw new Error('Pip konnte kein Projekt entwerfen. Bitte versuche es noch einmal.');
    patchStage(id, stageId, () => ({ project }));
  });
}
/** Grades the submitted project with the rubric (done from 70 %). */
export function gradeStageProject(id: string, stageId: string, submission: string) {
  return run(id + ':project:' + stageId, async () => {
    const project = skill(id)?.stages.find((st) => st.id === stageId)?.project;
    if (!project) return;
    const task = projectAsCase(project);
    const p = caseGradePrompt(task, submission, LANG_RULE);
    // the sample solution itself always gets full points – no need to ask the AI
    const grade = matchesSolution(submission, task.solution) ? fullGrade(task) : parseCaseGrade(task, await completeJson(p.system, p.user, 2500));
    patchStage(id, stageId, (st) => ({ project: { ...st.project!, submission, grade, done: st.project?.done || projectPassed(grade) } }));
  });
}
/** The cheat sheet of a passed stage: everything important on one page (made once). */
export function makeStageSheet(id: string, stageId: string) {
  return run(id + ':sheet:' + stageId, async () => {
    const s = skill(id);
    const stage = s?.stages.find((st) => st.id === stageId);
    if (!s || !stage) return;
    const r = await ask<{ sheet?: string }>(sheetPrompt(s, stage));
    const sheet = typeof r?.sheet === 'string' ? r.sheet.trim().slice(0, 12000) : '';
    if (!sheet) throw new Error('Pip konnte keinen Spickzettel schreiben. Bitte versuche es noch einmal.');
    patchStage(id, stageId, () => ({ sheet }));
  });
}

/** A mixed review – or, with lesson ids, a training of just those (weak) topics. */
/** A mixed review, or a training of weak lessons (focusIds); `count` tasks (short form from the smart „Weiter“). */
export function makeReview(id: string, focusIds?: string[], count?: number) {
  return run(id + ':review', async () => {
    const s = skill(id);
    if (!s) return;
    const focus = focusIds?.length ? s.stages.flatMap((st) => st.lessons).filter((l) => focusIds.includes(l.id)) : undefined;
    // remembered at once, so the smart „Weiter“ does not offer the same again
    updateSkill(id, focus?.length ? { lastWeakAt: Date.now() } : { lastReviewAt: Date.now() });
    const set = setOf(await ask(reviewPrompt(s, focus, count)));
    updateSkill(id, { review: set, reviewFocus: focus?.map((l) => l.title) });
    void checkSet(id, set.id, { get: (x) => x.review, put: (_x, v) => ({ review: v }) });
  });
}
