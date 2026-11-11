// Checks the spaced-repetition intervals. Run: npm run test:srs
import { ankiToSrs, formatDelay, newSrs, schedule, type Rating, type Srs } from '../src/lib/srs';
import { capForExam, dailyPlan, examAt, toIcs } from '../src/lib/exams';
import { reminderDue } from '../src/lib/reminderRule';
import { newLeft, pickDue, planNewForCourse } from '../src/lib/newCards';
import { cleanExamText, gradeFor, mcPoints, mistakeCards, parseExam, relatedCardIds, tasksFor, timeLeft } from '../src/lib/mockExamCore';
import { shortNames } from '../src/lib/deckNames';
import { initialPomo, pause, remaining, start, tick, workedSoFar } from '../src/lib/pomodoroRule';

const MIN = 60_000;
const DAY = 86_400_000;
let failures = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) failures++;
  console.log(cond ? '  ok  ' : '  FAIL', msg);
};
const after = (s: Srs, r: Rating, now: number) => schedule(s, r, now);
const delay = (s: Srs, r: Rating, now = 0) => after(s, r, now).due - now;

console.log('Neue Karte');
const n = newSrs(0);
ok(delay(n, 1) === 1 * MIN, `Nochmal → ${formatDelay(delay(n, 1))}`);
ok(delay(n, 2) === 6 * MIN, `Schwer → ${formatDelay(delay(n, 2))} (statt 1 Tag)`);
ok(delay(n, 3) === 10 * MIN, `Gut → ${formatDelay(delay(n, 3))}`);
ok(delay(n, 4) === 3 * DAY, `Einfach → ${formatDelay(delay(n, 4))}`);

console.log('Lernschritte');
let s = after(n, 3, 0); // 10 min step
ok(delay(s, 2) === 10 * MIN, `Schwer im 10-Min.-Schritt → ${formatDelay(delay(s, 2))}`);
s = after(s, 3, 0); // 1 h step
ok(delay(s, 3) === 1 * DAY, `Gut nach 1 Std. → ${formatDelay(delay(s, 3))} (Karte ist gelernt)`);
s = after(s, 3, 0);
ok(s.step === undefined && s.interval === 1, 'Karte ist jetzt in der Wiederholung');

console.log('Junge Wiederholungskarte (1 Tag)');
ok(delay(s, 2) === 0.5 * DAY, `Schwer → ${formatDelay(delay(s, 2))}`);
ok(delay(s, 3) > delay(s, 2), `Gut → ${formatDelay(delay(s, 3))}`);
ok(delay(s, 4) > delay(s, 3), `Einfach → ${formatDelay(delay(s, 4))}`);
ok(delay(s, 1) === 10 * MIN, `Nochmal → ${formatDelay(delay(s, 1))} (neu lernen)`);

console.log('Ältere Karte (20 Tage)');
const old: Srs = { ease: 2.5, interval: 20, reps: 5, lapses: 0, due: 0, last: 0 };
ok(delay(old, 2) === 24 * DAY, `Schwer → ${formatDelay(delay(old, 2))}`);
ok(delay(old, 3) === 50 * DAY, `Gut → ${formatDelay(delay(old, 3))}`);
const lapsed = after(old, 1, 0);
ok(lapsed.step === 0 && lapsed.lapses === 1, 'Nochmal → Neu-Lernen');
const back = after(after(lapsed, 3, 0), 3, 0);
ok(back.step === undefined && back.interval === 6, `nach dem Neu-Lernen → ${back.interval} Tage`);

console.log('Alte gespeicherte Karte (vor dem Update, "Nochmal" gedrückt)');
const legacy: Srs = { ease: 2.3, interval: 0, reps: 0, lapses: 1, due: 0, last: 0 };
ok(delay(legacy, 2) === 6 * MIN, `Schwer → ${formatDelay(delay(legacy, 2))}`);

console.log('Prüfungsmodus');
{
  const now = new Date(2026, 10, 10, 12).getTime();
  const exam = { id: 'e1', title: 'Statistik', date: '2026-11-15', deckIds: ['d1'], createdAt: 0 };
  const at = examAt(exam);
  ok(new Date(at).getHours() === 9, 'Prüfung ohne Uhrzeit = 9:00');
  const card: Srs = { ease: 2.5, interval: 20, reps: 5, lapses: 0, due: 0, last: 0 };
  const next = capForExam(schedule(card, 3, now), at, now);
  ok(next.due <= at - DAY && next.interval === 50, `20-Tage-Karte, Prüfung in 5 Tagen → fällig ${new Date(next.due).toLocaleDateString('de-DE')} (Intervall bleibt ${next.interval} T.)`);
  const soon = capForExam(schedule(newSrs(now), 1, now), at, now);
  ok(soon.due === now + 60_000, 'kurze Lernschritte bleiben unverändert');
  ok(capForExam(card, undefined, now) === card, 'ohne Prüfung keine Änderung');
  const cards = Array.from({ length: 50 }, (_, i) => ({ id: 'c' + i, front: '', back: '', createdAt: 0, srs: newSrs(now + DAY) }));
  const plan = dailyPlan({ decks: [{ id: 'd1', cards } as never], reviews: [] }, exam, now);
  ok(plan.target === 10, `Tagesplan: 50 offene Karten, 5 Tage → ${plan.target} pro Tag`);
  const ics = toIcs([exam], []);
  ok(/DTSTART;VALUE=DATE:20261115/.test(ics) && /SUMMARY:Prüfung: Statistik/.test(ics), 'Kalenderdatei (.ics) korrekt');
}

console.log('Anki-Lernstand');
{
  const crt = 1_700_000_000;
  const now = (crt + 100 * 86400) * 1000;
  const r = ankiToSrs({ kind: 2, due: 120, ivl: 30, factor: 2300, reps: 7, lapses: 1 }, crt, now);
  ok(r.interval === 30 && r.ease === 2.3 && r.due === (crt + 120 * 86400) * 1000 && r.step === undefined, 'Wiederholungskarte: Intervall, Leichtigkeit und Fälligkeit übernommen (in 20 Tagen)');
  const l = ankiToSrs({ kind: 3, due: 0, ivl: 12, factor: 2000, reps: 9, lapses: 2 }, crt, now);
  ok(l.step === 0 && l.lapseIvl === 12 && l.due === now, 'Karte im Neu-Lernen startet beim ersten Schritt');
}

console.log('Tägliche Erinnerung');
{
  const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m);
  ok(!reminderDue(at(17, 59), '18:00', null, 5), 'vor 18:00 keine Erinnerung');
  ok(reminderDue(at(18, 0), '18:00', null, 5), 'um 18:00 Erinnerung');
  ok(!reminderDue(at(20, 0), '18:00', '2026-11-11', 5), 'heute schon erinnert → keine zweite');
  ok(reminderDue(at(9, 0), '07:30', '2026-11-10', 5), 'neuer Tag → wieder erinnern');
  ok(!reminderDue(at(19, 0), '18:00', null, 0), 'nichts fällig → keine Erinnerung');
}

console.log('Pomodoro');
{
  const M = 60_000;
  let p = start(initialPomo(25), 0);
  ok(remaining(p, 10 * M) === 15 * M, '25-Min.-Phase: nach 10 Min. noch 15 Min.');
  p = pause(p, 10 * M);
  ok(remaining(p, 99 * M) === 15 * M, 'pausiert: Zeit bleibt stehen');
  p = start(p, 100 * M);
  ok(Math.round(workedSoFar(p, 105 * M, 25)) === 15, 'bisher 15 Min. gelernt');
  let r = tick(p, 115 * M, 25, 5);
  ok(r.ended === 'work' && r.studied === 25 && r.pomo.phase === 'break' && r.pomo.rounds === 1, 'Lernphase vorbei → 25 Min. gezählt, Pause startet');
  r = tick(r.pomo, 120 * M, 25, 5);
  ok(r.ended === 'break' && r.pomo.phase === 'work' && !r.pomo.running && r.studied === 0, 'Pause vorbei → neue Lernphase wartet auf Start');
}

console.log('Neue Karten pro Tag');
{
  const now = new Date(2026, 10, 11, 15).getTime();
  const fresh = Array.from({ length: 300 }, () => ({ srs: newSrs(now - DAY) }));
  const learnedDue = Array.from({ length: 30 }, () => ({ srs: { ease: 2.5, interval: 3, reps: 2, lapses: 0, due: now - 1000, last: now - 3 * DAY } as Srs }));
  const learnedLater = Array.from({ length: 40 }, () => ({ srs: { ease: 2.5, interval: 9, reps: 3, lapses: 0, due: now + 5 * DAY, last: now - 4 * DAY } as Srs }));
  const cards = [...learnedDue, ...fresh, ...learnedLater];
  const left = newLeft(cards, now, 20);
  const due = pickDue(cards, now, left);
  ok(left === 20 && due.length === 50, `300 neue + 30 fällige Karten → heute ${due.length} (30 Wiederholungen + 20 neue)`);
  const startedToday = cards.map((c, i) => (i >= 30 && i < 42 ? { srs: { ...c.srs, last: now - 1000, due: now + 600_000, introduced: now - 1000 } } : c));
  ok(newLeft(startedToday, now, 20) === 8, '12 neue heute schon angefangen → noch 8 neue');
  ok(newLeft(startedToday, now, 20, 10) === 18, '„10 weitere neue Karten“ → noch 18');
  ok(newLeft(startedToday, now + DAY, 20) === 20, 'am nächsten Tag wieder 20 neue');
}

console.log('Neue Karten pro Kurs');
{
  const now = new Date(2026, 10, 11, 15).getTime();
  const deck = (id: string, n: number, boost = 0) => ({ id, boost, cards: Array.from({ length: n }, () => ({ srs: newSrs(now - DAY) })) });
  const decks = [deck('d1', 33), deck('d2', 44), deck('d3', 14), deck('d4', 8)];
  const plan = planNewForCourse(decks, now, 20);
  const sum = [...plan.values()].reduce((a, b) => a + b, 0);
  ok(sum === 20 && plan.get('d1') === 20 && plan.get('d2') === 0, '11 Decks im Kurs teilen sich 20 neue (der Reihe nach)');
  const boosted = planNewForCourse([deck('d1', 33), deck('d2', 44, 10)], now, 20);
  ok(boosted.get('d2') === 10 && boosted.get('d1') === 20, '„10 neue Karten“ im Deck 2 → Deck 2 bekommt 10 zusätzlich, Deck 1 behält 20');
  const small = planNewForCourse([deck('d1', 5), deck('d2', 44)], now, 20);
  ok(small.get('d1') === 5 && small.get('d2') === 15, 'kleines Deck zuerst fertig, Rest geht ans nächste');
}

console.log('FSRS');
{
  const { setSchedulerOptions, schedule: sch } = await import('../src/lib/srs');
  const { fsrsInterval, retrievability, initState } = await import('../src/lib/fsrs');
  ok(Math.abs(fsrsInterval(10, 0.9) - 10) < 0.01 && Math.abs(retrievability(10, 10) - 0.9) < 0.001, 'Stabilität S = Tage bis 90 % Behalten');
  ok(initState(1).s < initState(3).s && initState(3).s < initState(4).s && initState(1).d > initState(4).d, 'Startwerte: Einfach stabiler und leichter als Nochmal');
  setSchedulerOptions({ fsrs: true, retention: 0.9 });
  const t = new Date(2026, 10, 11, 9).getTime();
  // new card: learning steps stay in minutes
  let c = sch(newSrs(t), 3, t);
  ok(c.step === 1 && c.due - t === 10 * 60_000 && !!c.mem, 'neue Karte: Lernschritte bleiben (10 Min.), Gedächtniswert wird angelegt');
  c = sch(c, 3, t + 10 * 60_000);
  c = sch(c, 3, t + 70 * 60_000);
  ok(c.step === undefined && c.interval >= 1, 'nach den Lernschritten: Abstand in Tagen aus FSRS (' + c.interval + ' T.)');
  const at = c.due;
  const hard = sch(c, 2, at), good = sch(c, 3, at), easy = sch(c, 4, at);
  ok(hard.interval < good.interval && good.interval < easy.interval, `Reihenfolge Schwer < Gut < Einfach (${hard.interval} / ${good.interval} / ${easy.interval} T.)`);
  ok(good.interval > c.interval, 'Gut verlängert den Abstand');
  const lapse = sch(good, 1, good.due);
  ok(lapse.step === 0 && (lapse.mem!.s < good.mem!.s) && lapse.lapseIvl! >= 1, 'vergessen: Neulernen in Minuten, Stabilität sinkt');
  // a classic card is taken over
  const old = { ease: 2.5, interval: 20, reps: 5, lapses: 0, due: t, last: t - 20 * DAY };
  const took = sch(old, 3, t);
  ok(took.interval > 20 && took.interval < 120, 'klassisch gelernte Karte wird übernommen (' + took.interval + ' T.)');
  setSchedulerOptions({ retention: 0.8 });
  const lower = sch(old, 3, t);
  ok(lower.interval > took.interval, 'niedrigere Behaltensquote → längere Abstände');
  setSchedulerOptions({ fsrs: false, retention: 0.9 });
  ok(!sch(old, 3, t).mem, 'ausgeschaltet: klassische Planung wie bisher');
}

console.log('Probeprüfung: Noten');
{
  ok(gradeFor(1, 'ch').grade === '6' && gradeFor(0.6, 'ch').grade === '4' && gradeFor(0.6, 'ch').passed, 'Schweiz: 100 % → 6, 60 % → 4 (genügend)');
  ok(gradeFor(0.85, 'ch').grade === '5.25' && !gradeFor(0.55, 'ch').passed, 'Schweiz: Viertelnoten, 55 % ungenügend');
  ok(gradeFor(0.5, 'de').grade === '4,0' && gradeFor(0.49, 'de').grade === '5,0' && gradeFor(0.97, 'de').grade === '1,0', 'Deutschland: 50 % → 4,0, darunter 5,0');
  ok(gradeFor(0.9, 'at').grade.startsWith('1') && gradeFor(0.4, 'at').grade.startsWith('5'), 'Österreich: 1 bis 5');
  const ex = parseExam({
    questions: [
      { type: 'mc', question: 'a', options: ['1', '2', '3', '4'], answer: 7, points: 2 },
      { type: 'weird', question: 'b', points: 0 },
      { type: 'open', question: 'c', points: 99 },
      { type: 'mc', question: 'kaputt' },
    ],
  } as never);
  ok(ex.questions.length === 3 && ex.questions[0].answer === 3 && ex.questions[1].type === 'short' && ex.questions[2].points === 20, 'Prüfung einlesen: fehlerhafte Aufgaben repariert oder aussortiert');
  ok(mcPoints(ex.questions[0], 3) === 2 && mcPoints(ex.questions[0], 1) === 0, 'Multiple Choice: alles oder nichts');
  const t0 = 1_000_000;
  ok(timeLeft({ minutes: 30, startedAt: t0 }, t0 + 10 * 60_000) === 20 * 60_000, 'Zeit läuft: nach 10 Min. bleiben 20');
  ok(timeLeft({ minutes: 30, startedAt: t0, pausedAt: t0 + 10 * 60_000 }, t0 + 25 * 60_000) === 20 * 60_000, 'Pause: Uhr steht still');
  ok(timeLeft({ minutes: 30, startedAt: t0, pausedMs: 15 * 60_000 }, t0 + 30 * 60_000) === 15 * 60_000, 'nach der Pause läuft die Zeit weiter, ohne die Pausenzeit');
  const graded = {
    questions: [
      { id: 'a', type: 'mc' as const, question: 'Was ist Agenda-Setting?', options: ['Themen setzen', 'Meinung'], answer: 0, points: 1, solution: '' },
      { id: 'b', type: 'open' as const, question: 'Erläutere Krisenkommunikation', points: 8, solution: 'Schnell, transparent, konsistent' },
      { id: 'c', type: 'short' as const, question: 'Definiere PR', points: 3, solution: 'Management von Kommunikation' },
    ],
    result: { perQuestion: { a: { points: 0, feedback: '' }, b: { points: 4, feedback: '' }, c: { points: 3, feedback: '' } } } as never,
  };
  const mc = mistakeCards(graded);
  ok(mc.length === 2 && mc[0].back.startsWith('Themen setzen') && mc[1].back.includes('transparent'), 'Fehlerkarten: nur Aufgaben mit Punktabzug, MC mit richtiger Antwort');
  const rel = relatedCardIds([{ question: 'Erläutere Krisenkommunikation transparent', solution: 'Krisenkommunikation transparent schnell' }], [
    { id: 'x', front: 'Was gilt in der Krisenkommunikation?', back: 'transparent informieren' },
    { id: 'y', front: 'Was ist Framing?', back: 'Deutungsrahmen' },
  ]);
  ok(rel.length === 1 && rel[0] === 'x', 'passende Karten zum Fehler werden gefunden');
  ok(cleanExamText('Lies den Fall.\n(a) Nenne zwei Ziele.\n(b) Erkläre sie.\n(c) Bewerte.') === 'Lies den Fall.\na) Nenne zwei Ziele.\nb) Erkläre sie.\nc) Bewerte.', 'Teilaufgaben (a) (b) (c) → a) b) c)');
  ok(cleanExamText('a) Nenne X.\nb) Erkläre Y.\n© Bewerte Z.') === 'a) Nenne X.\nb) Erkläre Y.\nc) Bewerte Z.', '© als Teilaufgabe → c)');
  ok(cleanExamText('© Nenne drei Merkmale.') === 'c) Nenne drei Merkmale.', '© am Zeilenanfang → c)');
  ok(cleanExamText('Teilaufgaben: (a) Ziel und (b) Weg sowie (c) Mittel') === 'Teilaufgaben: a) Ziel und b) Weg sowie c) Mittel', 'mehrere Kennungen im Fließtext');
  ok(cleanExamText('Wie in der Studie (z. B. Müller 2014) gezeigt') === 'Wie in der Studie (z. B. Müller 2014) gezeigt', 'normale Klammern bleiben');
  ok(cleanExamText('Copyright (c) 2024 Verlag') === 'Copyright (c) 2024 Verlag', 'einzelnes „(c)“ im Text bleibt');
  ok(cleanExamText('Deﬁniere den Begriff') === 'Definiere den Begriff', 'Ligatur ﬁ → fi');
  const cl = parseExam({ questions: [
    { type: 'mc', question: '© Was gilt?', options: ['(a) eins', 'zwei'], answer: 0, points: 1 },
    { type: 'short', question: 'x', points: 2 }, { type: 'short', question: 'y', points: 2 },
  ] } as never);
  ok(cl.questions[0].question === 'c) Was gilt?' && cl.questions[0].options![0] === 'a) eins', 'Prüfung einlesen säubert Aufgaben und Optionen');
  ok(tasksFor(60) === 13 && tasksFor(10) === 5, 'Aufgabenzahl passt zur Dauer');
}

console.log('Pip');
{
  const { pipReaction, pipGreeting, pipSummary } = await import('../src/lib/pipLines');
  const base = { rating: 3 as const, streak: 1, misses: 0, lapses: 0, done: 3, remaining: 20, total: 30 };
  ok(/erwischt|vergessen/.test(pipReaction({ ...base, lapses: 3 }) ?? ''), 'Karte nach 3× Vergessen endlich gewusst');
  ok(/5|Fünf/.test(pipReaction({ ...base, streak: 5 }) ?? ''), '5 richtig in Folge');
  ok(/durchatmen/.test(pipReaction({ ...base, rating: 1, streak: 0, misses: 3 }) ?? ''), '3 Fehler in Folge → aufmunternd');
  ok(/3|drei/.test(pipReaction({ ...base, remaining: 3 }) ?? ''), 'nur noch 3 Karten');
  ok(/Halbzeit|Hälfte/.test(pipReaction({ ...base, done: 15 }) ?? ''), 'Halbzeit');
  ok(pipReaction(base) === undefined, 'sonst still (kein Dauergequassel)');
  ok(/Nachteule/.test(pipGreeting(23, 40)) && /Früher Vogel/.test(pipGreeting(6, 10)), 'Begrüßung nach Tageszeit');
  ok(/Tagesrekord/.test(pipSummary({ done: 30, firstTry: 20, today: 120, bestDay: 100 })), 'neuer Tagesrekord');
  ok(/von 10/.test(pipSummary({ done: 10, firstTry: 6, today: 10, bestDay: 50 })), 'Zusammenfassung: auf Anhieb gewusst');
}

console.log('Wochenrückblick');
{
  const { weekReview, withSnapshot, reviewWeekKey } = await import('../src/lib/weekly');
  const now = new Date(2026, 10, 15, 18).getTime(); // a Sunday
  const card = (lvl: number) => ({ id: String(Math.random()), front: '', back: '', createdAt: 0, srs: { ease: 2.5, interval: lvl, reps: 3, lapses: 0, due: now + DAY, last: now - DAY } });
  const decks = [{ id: 'd1', name: 'Ethik', cards: [card(30), card(30), card(1)] }] as never;
  const reviews = [
    ...Array.from({ length: 12 }, (_, i) => ({ deckId: 'd1', cardId: 'c', at: now - (i % 3) * DAY, rating: (i % 4 ? 3 : 1) as Rating })),
    ...Array.from({ length: 5 }, () => ({ deckId: 'd1', cardId: 'c', at: now - 9 * DAY, rating: 3 as Rating })),
  ];
  const snaps = withSnapshot({ '2026-10-01': { d1: 1 } }, '2026-11-09', { d1: 20 }, now);
  ok(!snaps['2026-10-01'] && snaps['2026-11-09'].d1 === 20, 'Tagesstände: alte werden aufgeräumt');
  const w = weekReview({ decks, reviews, game: { xpByDay: {}, dailyGoal: 50, minutesByDay: { '2026-11-14': 25 }, masterySnaps: snaps } }, now);
  ok(w.reviews === 12 && w.prevReviews === 5 && w.activeDays === 3 && w.minutes === 25, 'Woche: Karten, Vorwoche, Lerntage, Minuten');
  ok(w.correct === 75, 'Woche: 75 % gewusst');
  ok(w.decks.length === 1 && w.decks[0].from === 20 && w.decks[0].to > 20, 'Woche: Fortschritt pro Deck');
  ok(reviewWeekKey(now) === '2026-11-15' && reviewWeekKey(now + DAY) === '2026-11-15' && reviewWeekKey(now + 2 * DAY) === null, 'erscheint Sonntag und Montag');
}

console.log('Teilen');
{
  const { buildShare, parseShare, compareResult } = await import('../src/lib/share');
  const deck = {
    id: 'd', courseId: 'c', name: 'Ethik', slug: 'ethik', createdAt: 0, source: 'Text', chat: [],
    cards: [{ id: 'k', front: 'F', back: 'A', createdAt: 0, srs: { ease: 2.5, interval: 30, reps: 9, lapses: 1, due: 0, last: 1 } }],
    mockExam: { id: 'm', createdAt: 0, status: 'graded', level: 'bachelor', detail: '', minutes: 30, scope: 'deck', scale: 'ch', title: 'P', instructions: '', answers: { q: 1 },
      questions: [{ id: 'q', type: 'mc', question: '?', options: ['a', 'b'], answer: 1, points: 1, solution: '' }],
      result: { grade: '5.5', percent: 90, passed: true } },
  } as never;
  const pack = buildShare(deck, 'Anna', { exam: true, result: true });
  const text = JSON.stringify(pack);
  ok(!text.includes('"srs"') && !text.includes('"answers"'), 'Datei enthält keinen Lernfortschritt und keine eigenen Antworten');
  const back = parseShare(text);
  ok(back.from === 'Anna' && back.deck.cards.length === 1 && back.exam?.questions.length === 1 && back.result?.percent === 90, 'Datei wird wieder eingelesen');
  ok(!buildShare(deck, 'Anna', { exam: true, result: false }).result, 'Note nur, wenn gewünscht');
  let bad = '';
  try { parseShare('{"hello":1}'); } catch (e) { bad = (e as Error).message; }
  ok(/keine Merkora-Datei/.test(bad), 'fremde Datei wird abgelehnt');
  ok(compareResult(80, 70) === 'better' && compareResult(60, 70) === 'worse' && compareResult(70, 70) === 'same', 'Vergleich mit Freunden');
}

console.log('Anki-Rückseite ohne wiederholte Vorderseite');
{
  const { answerOnly } = await import('../src/lib/backSide');
  const front = '<div class="q">Was ist <b>Wissen</b> (North et al. 2013)?</div>';
  ok(answerOnly(front, front + '<hr id=answer><div>Die Gesamtheit der Kenntnisse</div>') === '<div>Die Gesamtheit der Kenntnisse</div>', 'Anki-Trennlinie <hr id=answer>');
  ok(answerOnly(front, front + '<hr class="dash"><div>Antwort</div>') === '<div>Antwort</div>', 'wiederholte Vorderseite + Linie entfernt');
  const realF = '<div class="wrap"><div class="tag">Einleitung</div><div class="q">Was ist <b>Wissen</b> (North et al. 2013)?</div></div>';
  const realB = '<div class="wrap"><div class="tag">Einleitung</div><div class="q">Was ist <b>Wissen</b> (North et al. 2013)?</div><hr id="answer"><div class="a">Die Gesamtheit</div><div class="src">Folie 16</div></div>';
  ok(answerOnly(realF, realB) === '<div class="wrap"><div class="a">Die Gesamtheit</div><div class="src">Folie 16</div></div>', 'Frage in der Vorlage wiederholt: nur Antwort, Rahmen bleibt');
  ok(answerOnly(front, '<div>Nur Antwort</div>') === '<div>Nur Antwort</div>', 'Rückseite ohne Vorderseite bleibt');
  ok(answerOnly('kurz', 'kurz und mehr') === 'kurz und mehr', 'sehr kurze Vorderseite wird nicht herausgeschnitten');
  ok(answerOnly(front, front) === front, 'nichts übrig → ganze Rückseite zeigen');
}

console.log('Kurze Decknamen');
{
  const decks = ['01 Grundbegriffe', '02 Geschichte', '03 Ethik'].map((n, i) => ({ id: 'd' + i, name: 'PR-Forschung HS26 › ' + n }));
  const m = shortNames(decks);
  ok(m.get('d0') === '01 Grundbegriffe' && m.get('d2') === '03 Ethik', 'gemeinsamer Anki-Vorsatz wird weggelassen');
  const mixed = shortNames([{ id: 'a', name: 'Biologie' }, { id: 'b', name: 'Bio-Chemie' }]);
  ok(mixed.get('a') === 'Biologie' && mixed.get('b') === 'Bio-Chemie', 'kein Abschneiden mitten im Wort');
  ok(shortNames([{ id: 'x', name: 'A › B' }]).get('x') === 'A › B', 'einzelnes Deck bleibt unverändert');
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle SRS-Tests bestanden');
process.exit(failures ? 1 : 0);
