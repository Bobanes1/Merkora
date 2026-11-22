/**
 * Skills: learning by doing, without flashcards. A broad topic becomes a learning path in conversation:
 * questions → placement test → proposal with levels and lessons → adjust → learn lesson by lesson
 * (practice sets with active tasks), a test per level, mixed reviews.
 * Pure – tested in scripts/test-srs.mts. Running the AI requests: lib/skillRun.ts.
 */
import { FORMULA_RULE, LANG_RULE, type Prompt } from './ai';
import { FIGURE_RULE, problemCount, setFrame, solvedCount, toDomain, type Domain, type PracticeSet, type ProblemProgress } from './practice';
import { DAY, dayKey, startOfDay } from './util';
import { spreadClip } from './sample';
import type { DeckFile } from './store';
import type { CaseGrade, CaseTask } from './tasks';

export type PlanQuestion = { q: string; options: string[]; multi?: boolean };
export type Lesson = {
  id: string;
  title: string;
  goal: string;
  known?: boolean;
  set?: PracticeSet;
  /** Minutes spent in this lesson (measured while it is open) – for the remaining-time estimate. */
  minutes?: number;
};
/** A small hands-on project at the end of a stage: apply everything of the stage once. */
export type StageProject = {
  title: string;
  brief: string;
  steps: string[];
  deliverable: 'text' | 'code';
  rubric: { criterion: string; points: number }[];
  solution: string;
  starter?: string;
  submission?: string;
  grade?: CaseGrade;
  done?: boolean;
};
export type Stage = { id: string; name: string; goal: string; lessons: Lesson[]; test?: PracticeSet; passed?: boolean; project?: StageProject; sheet?: string };
export type Jurisdiction = 'ch' | 'de' | 'at';
export const JURISDICTION_RULE: Record<Jurisdiction, string> = {
  ch: 'RECHTSORDNUNG: Schweiz – nur Schweizer Recht (ZGB, OR, StGB, SchKG, BV …), Normen als "Art. … ZGB/OR", Schweizer Begriffe (z. B. Besitz, Eigentum, Grundbuch nach ZGB). "law": "Schweizer Recht".',
  de: 'RECHTSORDNUNG: Deutschland – nur deutsches Recht (BGB, StGB, HGB, GG …), Normen als "§ … BGB". "law": "Deutsches Recht".',
  at: 'RECHTSORDNUNG: Österreich – nur österreichisches Recht (ABGB, StGB, UGB, B-VG …), Normen als "§ … ABGB". "law": "Österreichisches Recht".',
};
export type NextIdea = { title: string; why: string; mini?: boolean };
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
  /** The original files of the material (PDF, Word, PowerPoint …), stored like deck files and shown under „Dein Material“. */
  files?: DeckFile[];
  /** Optional target date (YYYY-MM-DD) – the lessons can be spread over the days until then. */
  targetDate?: string;
  /** When the completion was celebrated (once). */
  celebrated?: number;
  /** Solved tasks per day (dayKey → count) – for the daily goal and the streak of this skill. */
  activity?: Record<string, number>;
  /** Tasks per day for the daily goal (default 6 ≈ one lesson). */
  dailyGoal?: number;
  status: 'planning' | 'active';
  /** Law: the legal system the tasks use (from the topic, the material or the grade scale). */
  jurisdiction?: Jurisdiction;
  /** A mini skill: a few short lessons just for fun – no planning, no stage test. */
  mini?: boolean;
  /** Suggestions for what to learn next (made once, near the end of the skill). */
  nextIdeas?: NextIdea[];
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
  /** When the review is a training of weak topics: their titles. */
  reviewFocus?: string[];
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

/**
 * Which law a law skill is about: named in title, topic or material (ZGB/OR/Schweiz, BGB/Deutschland, ABGB/Österreich),
 * else the country of the grade scale the person chose; else unknown. Pure – tested.
 */
export function jurisdictionOf(skill: Pick<Skill, 'title' | 'topic' | 'material'>, gradeScale?: string): Jurisdiction | undefined {
  const text = `${skill.title} ${skill.topic} ${(skill.material ?? '').slice(0, 20000)}`;
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  // country words in any case, law abbreviations only in capitals (so "or" in a text does not count)
  const ch = count(/schweiz|bundesgericht/gi) + count(/\bZGB\b|\bOR\b|\bSchKG\b|\bBGE\b/g);
  const de = count(/deutschland|deutsches recht/gi) + count(/\bBGB\b|\bHGB\b|\bGG\b|\bBGH\b/g);
  const at = count(/österreich/gi) + count(/\bABGB\b|\bOGH\b|\bUGB\b/g);
  const best = Math.max(ch, de, at);
  if (best > 0) return ch === best ? 'ch' : de === best ? 'de' : 'at';
  return gradeScale === 'ch' || gradeScale === 'de' || gradeScale === 'at' ? gradeScale : undefined;
}

const context = (skill: Skill) =>
  (skill.domain === 'law' && skill.jurisdiction ? JURISDICTION_RULE[skill.jurisdiction] + '\n' : '') +
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
  if (!beginner) return 'Wenn in dieser Lektion neue Grundbegriffe vorkommen, erkläre sie im ersten Häppchen kurz.';
  const code =
    skill.domain === 'java'
      ? `
PROGRAMMIER-ANFÄNGER: Die Person hat vielleicht noch nie programmiert. Werkzeuge (JDK, Compiler, IDE, Kommandozeile) erklärst du höchstens kurz mit Alltagsvergleich – frag sie NICHT ab. In Merkora läuft der Code direkt in der App, man muss nichts installieren.
Mindestens die Hälfte der Aufgaben sind "code"-Aufgaben, bei denen man selbst ein kleines, lauffähiges Programm schreibt – ganz klein anfangen (z. B. den eigenen Namen ausgeben, zwei Zahlen addieren), immer mit Startcode und klarer Anleitung, welche Zeile man ändert.`
      : '';
  return `ANFÄNGER-LEKTION – setze KEIN Vorwissen voraus.
Die ersten Häppchen holen ab: "Worum geht's?" (2–3 Sätze), "Stell dir vor …" (ein Bild/Vergleich aus dem Alltag), "Die wichtigen Begriffe" (**Begriff** – einfache Erklärung in einem Satz), dann erst das Neue.
Jeder Begriff, der im Beispiel oder in den Aufgaben vorkommt, muss vorher in einem Häppchen erklärt sein. Die ersten Aufgaben sind sehr leicht (Erfolgserlebnis), danach selbst etwas tun.${code}`;
}

/** With prior knowledge the lessons go faster: no basics, straight to the new part. */
export const FAST_RULE = 'TEMPO: Die Person hat Vorwissen. Keine Grundlagen, die sie schon kennt – direkt zum Neuen dieser Lektion. Nur 2–3 Häppchen, Kontrollfragen nur wo sie wirklich helfen, wenige Zwischenschritte. Schon die ersten Aufgaben verlangen Anwendung, keine sehr leichten Aufwärmaufgaben.';

/**
 * How fast to go: 'fast' when the person said they know something already (answer to a question about prior
 * knowledge), solved most of the placement test, or marked lessons as „kann ich schon“. Pure – tested.
 */
export function paceOf(skill: Skill): 'fast' | 'normal' {
  const qs = skill.plan.questions ?? [];
  const said = qs.some((q, i) => /vorwissen|vorkenntnis|erfahrung|kennst du|kannst du schon|bisher/i.test(q.q) && /etwas|viel|grundlagen|fortgeschritten|gut|sicher|einige|schon|mittel|erfahren/i.test(skill.plan.answers?.[i] ?? '') && !/keine?s?\b|nichts|gar nicht|null/i.test(skill.plan.answers?.[i] ?? ''));
  const pl = skill.plan.placement;
  const placed = !!pl && pl.progress.filter((x) => x.solved).length >= 3;
  const known = skill.stages.some((st) => st.lessons.some((l) => l.known));
  return said || placed || known ? 'fast' : 'normal';
}

/** Skill lessons explain in bites: read a little, answer an easy question about it, go on – no wall of text. */
export const BITE_RULE = `ERKLÄRUNG IN HÄPPCHEN – keine Textwand. Feld "bites": 3–5 Häppchen in sinnvoller Reihenfolge:
[{"title":"kurzer Titel","text":"Markdown, höchstens etwa 80 Wörter, ein Gedanke","figure":0,"check":{"q":"sehr leichte Frage genau zu diesem Häppchen","options":["…","…","…"],"correct":1,"why":"ein Satz, warum"}}]
- Jedes Häppchen endet mit "check" (2–4 Optionen, "correct" = Index der richtigen Option, ab 0). Die Frage prüft nur, ob man das Häppchen verstanden hat – kein Wissen von später.
- "figure" (optional) = Index eines Bildes in "figures", das genau zu diesem Häppchen passt.
- "intro" ist dann nur EIN Satz Zusammenfassung; "theory" lässt du weg.`;

export function lessonPrompt(skill: Skill, stage: Stage, lesson: Lesson, count = skill.mini ? 4 : 6): Prompt {
  const all = skill.stages.flatMap((st) => st.lessons);
  const i = all.findIndex((l) => l.id === lesson.id);
  const stageIndex = skill.stages.findIndex((st) => st.id === stage.id);
  const before = all.slice(0, Math.max(0, i)).map((l) => l.title);
  return {
    system: `Du bist ein geduldiger Tutor. Du erstellst eine Lektion, in der man durch eigenes Tun lernt: kurze Erklärung, ein durchgerechnetes Beispiel, dann ${count} Aufgaben, die man selbst löst. ${kindRule(skill)}
${BITE_RULE}
${skill.mini ? MINI_RULE + ' Höchstens 3 Häppchen.' : paceOf(skill) === 'fast' ? FAST_RULE : beginnerRule(skill, stageIndex, i)}
${FIGURE_RULE}
${JSON_ONLY}`,
    user: `${context(skill)}\n\nSTUFE: ${stage.name} – ${stage.goal}\nLEKTION ${i + 1} von ${all.length}: ${lesson.title} – Ziel: ${lesson.goal}${before.length ? `\nVorher gelernt: ${before.slice(-8).join('; ')}` : ''}`,
    maxTokens: Math.min(16000, 6000 + count * (skill.domain === 'java' || skill.domain === 'law' ? 900 : 600)),
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

export function reviewPrompt(skill: Skill, focus?: Lesson[]): Prompt {
  if (focus?.length)
    return {
      system: `Du erstellst ein Schwachstellen-Training: Aufgaben nur zu den Themen, bei denen die Person noch unsicher ist. Beginne mit einer etwas leichteren Aufgabe, steigere dann, und decke jedes Thema ab. ${kindRule(skill)}
Kein "example". 6 Aufgaben. ${JSON_ONLY}`,
      user: `${context(skill)}

UNSICHERE THEMEN: ${focus.map((l) => `${l.title} (${l.goal})`).join('; ')}`,
      maxTokens: 8000,
      json: true,
    };
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

// ---------- mini project per stage ----------
export function projectPrompt(skill: Skill, stage: Stage): Prompt {
  const code = skill.domain === 'java';
  return {
    system: `Du entwirfst ein kleines Praxisprojekt zum Abschluss einer Lernstufe: Die Person wendet alles an, was sie in dieser Stufe gelernt hat – an einer echten, kleinen Aufgabe (30–60 Minuten). ${LANG_RULE}
Beispiele: ein kurzes Programm, ein Brief oder Dialog in der Fremdsprache, eine kleine Datenanalyse, ein Gutachten zu einem Mini-Fall, eine kleine Komposition.
"brief": 3–5 Sätze, worum es geht und was am Ende herauskommt. "steps": 3–6 konkrete Schritte. "deliverable": "${code ? 'code' : 'text'}". "rubric": 3–5 Kriterien mit Punkten (zusammen 10). "solution": eine gute Musterlösung (nur für die Bewertung).${code ? ' "starter": Startcode (Java, class Solution mit main).' : ''}
Format: {"title":"…","brief":"…","steps":["…"],"deliverable":"${code ? 'code' : 'text'}","rubric":[{"criterion":"…","points":3}],"solution":"…"${code ? ',"starter":"…"' : ''}}
${JSON_ONLY}`,
    user: `${context(skill)}\n\nSTUFE: ${stage.name} – ${stage.goal}\nLektionen: ${stage.lessons.map((l) => l.title).join('; ')}`,
    maxTokens: 4000,
    json: true,
  };
}
export function parseProject(raw: unknown): StageProject | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, n = 4000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const title = str(r.title, 120);
  const brief = str(r.brief, 2000);
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((x) => str(x, 400)).filter(Boolean).slice(0, 8);
  const rubric = (Array.isArray(r.rubric) ? r.rubric : [])
    .map((x) => ({ criterion: str((x as Record<string, unknown>)?.criterion, 300), points: Math.max(1, Math.min(10, Math.round(Number((x as Record<string, unknown>)?.points) || 2))) }))
    .filter((x) => x.criterion)
    .slice(0, 6);
  if (!title || !brief || !rubric.length) return null;
  return { title, brief, steps, deliverable: r.deliverable === 'code' ? 'code' : 'text', rubric, solution: str(r.solution, 8000), ...(str(r.starter, 6000) ? { starter: str(r.starter, 6000) } : {}) };
}
/** The project as a case task, so the existing grading (caseGradePrompt / parseCaseGrade) can mark it. */
export const projectAsCase = (p: StageProject): CaseTask => ({
  type: 'case',
  facts: p.brief + (p.steps.length ? '\n\nSchritte:\n' + p.steps.map((x, i) => `${i + 1}. ${x}`).join('\n') : ''),
  question: p.title,
  rubric: p.rubric,
  solution: p.solution,
  hints: [],
});
/** A project counts as done from 70 % of the points. */
export const projectPassed = (g?: CaseGrade) => !!g && g.max > 0 && g.total / g.max >= 0.7;

// ---------- cheat sheet per stage ----------
export function sheetPrompt(skill: Skill, stage: Stage): Prompt {
  return {
    system: `Du schreibst einen Spickzettel für eine geschaffte Lernstufe: alles Wichtige auf einer Seite zum Nachschlagen und Wiederholen. ${LANG_RULE}
${FORMULA_RULE}
Markdown, höchstens etwa 350 Wörter, klar gegliedert:
"## Das Wichtigste" (3–6 Stichpunkte) · "## Begriffe" (Liste: **Begriff** – kurze Erklärung) · "## Regeln & Formeln" (wenn passend) · "## Beispiel" (ein kurzes, typisches) · "## Typische Fehler" (2–4 Stichpunkte).
Format: {"sheet":"…Markdown…"}
${JSON_ONLY}`,
    user: `${context(skill)}\n\nSTUFE: ${stage.name} – ${stage.goal}\nLektionen: ${stage.lessons.map((l) => `${l.title} (${l.goal})`).join('; ')}`,
    maxTokens: 2500,
    json: true,
  };
}

// ---------- remaining time, target date, completion ----------
/** Lessons still to learn (not done, not skipped). */
export const openLessons = (skill: Skill) => skill.stages.flatMap((st) => st.lessons).filter((l) => !l.known && !lessonDone(l));
/** Typical minutes per lesson: the average of measured ones (from two on), else 20. */
export function minutesPerLesson(skill: Skill): number {
  const m = skill.stages.flatMap((st) => st.lessons).map((l) => l.minutes ?? 0).filter((x) => x >= 3);
  return m.length >= 2 ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : 20;
}
/** „noch ca. 6 Std.“ – how long the open lessons take. */
export function remainingText(skill: Skill): string {
  const n = openLessons(skill).length;
  if (!n) return 'alle Lektionen geschafft';
  const min = n * minutesPerLesson(skill);
  const h = Math.round(min / 30) / 2;
  const t = min < 90 ? `${Math.max(5, Math.round(min / 5) * 5)} Min.` : `${Number.isInteger(h) ? h : `${Math.floor(h)},5`} Std.`;
  return `noch ca. ${t} · ${n} ${n === 1 ? 'Lektion' : 'Lektionen'}`;
}
/**
 * Spreads `count` lessons evenly over the days from `from` to `until` (both YYYY-MM-DD, until included),
 * at most `perDay` a day; if there are too few days, the last day gets the rest. Returns one day per lesson. Pure – tested.
 */
export function planLessons(count: number, from: string, until: string, perDay = 3): string[] {
  const day = (k: string) => new Date(k + 'T12:00:00').getTime();
  const key = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const days = Math.max(1, Math.round((day(until) - day(from)) / 86400000) + 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let d = Math.floor((i * days) / Math.max(1, count));
    // not more than perDay on one day: move on while there are days left
    while (d < days - 1 && out.filter((x) => x === key(day(from) + d * 86400000)).length >= perDay) d++;
    out.push(key(day(from) + d * 86400000));
  }
  return out;
}
/** The whole skill is done: every stage up to the target is passed. */
export const skillComplete = (skill: Skill) =>
  skill.status === 'active' && skill.stages.length > 0 && (skill.mini ? skill.stages.every((st) => st.lessons.every(lessonDone)) : skill.stages.every((st) => st.passed));

// ---------- daily goal and streak ----------
export const GOALS = [
  { n: 3, label: 'Locker' },
  { n: 6, label: 'Normal', hint: '≈ 1 Lektion' },
  { n: 12, label: 'Intensiv' },
];
export const goalOf = (skill: Skill) => Math.max(1, skill.dailyGoal ?? 6);

/** Counts a task as solved today – only when it was not solved before (no double counting). */
export function recordSolved(skill: Skill, before: PracticeSet | undefined, i: number, patch: Partial<ProblemProgress>, now = Date.now()): Partial<Skill> {
  if (!patch.solved || !before || before.progress[i]?.solved) return {};
  const k = dayKey(now);
  return { activity: { ...(skill.activity ?? {}), [k]: (skill.activity?.[k] ?? 0) + 1 } };
}
export function skillToday(skill: Skill, now = Date.now()) {
  const goal = goalOf(skill);
  const done = skill.activity?.[dayKey(now)] ?? 0;
  return { done, goal, reached: done >= goal };
}
/** Days in a row with the daily goal reached; today counts once it is reached, before that the streak runs from yesterday. */
export function skillStreak(skill: Skill, now = Date.now()) {
  const goal = goalOf(skill);
  const has = (t: number) => (skill.activity?.[dayKey(t)] ?? 0) >= goal;
  const prev = (t: number) => startOfDay(t - DAY / 2);
  let day = startOfDay(now);
  if (!has(day)) day = prev(day);
  let n = 0;
  while (has(day)) {
    n++;
    day = prev(day);
  }
  return n;
}
export const bestStreakAll = (skills: Skill[], now = Date.now()) => skills.reduce((m, sk) => Math.max(m, skillStreak(sk, now)), 0);
/** Solved skill tasks per day over the last n days (all skills together, oldest first). */
export function skillDays(skills: Skill[], n: number, now = Date.now()) {
  const out: { t: number; tasks: number }[] = [];
  let t = startOfDay(now);
  for (let k = 0; k < n; k++) {
    out.unshift({ t, tasks: skills.reduce((a, sk) => a + (sk.activity?.[dayKey(t)] ?? 0), 0) });
    t = startOfDay(t - DAY / 2);
  }
  return out;
}

// ---------- competence map ----------
/** How well one task went: first try without help 1, with retries/hints less, solution shown 0.2, unsolved 0. */
export function taskScore(p: ProblemProgress): number {
  if (p.solved) {
    if (p.shown) return 0.2;
    if (p.tries <= 1 && !p.hints) return 1;
    if (p.hints) return 0.5;
    return 0.7;
  }
  return p.shown ? 0.2 : 0;
}
const attempted = (p?: ProblemProgress) => !!p && (p.tries > 0 || p.solved || p.shown);
/** Competence of a set from the tasks you tried. */
export function setCompetence(set?: PracticeSet): { share: number; attempted: number } {
  const tried = (set?.progress ?? []).filter(attempted);
  if (!tried.length) return { share: 0, attempted: 0 };
  return { share: tried.reduce((a, p) => a + taskScore(p), 0) / tried.length, attempted: tried.length };
}
export type CompetenceState = 'good' | 'ok' | 'weak' | 'new' | 'skipped';
export type CompetenceRow = { lesson: Lesson; share: number; state: CompetenceState };
export function competenceState(share: number): CompetenceState {
  return share >= 0.8 ? 'good' : share >= 0.55 ? 'ok' : 'weak';
}
/** Per stage, per lesson: how well it sits. A stage test you took is averaged in (it covers the whole stage). */
export function competenceMap(skill: Skill): { stage: Stage; rows: CompetenceRow[] }[] {
  return skill.stages.map((stage) => {
    const test = setCompetence(stage.test);
    return {
      stage,
      rows: stage.lessons.map((lesson): CompetenceRow => {
        if (lesson.known) return { lesson, share: 1, state: 'skipped' };
        const c = setCompetence(lesson.set);
        if (!c.attempted) return { lesson, share: 0, state: 'new' };
        const share = test.attempted ? (c.share * 2 + test.share) / 3 : c.share;
        return { lesson, share, state: competenceState(share) };
      }),
    };
  });
}
/** The weakest lessons you already tried (for a focused training), at most 3. */
export function weakLessons(skill: Skill, max = 3): Lesson[] {
  return competenceMap(skill)
    .flatMap((g) => g.rows)
    .filter((r) => r.state === 'weak' || r.state === 'ok')
    .sort((a, b) => a.share - b.share)
    .slice(0, max)
    .map((r) => r.lesson);
}

// ---------- ideas: what to learn ----------
/** Topics for the suggestions on the skills page (a different few every day). */
export const TOPIC_POOL = [
  'Stochastik', 'Lineare Algebra', 'Analysis: Ableitungen', 'Statistik für die Uni', 'Finanzmathematik',
  'Java programmieren', 'Python-Grundlagen', 'SQL-Abfragen', 'JavaScript fürs Web', 'Algorithmen und Datenstrukturen',
  'Vertragsrecht – Fälle lösen', 'Mietrecht', 'Strafrecht AT', 'Arbeitsrecht', 'Sachenrecht',
  'Musiktheorie: Akkorde und Intervalle', 'Gitarre: Akkorde begleiten', 'Klavier: Noten lesen', 'Gehörbildung', 'Rhythmus und Takt',
  'Spanisch Grammatik', 'Englisch fürs Business', 'Französisch für den Alltag', 'Italienisch für den Urlaub', 'Latein-Grundlagen',
  'Buchhaltung Grundlagen', 'Volkswirtschaftslehre', 'Marketing-Grundlagen', 'Projektmanagement', 'Excel für den Job',
  'Erste Hilfe', 'Ernährung verstehen', 'Psychologie-Grundlagen', 'Philosophie: Ethik', 'Chemie: Reaktionen',
  'Physik: Mechanik', 'Biologie: Genetik', 'Geschichte: Das 20. Jahrhundert', 'Präsentieren und Reden', 'Wissenschaftliches Schreiben',
];

/** Small skills for fun – learned in about 20 minutes, to broaden the horizon. */
export const MINI_POOL = [
  'Morsecode', 'Sternbilder am Nachthimmel finden', 'Hiragana: die ersten 10 Zeichen', 'Origami-Kranich falten', 'Schach: Matt in 1',
  'Wie funktioniert Bitcoin?', 'Gebärdensprache: Begrüßung', 'Blues-Tonleiter', 'Kopfrechen-Tricks', 'Wolken erkennen',
  'Das NATO-Alphabet', 'Römische Zahlen', 'Knoten fürs Segeln', 'Wie Impfungen wirken', 'Kaffee: Von der Bohne zur Tasse',
  'Optische Täuschungen verstehen', 'Weinregionen Europas', 'Die Planeten unseres Sonnensystems', 'Zaubertrick mit Karten', 'Binärzahlen',
  'Griechisches Alphabet', 'Erste Worte auf Koreanisch', 'Pilze sicher unterscheiden – die Basics', 'Wie Flugzeuge fliegen', 'Fotografie: Die Drittel-Regel',
  'Kalligrafie: Grundstriche', 'Vogelstimmen erkennen', 'Wie das Internet funktioniert', 'Mondphasen verstehen', 'Akkorde auf der Ukulele',
  'Brot backen: Die Chemie dahinter', 'Typografie: Schriften erkennen', 'Rhetorische Stilmittel', 'Wie Wahlen gezählt werden', 'Erste Hilfe bei Verbrennungen',
  'Geheimschriften: Caesar-Verschlüsselung', 'Wie Farben im Gehirn entstehen', 'Kurzschrift: Die ersten Zeichen', 'Feng-Shui-Grundideen', 'Sudoku-Strategien',
];

/**
 * n topics from a pool, the same for the same seed (e.g. the day) and different for another;
 * topics the person already has (as skill titles or topics) are left out. Pure – tested.
 */
export function pickTopics(pool: readonly string[], n: number, seed: number, exclude: string[] = []): string[] {
  const has = new Set(exclude.map((x) => x.trim().toLowerCase()));
  const free = pool.filter((t) => !has.has(t.toLowerCase()));
  // a small seeded shuffle (mulberry32)
  let a = (seed >>> 0) || 1;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list = [...free];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, n);
}

/** Mini skills: light, curious, one aha after the other – short lessons with 4 tasks. */
export const MINI_RULE = 'MINI-SKILL: Ein kleines Thema zum Spaß und Horizont-Erweitern. Locker, neugierig machend, mit Aha-Momenten und einem überraschenden Fakt. Kein Vorwissen nötig, nichts Trockenes.';

/** One call: a mini skill with one stage of 3 short lessons – no questions, no placement test. */
export function miniPrompt(topic: string, level = ''): Prompt {
  return {
    system: `Du planst einen Mini-Skill: etwas Kleines, das man in etwa 20 Minuten durch eigenes Tun lernt – zum Spaß und um den Horizont zu erweitern. ${LANG_RULE}
${MINI_RULE}
"domain": math | java | law | music | language | general (Programmieren = java).
Format: {"title":"kurzer, einladender Name","domain":"…","approach":"2 Sätze: was man in 20 Minuten lernt und warum es Spaß macht","stages":[{"name":"Mini-Skill","goal":"was man danach kann","lessons":[{"title":"…","goal":"Lernziel in einem Satz"}]}]}
Genau 1 Stufe mit genau 3 Lektionen, vom Einfachsten zum kleinen Höhepunkt.
${JSON_ONLY}`,
    user: `Thema: ${topic}${level ? `\nBildungsniveau: ${level}` : ''}`,
    maxTokens: 1500,
    json: true,
  };
}

/** What could come next after this skill: 3 ideas (for a mini skill first the topic as a real skill). */
export function nextSkillsPrompt(skill: Skill, existing: string[] = []): Prompt {
  return {
    system: `Du bist ein Lerncoach. Jemand hat einen Skill (fast) geschafft. Schlage genau 3 passende nächste Skills vor, die darauf aufbauen oder den Horizont sinnvoll erweitern. ${LANG_RULE}
${skill.mini ? 'Es war ein Mini-Skill: Der ERSTE Vorschlag ist dasselbe Thema als richtiger Skill zum Vertiefen ("mini": false), die beiden anderen sind verwandte Mini-Skills ("mini": true).' : 'Mische: 2 richtige Skills ("mini": false) und 1 überraschender Mini-Skill zum Spaß ("mini": true).'}
Nicht vorschlagen, was die Person schon hat.
Format: {"ideas":[{"title":"kurzer Name","why":"ein Satz, warum das gut passt","mini":false}]}
${JSON_ONLY}`,
    user: `Geschafft: ${skill.title} (${skill.domain})\nLektionen: ${skill.stages.flatMap((st) => st.lessons.map((l) => l.title)).join('; ')}${existing.length ? `\nHat schon: ${existing.join('; ')}` : ''}`,
    maxTokens: 800,
    json: true,
  };
}

export function parseNextIdeas(raw: unknown): NextIdea[] {
  const r = (raw ?? {}) as Record<string, unknown>;
  return (Array.isArray(r.ideas) ? r.ideas : [])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { title: s(o.title, 80), why: s(o.why, 240), ...(o.mini === true ? { mini: true } : {}) };
    })
    .filter((x) => x.title)
    .slice(0, 3);
}

/** Show „Wie geht's weiter?“ once the skill is done or most of it (80 % of the lessons). */
export const wantsNextIdeas = (skill: Skill) => skill.status === 'active' && (skillComplete(skill) || skillProgress(skill).share >= 0.8);
