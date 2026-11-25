/**
 * Skills: learning by doing, without flashcards. A broad topic becomes a learning path in conversation:
 * questions → placement test → proposal with levels and lessons → adjust → learn lesson by lesson
 * (practice sets with active tasks), a test per level, mixed reviews.
 * Pure – tested in scripts/test-srs.mts. Running the AI requests: lib/skillRun.ts.
 */
import { FORMULA_RULE, LANG_RULE, type Prompt } from './ai';
import { cleanSolve, FIGURE_RULE, problemCount, setFrame, settledCount, solvedCount, taskList, toDomain, type Domain, type LessonStyle, type PracticeSet, type ProblemProgress } from './practice';
import { DAY, dayKey, startOfDay } from './util';
import { spreadClip } from './sample';
import type { DeckFile } from './store';
import { MINI_IDEAS, SKILL_IDEAS } from './topicPool';
import { presetPromptHint } from './visualPresets';
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
  /** When it was mastered for the first time (for when a review is due). */
  doneAt?: number;
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
export type Stage = { id: string; name: string; goal: string; lessons: Lesson[]; test?: PracticeSet; passed?: boolean; project?: StageProject; sheet?: string; /** the mini project was skipped – „Weiter“ no longer suggests it */ projectSkipped?: boolean };
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
  /** When the last review and the last weak-spot training were started (for the smart „Weiter“). */
  lastReviewAt?: number;
  lastWeakAt?: number;
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

/**
 * Does the topic deal with numbers (calculating, statistics, money, physics …)? Only then do spreadsheet and
 * calculation tasks fit – a PR, history or language topic gets no invented numbers. Pure – tested.
 */
export function numericTopic(skill: Pick<Skill, 'domain' | 'title' | 'topic' | 'material'>): boolean {
  if (skill.domain === 'math') return true;
  if (skill.domain !== 'general') return false;
  const text = `${skill.title} ${skill.topic} ${(skill.material ?? '').slice(0, 4000)}`.toLowerCase();
  return /statisti|mathe|rechn|finanz|buchhalt|bilanz|wirtschaft|ökonom|kalkulation|controlling|kosten|budget|steuer|excel|tabellenkalk|physik|chemie|elektro|zins|aktie|invest|prozent|datenanalyse|ernährung.*kalorien|kalorien/.test(text);
}
/** No numbers in the topic: no spreadsheet tasks and no invented statistics. */
export const NO_NUMBERS_RULE =
  'Das Thema handelt NICHT von Zahlen: keine Rechen- oder Tabellenaufgaben und keine erfundenen Zahlen, Studien oder Statistiken. "estimate" nur bei echten, bekannten Größen (z. B. Jahreszahlen); "calc" nur als Auswahl- oder Textantwort.';
const kindRule = (skill: Skill) => {
  const plain = skill.domain === 'general' && !numericTopic(skill);
  return `${LANG_RULE}\n${FORMULA_RULE}\n${setFrame(skill.domain, plain ? ['sheet'] : [])}${plain ? '\n' + NO_NUMBERS_RULE : ''}`;
};
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
Hole ganz am Anfang mit einer einfachen Alltagsidee ab und erkläre jeden neuen Fachbegriff sofort kurz, bevor er im Beispiel oder in den Aufgaben vorkommt. Nutze lebendige, zum Thema passende Überschriften statt starrer Standard-Titel. Die ersten Aufgaben geben ein schnelles Erfolgserlebnis, danach wird selbst angewendet.${code}`;
}

/** With prior knowledge the lessons go faster: no basics, straight to the new part. */
export const FAST_RULE = 'TEMPO: Die Person hat Vorwissen. Keine Grundlagen, die sie schon kennt – direkt zum Neuen dieser Lektion. Nur 2–3 Häppchen, Kontrollfragen nur wo sie wirklich helfen, wenige Zwischenschritte. Schon die ersten Aufgaben verlangen Anwendung, keine sehr leichten Aufwärmaufgaben.';

/**
 * How fast to go: 'fast' when the person said they know something already (answer to a question about prior
 * knowledge), solved most of the placement test, or marked lessons as „kann ich schon“. Pure – tested.
 */
/** When the last lessons went badly: smaller steps. */
export const GENTLE_RULE = 'TEMPO: Die letzten Lektionen fielen der Person schwer. Kleinere Schritte: ein Häppchen mehr, die ersten zwei Aufgaben sehr leicht (Erfolgserlebnis), danach langsam steigern, zu jeder Aufgabe zwei hilfreiche Hinweise.';

/** Share of a lesson's core tasks solved cleanly (first try, no hints, no solution looked at). */
function cleanShare(l: Lesson): number | null {
  const set = l.set;
  if (!set) return null;
  const core = set.progress.filter((x) => !x.extra);
  const tried = core.filter((x) => x.solved || x.tries > 0 || x.dunno || x.shown);
  if (tried.length < 3) return null;
  return core.filter(cleanSolve).length / core.length;
}

/**
 * How fast to go: the last two lessons worked on decide first (clean ≥ 80 % → fast, below 50 % → gentle);
 * otherwise prior knowledge (answer to a question about it, a good placement test, lessons marked „kann ich schon“). Pure – tested.
 */
export function paceOf(skill: Skill): 'fast' | 'normal' | 'gentle' {
  const recent = skill.stages
    .flatMap((st) => st.lessons)
    .map(cleanShare)
    .filter((x): x is number => x !== null)
    .slice(-2);
  if (recent.length) {
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (avg < 0.5) return 'gentle';
    if (recent.length === 2 && recent.every((x) => x >= 0.8)) return 'fast';
  }
  return priorPace(skill);
}
function priorPace(skill: Skill): 'fast' | 'normal' {
  const qs = skill.plan.questions ?? [];
  const said = qs.some((q, i) => /vorwissen|vorkenntnis|erfahrung|kennst du|kannst du schon|bisher/i.test(q.q) && /etwas|viel|grundlagen|fortgeschritten|gut|sicher|einige|schon|mittel|erfahren/i.test(skill.plan.answers?.[i] ?? '') && !/keine?s?\b|nichts|gar nicht|null/i.test(skill.plan.answers?.[i] ?? ''));
  const pl = skill.plan.placement;
  const placed = !!pl && pl.progress.filter((x) => x.solved).length >= 3;
  const known = skill.stages.some((st) => st.lessons.some((l) => l.known));
  return said || placed || known ? 'fast' : 'normal';
}

/** Skill lessons explain in structured, memorable bites (Goldilocks length) with varied mini-checks. */
export const BITE_RULE = `ERKLÄRUNG IN HÄPPCHEN – fundiert, bildhaft und sofort erfassbar (keine Mini-Stichpunkte und keine endlose Textwand!). Feld "bites": 3–4 klar aufgebaute Häppchen (je etwa 65–110 Wörter, gesamt ~250–380 Wörter):
[{"title":"kurzer, themenspezifischer Titel","text":"Markdown, ~65–110 Wörter, ein klarer Gedanke","analogy":"(optional, 1–2 Sätze) anschauliches Alltagsbild („Stell dir vor …“)","takeaway":"(empfohlen, 1 knackiger Satz) der Merksatz zum Behalten","pitfall":"(optional, 1 Satz) typische Falle oder häufige Verwechslung","figure":0,"check":{…}}]
- Klarer 3–4-Schritte-Bogen:
  1. Häppchen 1 (Ankommen & Grundidee, OHNE "check"): wozu man das Thema braucht und der erste Kernbegriff verständlich erklärt + starkes "analogy" (Alltagsbild) + "takeaway".
  2. Häppchen 2 (So funktioniert es, MIT bildhafter Grafik "figure": 0): der Kernmechanismus Schritt für Schritt, jeder neue Begriff und jede Abkürzung sofort erklärt + "takeaway" – hier passt 1 kurzer aktiver "check" zum gerade Gelesenen.
  3. Häppchen 3 (Vertiefung, Abgrenzung oder typische Stolperfalle, gern mit 2. Grafik "figure": 1): Unterschiede, Regeln, Grenzen + "pitfall" (typische Falle) + "takeaway" – optional mit 2. kurzem "check".
  4. Optional Häppchen 4 (Kurz-Merksatz „Auf einen Blick“, OHNE "check"): nur wenn das Thema es braucht, 2–3 knackige Merkpunkte zum Behalten.
- Keine Doppelung: Was du in "analogy", "takeaway" oder "pitfall" schreibst, wiederholst du nicht nochmal wörtlich im "text" – so bleibt der Fließtext luftig und das Auge erfasst den Kern sofort.
- Höchstens 2 Häppchen pro Lektion bekommen einen "check" (NIE Häppchen 1!) – die anderen sind reine Erklärung (kein "check"). Erklären geht vor Abfragen.
- Mische die kurzen "check"-Formate – NICHT jedes Häppchen als Multiple Choice (höchstens 1× "choice" pro Lektion):
  • Wahr oder Irrtum: {"type":"tf","statement":"steile Behauptung oder typischer Irrtum","answer":false,"why":"ein Satz Auflösung"}
  • Mini-Lücke: {"type":"gap","prompt":"Merksatz mit ___ für das Schlüsselwort","answer":["Wort","Synonym"],"options":["Wort","Ablenker 1","Ablenker 2"],"why":"ein Satz"} – "options": das richtige Wort plus 2 plausible falsche, die Person tippt eines an – die Lücke muss EINDEUTIG sein (der Satz lässt nur diesen Begriff offen); "answer" enthält ALLE richtigen Varianten (Synonyme, Ein-/Mehrzahl, genauere Fachbegriffe, ß/ss).
  • Kurz überlegen & aufdecken: {"type":"reveal","q":"kurze Denkfrage zum Häppchen","answer":"knappe Antwort in 1–2 Sätzen","why":"optionaler Zusatz"}
  • Kurz schätzen (nur wenn die Größenordnung im Häppchen eingeordnet wurde): {"type":"estimate","q":"Schätzfrage","min":0,"max":100,"answer":37,"tolerance":5,"unit":"%","why":"ein Satz"}
  • Auswahl (höchstens 1×): {"type":"choice","q":"leichte Frage","options":["…","…","…"],"correct":1,"why":"ein Satz"}
- Mindestens ein Häppchen – am besten das mit dem Kernzusammenhang oder der Formel – zeigt eine bildhafte Studyflix-Grafik ("figure": Index in "figures"); sein Text bezieht sich direkt darauf („In der Grafik siehst du …“).
- Jeder Check prüft ausschließlich, was genau in DIESEM Häppchen erklärt wurde – kein Vorwissen, kein Raten.
- "intro" ist dann nur EIN Satz Zusammenfassung; "theory" lässt du weg.`;

const BITE_DOMAIN_HINT: Record<Domain, string> = {
  math: 'Bei Mathe passen als Häppchen-Checks besonders "gap" (Zahl oder Begriff), "reveal" und "estimate" (nur wenn die Größenordnung im Häppchen erklärt wurde).',
  java: 'Bei Programmieren passen als Häppchen-Checks besonders "gap" (Ausgabe/Codewort tippen), "tf" (Verhalten/Irrtum) und "reveal".',
  law: 'Bei Recht passen als Häppchen-Checks besonders "tf" („Stimmt das juristisch?“), "reveal" (kurze Fallfrage) und "gap" (Tatbestandsmerkmal).',
  language: 'Bei Sprachen passen als Häppchen-Checks besonders "gap" (Wort/Endung), "reveal" (Übersetzung) und "tf" (typischer Fehler / Falscher Freund).',
  music: 'Bei Musik passen als Häppchen-Checks besonders "reveal", "tf" und "gap" (Intervall/Notenname); Häppchen mit Notenblatt brauchen keinen Check.',
  general: 'Wähle die Häppchen-Checks passend zum Thema: bei Mythen/Regeln "tf", bei Begriffen und Abläufen "gap" oder "reveal" – kein blindes Zahlen-Raten.',
};

const OPENERS: Record<Domain, string[]> = {
  math: ['calc', 'order', 'label', 'cloze', 'sheet', 'estimate'],
  java: ['code', 'cloze', 'order', 'calc'],
  law: ['scenario', 'order', 'cloze', 'case', 'multi'],
  music: ['music', 'order', 'label', 'cloze'],
  language: ['cloze', 'scenario', 'order', 'roleplay', 'calc'],
  general: ['order', 'cloze', 'scenario', 'label', 'calc', 'case', 'roleplay', 'sheet'],
};

const TOPIC_FIT_HINT: Record<Domain, string> = {
  math: 'Mathe-Mix: verbinde Rechnen ("calc"), Rechenwege ordnen ("order"), Formeltabellen ("sheet"), Grafik beschriften ("label") und Schätzen ("estimate", nur wenn vorher eingeordnet).',
  java: 'Programmier-Mix: Schwerpunkt auf eigenem "code", ergänzt durch Code-Lücken ("cloze"), Programmablauf ordnen ("order") und Ausgabe vorhersagen ("calc").',
  law: 'Rechts-Mix: echte Fallarbeit ("case"), Entscheidungs-Szenarien ("scenario"), Prüfungsschemata ("order"), Tatbestands-Lücken ("cloze") und Beratungs-Rollenspiel ("roleplay") und einmal einen Begriff in eigenen Worten erklären ("explain") statt bloßer 2-Gruppen-Zuordnung.',
  music: 'Musik-Mix: Schwerpunkt auf interaktiven "music"-Aufgaben (Hören, Klavier, Rhythmus, Noten), ergänzt durch "order", "label" und "cloze".',
  language: 'Sprach-Mix: Lücken ("cloze"), kurze Gespräche ("roleplay"), Alltagsszenarien ("scenario"), Satzbau ordnen ("order") und kurze Übersetzungen ("calc").',
  general: 'Themen-Mix: wähle die Typen passend zum konkreten Thema – Zahlen/Wirtschaft/Tabellen → "sheet", "calc"; Abläufe/Praxis/Erste Hilfe/Kochen → "order", "scenario", "label"; Kommunikation/Psychologie/Verhandeln → "roleplay", "scenario", "case"; Naturwissenschaft/Technik/Geschichte → "label", "order", "cloze"; Theorie-Begriffe → einmal "explain" (in eigenen Worten erklären).',
};

/**
 * Chooses a lesson flow (`classic` or `sprint`) – always theory first, never a blind question before
 * the explanation. Pure – tested.
 */
export function lessonStyleOf(skill: Skill, stageIndex: number, lessonIndex: number, inStageIndex: number): LessonStyle {
  const pace = paceOf(skill);
  if (pace === 'gentle') return 'classic';
  if (skill.mini) return lessonIndex < 2 ? 'classic' : 'sprint';
  const all = skill.stages.flatMap((st) => st.lessons);
  const recent = all
    .slice(0, Math.max(0, lessonIndex))
    .map((l) => l.set?.style ?? (l.set ? 'classic' : undefined))
    .filter((x): x is LessonStyle => !!x)
    .slice(-2);
  const last = recent[recent.length - 1];
  if (lessonIndex === 0 || (inStageIndex === 0 && stageIndex > 0)) return 'classic';
  if (pace === 'fast') return last === 'sprint' ? 'classic' : 'sprint';
  if (inStageIndex >= 2 && last !== 'sprint' && !recent.includes('sprint')) return 'sprint';
  return 'classic';
}

export type LessonVariety = {
  style: LessonStyle;
  preferredOpeners: string[];
  overused: string[];
  avoidClassify: boolean;
  styleRule: string;
  taskRule: string;
};

/**
 * Plans task-type variety and lesson flow from the skill's domain, position, and the last 2 generated lessons.
 * Pure – tested in scripts/test-srs.mts.
 */
export function lessonVariety(skill: Skill, stageIndex: number, lessonIndex: number, inStageIndex: number): LessonVariety {
  const style = lessonStyleOf(skill, stageIndex, lessonIndex, inStageIndex);
  const all = skill.stages.flatMap((st) => st.lessons);
  const recentSets = all
    .slice(0, Math.max(0, lessonIndex))
    .map((l) => l.set)
    .filter((x): x is PracticeSet => !!x)
    .slice(-2);
  const recentOpeners = new Set<string>(recentSets.map((s) => taskList(s)[0]?.type).filter((x): x is NonNullable<typeof x> => !!x));
  const counts = new Map<string, number>();
  for (const s of recentSets) {
    for (const t of taskList(s)) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
  }
  // a topic without numbers: no spreadsheet or calculation as a recommended start
  const pool = skill.domain === 'general' && !numericTopic(skill) ? OPENERS.general.filter((t) => t !== 'sheet' && t !== 'calc') : OPENERS[skill.domain];
  const shift = (lessonIndex * 2) % pool.length;
  const rotated = [...pool.slice(shift), ...pool.slice(0, shift)];
  const fresh = rotated.filter((t) => !recentOpeners.has(t));
  const preferredOpeners = (fresh.length >= 2 ? fresh : rotated).slice(0, 3);
  const avoidClassify = (counts.get('classify') ?? 0) >= 1;
  const overused = [...counts.entries()]
    .filter(([t, n]) => n >= 2 && t !== 'code' && t !== 'music')
    .map(([t]) => t);

  const styleRule =
    style === 'sprint'
      ? skill.mini
        ? `LEKTIONS-STIL: "style": "sprint" (Praxis-Höhepunkt: gehaltvoller Überblick auf einen Blick → anspruchsvoll üben, kein Frage-Einstieg).
- Gib "style": "sprint" an (KEIN "hook").
- Feld "bites": genau 3 gehaltvolle, vollständige Theorie-Abschnitte OHNE "check" (je ~90–120 Wörter, mit 2 verschiedenen Studyflix-Grafiken), die das neue Thema tief genug erklären, eine typische Falle beleuchten und den Bogen zu Lektion 1–2 schlagen. Ein konkretes "example" rundet die Theorie ab.`
        : `LEKTIONS-STIL: "style": "sprint" (Kompakt-Theorie auf einen Blick → direkt üben, kein Frage-Einstieg).
- Gib "style": "sprint" an (KEIN "hook").
- Feld "bites": genau 3 klare, vollständige Theorie-Abschnitte OHNE "check" (je ~60–90 Wörter, mit mindestens einer Studyflix-Grafik), die JEDEN neuen Begriff und Zusammenhang der Lektion sauber erklären, bevor die Aufgaben beginnen. Ein konkretes "example" rundet die Theorie ab.`
      : skill.mini
        ? `LEKTIONS-STIL: "style": "classic" (4 fundierte, bildhafte Theorie-Häppchen → anschauliches Beispiel → direkt anspruchsvolles Anwenden, immer erst Theorie). Gib "style": "classic" an (KEIN "hook").`
        : `LEKTIONS-STIL: "style": "classic" (3–4 gut merkbare Theorie-Häppchen → anschauliches Beispiel → gestuftes Üben, immer erst Theorie). Gib "style": "classic" an (KEIN "hook").`;

  const parts = [
    `ABWECHSLUNG BEI DEN AUFGABEN (${skill.domain}):`,
    `- ${TOPIC_FIT_HINT[skill.domain]}`,
    `- Starte Aufgabe 1 NICHT mit "classify"${skill.mini ? ', NICHT mit einer bloßen Wissens-Auswahl ("choice")' : ''} und NICHT mit einer blinden Schätzfrage ("estimate"). Gute Einstiegs-Typen für Aufgabe 1 diesmal: ${preferredOpeners.map((t) => `"${t}"`).join(', ')} – wähle den, der inhaltlich am besten zum Erklärten passt.`,
    avoidClassify
      ? `- "classify" kam gerade erst vor: lass "classify" in dieser Lektion ganz weg.`
      : `- Wenn du "classify" überhaupt nutzt, dann erst später in der Lektion und mit 3–4 Kategorien statt nur 2.`,
  ];
  if (overused.length) {
    parts.push(`- Zuletzt schon häufig dran: ${overused.map((t) => `"${t}"`).join(', ')} – setze diesmal bevorzugt andere Typen aus der Liste ein.`);
  }
  return { style, preferredOpeners, overused, avoidClassify, styleRule, taskRule: parts.join('\n') };
}

/** Richer theory input + stronger task start (level 2 → 3 instead of trivial warm-up) for mini skills. */
function miniLessonRule(style: LessonStyle): string {
  if (style === 'sprint') {
    return `${MINI_RULE}
MINI-SKILL-THEORIE (Lektion 3 – Höhepunkt):
- Genau 3 gehaltvolle Theorie-Abschnitte OHNE "check" (je ~90–120 Wörter, gesamt ~300–360 Wörter) mit 2 verschiedenen Studyflix-Grafiken ("figures") – erkläre Mechanismus, eine typische Falle („Viele denken X – tatsächlich gilt Y, weil …“) und verknüpfe mit den vorherigen Lektionen.
MINI-SKILL-AUFGABEN (anspruchsvoll statt Aufwärmen):
- Keine triviale level-1-Wiedererkennungsfrage! Starte direkt auf "level": 2 und steigere auf "level": 3 (Bogen: 2 → 3 → 3 → 3): praxisnahe Transfer- und Kombinationsaufgaben, die das Gelernte aus allen Lektionen verbinden.`;
  }
  return `${MINI_RULE}
MINI-SKILL-THEORIE (mehr Substanz vor dem Üben):
- Genau 4 tiefere, gut merkbare Erklär-Häppchen (je ~90–130 Wörter, gesamt ~380–500 Wörter) mit 2 verschiedenen Studyflix-Grafiken ("figures") und höchstens 1 kurzen Check (erst in Häppchen 2 oder 3, damit der Lesefluss bleibt):
  1. Alltagsbild & Grundidee (ohne Check): warum das Thema spannend ist, wozu es dient und der Kernbegriff klar erklärt.
  2. Kernmechanismus im Detail (mit Grafik "figure": 0): wie es wirklich funktioniert, Ursachen und Zusammenhänge statt nur Oberfläche.
  3. Zusammenhänge, Ausnahmen & typische Falle (mit Grafik "figure": 1): ausdrücklich eine typische Fehlannahme oder ein überraschender Grenzfall („Viele denken X – tatsächlich passiert aber Y, weil …“).
  4. Praxis-Regel / „So wendest du es an“ (ohne Check): kompakte Denk- oder Entscheidungsregel direkt vor dem Beispiel.
- Das "example" zeigt eine realistische Anwendung mit kurzer „warum“-Begründung je Schritt.
MINI-SKILL-AUFGABEN (direkt anspruchsvoller starten):
- Keine triviale level-1-Aufwärmfrage („Welcher Begriff stand im Text?“)! Da die Theorie ausführlich war, starte direkt mit echter Anwendung (Bogen: "level": 2 → 2 → 3 → 3):
  • Aufgabe 1 ("level": 2): direkte Anwendung des Erklärten auf einen neuen konkreten Mini-Fall.
  • Aufgabe 2 ("level": 2): Verknüpfung, Ursache-Wirkung oder die typische Falle aus Häppchen 3.
  • Aufgabe 3 ("level": 3): Transfer auf eine ungewohnte Situation oder knifflige Abwägung.
  • Aufgabe 4 ("level": 3): kleiner Höhepunkt / Synthese (z. B. "explain" in eigenen Worten, realistischer Fall, "scenario" oder "roleplay").`;
}

export function lessonPrompt(skill: Skill, stage: Stage, lesson: Lesson, count = skill.mini ? 4 : 5): Prompt {
  const all = skill.stages.flatMap((st) => st.lessons);
  const i = all.findIndex((l) => l.id === lesson.id);
  const stageIndex = skill.stages.findIndex((st) => st.id === stage.id);
  const inStageIndex = Math.max(0, stage.lessons.findIndex((l) => l.id === lesson.id));
  const before = all.slice(0, Math.max(0, i)).map((l) => l.title);
  const variety = lessonVariety(skill, stageIndex, Math.max(0, i), inStageIndex);
  const taskArc = skill.mini
    ? 'starte nach der ausführlichen Theorie direkt mit echter Anwendung auf level 2 statt einer leichten Aufwärmfrage, danach weiter anwenden und Transfer auf level 3'
    : 'gestuft: Aufgabe 1 = sicherer Einstieg direkt zum Erklärten, danach anwenden, am Ende Transfer';
  return {
    system: `Du bist ein geduldiger Tutor. Du erstellst eine Lektion mit idealer Balance aus klarer Theorie und eigenem Tun: zuerst eine gut merkbare, bildhafte Erklärung (genug Substanz zum echten Verstehen, aber nie überladen), dann ein konkretes durchgespieltes Beispiel, dann ${count} Aufgaben, die man selbst löst (${taskArc}). ${kindRule(skill)}
${BITE_RULE}
${BITE_DOMAIN_HINT[skill.domain]}
${variety.styleRule}
${variety.taskRule}
${skill.mini ? miniLessonRule(variety.style) : paceOf(skill) === 'fast' ? FAST_RULE : paceOf(skill) === 'gentle' ? GENTLE_RULE + '\n' + beginnerRule(skill, stageIndex, i) : beginnerRule(skill, stageIndex, i)}
${FIGURE_RULE}
${presetPromptHint(skill.domain, `${skill.title} ${stage.name} ${lesson.title} ${lesson.goal}`)}
NUR ERKLÄRTES ABFRAGEN (streng!): Jede einzelne Aufgabe darf AUSSCHLIESSLICH Begriffe, Abkürzungen (z. B. IPv4, DNS, Fachkürzel), Zahlen, Regeln und Zusammenhänge abfragen, die vorher ausdrücklich in deinen "bites" oder im "example" erklärt wurden (oder nachweislich aus einer früheren Lektion bekannt sind). Keine Fakten- oder Schätzfragen zu Zahlen oder Begriffen, die nicht im Text standen – die Person soll Gelerntes anwenden, niemals blind raten!
REIHENFOLGE IM JSON: zuerst "kind", "topic", "style", "intro", "bites" (die vollständige Erklärung), "example", "figures" (und ggf. Fach-Visuals/"labs"), und ERST DANACH "problems" – schreibe die Aufgaben erst, wenn deine gesamte Erklärung feststeht, und prüfe bei jeder Aufgabe, ob wirklich jeder abgefragte Begriff vorher in "bites" erklärt wurde. Halte Texte knapp und klar.
${JSON_ONLY}`,
    user: `${context(skill)}\n\nSTUFE: ${stage.name} – ${stage.goal}\nLEKTION ${i + 1} von ${all.length}: ${lesson.title} – Ziel: ${lesson.goal}${before.length ? `\nVorher gelernt: ${before.slice(-8).join('; ')}` : ''}`,
    maxTokens: Math.min(16000, (skill.mini ? 9500 : 8500) + count * (skill.domain === 'java' || skill.domain === 'law' ? 900 : 700)),
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

export function reviewPrompt(skill: Skill, focus?: Lesson[], count?: number): Prompt {
  if (focus?.length)
    return {
      system: `Du erstellst ein Schwachstellen-Training: Aufgaben nur zu den Themen, bei denen die Person noch unsicher ist. Beginne mit einer etwas leichteren Aufgabe, steigere dann, und decke jedes Thema ab. ${kindRule(skill)}
Kein "example". ${count ?? 6} Aufgaben. ${JSON_ONLY}`,
      user: `${context(skill)}

UNSICHERE THEMEN: ${focus.map((l) => `${l.title} (${l.goal})`).join('; ')}`,
      maxTokens: 8000,
      json: true,
    };
  const done = skill.stages.flatMap((st) => st.lessons).filter(lessonDone);
  return {
    system: `Du erstellst eine gemischte Wiederholung: Aufgaben quer durch bereits gelernte Lektionen, damit nichts vergessen wird (verteiltes Üben). ${kindRule(skill)}
Kein "example". ${count ?? 8} Aufgaben. ${JSON_ONLY}`,
    user: `${context(skill)}\n\nGELERNTE LEKTIONEN: ${done.map((l) => `${l.title} (${l.goal})`).join('; ')}`,
    maxTokens: 9000,
    json: true,
  };
}

/** A set counts as mastered at 80 % solved (used for stage tests and star ratings). */
export const mastered = (set?: PracticeSet) => !!set && problemCount(set) > 0 && solvedCount(set) / problemCount(set) >= 0.8;
/** Every core task of the set has been worked through (solved or skipped with „Weiß nicht“). */
export const setFinished = (set?: PracticeSet) => !!set && problemCount(set) > 0 && settledCount(set) >= problemCount(set);
export const lessonDone = (l: Lesson) => !!l.known || mastered(l.set) || setFinished(l.set);
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
export const canReview = (skill: Skill) => skill.stages.flatMap((st) => st.lessons).filter((l) => !l.known && lessonDone(l)).length >= 2;
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
export const TOPIC_POOL = SKILL_IDEAS.map((x) => x.t);

/** Small skills for fun – learned in about 20 minutes, to broaden the horizon. */
export const MINI_POOL = MINI_IDEAS.map((x) => x.t);

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

/**
 * Block `page` of n topics from a fixed shuffled order (same seed = same order): each click on „Andere“
 * shows the next block, so topics only come back once all were shown. `prefer` topics come first
 * (each group shuffled on its own). Pure – tested.
 */
export function pageTopics(pool: readonly string[], n: number, seed: number, page: number, exclude: string[] = [], prefer: readonly string[] = []): string[] {
  const all = pickTopics(pool, pool.length, seed, exclude);
  const pref = new Set(prefer);
  const order = [...all.filter((t) => pref.has(t)), ...all.filter((t) => !pref.has(t))];
  if (order.length <= n) return order;
  const blocks = Math.ceil(order.length / n);
  const start = ((page % blocks) + blocks) % blocks * n;
  const out = order.slice(start, start + n);
  // the last block is filled up from the start
  return out.length < n ? [...out, ...order.slice(0, n - out.length)] : out;
}

/** Mini skills: engaging, curious, with real depth and aha moments – 3 lessons with 4 tasks. */
export const MINI_RULE = 'MINI-SKILL: Ein kompaktes Thema zum Horizont-Erweitern. Locker und neugierig machend, aber mit echter inhaltlicher Tiefe, Aha-Momenten und einem überraschenden Fakt. Kein Vorwissen nötig, nichts Trockenes, aber auch nichts Oberflächliches.';

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

export type NextStep =
  | { kind: 'lesson'; stage: Stage; lesson: Lesson }
  | { kind: 'review'; reason: string }
  | { kind: 'weak'; lesson: Lesson; reason: string }
  | { kind: 'project'; stage: Stage; reason: string };

/**
 * The smart „Weiter“: what is best now. A short mixed review after every two new lessons (at most once a day),
 * a weak spot (below 50 %) that was not trained for two days, otherwise the next new lesson. Pure – tested.
 */
export function nextStep(skill: Skill, now = Date.now()): NextStep | null {
  const DAY = 86_400_000;
  const all = skill.stages.flatMap((st) => st.lessons);
  const learned = all.filter((l) => !l.known && lessonDone(l));
  const fresh = learned.filter((l) => (l.doneAt ?? 0) > (skill.lastReviewAt ?? 0)).length;
  if (!skill.mini && learned.length >= 2 && fresh >= 2 && now - (skill.lastReviewAt ?? 0) > DAY) return { kind: 'review', reason: 'damit nichts vergessen wird' };
  const weak = competenceMap(skill)
    .flatMap((g) => g.rows)
    .filter((r) => r.state === 'weak' && r.share < 0.5 && lessonDone(r.lesson))
    .sort((a, b) => a.share - b.share)[0];
  if (weak && now - (skill.lastWeakAt ?? 0) > 2 * DAY) return { kind: 'weak', lesson: weak.lesson, reason: 'da bist du noch unsicher' };
  // a passed stage: apply it once in the mini project (suggested once, can be skipped)
  const proj = skill.mini ? undefined : skill.stages.find((st) => st.passed && !st.project?.done && !st.projectSkipped);
  if (proj) return { kind: 'project', stage: proj, reason: 'wende die Stufe einmal praktisch an' };
  const next = nextLesson(skill);
  return next ? { kind: 'lesson', ...next } : null;
}

/** Show „Wie geht's weiter?“ once the skill is done or most of it (80 % of the lessons). */
export const wantsNextIdeas = (skill: Skill) => skill.status === 'active' && (skillComplete(skill) || skillProgress(skill).share >= 0.8);
