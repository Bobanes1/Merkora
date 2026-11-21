/**
 * Skills: learning by doing, without flashcards. A broad topic becomes a learning path in conversation:
 * questions → placement test → proposal with levels and lessons → adjust → learn lesson by lesson
 * (practice sets with active tasks), a test per level, mixed reviews.
 * Pure – tested in scripts/test-srs.mts. Running the AI requests: lib/skillRun.ts.
 */
import { FORMULA_RULE, LANG_RULE, type Prompt } from './ai';
import { problemCount, setFrame, solvedCount, toDomain, type Domain, type PracticeSet } from './practice';
import { spreadClip } from './sample';

export type PlanQuestion = { q: string; options: string[]; multi?: boolean };
export type Lesson = { id: string; title: string; goal: string; known?: boolean; set?: PracticeSet };
export type Stage = { id: string; name: string; goal: string; lessons: Lesson[]; test?: PracticeSet; passed?: boolean };
export type Skill = {
  id: string;
  /** What the person typed („Musiktheorie“). */
  topic: string;
  title: string;
  domain: Domain;
  /** Levels from beginner to expert (named by the AI for this skill). */
  levels: string[];
  /** Up to which level (index in `levels`). */
  targetLevel: number;
  /** Education level of the person (school, university …). */
  level: string;
  material?: string;
  status: 'planning' | 'active';
  plan: {
    questions?: PlanQuestion[];
    answers?: Record<number, string>;
    placement?: PracticeSet;
    placementNote?: string;
    approach?: string;
    duration?: string;
  };
  stages: Stage[];
  /** The latest mixed review (tasks across finished lessons). */
  review?: PracticeSet;
  createdAt: number;
  updatedAt: number;
};

const s = (v: unknown, max = 600) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const arr = (v: unknown, max = 8, len = 200) => (Array.isArray(v) ? v : []).map((x) => s(x, len)).filter(Boolean).slice(0, max);
let counter = 0;
export const newId = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- step 1: questions ----------
export function questionsPrompt(topic: string, level: string, material?: string): Prompt {
  return {
    system: `Du bist ein erfahrener Lerncoach. Jemand möchte einen Skill lernen – aktiv, durch eigenes Tun (learning by doing). ${LANG_RULE}
Bevor du einen Lernpfad planst, stellst du 3–5 kurze, gezielte Fragen mit antippbaren Antworten (je 3–5 Optionen), z. B. zum Vorwissen, zum Ziel (Prüfung, Beruf, Hobby), zu Teilgebieten, die interessieren, und zur Zeit pro Woche. Frag NICHT nach dem Zielniveau – das wählt man über "levels".
"levels": 4–5 Niveaustufen dieses Skills vom Einstieg bis zur Meisterschaft, mit kurzen, konkreten Namen (z. B. "Einsteiger", "Grundlagen sicher", "Fortgeschritten", "Prüfungsniveau", "Experte").
"domain": math | java | law | music | language | general (Programmieren = java).
Format: {"title":"kurzer Name des Skills","domain":"…","levels":["…"],"questions":[{"q":"…","options":["…","…"],"multi":false}]}
Antworte ausschließlich mit gültigem JSON.`,
    user: `Skill: ${topic}\nBildungsniveau: ${level || 'unbekannt'}${material ? `\n\nMaterial, das die Person mitgebracht hat:\n${spreadClip(material, 6000)}` : ''}`,
    maxTokens: 1500,
    json: true,
  };
}

export function parseQuestions(raw: unknown): { title: string; domain: Domain; levels: string[]; questions: PlanQuestion[] } | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const levels = arr(r.levels, 6, 40);
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q) => {
      const o = (q ?? {}) as Record<string, unknown>;
      return { q: s(o.q ?? o.question, 300), options: arr(o.options, 6, 120), ...(o.multi === true ? { multi: true } : {}) };
    })
    .filter((q) => q.q && q.options.length >= 2)
    .slice(0, 5);
  if (levels.length < 2 || !questions.length) return null;
  return { title: s(r.title, 80), domain: toDomain(r.domain), levels, questions };
}

/** The answers given so far as readable text for the AI. */
export function answersText(skill: Skill): string {
  const qs = skill.plan.questions ?? [];
  return qs.map((q, i) => `- ${q.q} → ${skill.plan.answers?.[i] || '(keine Angabe)'}`).join('\n');
}

const context = (skill: Skill) =>
  `Skill: ${skill.title || skill.topic}\nFach: ${skill.domain}\nBildungsniveau: ${skill.level || 'unbekannt'}\nNiveaustufen: ${skill.levels.join(' → ')}\nZielniveau: ${skill.levels[skill.targetLevel] ?? skill.levels[skill.levels.length - 1]}\nAntworten der Person:\n${answersText(skill)}${skill.plan.placementNote ? `\nEinstufung: ${skill.plan.placementNote}` : ''}${skill.material ? `\n\nMATERIAL:\n${spreadClip(skill.material, 20000)}` : ''}`;

const kindRule = (skill: Skill) => `${LANG_RULE}\n${FORMULA_RULE}\n${setFrame(skill.domain)}`;
const JSON_ONLY = 'Antworte ausschließlich mit gültigem JSON, ohne Erklärtext und ohne Markdown-Codeblock.';

// ---------- step 2: placement test ----------
export function placementPrompt(skill: Skill): Prompt {
  return {
    system: `Du erstellst einen kurzen Einstufungstest, um herauszufinden, was jemand bei einem Skill schon kann. ${kindRule(skill)}
Erstelle 5 kurze Aufgaben, die von der niedrigsten bis zur höchsten Niveaustufe ansteigen (je Aufgabe ein typisches Teilgebiet). Keine Erklärung nötig ("intro" 1 Satz, kein "example"). ${JSON_ONLY}`,
    user: context(skill),
    maxTokens: 4000,
    json: true,
  };
}

/** What the placement test showed, as a note for the proposal („Teilgebiet: gekonnt / nicht gekonnt“). */
export function placementNote(set: PracticeSet, tasks: { label: string }[]): string {
  return tasks.map((t, i) => `${t.label}: ${set.progress[i]?.solved ? 'gekonnt' : set.progress[i]?.tries ? 'nicht gekonnt' : 'übersprungen'}`).join('; ');
}

// ---------- step 3: proposal ----------
const PROPOSAL_FORMAT = `Format: {"title":"…","approach":"So meisterst du den Skill: 3–5 Sätze zum Vorgehen und was man am Ende jeder Stufe kann","duration":"z. B. ca. 6 Wochen bei 2 h pro Woche","stages":[{"name":"Name der Niveaustufe","goal":"was man danach kann","lessons":[{"title":"…","goal":"Lernziel in einem Satz","known":false}]}]}
Je Stufe 3–6 Lektionen, vom Einfachen zum Schweren, aufeinander aufbauend und praxisnah. Stufen nur bis zum Zielniveau. "known": true für Lektionen, die die Person laut Einstufung schon kann.`;

export function proposalPrompt(skill: Skill): Prompt {
  return {
    system: `Du planst einen Lernpfad, mit dem man einen Skill durch eigenes Tun meistert (learning by doing: jede Lektion besteht vor allem aus Aufgaben, die man selbst löst). ${LANG_RULE}
Ohne Material nutzt du dein Fachwissen – fachlich korrekt und passend zum Bildungsniveau.
${PROPOSAL_FORMAT}
${JSON_ONLY}`,
    user: context(skill),
    maxTokens: 4000,
    json: true,
  };
}

/** Changing the proposal on request („mehr Praxis zu …“, „bis Stufe X“). */
export function revisePrompt(skill: Skill, request: string): Prompt {
  return {
    system: `Du passt einen Lernpfad nach dem Wunsch der Person an. Ändere nur, was nötig ist; behalte gute Lektionen bei. ${LANG_RULE}
${PROPOSAL_FORMAT}
${JSON_ONLY}`,
    user: `${context(skill)}\n\nBISHERIGER LERNPFAD:\n${JSON.stringify({ stages: skill.stages.map((st) => ({ name: st.name, goal: st.goal, lessons: st.lessons.map((l) => ({ title: l.title, goal: l.goal, known: !!l.known })) })) })}\n\nWUNSCH DER PERSON: ${request}`,
    maxTokens: 4000,
    json: true,
  };
}

/** Reads a proposal; keeps lessons (with their sets) that already exist under the same title. */
export function parseProposal(raw: unknown, old: Stage[] = []): { title: string; approach: string; duration: string; stages: Stage[] } | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const known = new Map(old.flatMap((st) => st.lessons).map((l) => [l.title.toLowerCase(), l]));
  const stages = (Array.isArray(r.stages) ? r.stages : [])
    .map((st) => {
      const o = (st ?? {}) as Record<string, unknown>;
      const lessons = (Array.isArray(o.lessons) ? o.lessons : [])
        .map((l) => {
          const x = (l ?? {}) as Record<string, unknown>;
          const title = s(x.title, 100);
          const prev = known.get(title.toLowerCase());
          return title ? { ...(prev ?? { id: newId() }), title, goal: s(x.goal, 300) || prev?.goal || '', ...(x.known === true ? { known: true } : prev?.known ? { known: true } : {}) } : null;
        })
        .filter((l): l is Lesson => !!l)
        .slice(0, 8);
      const name = s(o.name, 60);
      const prevStage = old.find((p) => p.name === name);
      return name && lessons.length ? { id: prevStage?.id ?? newId(), name, goal: s(o.goal, 300), lessons, ...(prevStage?.test ? { test: prevStage.test } : {}), ...(prevStage?.passed ? { passed: true } : {}) } : null;
    })
    .filter((st): st is Stage => !!st)
    .slice(0, 6);
  if (!stages.length) return null;
  return { title: s(r.title, 80), approach: s(r.approach, 1500), duration: s(r.duration, 120), stages };
}

// ---------- adjusting by hand ----------
export function removeLesson(stages: Stage[], lessonId: string): Stage[] {
  return stages.map((st) => ({ ...st, lessons: st.lessons.filter((l) => l.id !== lessonId) })).filter((st) => st.lessons.length);
}
export function moveLesson(stages: Stage[], lessonId: string, by: -1 | 1): Stage[] {
  return stages.map((st) => {
    const i = st.lessons.findIndex((l) => l.id === lessonId);
    const j = i + by;
    if (i < 0 || j < 0 || j >= st.lessons.length) return st;
    const lessons = [...st.lessons];
    [lessons[i], lessons[j]] = [lessons[j], lessons[i]];
    return { ...st, lessons };
  });
}
export function addLesson(stages: Stage[], stageId: string, title: string, goal = ''): Stage[] {
  return stages.map((st) => (st.id === stageId ? { ...st, lessons: [...st.lessons, { id: newId(), title: title.trim().slice(0, 100), goal }] } : st));
}
export const toggleKnown = (stages: Stage[], lessonId: string): Stage[] =>
  stages.map((st) => ({ ...st, lessons: st.lessons.map((l) => (l.id === lessonId ? { ...l, known: !l.known } : l)) }));

// ---------- learning ----------
/**
 * Beginner lessons (first stage, or the first three lessons): theory first, every term explained before it is used,
 * and – when programming – mostly small programs to write yourself instead of questions about tools.
 */
export function beginnerRule(skill: Skill, stageIndex: number, lessonIndex: number): string {
  const beginner = stageIndex === 0 || lessonIndex < 3;
  if (!beginner) return 'Wenn in dieser Lektion neue Grundbegriffe vorkommen, erkläre sie kurz in "theory" (Markdown); sonst lass "theory" weg.';
  const code =
    skill.domain === 'java'
      ? `
PROGRAMMIER-ANFÄNGER: Die Person hat vielleicht noch nie programmiert. Werkzeuge (JDK, Compiler, IDE, Kommandozeile) erklärst du höchstens kurz mit Alltagsvergleich – frag sie NICHT ab. In Merkora läuft der Code direkt in der App, man muss nichts installieren.
Mindestens die Hälfte der Aufgaben sind "code"-Aufgaben, bei denen man selbst ein kleines, lauffähiges Programm schreibt – ganz klein anfangen (z. B. den eigenen Namen ausgeben, zwei Zahlen addieren), immer mit Startcode und klarer Anleitung, welche Zeile man ändert.`
      : '';
  return `ANFÄNGER-LEKTION – setze KEIN Vorwissen voraus.
Pflichtfeld "theory" (Markdown, etwa 150–350 Wörter), VOR der kurzen Erklärung:
"### Worum geht's?" (2–3 Sätze) · "### Stell dir vor …" (ein Bild/Vergleich aus dem Alltag) · "### Die wichtigen Begriffe" (Liste: **Begriff** – einfache Erklärung in einem Satz) · "### Was du gleich machst" (1–2 Sätze).
Jeder Begriff, der in "intro", im Beispiel oder in den Aufgaben vorkommt, muss vorher in "theory" erklärt sein. Die ersten Aufgaben sind sehr leicht (Erfolgserlebnis), danach selbst etwas tun.${code}`;
}

export function lessonPrompt(skill: Skill, stage: Stage, lesson: Lesson, count = 6): Prompt {
  const all = skill.stages.flatMap((st) => st.lessons);
  const i = all.findIndex((l) => l.id === lesson.id);
  const stageIndex = skill.stages.findIndex((st) => st.id === stage.id);
  const before = all.slice(0, Math.max(0, i)).map((l) => l.title);
  return {
    system: `Du bist ein geduldiger Tutor. Du erstellst eine Lektion, in der man durch eigenes Tun lernt: kurze Erklärung, ein durchgerechnetes Beispiel, dann ${count} Aufgaben, die man selbst löst. ${kindRule(skill)}
${beginnerRule(skill, stageIndex, i)}
${JSON_ONLY}`,
    user: `${context(skill)}\n\nSTUFE: ${stage.name} – ${stage.goal}\nLEKTION ${i + 1} von ${all.length}: ${lesson.title} – Ziel: ${lesson.goal}${before.length ? `\nVorher gelernt: ${before.slice(-8).join('; ')}` : ''}`,
    maxTokens: Math.min(16000, 3000 + count * (skill.domain === 'java' || skill.domain === 'law' ? 900 : 600)),
    json: true,
  };
}

export function stageTestPrompt(skill: Skill, stage: Stage): Prompt {
  return {
    system: `Du erstellst einen Stufentest: gemischte Aufgaben quer durch alle Lektionen dieser Stufe, so dass man zeigt, dass man die Stufe beherrscht. ${kindRule(skill)}
Keine Erklärung nötig ("intro" 1 Satz, kein "example"). 8 Aufgaben. ${JSON_ONLY}`,
    user: `${context(skill)}\n\nSTUFE: ${stage.name} – ${stage.goal}\nLektionen: ${stage.lessons.map((l) => `${l.title} (${l.goal})`).join('; ')}`,
    maxTokens: 9000,
    json: true,
  };
}

export function reviewPrompt(skill: Skill): Prompt {
  const done = skill.stages.flatMap((st) => st.lessons).filter(lessonDone);
  return {
    system: `Du erstellst eine gemischte Wiederholung: Aufgaben quer durch bereits gelernte Lektionen, damit nichts vergessen wird (verteiltes Üben). ${kindRule(skill)}
Kein "example". 8 Aufgaben. ${JSON_ONLY}`,
    user: `${context(skill)}\n\nGELERNTE LEKTIONEN: ${done.map((l) => `${l.title} (${l.goal})`).join('; ')}`,
    maxTokens: 9000,
    json: true,
  };
}

/** A set counts as mastered at 80 % solved. */
export const mastered = (set?: PracticeSet) => !!set && problemCount(set) > 0 && solvedCount(set) / problemCount(set) >= 0.8;
export const lessonDone = (l: Lesson) => !!l.known || mastered(l.set);
/** Stars for a finished lesson on the path: 3 = all solved (or „kannst du schon“), 2 = from 90 %, 1 = done (80 %). */
/** A lesson you said you already know: skipped – it does not count as learned. */
export const lessonSkipped = (l: Lesson) => !!l.known;
export function lessonStars(l: Lesson): number {
  if (l.known) return 0;
  if (!l.set || !problemCount(l.set)) return 0;
  const share = solvedCount(l.set) / problemCount(l.set);
  return share >= 1 ? 3 : share >= 0.9 ? 2 : share >= 0.8 ? 1 : 0;
}
/** The lesson that is next: the first one not done (lessons marked „kannst du schon“ are skipped). */
export function nextLesson(skill: Skill): { stage: Stage; lesson: Lesson } | null {
  for (const stage of skill.stages) for (const lesson of stage.lessons) if (!lessonDone(lesson)) return { stage, lesson };
  return null;
}
/** The lesson after this one (for preparing it in the background). */
export function lessonAfter(skill: Skill, lessonId: string): { stage: Stage; lesson: Lesson } | null {
  const all = skill.stages.flatMap((stage) => stage.lessons.map((lesson) => ({ stage, lesson })));
  const i = all.findIndex((x) => x.lesson.id === lessonId);
  return all.slice(i + 1).find((x) => !x.lesson.known && !x.lesson.set) ?? null;
}
export function skillProgress(skill: Skill) {
  const all = skill.stages.flatMap((st) => st.lessons);
  // skipped lessons („kannst du schon“) are neither learned nor still to do
  const skipped = all.filter(lessonSkipped).length;
  const done = all.filter((l) => !l.known && lessonDone(l)).length;
  const total = all.length - skipped;
  return { done, skipped, total, share: total ? done / total : skipped ? 1 : 0 };
}
/** A level test is open when every lesson of the level is done. */
export const stageReady = (st: Stage) => st.lessons.every(lessonDone);
/** Mixed review after at least two finished lessons (that were really practised). */
export const canReview = (skill: Skill) => skill.stages.flatMap((st) => st.lessons).filter((l) => mastered(l.set)).length >= 2;
/** The level reached so far (index in levels; −1 = none yet). */
export function reachedStage(skill: Skill): number {
  let n = -1;
  skill.stages.forEach((st, i) => {
    if (st.passed && n === i - 1) n = i;
  });
  return n;
}
