/**
 * Runs the AI requests of skills (questions, placement test, proposal, lessons, level tests, reviews).
 * They keep running when you change pages; the result is saved into the skill. One request per key at a time.
 */
import { useSyncExternalStore } from 'react';
import { completeJson } from './ai';
import { parsePractice, taskList, type Task } from './practice';
import {
  lessonAfter,
  lessonPrompt,
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
  type Skill,
} from './skills';
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

const skill = (id: string) => getState().data.skills?.find((s) => s.id === id);
const ask = <T>(p: { system: string; user: string; maxTokens: number }) => completeJson<T>(p.system, p.user, p.maxTokens);
const setOf = (raw: unknown) => {
  const set = parsePractice(raw, newId(), Date.now());
  if (!set) throw new Error('Die KI hat keine brauchbaren Aufgaben geliefert. Bitte versuche es noch einmal.');
  return set;
};

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
}

export function makeStageTest(id: string, stageId: string) {
  return run(id + ':test:' + stageId, async () => {
    const s = skill(id);
    const stage = s?.stages.find((st) => st.id === stageId);
    if (!s || !stage) return;
    const set = setOf(await ask(stageTestPrompt(s, stage)));
    updateSkill(id, (x) => ({ stages: x.stages.map((st) => (st.id === stageId ? { ...st, test: set, passed: undefined } : st)) }));
  });
}

export function makeReview(id: string) {
  return run(id + ':review', async () => {
    const s = skill(id);
    if (!s) return;
    const set = setOf(await ask(reviewPrompt(s)));
    updateSkill(id, { review: set });
  });
}
