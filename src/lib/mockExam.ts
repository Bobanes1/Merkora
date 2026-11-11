/**
 * Mock exam ("Probeprüfung"): the AI writes a realistic exam for the learner's education level,
 * the learner writes it under time pressure, then the AI grades the written answers like an examiner.
 * Multiple choice is scored right here (no AI cost). Grades follow the chosen grading scale.
 */
import { completeJson, LANG_RULE, materialFrom } from './ai';
import { addCards, getState, setSettings, updateDeck, type Deck, type MockExam, type MockQuestion, type MockResult } from './store';
import { uid } from './util';
import { cleanExamText, levelLabel, gradeFor, mcPoints, mistakeCards, parseExam, relatedCardIds, tasksFor, type GradeScale, type RawExam } from './mockExamCore';
export * from './mockExamCore';

const LEVEL_STYLE: Record<string, string> = {
  sek1: 'einfache, klar formulierte Aufgaben; vor allem Wissen und Verständnis, wenige kurze Anwendungsaufgaben.',
  gym: 'Wissen, Verständnis und Anwendung; einige Aufgaben verlangen Begründungen oder Vergleiche (Operatoren wie „erläutere“, „vergleiche“, „beurteile“).',
  beruf: 'praxisnahe Aufgaben aus dem Berufsalltag, Fallbeispiele, Fachbegriffe korrekt anwenden.',
  hf: 'anwendungsorientiert: Fallstudien, Transfer auf Praxissituationen, Begründung von Entscheidungen.',
  bachelor: 'universitäres Niveau: Definitionen präzise, Theorien erklären und voneinander abgrenzen, Anwendung auf Beispiele, eine Transfer- oder Essayaufgabe.',
  master: 'anspruchsvoll: kritische Diskussion, Verknüpfung mehrerer Konzepte, Bewertung von Ansätzen, wissenschaftliche Argumentation.',
  weiter: 'praxisorientierte Prüfungsfragen wie in Zertifikatsprüfungen, Fallbeispiele.',
};

export function examPrompt(material: string, o: { level: string; detail: string; minutes: number; count: number }) {
  const system = `Du bist erfahrene Prüfungsautorin bzw. erfahrener Prüfungsautor und erstellst eine realistische Probeprüfung. ${LANG_RULE}
Niveau: ${levelLabel(o.level)}${o.detail ? ` (${o.detail})` : ''}. Stil: ${LEVEL_STYLE[o.level] ?? LEVEL_STYLE.bachelor}
Die Prüfung soll sich wie eine echte schriftliche Prüfung anfühlen: sachlicher Prüfungston, steigender Schwierigkeitsgrad, Punkte passend zum Aufwand (insgesamt etwa ${o.minutes} Punkte für ${o.minutes} Minuten).
Aufgabentypen gemischt: "mc" (Multiple Choice, genau 4 Optionen, genau eine richtig, "answer" = Index 0–3, 1–2 Punkte), "short" (Kurzantwort, 1–3 Sätze, 2–4 Punkte), "open" (ausführliche Antwort, Anwendung/Transfer/Fallbeispiel, 5–12 Punkte). Etwa 35 % mc, 35 % short, 30 % open.
Prüfe nur Inhalte aus dem Material. Keine Aufgabe darf die Lösung einer anderen verraten.
"solution" ist die Musterlösung, "criteria" listet stichwortartig, wofür es wie viele Punkte gibt (bei mc leer).
Schreibweise: Teilaufgaben als „a)“, „b)“, „c)“ – nur mit schließender Klammer, jede auf einer eigenen Zeile. Nur normaler Text: keine Sonderzeichen wie ©, ® oder ™, kein Markdown.
Format: {"title":"...","instructions":"kurze Hinweise wie auf einem Prüfungsblatt","questions":[{"type":"mc|short|open","question":"...","options":["..."],"answer":0,"points":2,"solution":"...","criteria":"..."}]}`;
  return {
    system,
    user: `Erstelle genau ${o.count} Aufgaben für eine Prüfung von ${o.minutes} Minuten.\n\n${material}`,
    maxTokens: Math.min(16000, 800 + o.count * 500),
  };
}

const patchExam = (deckId: string, patch: Partial<MockExam>) =>
  updateDeck(deckId, (d) => (d.mockExam ? { mockExam: { ...d.mockExam, ...patch } } : {}));

/** Material for the exam: this deck, or all decks of its course. */
function examMaterial(deck: Deck, scope: 'deck' | 'course') {
  if (scope === 'deck') return materialFrom(deck.source, deck.cards);
  const decks = getState().data.decks.filter((d) => d.courseId === deck.courseId);
  const per = Math.max(3000, Math.floor(40000 / Math.max(1, decks.length)));
  return decks.map((d) => `## ${d.name}\n${materialFrom(d.source, d.cards, per)}`).join('\n\n');
}

export async function createMockExam(
  deck: Deck,
  o: { level: string; detail: string; minutes: number; scope: 'deck' | 'course'; scale: GradeScale },
) {
  setSettings({ eduLevel: o.level, eduDetail: o.detail, gradeScale: o.scale });
  const count = tasksFor(o.minutes);
  updateDeck(deck.id, {
    mockExam: {
      id: uid(),
      createdAt: Date.now(),
      status: 'generating',
      level: o.level,
      detail: o.detail,
      minutes: o.minutes,
      scope: o.scope,
      scale: o.scale,
      title: '',
      instructions: '',
      questions: [],
      answers: {},
    },
  });
  try {
    const p = examPrompt(examMaterial(deck, o.scope), { ...o, count });
    const exam = parseExam(await completeJson<RawExam>(p.system, p.user, p.maxTokens));
    patchExam(deck.id, { ...exam, status: 'ready', error: undefined });
  } catch (e) {
    patchExam(deck.id, { status: 'error', error: (e as Error).message || 'Unbekannter Fehler' });
  }
}

export const startMockExam = (deckId: string) =>
  patchExam(deckId, { status: 'running', startedAt: Date.now(), pausedAt: undefined, pausedMs: 0, pauses: 0, answers: {}, result: undefined });
export const pauseMockExam = (deckId: string) =>
  updateDeck(deckId, (d) =>
    d.mockExam && !d.mockExam.pausedAt ? { mockExam: { ...d.mockExam, pausedAt: Date.now(), pauses: (d.mockExam.pauses ?? 0) + 1 } } : {},
  );
export const resumeMockExam = (deckId: string) =>
  updateDeck(deckId, (d) =>
    d.mockExam?.pausedAt
      ? { mockExam: { ...d.mockExam, pausedMs: (d.mockExam.pausedMs ?? 0) + (Date.now() - d.mockExam.pausedAt), pausedAt: undefined } }
      : {},
  );
export const setMockAnswer = (deckId: string, qid: string, value: string | number) =>
  updateDeck(deckId, (d) => (d.mockExam ? { mockExam: { ...d.mockExam, answers: { ...d.mockExam.answers, [qid]: value } } } : {}));
export const discardMockExam = (deckId: string) => updateDeck(deckId, { mockExam: undefined });

/** Submit: MC is scored here, written answers are graded by the AI like an examiner. */
export async function gradeMockExam(deckId: string) {
  const deck = getState().data.decks.find((d) => d.id === deckId);
  const ex = deck?.mockExam;
  if (!ex) return;
  patchExam(deckId, { status: 'grading', submittedAt: ex.submittedAt ?? Date.now(), error: undefined });
  try {
    const written = ex.questions.filter((q) => q.type !== 'mc');
    const per: MockResult['perQuestion'] = {};
    for (const q of ex.questions.filter((x) => x.type === 'mc')) {
      const a = ex.answers[q.id];
      per[q.id] = {
        points: mcPoints(q, a),
        feedback: a === undefined ? 'Nicht beantwortet.' : a === q.answer ? 'Richtig.' : `Falsch – richtig ist ${'ABCD'[q.answer!] ?? ''}: ${q.options![q.answer!]}.`,
      };
    }
    const mcGot = Object.values(per).reduce((n, r) => n + r.points, 0);
    const mcMax = ex.questions.filter((q) => q.type === 'mc').reduce((n, q) => n + q.points, 0);
    type Graded = { questions?: { id: string; points: number; feedback: string }[]; summary?: string; strengths?: string[]; improve?: string[] };
    const tasks = written
      .map(
        (q, i) =>
          `### Aufgabe ${i + 1} (id: ${q.id}, max. ${q.points} Punkte)\nFrage: ${q.question}\nMusterlösung: ${q.solution}\nBewertungskriterien: ${q.criteria || '–'}\nAntwort: ${String(ex.answers[q.id] ?? '').trim() || '(keine Antwort)'}`,
      )
      .join('\n\n');
    const res = await completeJson<Graded>(
      `Du korrigierst eine schriftliche Prüfung wie eine faire, aber genaue Prüferin bzw. ein fairer, aber genauer Prüfer. ${LANG_RULE}
Niveau: ${levelLabel(ex.level)}${ex.detail ? ` (${ex.detail})` : ''}. Bewerte so streng, wie es auf diesem Niveau in einer echten Prüfung üblich ist.
Vergib je Aufgabe Punkte von 0 bis zur Höchstpunktzahl (halbe Punkte erlaubt) anhand von Musterlösung und Kriterien. Inhaltlich richtige Antworten mit anderen Worten zählen voll. Leere Antworten = 0 Punkte.
"feedback" (1–3 Sätze): was gut war und was für volle Punkte fehlt. "summary": 2–4 Sätze Gesamteindruck, an den Lernenden gerichtet (du). "strengths" und "improve": je 2–4 kurze Punkte; "improve" nennt konkrete Themen zum Wiederholen.
Format: {"questions":[{"id":"...","points":3,"feedback":"..."}],"summary":"...","strengths":["..."],"improve":["..."]}`,
      `Multiple-Choice-Teil: ${mcGot} von ${mcMax} Punkten.\n\n${tasks || '(keine schriftlichen Aufgaben)'}`,
      Math.min(8000, 1200 + written.length * 300),
    );
    for (const q of written) {
      const g = res.questions?.find((x) => x.id === q.id);
      const pts = Math.round(Math.max(0, Math.min(q.points, Number(g?.points) || 0)) * 2) / 2;
      per[q.id] = { points: String(ex.answers[q.id] ?? '').trim() ? pts : 0, feedback: cleanExamText(g?.feedback ?? '') || 'Keine Rückmeldung erhalten.' };
    }
    const total = Object.values(per).reduce((n, r) => n + r.points, 0);
    const max = ex.questions.reduce((n, q) => n + q.points, 0);
    const { grade, passed } = gradeFor(max ? total / max : 0, ex.scale);
    const result: MockResult = {
      perQuestion: per,
      total,
      max,
      percent: max ? Math.round((total / max) * 100) : 0,
      grade,
      passed,
      summary: cleanExamText(res.summary ?? ''),
      strengths: (res.strengths ?? []).map((x) => cleanExamText(String(x))).filter(Boolean).slice(0, 5),
      improve: (res.improve ?? []).map((x) => cleanExamText(String(x))).filter(Boolean).slice(0, 5),
    };
    updateDeck(deckId, (d) => ({
      mockExam: d.mockExam ? { ...d.mockExam, status: 'graded', result } : d.mockExam,
      mockHistory: [
        ...(d.mockHistory ?? []),
        { at: Date.now(), title: ex.title, level: ex.level, percent: result.percent, grade, passed, scale: ex.scale },
      ].slice(-20),
    }));
  } catch (e) {
    patchExam(deckId, { status: 'submitted', error: (e as Error).message || 'Unbekannter Fehler' });
  }
}

/**
 * Learn from the mistakes: every task with lost points becomes a card that is due right away
 * (outside the daily limit of new cards), and existing cards on the same topics are moved to today.
 */
export function learnFromMistakes(deckId: string): { added: number; moved: number } {
  const deck = getState().data.decks.find((d) => d.id === deckId);
  const ex = deck?.mockExam;
  if (!deck || !ex?.result || ex.mistakesLearned) return { added: 0, moved: 0 };
  const now = Date.now();
  const fresh = mistakeCards(ex);
  const missed = ex.questions.filter((q) => (ex.result!.perQuestion[q.id]?.points ?? 0) < q.points);
  const related = new Set(relatedCardIds(missed, deck.cards));
  addCards(
    deckId,
    fresh.map((c) => ({
      ...c,
      tags: ['Probeprüfung'],
      // like a forgotten card: due now, relearned in short steps, not counted as a new card
      srs: { ease: 2.3, interval: 0, reps: 0, lapses: 0, due: now, last: now, step: 0, introduced: now },
    })),
  );
  updateDeck(deckId, (d) => ({
    cards: d.cards.map((c) => (related.has(c.id) && c.srs.last !== undefined && c.srs.due > now ? { ...c, srs: { ...c.srs, due: now } } : c)),
    mockExam: d.mockExam ? { ...d.mockExam, mistakesLearned: true } : d.mockExam,
  }));
  return { added: fresh.length, moved: [...related].filter((id) => deck.cards.find((c) => c.id === id && c.srs.last !== undefined && c.srs.due > now)).length };
}
