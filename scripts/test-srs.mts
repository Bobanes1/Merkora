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

console.log('Markierte Karten');
{
  const { fromAnkiTags, toAnkiTags } = await import('../src/lib/marks');
  const a = fromAnkiTags(['KoWi::S01', 'marked']);
  ok(a.marked && a.tags?.length === 1 && a.tags[0] === 'KoWi::S01', 'Anki-Tag „marked“ → Stern, Tag verschwindet');
  ok(!fromAnkiTags(['x']).marked && fromAnkiTags(['Marked']).tags === undefined, 'ohne „marked“ nicht markiert; Groß/klein egal');
  ok(toAnkiTags(['x'], true).join(' ') === 'x marked' && toAnkiTags(undefined, false).length === 0, 'Export: Stern → Anki-Tag „marked“');
}

console.log('Kartenanzahl: die KI entscheidet');
{
  const { autoCardInstruction, cardRange } = await import('../src/lib/cardCount');
  const t = autoCardInstruction(undefined, 'thorough');
  ok(t.includes('"topics"') && t.includes('JEDEM Thema mindestens eine Karte') && t.includes('höchstens 40') && autoCardInstruction(8000, 'thorough').includes('höchstens 6 '), 'Anweisung: erst Themen wie bei einer Zusammenfassung, dann je Thema eine Karte (Sicherheitsnetz je nach Länge)');
  ok(/Organisatorisches/.test(t) && /Qualität vor Menge/.test(t) && /Zusammengehörendes/.test(t), 'Anweisung: hochwertige Karten, Verwandtes zusammenfassen');
  const s = cardRange(4000), l = cardRange(40000);
  ok(s.low < s.high && l.low < l.high && l.high > s.high, 'Spanne für die Kostenanzeige wächst mit dem Material');
}

console.log('Kostenschätzung');
{
  const { tokensOf, estimate, priceFor, costOf, formatCost } = await import('../src/lib/costs');
  ok(tokensOf(3500) === 1000, '3.500 Zeichen ≈ 1.000 Tokens');
  const a = estimate.cards(10000, 10), b = estimate.cards(10000, 30), c = estimate.cards(30000, 30);
  ok(b.output > a.output && c.input > b.input, 'mehr Karten → mehr Ausgabe, mehr Material → mehr Eingabe');
  const auto = estimate.cards(30000, 0), fixed = estimate.cards(30000, 20);
  ok(auto.outputHigh! > auto.output && fixed.outputHigh === undefined, 'KI entscheidet → Kosten als Spanne, feste Anzahl → ein Wert');
  const haiku = priceFor('claude-haiku-5-5')!;
  ok(Math.abs(costOf({ input: 1_000_000, output: 0 }, haiku) - 0.1) < 1e-9, 'claude-haiku-5-5: 1 Mio. Eingabe = 0,10 $');
  ok(priceFor('openai/gpt-4o-mini')?.in === 0.15 && priceFor('nvidia/x:free')?.in === 0, 'OpenRouter-Namen und kostenlose Modelle');
  ok(priceFor('llama3.1') === null, 'unbekanntes Modell → Preis unbekannt');
  ok(priceFor('llama3.1', { custom: { in: 1, out: 2 } })?.source === 'custom', 'eigener Preis überschreibt');
  ok(priceFor('x/y', { live: { 'x/y': { in: 3, out: 4 } } })?.in === 3, 'aktuelle OpenRouter-Preise werden genutzt');
  ok(formatCost(0.004) === '0,0040 $' && formatCost(0.00037) === '0,00037 $' && formatCost(0.042) === '0,042 $' && formatCost(0.25) === '0,25 $' && formatCost(1.234) === '1,23 $' && formatCost(0) === 'kostenlos', 'Betrag genau, auch unter einem Cent');
}

console.log('Langes Material in Teilen');
{
  const { splitMaterial, shareCount, avoidList } = await import('../src/lib/chunks');
  const { estimate } = await import('../src/lib/costs');
  const para = (n: number) => Array.from({ length: n }, (_, i) => 'Absatz ' + i + ': ' + 'Wissen ist Macht. '.repeat(20)).join('\n\n');
  const small = splitMaterial([{ name: 'a.pdf', text: 'kurz' }, { name: 'b.pdf', text: 'auch kurz' }]);
  ok(small.length === 1 && small[0].label === 'a.pdf, b.pdf', 'kleine Dateien teilen sich einen Teil');
  const big = splitMaterial([{ name: 'Skript.pdf', text: para(300) }], 40000);
  ok(big.length >= 3 && big.every((x) => x.text.length <= 40000), 'großes Skript → mehrere Teile, keiner zu lang (' + big.length + ')');
  ok(big.every((x) => /^Absatz \d+:/.test(x.text)), 'geschnitten wird an Absatzgrenzen');
  ok(big.map((x) => x.text).join('').replace(/\s+/g, '') === para(300).replace(/\s+/g, ''), 'kein Text geht verloren');
  ok(big[0].label === 'Skript.pdf (Anfang)' && big[big.length - 1].label === 'Skript.pdf (Schluss)', 'Teile sind beschriftet');
  const three = splitMaterial([{ name: 'S1', text: para(120) }, { name: 'S2', text: para(120) }, { name: 'S3', text: para(120) }], 40000);
  const sizes = three.map((x) => x.text.length);
  ok(three.length === Math.ceil((3 * para(120).length) / 40000) && Math.max(...sizes) - Math.min(...sizes) < 6000, 'möglichst wenige, gleich große Teile (' + three.length + ': ' + sizes.map((n) => Math.round(n / 1000) + 'k').join(' / ') + ')');
  ok(three[0].label.startsWith('S1') && three[three.length - 1].label.includes('S3'), 'Dokumente bleiben in Reihenfolge');
  // like the real case: nine full parts and then only the literature list of the last slide
  const lit = 'LITERATUR UND QUELLEN\n' + '§ Autor, A. (2020). Titel. Verlag. https://doi.org/10.1/x\n'.repeat(20);
  const withRest = splitMaterial([{ name: 'VL.pptx', text: para(240) + '\n\n' + lit }], 40000);
  ok(!withRest.some((x) => x.text.length < 5000) && withRest[withRest.length - 1].text.includes('LITERATUR'), 'kleiner Rest am Ende (z. B. Literaturliste) wird kein eigener Teil');
  ok(withRest.every((x) => x.text.length <= 60000), 'auch mit angehängtem Rest höchstens 60k Zeichen pro Teil');
  const c = shareCount(30, [{ text: 'x'.repeat(1000) }, { text: 'x'.repeat(2000) }]);
  ok(c[0] === 10 && c[1] === 20 && shareCount(0, [{ text: 'a' }, { text: 'b' }]).every((n) => n === 0), 'feste Anzahl wird anteilig verteilt, Automatisch bleibt automatisch');
  const av = avoidList(Array.from({ length: 500 }, (_, i) => 'Frage Nummer ' + i + ' zum Thema'), 2000);
  ok(av.length < 500 && av[av.length - 1] === 'Frage Nummer 499 zum Thema', 'Liste bisheriger Fragen bleibt kurz (neueste zuletzt)');
  const one = estimate.cards(40000, 0), two = estimate.cardsParts([40000, 40000], [0, 0]);
  ok(two.input > 2 * one.input - 1 && two.output === 2 * one.output && two.outputHigh === 2 * one.outputHigh!, 'Kosten aller Teile werden zusammengezählt');
  const { formatCostRange } = await import('../src/lib/costs');
  ok(formatCostRange(0.1, 0.25) === '0,10–0,25 $' && formatCostRange(0.002, 0.004) === '0,0020–0,0040 $' && formatCostRange(0.0034, 0.0034) === '0,0034 $' && formatCostRange(0, 0.01) === 'bis 0,010 $', 'Kostenspanne genau');
}

console.log('Diagramme');
{
  const { parseDiagram, layoutDiagram, renderDiagram, PALETTES, diagramHtml, diagramsToSvg, DIAGRAM_RULE } = await import('../src/lib/diagram');
  const long = 'Ein ziemlich langer Begriff mit Erklärung zur Sache';
  const samples = [
    { type: 'flow', title: 'Forschungsprozess', steps: ['Forschungsfrage', 'Hypothesen', 'Operationalisierung', 'Datenerhebung', 'Auswertung', 'Bericht'] },
    { type: 'cycle', steps: Array.from({ length: 8 }, (_, i) => 'Schritt ' + (i + 1) + ' ' + long.slice(0, 20)) },
    { type: 'hierarchy', title: 'Methoden', root: 'Empirische Methoden', children: [{ label: 'Quantitativ', children: ['Befragung', 'Inhaltsanalyse', 'Experiment', 'Beobachtung'] }, { label: 'Qualitativ', children: ['Leitfadeninterview'] }, 'Mixed Methods', { label: long }] },
    { type: 'compare', columns: [{ title: 'Quantitativ', items: ['standardisiert', long, 'statistisch'] }, { title: 'Qualitativ', items: ['offen'] }, { title: 'Mixed', items: ['beides'] }] },
    { type: 'timeline', events: Array.from({ length: 8 }, (_, i) => ({ when: String(1900 + i * 15), label: long })) },
    { type: 'concept', title: 'Wissen', center: 'Wissen (North 2013)', branches: ['Daten', 'Informationen', 'Kenntnisse', 'Fähigkeiten', 'Problemlösung', long, 'Regeln', 'Erfahrung'] },
    { type: 'matrix', x: 'Reliabilität', y: 'Validität', cells: [long, 'hoch / hoch', long, 'gültig, aber unzuverlässig'] },
    { type: 'axes', x: 'Zeit', y: 'Behalten', shape: 'fallend', marks: [{ at: 0.2, label: 'Wiederholung' }, { at: 0.7, label: 'Prüfung' }] },
  ];
  const hit = (a: any, b: any) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  for (const raw of samples) {
    const d = parseDiagram(raw)!;
    const L = layoutDiagram(d);
    const real = L.boxes.filter((b) => b.lines.length);
    const outside = real.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > L.width + 0.5 || b.y + b.h > L.height + 0.5);
    let overlaps = 0;
    real.forEach((a, k) => real.slice(k + 1).forEach((b) => (overlaps += hit(a, b) ? 1 : 0)));
    const svg = renderDiagram(d);
    // the first label of the description must be drawn
    const first = { flow: () => (d as any).steps[0], cycle: () => (d as any).steps[0], hierarchy: () => (d as any).root, compare: () => (d as any).columns[0].title, timeline: () => (d as any).events[0].when, concept: () => (d as any).center, matrix: () => (d as any).x, axes: () => (d as any).y }[d.type]();
    const firstWord = String(first).split(' ')[0];
    ok(!!d && outside.length === 0 && overlaps === 0 && /^<svg/.test(svg) && svg.includes(firstWord), d.type + ': nichts überlappt oder ragt hinaus, Beschriftung „' + firstWord + '“ vorhanden');
  }
  // ---- new kinds: model, venn, pyramid, bars, decision
  const moderator = { type: 'model', title: 'Beispiel: Moderator', nodes: ['Freizeit', 'Nutzung von Streamingdiensten', 'Alter'], links: [{ from: 'Freizeit', to: 'Nutzung von Streamingdiensten', label: '+' }, { from: 'Alter', to: 'Freizeit -> Nutzung von Streamingdiensten', label: 'moderiert' }] };
  const mediator = { type: 'model', nodes: ['Bildung', 'Einkommen', 'Gesundheit'], links: [{ from: 'Bildung', to: 'Einkommen', label: 'a' }, { from: 'Einkommen', to: 'Gesundheit', label: 'b' }, { from: 'Bildung', to: 'Gesundheit', label: 'c (direkt)' }] };
  const comm = { type: 'model', title: 'Kommunikationsmodell', nodes: ['Sender', 'Botschaft', 'Kanal', 'Empfänger', 'Störung'], links: [{ from: 'Sender', to: 'Botschaft', label: 'codiert' }, { from: 'Botschaft', to: 'Kanal' }, { from: 'Kanal', to: 'Empfänger', label: 'decodiert' }, { from: 'Empfänger', to: 'Sender', label: 'Feedback', dashed: true }, { from: 'Störung', to: 'Kanal -> Empfänger' }] };
  const eight = { type: 'model', nodes: ['A1 Ursache', 'B2 Schritt', 'C3 Schritt', 'D4 Schritt', 'E5 Schritt', 'F6 Wirkung', 'G7 Moderator', 'H8 Begleitfaktor'], links: [{ from: 'A1 Ursache', to: 'B2 Schritt' }, { from: 'B2 Schritt', to: 'C3 Schritt' }, { from: 'C3 Schritt', to: 'D4 Schritt', label: 'verstärkt' }, { from: 'D4 Schritt', to: 'E5 Schritt' }, { from: 'E5 Schritt', to: 'F6 Wirkung' }, { from: 'G7 Moderator', to: 'C3 Schritt -> D4 Schritt' }, { from: 'H8 Begleitfaktor', to: 'A1 Ursache', both: true }, { from: 'A1 Ursache', to: 'F6 Wirkung', dashed: true }] };
  const more = [
    moderator, mediator, comm, eight,
    { type: 'venn', title: 'Qualitativ und quantitativ', sets: [{ label: 'Qualitativ', items: ['offen', 'kleine Fallzahlen', 'verstehen'] }, { label: 'Quantitativ', items: ['standardisiert', 'große Stichproben', 'messen'] }], shared: ['systematisch', 'theoriegeleitet'] },
    { type: 'pyramid', title: 'Bedürfnispyramide', levels: ['Selbstverwirklichung', 'Individualbedürfnisse', 'Soziale Bedürfnisse', 'Sicherheit', 'Physiologische Bedürfnisse'] },
    { type: 'bars', title: 'Mediennutzung pro Tag', unit: 'Min.', bars: [{ label: 'Streaming', value: 140 }, { label: 'Fernsehen (linear)', value: 95.5 }, { label: 'Radio', value: 60 }, { label: 'Zeitung', value: 12 }] },
    { type: 'decision', title: 'Welcher Test?', question: 'Sind die Daten normalverteilt?', yes: { question: 'Zwei Gruppen?', yes: 't-Test', no: 'ANOVA' }, no: 'Mann-Whitney-U-Test' },
    { type: 'axes', x: 'Übung', y: 'Leistung', shape: 's-kurve', label: 'mit Feedback', second: { shape: 'linear', label: 'ohne Feedback' } },
  ];
  const crosses = (L: any) => {
    // a line segment must not run through a box (tags and plain text excluded)
    const solid = L.boxes.filter((b: any) => b.lines.length && ['node', 'accent', 'node2', 'accent2', 'soft'].includes(b.kind));
    let n = 0;
    for (const l of L.lines) for (let i = 1; i < l.pts.length; i++) {
      const [ax, ay] = l.pts[i - 1], [bx, by] = l.pts[i];
      for (const b of solid) {
        const x0 = b.x + 3, x1 = b.x + b.w - 3, y0 = b.y + 3, y1 = b.y + b.h - 3;
        let t0 = 0, t1 = 1;
        const clip = (pp: number, q: number) => {
          if (pp === 0) return q >= 0;
          const r = q / pp;
          if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
          return true;
        };
        const dx = bx - ax, dy = by - ay;
        if (clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay) && t0 < t1) n++;
      }
    }
    return n;
  };
  for (const raw of more) {
    const d = parseDiagram(raw)!;
    if (!d) { ok(false, (raw as any).type + ': wird erkannt'); continue; }
    const L = layoutDiagram(d);
    const real = L.boxes.filter((b) => b.lines.length);
    const outside = real.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > L.width + 0.5 || b.y + b.h > L.height + 0.5);
    let overlaps = 0;
    const pairs: string[] = [];
    real.forEach((a, k) => real.slice(k + 1).forEach((b) => { if (hit(a, b)) { overlaps++; pairs.push(a.lines[0] + ' / ' + b.lines[0]); } }));
    const svg = renderDiagram(d, PALETTES.dark);
    const cr = d.type === 'model' || d.type === 'decision' ? crosses(L) : 0;
    ok(outside.length === 0 && overlaps === 0 && cr === 0 && /^<svg/.test(svg), d.type + (d.title ? ' „' + d.title + '“' : '') + ': nichts überlappt, ragt hinaus oder kreuzt einen Kasten' + (overlaps ? ' [' + pairs.join('; ') + ']' : '') + (outside.length ? ' [außen: ' + outside.map((b) => b.lines[0]).join(', ') + ']' : '') + (cr ? ' [' + cr + ' Kreuzungen]' : ''));
  }
  {
    const d = parseDiagram(moderator)! as any;
    const L = layoutDiagram(d);
    const modLine = L.lines.find((l) => l.tone === 2)!;
    const main = L.lines.find((l) => l.tone !== 2 && l.pts.length === 2)!;
    const m = [(main.pts[0][0] + main.pts[1][0]) / 2, (main.pts[0][1] + main.pts[1][1]) / 2];
    const end = modLine.pts[modLine.pts.length - 1];
    ok(Math.hypot(end[0] - m[0], end[1] - m[1]) < 1, 'Moderator-Pfeil endet auf der Mitte des Pfeils Freizeit → Nutzung');
    const alter = L.boxes.find((b) => b.lines[0] === 'Alter')!;
    ok(alter.kind === 'node2' && alter.y + alter.h < main.pts[0][1], 'Moderator steht über dem Pfeil, in der zweiten Farbe');
  }
  {
    const ids = parseDiagram({ type: 'model', nodes: [{ id: 'x', label: 'Bildung' }, { id: 'y', label: 'Einkommen' }], links: [{ from: 'x', to: 'y' }, { from: 'bildung', to: 'Gesundheit' }] }) as any;
    ok(ids && ids.links[0].from === 'Bildung' && ids.links[0].to === 'Einkommen' && ids.nodes.includes('Gesundheit') && ids.links[1].from === 'Bildung', 'Modell: IDs und Groß-/Kleinschreibung werden aufgelöst, unbekannte Kästen ergänzt');
    const mod = parseDiagram({ type: 'model', nodes: ['A', 'B', 'M'], links: [{ from: 'M', to: 'A → B' }] }) as any;
    ok(mod && mod.links.some((l: any) => l.from === 'A' && l.to === 'B') && mod.links.some((l: any) => l.from === 'M' && l.to === 'A -> B'), 'Pfeil auf einen fehlenden Pfeil: der Pfeil A→B wird ergänzt');
    ok(parseDiagram({ type: 'model', nodes: ['A'], links: [] }) === null && parseDiagram({ type: 'model', nodes: ['A', 'B'], links: [{ from: 'A', to: 'A' }] }) === null, 'Modell ohne brauchbare Pfeile → keine Grafik');
    const again = parseDiagram(JSON.parse(JSON.stringify(parseDiagram(comm))));
    ok(JSON.stringify(again) === JSON.stringify(parseDiagram(comm)), 'gespeichertes Modell wird beim Anzeigen gleich gelesen');
    const dec = parseDiagram({ type: 'decision', question: 'Q?', yes: { question: 'Q2?', yes: { question: 'zu tief', yes: 'a', no: 'b' }, no: 'c' }, no: 'd' }) as any;
    ok(dec && typeof dec.yes === 'object' && typeof dec.yes.yes === 'string', 'Entscheidungsbaum: zu tiefe Fragen werden zur Antwort');
    const hl = parseDiagram({ type: 'flow', steps: ['A', 'B', 'C'], highlight: 'b' })!;
    const kinds = layoutDiagram(hl).boxes.filter((b) => b.lines.length).map((b) => b.kind).join(',');
    ok((hl as any).highlight === 'B' && kinds === 'node,accent,node', 'Hervorhebung trifft den gewählten Schritt statt des ersten');
    const bars = renderDiagram(parseDiagram(more[6])!);
    ok(bars.includes('95,5 Min.') && bars.includes('140 Min.'), 'Balken zeigen die Werte mit Einheit');
    ok(/\bmodel \{/.test(DIAGRAM_RULE) && /\bdecision \{/.test(DIAGRAM_RULE), 'KI-Anweisung kennt die neuen Arten');
  }
  // ---- nothing is cut off, long labels included
  {
    const L50 = 'Methoden der empirischen Sozialforschung im Überblick';
    const longs: any[] = [
      { type: 'flow', title: L50, steps: [L50, 'Kurz', L50] },
      { type: 'cycle', steps: [L50, 'Zwei', L50, 'Vier'] },
      { type: 'concept', center: L50, branches: [L50, 'Daten', 'Informationen', L50, 'Wissen'] },
      { type: 'hierarchy', root: L50, children: [{ label: L50, children: [L50, 'kurz'] }, { label: 'Qualitativ' }, { label: 'Mixed' }] },
      { type: 'compare', columns: [{ title: L50, items: [L50, 'x'] }, { title: 'B', items: ['y'] }, { title: 'C', items: [L50] }] },
      { type: 'timeline', events: [{ when: '1900', label: L50 }, { when: '1950', label: L50 }, { when: '2000', label: 'kurz' }] },
      { type: 'matrix', x: 'Reliabilität', y: 'Validität', cells: [L50, L50, 'c', L50] },
      { type: 'axes', x: 'Zeit', y: 'Behalten', shape: 'fallend', marks: [{ at: 0.3, label: 'Wiederholung' }] },
      { type: 'model', nodes: ['Hitze', 'Eisverkauf', 'Schwimmunfälle'], links: [{ from: 'Hitze', to: 'Eisverkauf', label: 'verursacht' }, { from: 'Hitze', to: 'Schwimmunfälle', label: 'verursacht' }, { from: 'Eisverkauf', to: 'Schwimmunfälle', label: 'Scheinzusammenhang', both: true, dashed: true }] },
      { type: 'model', nodes: [L50, 'Wirkung', 'Moderator mit langem Namen'], links: [{ from: L50, to: 'Wirkung', label: 'eine ziemlich lange Pfeilbeschriftung' }, { from: 'Moderator mit langem Namen', to: L50 + ' -> Wirkung', label: 'Scheinzusammenhang' }] },
      { type: 'venn', sets: [{ label: L50, items: [L50] }, { label: 'B', items: ['kurz'] }], shared: ['Gemeinsamkeitenliste'] },
      { type: 'pyramid', levels: ['Selbstverwirklichung', L50, 'Soziale Bedürfnisse', L50] },
      { type: 'bars', bars: [{ label: L50, value: 3 }, { label: 'b', value: 5 }] },
      { type: 'decision', question: L50 + '?', yes: { question: L50 + '?', yes: L50, no: 'kurz' }, no: L50 },
    ];
    for (const raw of longs) {
      const d = parseDiagram(raw)!;
      const L = layoutDiagram(d);
      const svg = renderDiagram(d);
      const text = L.boxes.flatMap((b) => b.lines).join(' ').replace(/-\s/g, '');
      const want = JSON.stringify(raw).match(/[A-Za-zÄÖÜäöüß]{4,}/g)!.filter((w) => !['type', 'title', 'steps', 'branches', 'center', 'root', 'children', 'label', 'columns', 'items', 'events', 'when', 'cells', 'shape', 'fallend', 'marks', 'nodes', 'links', 'from', 'both', 'dashed', 'true', 'sets', 'shared', 'levels', 'bars', 'value', 'question'].includes(w) && w !== raw.type);
      const missing = want.filter((w) => !text.includes(w));
      const real = L.boxes.filter((b) => b.lines.length);
      let overlaps = 0;
      real.forEach((a, k) => real.slice(k + 1).forEach((b) => (overlaps += hit(a, b) ? 1 : 0)));
      ok(!svg.includes('…') && missing.length === 0 && overlaps === 0, d.type + ': lange Beschriftungen stehen vollständig da, ohne „…“ und ohne Überlappung' + (missing.length ? ' [fehlt: ' + [...new Set(missing)].join(', ') + ']' : '') + (overlaps ? ' [' + overlaps + ' Überlappungen]' : ''));
    }
    const sch = layoutDiagram(parseDiagram(longs[8])!).boxes.find((b) => b.kind === 'tag' && b.lines.join('').includes('Scheinzusammen'))!;
    ok(sch.lines.length === 1 && sch.lines[0] === 'Scheinzusammenhang', 'Pfeilschild „Scheinzusammenhang“ steht ganz in einer Zeile');
  }
  // ---- colours: every column in its own colour, the whole column
  {
    const cmp = renderDiagram(parseDiagram({ type: 'compare', columns: [{ title: 'Eins', items: ['a'] }, { title: 'Zwei', items: ['b'] }, { title: 'Drei', items: ['c'] }] })!, PALETTES.light);
    const t = PALETTES.light.tones;
    ok([0, 1, 2].every((i) => cmp.includes(`fill="${t[i].accent}"`) && cmp.includes(`fill="${t[i].soft}" stroke="${t[i].stroke}"`)), 'Vergleich: 3 Spalten in 3 Farben, Kopf und Kasten jeweils gleich');
    const darkSvg = renderDiagram(parseDiagram(more[0])!, PALETTES.dark) + renderDiagram(parseDiagram({ type: 'hierarchy', root: 'R', children: ['a', 'b', 'c', 'd', 'e'] })!, PALETTES.dark);
    const lightOnly = PALETTES.light.tones.flatMap((x) => [x.node, x.soft]);
    ok(!lightOnly.some((c) => darkSvg.includes(c)), 'Dunkelmodus nutzt nur dunkle Füllfarben');
    const hier = layoutDiagram(parseDiagram({ type: 'hierarchy', root: 'R', children: [{ label: 'A', children: ['a1'] }, { label: 'B', children: ['b1'] }] })!);
    const bA = hier.boxes.find((b) => b.lines[0] === 'A')!, a1 = hier.boxes.find((b) => b.lines[0] === 'a1')!, bB = hier.boxes.find((b) => b.lines[0] === 'B')!;
    ok(bA.tone === a1.tone && bA.tone !== bB.tone, 'Gliederung: jeder Ast samt Unterpunkten in seiner Farbe');
  }
  // ---- symbols in boxes
  {
    const { ICON_NAMES } = await import('../src/lib/diagramIcons');
    const { RULE_ICONS } = await import('../src/lib/diagram');
    const withIcons: any[] = [
      { type: 'flow', steps: ['Forschungsfrage', 'Datenerhebung', 'Auswertung'], icons: { forschungsfrage: 'Frage', Datenerhebung: 'liste', Auswertung: 'balken' } },
      { type: 'cycle', steps: ['Plan', 'Do', 'Check', 'Act'], icons: { Plan: 'idee', Check: 'suche' } },
      { type: 'concept', center: 'Wissen', branches: ['Daten', 'Informationen', 'Erfahrung'], icons: { Wissen: 'gehirn', Daten: 'daten' } },
      { type: 'hierarchy', root: 'Methoden der empirischen Sozialforschung', children: [{ label: 'Quantitativ', children: ['Befragung'] }, { label: 'Qualitativ' }], icons: { 'Methoden der empirischen Sozialforschung': 'buch', Quantitativ: 'balken', Befragung: 'chat' } },
      { type: 'compare', columns: [{ title: 'Fernsehen', items: ['linear'] }, { title: 'Streaming', items: ['auf Abruf'] }], icons: { Fernsehen: 'fernseher', Streaming: 'smartphone' } },
      { type: 'matrix', x: 'x', y: 'y', cells: ['Gesetz', 'Markt', 'Staat', 'Bürger'], icons: { Gesetz: 'gesetz', 'Bürger': 'gruppe' } },
      { type: 'model', nodes: ['Freizeit', 'Nutzung von Streamingdiensten', 'Alter'], links: [{ from: 'Freizeit', to: 'Nutzung von Streamingdiensten' }, { from: 'Alter', to: 'Freizeit -> Nutzung von Streamingdiensten' }], icons: { Freizeit: 'uhr', 'Nutzung von Streamingdiensten': 'fernseher', Alter: 'person' } },
      { type: 'decision', question: 'Normalverteilt?', yes: 't-Test', no: 'Mann-Whitney-U-Test', icons: { 'Normalverteilt?': 'frage' } },
      { type: 'pyramid', levels: ['Selbstverwirklichung', 'Soziale Bedürfnisse', 'Sicherheit'], icons: { Sicherheit: 'schloss', Selbstverwirklichung: 'stern' } },
    ];
    for (const raw of withIcons) {
      const d = parseDiagram(raw)!;
      const L = layoutDiagram(d);
      const iconBoxes = L.boxes.filter((b) => b.icon);
      const svg = renderDiagram(d, PALETTES.dark);
      const real = L.boxes.filter((b) => b.lines.length);
      let overlaps = 0;
      real.forEach((a, k) => real.slice(k + 1).forEach((b) => (overlaps += hit(a, b) ? 1 : 0)));
      // text of a box with a symbol fits in the box minus the symbol
      const roomy = iconBoxes.every((b) => Math.max(...b.lines.map((l) => l.length)) * ((b.fs ?? L.fs) * 0.58) <= b.w - 24 - 8);
      ok(iconBoxes.length === Object.keys(d.icons ?? {}).length && iconBoxes.length > 0 && svg.split('scale(0.75)').length - 1 === iconBoxes.length && overlaps === 0 && !svg.includes('…') && roomy, d.type + ': ' + iconBoxes.length + ' Symbol(e) gezeichnet, Text hat daneben Platz, nichts überlappt');
    }
    const p = parseDiagram({ type: 'flow', steps: ['A', 'B'], icons: { a: 'Gebäude', B: 'einhorn', C: 'haus' } }) as any;
    ok(p.icons.A === 'gebaeude' && !('B' in p.icons) && !('C' in p.icons), 'Symbole: Name wird erkannt (Umlaute, Großschreibung), unbekannte Symbole und Beschriftungen fallen weg');
    const many = parseDiagram({ type: 'flow', steps: Array.from({ length: 8 }, (_, i) => 'S' + i), icons: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['S' + i, 'stern'])) }) as any;
    ok(Object.keys(many.icons).length === 8, 'mehrere Symbole pro Grafik möglich');
    ok(parseDiagram({ type: 'flow', steps: ['A', 'B'] })!.icons === undefined, 'ohne Symbole bleibt die Beschreibung wie bisher');
    const mod = renderDiagram(parseDiagram(withIcons[6])!, PALETTES.light);
    ok(mod.includes(`stroke="${PALETTES.light.tones[1].stroke}" stroke-width="2" stroke-linecap`) && mod.includes(`stroke="${PALETTES.light.tones[0].stroke}" stroke-width="2" stroke-linecap`), 'Symbol in der Farbe seines Kastens (Moderator Beere, sonst Türkis)');
    const dark = renderDiagram(parseDiagram(withIcons[6])!, PALETTES.dark);
    ok(dark.includes(`stroke="${PALETTES.dark.tones[0].stroke}" stroke-width="2" stroke-linecap`), 'Symbol im Dunkelmodus in der hellen Randfarbe');
    ok(ICON_NAMES.length >= 50 && RULE_ICONS.length >= 30 && RULE_ICONS.every((n) => ICON_NAMES.includes(n) && DIAGRAM_RULE.includes(n)) && DIAGRAM_RULE.length <= 2800, 'KI-Anweisung kurz (' + DIAGRAM_RULE.length + ' Zeichen) mit ' + RULE_ICONS.length + ' gültigen Symbolen');
    const roundTrip = parseDiagram(JSON.parse(JSON.stringify(parseDiagram(withIcons[6]))));
    ok(JSON.stringify(roundTrip) === JSON.stringify(parseDiagram(withIcons[6])), 'gespeicherte Symbole werden beim Anzeigen gleich gelesen');
  }
  // ---- mind map
  {
    const mk = (n: number) => ({
      type: 'mindmap',
      center: 'Methoden der empirischen Sozialforschung',
      branches: Array.from({ length: n }, (_, i) => ({ label: ['Forschungsprozess', 'Gütekriterien', 'Stichproben und Auswahlverfahren', 'Befragung', 'Inhaltsanalyse', 'Experiment', 'Beobachtung', 'Auswertung'][i], children: ['Punkt eins mit etwas mehr Text', 'Zwei', 'Operationalisierung', 'Vier'].slice(0, 2 + (i % 3)) })),
      icons: { Befragung: 'chat', 'Methoden der empirischen Sozialforschung': 'buch' },
    });
    for (const n of [3, 6, 8]) {
      const d = parseDiagram(mk(n))!;
      const L = layoutDiagram(d);
      const real = L.boxes.filter((b) => b.lines.length);
      let overlaps = 0;
      real.forEach((a, k) => real.slice(k + 1).forEach((b) => (overlaps += hit(a, b) ? 1 : 0)));
      const outside = real.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > L.width + 0.5 || b.y + b.h > L.height + 0.5);
      const heads = L.boxes.filter((b) => b.kind === 'accent' && b.tone && b.lines.length && b.fs !== 16);
      const svg = renderDiagram(d, PALETTES.dark);
      ok(d.type === 'mindmap' && overlaps === 0 && outside.length === 0 && !svg.includes('…') && heads.length === n && new Set((d as any).branches.slice(0, 5).map((br: any) => heads.find((b) => b.lines.join(' ').replace(/- /g, '') === br.label)?.tone)).size === Math.min(5, n), `Mindmap mit ${n} Ästen: nichts überlappt oder ragt hinaus, Äste in verschiedenen Farben`);
    }
    ok(parseDiagram({ type: 'mindmap', center: 'X', branches: ['a', 'b'] }) === null && (parseDiagram({ type: 'mindmap', center: 'X', branches: ['a', 'b', 'c'] }) as any).branches[0].children.length === 0, 'Mindmap braucht mindestens 3 Äste; Äste als reine Wörter gehen auch');
    ok(!DIAGRAM_RULE.includes('"type":"mindmap"'), 'Mindmap ist nicht für einzelne Karten gedacht');
  }
  const esc = renderDiagram(parseDiagram({ type: 'flow', steps: ['a <b> & "c"', 'd'] })!);
  ok(esc.includes('a &lt;b&gt; &amp; &quot;c&quot;') && !esc.includes('<b>'), 'Sonderzeichen werden escaped');
  ok(!/Operationalisier-/.test(renderDiagram(parseDiagram(samples[0])!)), 'lange Wörter bleiben ganz (kleinere Schrift statt Trennung)');
  ok(parseDiagram({ type: 'flow', steps: ['nur einer'] }) === null && parseDiagram({ type: 'quatsch' }) === null && parseDiagram('text') === null, 'unbrauchbare Beschreibung → keine Grafik');
  const many = parseDiagram({ type: 'flow', steps: Array.from({ length: 20 }, (_, i) => 'x'.repeat(100) + i) })!;
  ok(many.type === 'flow' && many.steps.length === 8 && many.steps[0].length <= 60, 'zu viele / zu lange Einträge werden gekürzt');
  ok(parseDiagram({ type: 'axes', x: 'x', y: 'y', shape: 'umgekehrtes U' })!.type === 'axes' && (parseDiagram({ type: 'axes', x: 'x', y: 'y', shape: 'umgekehrtes U' }) as any).shape === 'umgekehrtes-u', 'Kurvenform wird erkannt');
  const light = renderDiagram(parseDiagram(samples[0])!, PALETTES.light), dark = renderDiagram(parseDiagram(samples[0])!, PALETTES.dark);
  ok(light !== dark && dark.includes(PALETTES.dark.text) && light.includes(PALETTES.light.text), 'helle und dunkle Farben');
  const html = 'Antwort' + diagramHtml(parseDiagram(samples[0])!);
  const out = diagramsToSvg(html);
  ok(!out.includes('data-diagram') && out.includes('<svg') && out.includes('Forschungsfrage') && out.includes('#ffffff'), 'Anki-Export: Platzhalter → fertiges SVG auf Weiß');
  ok(!/<svg/i.test(DIAGRAM_RULE) && /\bflow \{/.test(DIAGRAM_RULE), 'KI-Anweisung verlangt Beschreibung, kein SVG');
}

console.log('Modelle aus PDF-Folien');
{
  const { pickFigurePages, markFigures, FIGURE_RULE, figureHtml } = await import('../src/lib/slides');
  // 10 slides: logo (120x40) and ~6 template lines on every slide; slide 3 has a picture, slide 6 a model drawn with shapes
  const stats = Array.from({ length: 10 }, (_, i) => ({
    images: ['120x40', ...(i === 2 ? ['800x450'] : [])],
    paths: 6 + (i === 5 ? 40 : 0) + (i === 8 ? 4 : 0),
  }));
  ok(JSON.stringify(pickFigurePages(stats)) === '[3,6]', 'Folie mit Bild und Folie mit gezeichnetem Modell erkannt; Logo und Vorlagenlinien zählen nicht');
  ok(pickFigurePages([]).length === 0, 'leeres PDF → keine Abbildungen');
  const m = markFigures([
    { name: 'S1.pdf', pages: ['Einleitung', 'Modell A', 'Fazit'], figures: [2] },
    { name: 'S2.pdf', pages: ['Modell B', 'Text'], figures: [1] },
  ]);
  ok(m.texts[0].text.includes('[Abbildung 1 – Folie 2 aus S1.pdf]\nModell A') && m.texts[1].text.startsWith('[Abbildung 2 – Folie 1 aus S2.pdf]'), 'Markierungen an der richtigen Folie, Nummern laufen über alle Dateien');
  ok(m.figures[1].file === 'S1.pdf' && m.figures[1].page === 2 && m.figures[2].file === 'S2.pdf' && m.figures[2].page === 1, 'Zuordnung Nummer → Datei und Folie');
  ok(/"figure": 7/.test(FIGURE_RULE), 'Anweisung nennt das Feld „figure“');
  const h = figureHtml('abc', 'Folie 3 · <b>&"x".pdf');
  ok(h.includes('data-media="abc"') && h.includes('&lt;b&gt;&amp;&quot;x&quot;.pdf') && !h.includes('<b>'), 'Folienbild-HTML sauber escaped');
}

console.log('Grafik pro Karte');
{
  const { cardGraphic, stripGraphics, withDiagram, diagramHtml, parseDiagram } = await import('../src/lib/diagram');
  const { figureHtml } = await import('../src/lib/slides');
  const d1 = parseDiagram({ type: 'flow', steps: ['A', 'B'] })!;
  const d2 = parseDiagram({ type: 'compare', columns: [{ title: 'X', items: ['1'] }, { title: 'Y', items: ['2'] }] })!;
  const own = '<img data-media="mein-bild" alt="">';
  const withD = 'Antwort ' + own + diagramHtml(d1);
  const withSlide = 'Antwort' + figureHtml('m1', 'Folie 3 · S.pdf');
  const withOld = 'Antwort<br><img data-media="m2" alt="Grafik">';
  ok(cardGraphic(withD).kind === 'diagram' && cardGraphic(withD).diagram?.type === 'flow', 'Merkora-Grafik erkannt');
  ok(cardGraphic(withSlide).kind === 'slide' && cardGraphic(withOld).kind === 'image' && cardGraphic('nur Text ' + own).kind === null, 'Folienbild, ältere KI-Grafik und „keine Grafik“ erkannt');
  ok(stripGraphics(withD) === 'Antwort ' + own && stripGraphics(withSlide) === 'Antwort' && stripGraphics(withOld) === 'Antwort', 'Entfernen: nur die Grafik geht, Text und eigene Bilder bleiben');
  const replaced = withDiagram(withSlide, d2);
  ok(cardGraphic(replaced).diagram?.type === 'compare' && !replaced.includes('slide-figure'), 'Ersetzen: Folienbild → neue Grafik');
  ok(cardGraphic(withDiagram('Text', d1)).kind === 'diagram', 'Karte ohne Grafik bekommt eine');
}

console.log('PDF-Text ohne wiederholte Kopfzeilen');
{
  const { stripRepeatedLines, pagesToText } = await import('../src/lib/pdfText');
  const head = 'UNIVERSITÉ DE FRIBOURG / UNIVERSITÄT FREIBURG I FACULTÉ DES SCIENCES';
  const head2 = 'SOCIALES ET DU MANAGEMENT / WIRTSCHAFTS- UND SOZIALWISSENSCHAFTLICHE FAKULTÄT';
  const pages = Array.from({ length: 8 }, (_, i) => [head, head2, `Thema ${i + 1}: Inhalt der Folie`, `Erklärung zu Punkt ${i + 1}`, 'Methoden I – HS 2026', String(i + 2)].join('\n'));
  pages[0] = [head, head2, 'METHODEN DER EMPIRISCHEN SOZIALFORSCHUNG', 'Einführung'].join('\n');
  const out = stripRepeatedLines(pages);
  const text = pagesToText(out);
  ok(!text.includes('UNIVERSITÉ') && !text.includes('WIRTSCHAFTS-') && !text.includes('HS 2026'), 'Kopf- und Fußzeilen auf jeder Folie fallen weg');
  ok(text.includes('METHODEN DER EMPIRISCHEN SOZIALFORSCHUNG') && text.includes('Thema 3: Inhalt der Folie') && text.includes('Erklärung zu Punkt 8'), 'Folieninhalt bleibt vollständig');
  ok(!/^\d+$/m.test(text), 'Seitenzahlen fallen weg');
  ok(out.length === pages.length, 'Folien behalten ihre Nummern (für Abbildungen)');
  const few = ['A\nKopf', 'B\nKopf', 'C\nKopf'];
  ok(JSON.stringify(stripRepeatedLines(few)) === JSON.stringify(few), 'kurze PDFs (unter 4 Folien) bleiben unverändert');
  const body = Array.from({ length: 6 }, (_, i) => ['Titel ' + i, 'a', 'b', 'c', 'd', 'Definition: Reliabilität', 'e', 'f', 'g', 'h', 'Ende ' + i].join('\n'));
  ok(stripRepeatedLines(body).every((p) => p.includes('Definition: Reliabilität')), 'wiederholte Zeilen mitten auf der Folie bleiben');
}

console.log('Problemkarten');
{
  const { isLeech, becomesLeech, LEECH } = await import('../src/lib/cardLinks');
  const { newSrs } = await import('../src/lib/srs');
  const base = (id: string, extra: any = {}) => ({ id, front: 'Frage ' + id, back: 'Antwort ' + id, createdAt: 0, srs: newSrs(0), ...extra }) as any;
  ok(!isLeech(base('a', { srs: { ...newSrs(0), lapses: LEECH - 1 } })) && isLeech(base('a', { srs: { ...newSrs(0), lapses: LEECH } })), `Problemkarte ab ${LEECH}× vergessen`);
  ok(becomesLeech({ srs: { ...newSrs(0), lapses: 3 } }, { srs: { ...newSrs(0), lapses: 4 } }) && !becomesLeech({ srs: { ...newSrs(0), lapses: 4 } }, { srs: { ...newSrs(0), lapses: 5 } }), 'Hinweis nur beim Übergang zur Problemkarte');
  ok(!isLeech({ srs: { ...newSrs(0), lapses: 0 } }), '„Ersetzen“ (lapses 0) nimmt die Karte aus den Problemkarten');
}

console.log('Begriff oder Definition zuerst');
{
  const { asksBack, sidesFor, swapSides } = await import('../src/lib/askSide');
  const card = { front: 'Reliabilität', back: 'Zuverlässigkeit einer Messung' };
  ok(JSON.stringify(sidesFor(card, false)) === JSON.stringify({ question: 'Reliabilität', answer: 'Zuverlässigkeit einer Messung' }) && JSON.stringify(sidesFor(card, true)) === JSON.stringify({ question: 'Zuverlässigkeit einer Messung', answer: 'Reliabilität' }), 'Definition zuerst: Rückseite wird gefragt, Vorderseite ist die Antwort');
  const anki = { front: 'Q', back: 'Q<hr id=answer>A', html: true };
  ok(sidesFor(anki, true).question === 'A' && sidesFor(anki, true).answer === 'Q', 'Anki-Karte: gefragt wird nur der Antwortteil, nicht die wiederholte Frage');
  ok(!asksBack('front', 'x') && asksBack('back', 'x') && !asksBack(undefined, 'x'), 'Begriff zuerst ist der Standard');
  const ids = Array.from({ length: 40 }, (_, i) => 'card' + i);
  const back = ids.filter((id) => asksBack('mixed', id, 1)).length;
  ok(back > 8 && back < 32 && ids.every((id) => asksBack('mixed', id, 1) === asksBack('mixed', id, 1)), 'Gemischt: etwa die Hälfte von hinten, pro Karte und Runde fest');
  ok(JSON.stringify(swapSides('Begriff', 'Definition', false)) === JSON.stringify({ front: 'Definition', back: 'Begriff' }) && swapSides('Q', 'Q<hr id=answer>A', true).front === 'A', 'Tauschen im Editor: Vorder- und Rückseite wechseln (Anki: nur der Antwortteil)');
}

console.log('Zuordnen-Spiel');
{
  const { pickMatchCards, makeTiles, isPair, formatTime, MATCH_MAX } = await import('../src/lib/match');
  const now = 1_000_000;
  const c = (id: string, front: string, back: string, due = now + 1e9, leech = false, media = false) => ({ id, front, back, due, leech, media });
  const pool = [
    c('long', 'x'.repeat(MATCH_MAX + 1), 'kurz'),
    c('img', 'Bild', 'Antwort', now - 1, false, true),
    c('d1', 'Fällig 1', 'A1', now - 5),
    c('d2', 'Fällig 2', 'A2', now - 5),
    c('l1', 'Problem', 'A3', now + 1e9, true),
    c('dup', 'Andere Frage', 'A1'),
    ...Array.from({ length: 8 }, (_, i) => c('n' + i, 'Neu ' + i, 'Antwort ' + i)),
  ];
  const picked = pickMatchCards(pool, 6, now, () => 0.3);
  const ids = picked.map((p) => p.id);
  ok(picked.length === 6 && !ids.includes('long') && !ids.includes('img'), 'nur kurze Textkarten ohne Bilder');
  ok(['d1', 'd2', 'l1'].every((id) => ids.includes(id)), 'fällige und Problemkarten zuerst');
  ok(new Set(picked.map((p) => p.back.toLowerCase())).size === picked.length && !ids.includes('dup'), 'keine zwei Karten mit derselben Antwort');
  const tiles = makeTiles(picked, () => 0.5);
  ok(tiles.length === 12 && isPair(tiles.find((t) => t.key === 'd1:f')!, tiles.find((t) => t.key === 'd1:b')!) && !isPair(tiles.find((t) => t.key === 'd1:f')!, tiles.find((t) => t.key === 'd2:b')!), '12 Kacheln, Paare werden richtig erkannt');
  ok(formatTime(23456) === '23,5 s', 'Zeit wird lesbar angezeigt');
}

console.log('Vorlesen');
{
  const { htmlSpeech, markdownSpeech } = await import('../src/lib/speechText');
  ok(htmlSpeech('<b>Reliabilität</b><br>Zuverlässigkeit &amp; Genauigkeit<div class="diagram" data-diagram="{}"></div><img data-media="x">') === 'Reliabilität. Zuverlässigkeit & Genauigkeit', 'Karten-HTML → Vorlesetext ohne Grafiken und Bilder');
  const md = markdownSpeech('## Überblick\n\n- **Punkt** eins\n- [Link](http://x) zwei\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  ok(md.length === 3 && md[0] === 'Überblick.' && md[1] === 'Punkt eins. Link zwei.' && !md.join(' ').includes('*') && !md.join(' ').includes('---'), 'Markdown → Absätze ohne Zeichen wie ** und Tabellenlinien');
}

console.log('Interaktive Mindmap');
{
  const { mindmapLayout } = await import('../src/lib/mindmapLayout');
  const { parseDiagram } = await import('../src/lib/diagram');
  const labels = ['Forschungsprozess', 'Gütekriterien', 'Stichproben und Auswahlverfahren', 'Befragung', 'Inhaltsanalyse', 'Experiment', 'Beobachtung', 'Auswertung'];
  const mk = (n: number) => parseDiagram({ type: 'mindmap', center: 'Methoden der empirischen Sozialforschung', branches: labels.slice(0, n).map((l) => ({ label: l, children: ['Operationalisierung der Begriffe', 'Reliabilität', 'Validität prüfen', 'Pretest', 'Stichprobenfehler'] })), icons: { Befragung: 'chat' } }) as any;
  const overlaps = (nodes: any[]) => {
    const shown = nodes.filter((x) => x.shown);
    let ov = 0;
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++) {
        const a = shown[i], b = shown[j];
        if (Math.abs(a.home.x - b.home.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.home.y - b.home.y) < (a.h + b.h) / 2 + 4) ov++;
      }
    return ov;
  };
  for (const n of [3, 5, 8]) {
    const d = mk(n);
    const allOpen = mindmapLayout(d, new Set(d.branches.map((_: any, i: number) => i)));
    const closed = mindmapLayout(d, new Set());
    ok(overlaps(allOpen) === 0 && overlaps(closed) === 0 && closed.filter((x) => x.shown).length === n + 1, `Mindmap mit ${n} Ästen: zu- und aufgeklappt überlappt nichts`);
  }
  const d = mk(6);
  const one = mindmapLayout(d, new Set([2]));
  const leaves = one.filter((x) => x.kind === 'leaf');
  const b2 = one.find((x) => x.id === 'b2')!;
  ok(leaves.filter((x) => x.shown).every((x) => x.branch === 2 && Math.sign(x.home.x) === Math.sign(b2.home.x) && Math.abs(x.home.x) > Math.abs(b2.home.x)), 'aufgeklappte Punkte stehen außen neben ihrem Ast');
  ok(leaves.filter((x) => !x.shown).every((x) => { const b = one.find((y) => y.id === `b${x.branch}`)!; return x.home.x === b.home.x && x.home.y === b.home.y; }), 'zugeklappte Punkte warten unsichtbar auf ihrem Ast (von dort klappen sie auf)');
  ok(one.find((x) => x.label === 'Befragung')?.icon === 'chat', 'Symbole erscheinen auch in der interaktiven Mindmap');
  const full = mindmapLayout(d, new Set(d.branches.map((_: any, i: number) => i)));
  const right = (k: string) => full.filter((x) => x.kind === k).map((x) => x.home.x - x.w / 2);
  const left = (k: string) => full.filter((x) => x.kind === k).map((x) => x.home.x + x.w / 2);
  ok(Math.max(...left('center')) < Math.min(...right('branch')) && Math.max(...left('branch')) < Math.min(...right('leaf')) && new Set(right('branch').map(Math.round)).size === 1 && new Set(right('leaf').map(Math.round)).size === 1, 'von links nach rechts: Thema, dann Äste, dann Punkte – jeweils bündig in einer Spalte');
}

console.log('Lernpfad: Antworten und Zeit');
{
  const { answerXp, mcRating, mcTimeLimit, PATH_RATINGS } = await import('../src/lib/path');
  ok(answerXp(1, true, 0) === 0 && answerXp(2, true, 0) < answerXp(3, true, 0) && answerXp(3, true, 0) < answerXp(4, true, 0), 'Nochmal 0 XP, Schwer < Gut < Einfach');
  ok(answerXp(4, false, 0) === 3 && answerXp(3, true, 2) === answerXp(3, true, 0) + 2, 'zweiter Versuch gibt wenig, eine Serie 2 XP extra');
  ok(mcRating(false, 500, 50) === 1 && mcRating(true, 3000, 50) === 3 && mcRating(true, 9000, 50) === 2, 'Multiple Choice: falsch → Nochmal, schnell richtig → Gut, lange überlegt → Schwer');
  ok(mcRating(true, 9000, 200) === 3 && mcTimeLimit(200) > mcTimeLimit(50), 'lange Fragen bekommen mehr Zeit');
  ok(mcTimeLimit(5000) === 25000, 'höchstens 25 Sekunden');
  ok(PATH_RATINGS.map((r) => r.label).join('/') === 'Nicht gewusst/Unsicher/Gewusst' && PATH_RATINGS.map((r) => r.value).join('') === '123', 'Aufdecken: drei Knöpfe Nicht gewusst / Unsicher / Gewusst (= Nochmal / Schwer / Gut)');
}

console.log('Prüfung für ganzen Kurs oder Ordner');
{
  const { examCovers, examDecks, nextExamForDeck, nextExamAt } = await import('../src/lib/exams');
  const day = 86_400_000;
  const future = new Date(Date.now() + 10 * day);
  const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
  const deck = (id: string, courseId: string, folderId?: string) => ({ id, courseId, folderId, cards: [], name: id }) as any;
  const decks = [deck('a', 'k1'), deck('b', 'k1', 'f1'), deck('c', 'k2'), deck('d', 'k2', 'f2')];
  const exam = { id: 'e', title: 'Klausur', date, deckIds: ['c'], courseIds: ['k1'], folderIds: ['f2'], createdAt: 0 } as any;
  ok(examCovers(exam, decks[0]) && examCovers(exam, decks[1]) && examCovers(exam, decks[2]) && examCovers(exam, decks[3]), 'ganzer Kurs, ganzer Ordner und einzelnes Deck gehören zur Prüfung');
  const later = deck('neu', 'k1');
  ok(examCovers(exam, later) && examDecks({ decks: [...decks, later] }, exam).some((d) => d.id === 'neu'), 'ein später hinzugefügtes Deck im Kurs gehört automatisch dazu');
  ok(!examCovers(exam, deck('x', 'k3')) && !examCovers({ ...exam, courseIds: undefined, folderIds: undefined }, deck('y', 'k1')), 'andere Kurse gehören nicht dazu; alte Prüfungen nur mit Decks funktionieren wie bisher');
  const data = { exams: [exam], decks: [...decks, later] } as any;
  ok(nextExamForDeck(data, 'neu')?.id === 'e' && typeof nextExamAt(data, 'neu') === 'number', 'Planung vor der Prüfung gilt auch für das neue Deck');
}

console.log('Karten in anderes Deck verschieben');
{
  const { moveCardsIn } = await import('../src/lib/moveCards');
  const card = (id: string, extra: any = {}) => ({ id, front: 'F' + id, back: 'B' + id, createdAt: 0, srs: { ease: 2.5, interval: 7, reps: 4, lapses: 1, due: 99 }, ...extra });
  const decks: any[] = [
    { id: 'A', courseId: 'k', name: 'A', cards: [card('1'), card('2', { styleId: 's1', html: true }), card('3')], styles: { s1: '.card{color:red}' } },
    { id: 'B', courseId: 'k', name: 'B', cards: [card('9')] },
  ];
  const reviews: any[] = [{ deckId: 'A', cardId: '1', at: 1, rating: 3 }, { deckId: 'A', cardId: '3', at: 2, rating: 1 }];
  let n = 0;
  const r = moveCardsIn(decks, reviews, 'A', ['1', '2'], 'B', () => 'neu' + ++n, 5);
  const A = r.decks.find((d) => d.id === 'A')!, B = r.decks.find((d) => d.id === 'B')!;
  ok(r.moved === 2 && A.cards.map((c) => c.id).join() === '3' && B.cards.length === 3, '2 Karten wandern von A nach B');
  const m1 = B.cards.find((c) => c.front === 'F1')!;
  ok(m1.id !== '1' && m1.srs.reps === 4 && m1.srs.interval === 7, 'Lernstand zieht mit (neue ID, damit eine synchronisierte Kopie die Karte nicht im alten Deck zurückbringt)');
  ok(JSON.stringify(r.gone.sort()) === '["1","2"]', 'alte IDs werden als gelöscht vermerkt');
  ok(r.reviews[0].deckId === 'B' && r.reviews[0].cardId === m1.id && r.reviews[1].deckId === 'A', 'Lerngeschichte zieht mit, andere bleiben');
  ok((B as any).styles?.s1 === '.card{color:red}', 'Anki-Aussehen der Karte kommt mit ins neue Deck');
  ok(moveCardsIn(decks, reviews, 'A', ['1'], 'A', () => 'x').moved === 0 && moveCardsIn(decks, reviews, 'A', ['1'], 'Z', () => 'x').moved === 0, 'gleiches oder unbekanntes Ziel: nichts passiert');
}

console.log('Fette Schlüsselwörter');
{
  const { emphasisHtml, stripEmphasis, hasEmphasis } = await import('../src/lib/emphasis');
  ok(emphasisHtml('Die **Mitose** teilt') === 'Die <b>Mitose</b> teilt', '**Wort** wird fett');
  ok(emphasisHtml('**A** und **B**') === '<b>A</b> und <b>B</b>', 'mehrere Markierungen');
  ok(emphasisHtml('a < b & **c**') === 'a &lt; b &amp; <b>c</b>', 'HTML wird escaped');
  ok(emphasisHtml('Zeile 1\nZeile 2') === 'Zeile 1<br>Zeile 2', 'Zeilenumbruch wird <br>');
  ok(emphasisHtml('nur ** einmal') === 'nur ** einmal', 'unpaariges ** bleibt Text');
  ok(stripEmphasis('Die **Mitose** und **Meiose**') === 'Die Mitose und Meiose', 'stripEmphasis entfernt die Sternchen');
  ok(hasEmphasis('x **y**') && !hasEmphasis('x ** y'), 'hasEmphasis erkennt Markierungen');
}

console.log('Mindmap: verwandte Karten und Material');
{
  const { relatedCards, materialAbout } = await import('../src/lib/related');
  const cards = [
    { id: '1', front: 'Was ist Osmose?', back: 'Diffusion durch eine Membran' },
    { id: '2', front: 'Zelle', back: 'Die osmose in der Zelle …' },
    { id: '3', front: 'Mitose', back: 'Kernteilung' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, front: 'Osmose ' + i, back: '' })),
  ];
  const r = relatedCards(cards, 'Osmose');
  ok(r.length === 5, 'höchstens 5 Treffer');
  ok(r[0].id === '1' && !r.some((c) => c.id === '3'), 'Treffer in der Frage zuerst, Fremdes nicht');
  ok(relatedCards(cards.slice(0, 3), 'OSMOSE').map((c) => c.id).join() === '1,2', 'ohne Groß-/Kleinschreibung, auch in der Antwort');
  const src = 'Einleitung zur Zelle.\n\nOsmose ist Wanderung von Wasser.\n\nAnderes Thema.\n\nNochmal Osmose hier.';
  const m = materialAbout(src, 'Osmose');
  ok(m.includes('Wanderung') && m.includes('Nochmal') && !m.includes('Anderes'), 'nur Absätze mit dem Begriff');
  ok(materialAbout('Osmose ' + 'x'.repeat(5000), 'Osmose', 100).length <= 100, 'auf die Länge gekürzt');
}

console.log('Ordner lernen');
{
  const { dueAcross, allAcross } = await import('../src/lib/sessions');
  const s = (due: number, last?: number) => ({ ...newSrs(0), due, last });
  const decks = [
    { id: 'A', cards: [{ id: 'a1', srs: s(300, 1) }, { id: 'a2', srs: s(5000, 1) }, { id: 'a3', srs: s(0) }, { id: 'a4', srs: s(0) }] },
    { id: 'B', cards: [{ id: 'b1', srs: s(100, 1) }, { id: 'b2', srs: s(200, 1) }] },
  ];
  const items = dueAcross(decks, (d) => (d.id === 'A' ? 1 : 0), 1000);
  ok(items.map((i) => i.cardId).join() === 'a3,b1,b2,a1', `fällige Karten aus allen Decks nach Fälligkeit (${items.map((i) => i.cardId).join()})`);
  ok(!items.some((i) => i.cardId === 'a2'), 'nicht fällige bleiben weg');
  ok(!items.some((i) => i.cardId === 'a4'), 'Tageskontingent für neue Karten wird eingehalten');
  ok(items.find((i) => i.cardId === 'b1')!.deckId === 'B', 'jede Karte behält ihr Deck');
  const all = allAcross(decks, () => 0.5);
  ok(all.length === 6 && new Set(all.map((i) => i.cardId)).size === 6, 'Üben: alle Karten, jede einmal');
}

console.log('To-dos');
{
  const { todoGroups, mergeTodos, todoSuggestions, dueText } = await import('../src/lib/todos');
  const now = new Date(2026, 10, 13, 12).getTime();
  const t = (id: string, due?: string, doneAt?: number, createdAt = 1) => ({ id, text: id, due, doneAt, createdAt });
  const g = todoGroups([t('nodate'), t('soon2', '2026-11-20'), t('today', '2026-11-13'), t('late', '2026-11-10'), t('soon1', '2026-11-14'), t('done', '2026-11-01', 5)], now);
  ok(g.map((x) => x.id).join() === 'overdue,today,soon,nodate,done', 'Gruppen: überfällig, heute, demnächst, ohne Datum, erledigt');
  ok(g.find((x) => x.id === 'soon')!.items.map((x) => x.id).join() === 'soon1,soon2', 'innerhalb der Gruppe nach Datum');
  ok(g.find((x) => x.id === 'done')!.items[0].id === 'done' && g[g.length - 1].id === 'done', 'Erledigte zuletzt (auch mit altem Datum nicht überfällig)');
  ok(todoGroups([], now).length === 0, 'keine leeren Gruppen');
  ok(dueText('2026-11-13', now) === 'heute' && dueText('2026-11-14', now) === 'morgen', 'Datum als „heute“ / „morgen“');
  const a = [{ ...t('x'), updatedAt: 10 }, t('gone')];
  const b = [{ ...t('x'), doneAt: 20, updatedAt: 20 }, t('gone'), t('new')];
  const m = mergeTodos(a, b, (id) => id === 'gone');
  ok(!m.some((x) => x.id === 'gone'), 'gelöschtes To-do kommt per Sync nicht zurück');
  ok(m.find((x) => x.id === 'x')!.doneAt === 20 && m.some((x) => x.id === 'new'), 'neuere Änderung (abgehakt) gewinnt, neue kommen dazu');
  const ideas = todoSuggestions({ exams: [{ id: 'e', title: 'Statistik', date: '2026-11-18' }], decks: [{ id: 'd', name: 'Bio', leeches: 3 }], todos: [] }, now);
  ok(ideas.length === 2 && ideas[0].examId === 'e' && ideas[1].deckId === 'd', 'Vorschläge: Probeprüfung bei naher Prüfung, Problemkarten');
  ok(todoSuggestions({ exams: [{ id: 'e', title: 'Statistik', date: '2027-01-30' }], decks: [], todos: [] }, now).length === 0, 'ferne Prüfung: kein Vorschlag');
  ok(todoSuggestions({ exams: [], decks: [{ id: 'd', name: 'Bio', leeches: 3 }], todos: [t('Problemkarten in Bio verbessern')] }, now).length === 0, 'schon vorhandene Vorschläge fallen weg');
}

console.log('Statistik: Kurse und Ordner');
{
  const { groupTotals, statsTree, courseSummary, sortCourses } = await import('../src/lib/stats');
  const row = (deckId: string, cards: number, mastery: number, due: number, reviews: number, known: number) => ({ deckId, name: deckId, cards, mastery, due, reviews, known });
  const t = groupTotals([row('a', 10, 100, 2, 4, 4), row('b', 30, 0, 5, 6, 2)]);
  ok(t.cards === 40 && t.due === 7 && t.reviews === 10, 'Karten, Fällige und Wiederholungen summiert');
  ok(t.mastery === 25, `Fortschritt nach Kartenzahl gewichtet (${t.mastery} %)`);
  ok(t.correct === 60 && groupTotals([row('c', 5, 0, 0, 0, 0)]).correct === null, '„gewusst“ aus allen Wiederholungen, sonst –');
  const data = {
    workspaces: [{ id: 'w1', name: 'Uni' }, { id: 'w2', name: 'Leer' }],
    courses: [
      { id: 'c1', workspaceId: 'w1', name: 'Bio', folders: [{ id: 'f1', name: 'Kap 1' }, { id: 'f2', name: 'Leer' }] },
      { id: 'c2', workspaceId: 'w1', name: 'Ohne Decks' },
      { id: 'c3', workspaceId: 'w2', name: 'Auch leer' },
    ],
    decks: [
      { id: 'd1', courseId: 'c1', folderId: 'f1' },
      { id: 'd2', courseId: 'c1' },
      { id: 'd3', courseId: 'c1', folderId: 'f1' },
    ],
  };
  const tree = statsTree(data, [row('d1', 1, 0, 0, 0, 0), row('d2', 2, 0, 0, 0, 0), row('d3', 3, 0, 0, 0, 0)]);
  ok(tree.length === 1 && tree[0].courses.length === 1, 'leere Kurse und Workspaces fallen weg');
  const c = tree[0].courses[0];
  ok(c.folders.length === 1 && c.folders[0].decks.map((d) => d.deckId).join() === 'd1,d3', 'Decks im richtigen Ordner, Reihenfolge wie in der Bibliothek');
  ok(c.decks.map((d) => d.deckId).join() === 'd2' && c.totals.cards === 6 && c.folders[0].totals.cards === 4, 'Decks ohne Ordner direkt unter dem Kurs, Summen stimmen');
  const card = (lvl: 'new' | 'done') => ({ id: 'k', front: '', back: '', createdAt: 0, srs: lvl === 'new' ? newSrs(0) : { ...newSrs(0), reps: 8, interval: 60, last: 1, due: 9e15 } });
  const decks = [
    { courseId: 'c1', cards: [card('new'), card('done')] },
    { courseId: 'c1', cards: [card('done')] },
    { courseId: 'c2', cards: [card('new')] },
  ] as any[];
  const s = courseSummary({ id: 'c1', folders: [1, 2] }, decks, (d) => d.cards.length);
  ok(s.decks === 2 && s.folders === 2 && s.cards === 3 && s.due === 3, 'Kurs-Kennzahlen: Decks, Ordner, Karten, fällig');
  const list = [
    { name: 'Chemie', sum: { decks: 1, folders: 0, cards: 5, mastery: 80, due: 0 } },
    { name: 'Biologie', sum: { decks: 1, folders: 0, cards: 50, mastery: 10, due: 9 } },
    { name: 'Anatomie', sum: { decks: 1, folders: 0, cards: 20, mastery: 40, due: 3 } },
  ];
  ok(sortCourses(list, 'name').map((x) => x.name).join() === 'Anatomie,Biologie,Chemie', 'Sortieren nach Name A–Z');
  ok(sortCourses(list, 'cards').map((x) => x.name).join() === 'Biologie,Anatomie,Chemie', 'nach Karten: größte zuerst');
  ok(sortCourses(list, 'mastery', true)[0].name === 'Biologie' && sortCourses(list, 'due')[0].name === 'Biologie', 'nach Fortschritt (aufsteigend) und Fällig');
}

console.log('Pip auf der Startseite');
{
  const { pokeMove } = await import('../src/lib/pipLines');
  const moves = Array.from({ length: 9 }, (_, n) => pokeMove(n));
  ok(moves.every((m, i) => i === 0 || m !== moves[i - 1]), 'aufeinanderfolgende Klicks: nie zweimal dieselbe Bewegung');
  ok(moves.includes('flip') && moves.includes('cheer') && moves.includes('wave'), 'Salto, Jubeln und Winken sind dabei');
}

console.log('Startseite: Lerntage und Deck-Sortierung');
{
  const { studyDays, sortDecks } = await import('../src/lib/stats');
  const t = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
  const days = studyDays([
    { deckId: 'A', cardId: '1', at: t(12, 9) },
    { deckId: 'A', cardId: '1', at: t(12, 18) },
    { deckId: 'A', cardId: '2', at: t(12, 19) },
    { deckId: 'B', cardId: '1', at: t(13, 8) },
  ]);
  ok(days.get('2026-11-12') === 2 && days.get('2026-11-13') === 1 && !days.has('2026-11-11'), 'Karten je Tag, dieselbe Karte am selben Tag nur einmal');
  const decks = [
    { id: 'a', name: 'Anatomie', createdAt: 3 },
    { id: 'b', name: 'Biologie', createdAt: 1, updatedAt: 9 },
    { id: 'c', name: 'Chemie', createdAt: 5 },
    { id: 'd', name: 'Didaktik', createdAt: 2 },
  ];
  const due: Record<string, number> = { a: 3, b: 0, c: 3, d: 10 };
  const reviews = [{ deckId: 'c', at: 50 }, { deckId: 'a', at: 80 }, { deckId: 'c', at: 20 }];
  ok(sortDecks(decks, 'due', reviews, (d) => due[d.id]).map((d) => d.id).join() === 'd,a,c,b', 'fällig zuerst, Gleichstand nach Name');
  ok(sortDecks(decks, 'studied', reviews, (d) => due[d.id]).map((d) => d.id).join() === 'a,c,b,d', 'zuletzt gelernt, nie gelernte am Ende');
  ok(sortDecks(decks, 'created', reviews, (d) => due[d.id]).map((d) => d.id).join() === 'b,c,a,d', 'zuletzt erstellt bzw. geändert');
}

console.log('Kurs-Dokumente');
{
  const { courseDocs, fileSize } = await import('../src/lib/courseDocs');
  const f = (id: string) => ({ id, name: id + '.pdf', size: 2_400_000 });
  const course = { id: 'c1', folders: [{ id: 'f2', name: 'Zweiter' }, { id: 'f1', name: 'Erster' }] };
  const decks = [
    { id: 'lose', name: 'Lose', courseId: 'c1', files: [f('x')] },
    { id: 'd1', name: 'D1', courseId: 'c1', folderId: 'f1', files: [f('a'), f('b')] },
    { id: 'd2', name: 'D2', courseId: 'c1', folderId: 'f2', files: [f('c')] },
    { id: 'text', name: 'Word-Deck', courseId: 'c1', folderId: 'f1', source: '  Text aus Word  ' },
    { id: 'leer', name: 'Leer', courseId: 'c1' },
    { id: 'fremd', name: 'Fremd', courseId: 'c2', files: [f('z')], source: 'x' },
  ];
  const r = courseDocs(course, decks);
  ok(r.files.map((x) => x.fileId).join() === 'c,a,b,x', 'Reihenfolge wie die Ordner, Decks ohne Ordner zuletzt');
  ok(r.files[0].folder === 'Zweiter' && r.files[3].folder === undefined, 'Ordnername ist dabei');
  ok(r.texts.length === 1 && r.texts[0].deckId === 'text' && r.texts[0].chars === 13, 'Decks nur mit Text in der Textliste');
  ok(!r.files.some((x) => x.fileId === 'z') && !r.texts.some((x) => x.deckId === 'fremd'), 'fremde Kurse sind nicht dabei');
  ok(fileSize(2_400_000) === '2,4 MB' && fileSize(830_000) === '830 KB', 'Dateigröße lesbar');
}

console.log('Mindmap: Ast-Karten und Erklärungs-Kontext');
{
  const { branchCards, explainContext } = await import('../src/lib/related');
  const cards = [
    { front: 'Was ist Wissen nach North?', back: 'vernetzte Information' },
    { front: 'Theoretische Erkenntnisse', back: 'Wissen über Zusammenhänge' },
    { front: 'Praktische Regeln?', back: 'Handlungsanweisungen' },
    { front: 'Fremdes Thema', back: 'nichts' },
  ];
  const g = branchCards(cards, ['Wissen (North et al. 2013)', 'Theoretische Erkenntnisse', 'Praktische Regeln und Handlungsanweisungen']);
  const all = g.flatMap((x) => x.cards);
  ok(all.length === 3 && new Set(all).size === 3, 'Karten der Unterpunkte dabei, keine Dubletten');
  ok(g[0].label.startsWith('Wissen') && g[0].cards[0] === cards[0], 'Karten zum Ast stehen vorn');
  ok(!all.includes(cards[3]), 'Karten ohne Bezug bleiben weg');
  const map = { center: 'KoWi', branches: [{ label: 'Wissen (North et al. 2013)', children: ['Theoretische Erkenntnisse', 'Praktische Regeln und Handlungsanweisungen'] }] };
  const noMat = explainContext({ source: '', cards: [{ front: '<b>Praktische Regeln?</b>', back: 'Handlungs&shy;anweisungen <i>wie</i>' }] }, 'Praktische Regeln und Handlungsanweisungen', 'Wissen (North et al. 2013)', map);
  ok(noMat.includes('Ast „Wissen (North et al. 2013)“') && noMat.includes('KARTEIKARTEN'), 'ohne Material: Mindmap-Ast und Karten sind im Kontext');
  ok(!/<[a-z]/i.test(noMat), 'HTML wird entfernt');
  const withMat = explainContext({ source: 'Einleitung.\n\nPraktische Regeln sagen, wie man handelt.', cards: [] }, 'Praktische Regeln', 'Wissen', undefined);
  ok(withMat.includes('LERNMATERIAL') && withMat.includes('wie man handelt'), 'mit Material: passende Absätze sind dabei');
  const long = explainContext({ source: ('Praktische Regeln ' + 'x'.repeat(300) + '\n\n').repeat(40), cards: [] }, 'Praktische Regeln', '', undefined, 1000);
  ok(long.length <= 1000, 'Längengrenze wird eingehalten');
}

console.log('Globale Suche');
{
  const { searchAll } = await import('../src/lib/search');
  const data = {
    courses: [{ id: 'c1', name: 'Biologie', workspaceId: 'w' }, { id: 'c2', name: 'Chemie', workspaceId: 'w' }],
    decks: [
      { id: 'd1', name: 'Die Zelle', courseId: 'c1', cards: [
        { id: 'k1', front: 'Was ist <b>Osmose</b>?', back: 'Wanderung von Wasser' },
        { id: 'k2', front: 'Zellmembran', back: 'regelt die Osmose und Diffusion' },
        { id: 'k3', front: 'Mitose', back: 'Kernteilung' },
      ] },
      { id: 'd2', name: 'Osmose kompakt', courseId: 'c1', cards: Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, front: 'Osmose ' + i, back: '' })) },
    ],
  };
  const r = searchAll(data, 'OSMOSE', { cards: 5, other: 6 });
  ok(r.some((h) => h.kind === 'deck' && h.id === 'd2'), 'findet Decks nach Namen (ohne Groß-/Kleinschreibung)');
  const cards = r.filter((h) => h.kind === 'card');
  ok(cards.length === 5, 'hält die Höchstzahl für Karten ein');
  ok(cards[0].id === 'k1' && cards[0].title === 'Was ist Osmose?', 'Treffer in der Frage zuerst, HTML entfernt');
  ok(searchAll(data, 'biologie').some((h) => h.kind === 'course' && h.id === 'c1'), 'findet Kurse');
  const both = searchAll(data, 'osmose diffusion');
  ok(both.length === 1 && both[0].id === 'k2', 'alle Wörter müssen vorkommen (auch in der Antwort)');
  ok(searchAll(data, '   ').length === 0, 'leere Suche liefert nichts');
}

console.log('Prüfungs-Prognose');
{
  const { examForecast, forecastText } = await import('../src/lib/exams');
  const D = 86_400_000;
  const now = new Date(2026, 10, 15, 12).getTime();
  const fresh = (id: string) => ({ id, srs: { ...newSrs(0) } });
  const mastered = (id: string) => ({ id, srs: { ...newSrs(0), reps: 8, interval: 60, last: now - D, due: now + 60 * D } });
  const cards = Array.from({ length: 10 }, (_, i) => fresh('c' + i)); // 10 × 4 = 40 reviews of work
  const revs = (perDay: number, days: number) =>
    Array.from({ length: days }, (_, d) => Array.from({ length: perDay }, () => ({ cardId: 'c0', at: now - d * D }))).flat();
  const ok1 = examForecast(cards, revs(10, 14), now + 10 * D, now);
  ok(ok1.kind === 'ok' && Math.round((ok1.at - new Date(2026, 10, 15).getTime()) / D) === 4, 'normales Tempo: 40 Wiederholungen bei 10 pro Tag → in 4 Tagen');
  const late = examForecast(cards, revs(2, 14), now + 5 * D, now);
  ok(late.kind === 'late' && late.perDay === 2 && late.needPerDay === 8, 'zu langsam: „nach der Prüfung“ mit nötigem Pensum (8 statt 2)');
  ok(forecastText(late).includes('täglich etwa 8 Wiederholungen (bisher 2 pro Tag)') && forecastText(late).includes('nach der Prüfung'), 'Text nennt das Pensum');
  ok(forecastText({ kind: 'late', at: 0, perDay: 0.3, needPerDay: 26 }).includes('(bisher weniger als 1 pro Tag)'), 'unter 1 pro Tag: „weniger als 1“ statt 0');
  ok(examForecast(cards, [], now + 5 * D, now).kind === 'none', 'ohne Lernaktivität keine Prognose');
  ok(examForecast([mastered('m')], revs(5, 3), now + 5 * D, now).kind === 'done', 'alles gemeistert: fertig');
  const recent = examForecast(cards, revs(10, 2), now + 10 * D, now);
  ok(recent.kind === 'ok' && recent.perDay === 10, 'Tempo zählt erst ab dem ersten Lerntag');
}

console.log('Rückgängig');
{
  const { withoutReview } = await import('../src/lib/newCards');
  const r = [
    { deckId: 'A', cardId: '1', at: 5 },
    { deckId: 'A', cardId: '1', at: 9 },
    { deckId: 'B', cardId: '1', at: 9 },
  ];
  const out = withoutReview(r, 'A', '1', 9);
  ok(out.length === 2 && out[0].at === 5 && out[1].deckId === 'B', 'entfernt genau den einen Eintrag');
  ok(withoutReview(r, 'A', '1', 7) === r, 'unbekannter Eintrag: nichts ändert sich');
}

console.log('Dropbox: Anmeldung mit Code');
{
  const { dropboxCodeUrl, dropboxCodeBody } = await import('../src/lib/dropboxAuth');
  const u = new URL(dropboxCodeUrl(' abc123 ', 'CHAL'));
  ok(u.origin + u.pathname === 'https://www.dropbox.com/oauth2/authorize', 'Dropbox-Anmeldeseite');
  ok(!u.searchParams.has('redirect_uri'), 'ohne Rücksprung-Adresse (Dropbox zeigt einen Code)');
  ok(u.searchParams.get('code_challenge') === 'CHAL' && u.searchParams.get('code_challenge_method') === 'S256', 'PKCE mit S256');
  ok(u.searchParams.get('token_access_type') === 'offline' && u.searchParams.get('client_id') === 'abc123', 'dauerhafte Anmeldung, App-Key ohne Leerzeichen');
  const b = dropboxCodeBody('abc123', '  xyz ', 'VER');
  ok(b.get('code') === 'xyz' && b.get('code_verifier') === 'VER' && !b.has('redirect_uri') && b.get('grant_type') === 'authorization_code', 'Code-Tausch ohne Rücksprung-Adresse');
  const { looksLikeDropboxCode } = await import('../src/lib/dropboxAuth');
  ok(looksLikeDropboxCode('sDfG8hJkL0qWeRtYuIoP_a-bCdEfGh12') && looksLikeDropboxCode('\n  sDfG8hJkL0qWeRtYuIoP_a-bC \n'), 'eingefügter Code (auch mit Leerzeichen/Umbruch drumherum) wird erkannt');
  ok(!looksLikeDropboxCode('abc123') && !looksLikeDropboxCode('https://www.dropbox.com/oauth2') && !looksLikeDropboxCode('zwei Wörter im Code hier drin'), 'zu kurz, Adresse oder Text → kein automatisches Verbinden');
}

console.log('Handy: Wischen beim Lernen');
{
  const { swipeRating } = await import('../src/lib/phone');
  ok(swipeRating(-120, 10) === 1 && swipeRating(130, -20) === 3, 'links = Nochmal, rechts = Gut');
  ok(swipeRating(30, 0) === null, 'kurze Bewegung zählt als Tippen');
  ok(swipeRating(90, 80) === null, 'eher senkrechte Bewegung (Scrollen) bewertet nicht');
}

console.log('Android-Update: Versionen vergleichen');
{
  const { isNewerVersion, apkUrl } = await import('../src/lib/androidUpdate');
  ok(isNewerVersion('0.9.10', '0.9.9') && !isNewerVersion('0.9.9', '0.9.10'), 'mehrstellige Teile richtig verglichen');
  ok(!isNewerVersion('0.9.0', '0.9.0') && !isNewerVersion('v0.9.0', '0.9.0'), 'gleiche Version ist nicht neuer, „v“ wird ignoriert');
  ok(isNewerVersion('1.0.0', '0.99.99') && isNewerVersion('0.9.1', '0.9'), 'größere Hauptversion und zusätzliche Stelle');
  ok(apkUrl('0.9.1') === 'https://github.com/Bobanes1/Merkora/releases/download/v0.9.1/Merkora_0.9.1_android.apk', 'APK-Adresse passt zum Release');
}

console.log('KI-Antworten reparieren');
{
  const { repairJson } = await import('../src/lib/jsonRepair');
  const r = (t: string) => repairJson(t) as any;
  ok(r('Hier ist das JSON:\n```json\n{"cards":[{"front":"A","back":"B"}]}\n```\nViel Erfolg!')?.cards?.length === 1, 'Text und Codeblock drumherum');
  ok(r('{"cards":[{"front":"A","back":"Zeile 1\nZeile 2"}]}')?.cards?.[0]?.back === 'Zeile 1\nZeile 2', 'Zeilenumbruch in einem Text');
  ok(r('{"cards":[{"front":"A","back":"B",},]}')?.cards?.length === 1, 'überzählige Kommas');
  const cut = r('{"cards":[{"front":"A","back":"B"},{"front":"C","back":"D"},{"front":"E","ba');
  ok(cut?.cards?.length === 3 && cut.cards[1].back === 'D' && cut.cards[2].front === 'E' && cut.cards[2].back === undefined, 'abgeschnittene Antwort: fertige Karten bleiben, halbe ohne Antwort');
  const cut2 = r('{"cards":[{"front":"A","back":"B"},{"front":"C","back":"Hallo Wel');
  ok(cut2?.cards?.length >= 1 && cut2.cards[0].back === 'B', 'mitten im Text abgeschnitten');
  ok(r('{"title":"Prüfung","questions":[{"q":"1"},{"q":"2"}]} und noch etwas {x}')?.questions?.length === 2, 'Text nach dem JSON wird ignoriert');
  ok(repairJson('Keine Ahnung.') === null, 'ohne JSON: nichts');
  ok(r('{"a":"Er sagte \\"Hallo\\" und ging"}')?.a === 'Er sagte "Hallo" und ging', 'maskierte Anführungszeichen bleiben');
}

console.log('Formeln und neue Grafiken');
{
  const { compileExpr, sampleCurve } = await import('../src/lib/plotExpr');
  const f = (s: string, x = 0) => compileExpr(s)?.(x);
  ok(f('1 + 2*3') === 7 && f('2^3^2') === 512 && f('-2^2') === -4 && f('(1+2)*3') === 9, 'Formel: Punkt vor Strich, Potenz, Klammern');
  ok(f('2x', 3) === 6 && f('3(x+1)', 1) === 6 && Math.abs(f('2pi')! - 2 * Math.PI) < 1e-12, 'Formel: 2x, 3(x+1), 2pi');
  ok(Math.abs(f('exp(-x^2/2)/sqrt(2*pi)')! - 0.3989422804) < 1e-9 && f('ln(e)') === 1 && f('log(1000)') === 3 && f('max(1, x)', 4) === 4 && f('10 − 0,5·x', 2) === 9, 'Formel: Funktionen, pi, e, Komma und Sonderzeichen');
  ok(compileExpr('alert(1)') === null && compileExpr('y + 1') === null && compileExpr('constructor') === null && compileExpr('(1+2') === null && compileExpr('') === null && compileExpr('x'.repeat(201)) === null, 'Formel: Ungültiges und Fremdes wird abgelehnt');
  const pts = sampleCurve(compileExpr('ln(x)')!, -1, 1, 4);
  ok(pts.length === 5 && pts[0] === null && pts[4]!.y === 0, 'Kurve: Lücken, wo die Formel keinen Wert hat');

  const { parseDiagram, layoutDiagram, renderDiagram, PALETTES, DIAGRAM_KINDS, niceTicks } = await import('../src/lib/diagram');
  ok(JSON.stringify(niceTicks(0, 10)) === '[0,2,4,6,8,10]' && JSON.stringify(niceTicks(0, 1)) === '[0,0.2,0.4,0.6,0.8,1]', 'Teilstriche auf runden Werten');
  const hit = (a: any, b: any) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  const long = 'Ein ziemlich langer Begriff zur Sache';
  const news = [
    { type: 'plot', title: 'Angebot und Nachfrage', x: { label: 'Menge', min: 0, max: 10 }, y: { label: 'Preis', min: 0, max: 10 }, functions: [{ label: 'Nachfrage', expr: '10 - x' }, { label: 'Angebot', expr: '1 + 0.8*x' }], points: [{ x: 5, label: 'Gleichgewicht' }] },
    { type: 'plot', title: 'Normalverteilung', x: { label: 'z', min: -3, max: 3 }, y: { label: 'Dichte', min: 0, max: 0.45 }, functions: [{ label: '', expr: 'exp(-x^2/2)/sqrt(2*pi)' }] },
    { type: 'plot', x: { label: 'x', min: 0.1, max: 5 }, y: { label: 'y', min: -2, max: 2 }, functions: [{ label: 'ln', expr: 'ln(x)' }, { label: '1/x', expr: '1/x' }, { label: 'sin', expr: 'sin(x)' }] },
    { type: 'pie', title: 'Stimmanteile', slices: [{ label: 'Partei A', value: 32 }, { label: 'Partei B', value: 27 }, { label: long, value: 18 }, { label: 'Andere', value: 23 }] },
    { type: 'fishbone', title: 'Warum sinkt die Motivation?', effect: 'Geringe Motivation', causes: [{ label: 'Umfeld', items: ['Lärm', 'keine Ruhe'] }, { label: 'Person', items: ['Müdigkeit', long, 'Stress'] }, { label: 'Aufgabe', items: ['zu schwer'] }, { label: 'Methode', items: ['kein Plan', 'monoton'] }, { label: 'Zeit', items: ['Termindruck'] }] },
    { type: 'numberline', title: 'pH-Skala', min: 0, max: 14, marks: [{ value: 1, label: 'Magensäure' }, { value: 7, label: 'Wasser' }, { value: 8.3, label: 'Meerwasser' }, { value: 13, label: 'Natronlauge' }], ranges: [{ from: 0, to: 7, label: 'sauer' }, { from: 7, to: 14, label: 'basisch' }] },
    { type: 'numberline', min: 1, max: 6, marks: [{ value: 4, label: 'genügend' }] },
    { type: 'network', title: 'Lernen', nodes: ['Motivation', 'Aufmerksamkeit', 'Gedächtnis', 'Emotion', 'Schlaf'], links: [{ from: 'Motivation', to: 'Aufmerksamkeit', label: 'lenkt' }, { from: 'Emotion', to: 'Gedächtnis', label: 'verstärkt' }, { from: 'Schlaf', to: 'Gedächtnis', label: 'festigt' }, { from: 'aufmerksamkeit', to: 'Gedächtnis' }] },
    { type: 'network', nodes: ['A', 'B', 'C'], links: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }] },
  ];
  for (const raw of news) {
    const d = parseDiagram(raw)!;
    if (!d) { ok(false, raw.type + ': wird erkannt'); continue; }
    const L = layoutDiagram(d);
    const real = L.boxes.filter((b) => b.lines.length);
    const outside = real.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > L.width + 0.5 || b.y + b.h > L.height + 0.5);
    const pairs: string[] = [];
    real.forEach((a, k) => real.slice(k + 1).forEach((b) => { if (hit(a, b)) pairs.push(a.lines[0] + ' / ' + b.lines[0]); }));
    const svg = renderDiagram(d, PALETTES.dark);
    ok(outside.length === 0 && pairs.length === 0 && /^<svg/.test(svg) && !svg.includes('NaN'), d.type + (d.title ? ' „' + d.title + '“' : '') + ': nichts überlappt oder ragt hinaus' + (pairs.length ? ' [' + pairs.join('; ') + ']' : '') + (outside.length ? ' [außen: ' + outside.map((b) => b.lines[0]).join(', ') + ']' : ''));
  }
  const sd = layoutDiagram(parseDiagram(news[0])!);
  ok(sd.lines.filter((l) => !l.muted && !l.arrow && l.pts.length > 50).length === 2 && sd.areas.some((a) => a.circle), 'Kurve: zwei exakte Linien und ein markierter Gleichgewichtspunkt');
  const gw = sd.areas.find((a) => a.circle)!.circle!;
  ok(Math.abs(gw[0] - (62 + (600 - 16 - 12 - 62) / 2)) < 0.5, 'Kurve: Punkt liegt genau bei x = 5');
  ok(parseDiagram({ type: 'plot', x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, functions: [{ expr: 'alert(1)' }] }) === null, 'Kurve mit fremdem Code → keine Grafik');
  ok(parseDiagram({ type: 'plot', x: { min: 5, max: 1 }, y: { min: 0, max: 1 }, functions: [{ expr: 'x' }] }) === null, 'Kurve mit verkehrter Achse → keine Grafik');
  ok(parseDiagram({ type: 'pie', slices: [{ label: 'nur', value: 1 }] }) === null && parseDiagram({ type: 'pie', slices: [{ label: 'a', value: '40' }, { label: 'b', value: '60,5' }] }) !== null, 'Kreisdiagramm braucht zwei Anteile; Zahlen als Text gehen');
  ok(parseDiagram({ type: 'fishbone', effect: 'X', causes: ['nur eins'] }) === null, 'Ishikawa braucht zwei Ursachen');
  ok(parseDiagram({ type: 'numberline', min: 0, max: 10, marks: [{ value: 20, label: 'außerhalb' }] }) === null, 'Zahlenstrahl ohne gültige Marke → keine Grafik');
  const net = parseDiagram(news[7]) as any;
  ok(net.links.length === 4 && net.links[3].from === 'Aufmerksamkeit' && !('label' in net.links[3]), 'Begriffsnetz: Namen werden zugeordnet, leere Beschriftung fällt weg');
  ok(['plot', 'pie', 'fishbone', 'numberline', 'network'].every((t) => DIAGRAM_KINDS.some((k) => k.id === t)), 'neue Formen stehen in der Grafik-Auswahl');
  const again = parseDiagram(JSON.parse(JSON.stringify(parseDiagram(news[0]))));
  ok(JSON.stringify(again) === JSON.stringify(parseDiagram(news[0])), 'gespeicherte Kurve wird gleich gelesen');
}

console.log('Dateien ansehen');
{
  const { zipSync, strToU8 } = await import('fflate');
  const { docxHtml, pptxSlides, csvRows } = await import('../src/lib/officeHtml');
  const { fileKind } = await import('../src/lib/fileKind');
  ok(fileKind('a.PDF') === 'pdf' && fileKind('b.docx') === 'word' && fileKind('c.pptx') === 'powerpoint' && fileKind('d.md') === 'markdown' && fileKind('e.csv') === 'csv' && fileKind('x', 'application/pdf') === 'pdf' && fileKind('f.exe') === 'other', 'Dateiart wird erkannt');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<w:document ${W}><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kapitel 1</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>fett</w:t></w:r><w:r><w:t xml:space="preserve"> und </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>kursiv &lt;script&gt;</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Punkt A</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Zelle 1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Zelle 2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`;
  const html = docxHtml({ 'word/document.xml': strToU8(doc) } as any);
  ok(/<h\d[^>]*>Kapitel 1<\/h\d>/.test(html) && /<b>fett<\/b>/.test(html) && /<i>kursiv &lt;script&gt;<\/i>/.test(html), 'Word: Überschrift, fett, kursiv; Text bleibt escaped');
  ok(/<li[^>]*>Punkt A<\/li>/.test(html) && /<td[^>]*>.*Zelle 1/.test(html.replace(/\n/g, '')) && !html.includes('<script>'), 'Word: Listen und Tabellen');
  const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const slide = (title: string, pts: string[]) => strToU8(`<p:sld ${A}><p:cSld><p:spTree>
    ${title ? `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>` : ''}
    <p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${pts.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`);
  const slides = pptxSlides({ 'ppt/slides/slide10.xml': slide('Zehn', ['z']), 'ppt/slides/slide2.xml': slide('Zwei', ['a', 'b']), 'ppt/slides/slide1.xml': slide('', []) } as any);
  ok(slides.length === 3 && slides[1].title === 'Zwei' && slides[2].title === 'Zehn' && slides[1].points.map((p) => p.text).join() === 'a,b', 'PowerPoint: Folien in richtiger Reihenfolge, Titel und Punkte getrennt');
  ok(slides[0].n === 1 && !slides[0].title && slides[0].points.length === 0, 'PowerPoint: leere Folie zählt mit');
  void zipSync;
  const rows = csvRows('Name;Note\n"Meier, Anna";5,5\n"Zitat ""x""";4');
  ok(rows.length === 3 && rows[1][0] === 'Meier, Anna' && rows[1][1] === '5,5' && rows[2][0] === 'Zitat "x"', 'CSV: Trennzeichen und Anführungszeichen');

  const { searchAll } = await import('../src/lib/search');
  const sdata = { courses: [{ id: 'c', name: 'Bio' }], decks: [{ id: 'd', name: 'Zelle', courseId: 'c', cards: [], files: [{ id: 'f1', name: 'Skript Zellbiologie.pdf', size: 1, addedAt: 0 }, { id: 'f2', name: 'Folien.pptx', size: 1, addedAt: 0 }] }] } as any;
  const fh = searchAll(sdata, 'zellbio');
  ok(fh.length === 1 && fh[0].kind === 'file' && fh[0].id === 'f1' && (fh[0] as any).deckId === 'd', 'Suche findet Dateien nach Namen');
  const { courseDocs } = await import('../src/lib/courseDocs');
  const cd = courseDocs({ id: 'c' }, [{ id: 'd', name: 'Zelle', courseId: 'c', files: [{ id: 'w', name: 'a.docx', size: 1, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, { id: 't', name: 'b.txt', size: 1, type: 'text/plain' }] }]);
  ok(cd.files.length === 2 && cd.files[0].type!.includes('word'), 'Kurs-Dokumente zeigen auch Word- und Textdateien');
}

console.log('Grafik beim Lernen abfragen');
{
  const { parseDiagram, diagramLabels, hideLabel, renderDiagram, PALETTES, graphicQuiz, withDiagramView, diagramHtml } = await import('../src/lib/diagram');
  const flow = parseDiagram({ type: 'flow', title: 'Ablauf', steps: ['Planung', 'Erhebung', 'Auswertung', 'Bericht'] })!;
  const labels = diagramLabels(flow);
  ok(labels.join('|') === 'Planung|Erhebung|Auswertung|Bericht', 'Beschriftungen einer Grafik (ohne Titel): ' + labels.join('|'));
  const longWord = parseDiagram({ type: 'flow', steps: ['Operationalisierungsverfahrensbeschreibung', 'B c', 'D e'] })!;
  ok(diagramLabels(longWord)[0] === 'Operationalisierungsverfahrensbeschreibung', 'umbrochene Wörter werden wieder zusammengesetzt');
  const h = hideLabel(flow, 1)!;
  ok(h.label === 'Erhebung' && hideLabel(flow, 9) === null, 'hideLabel: richtige Beschriftung, ungültige Nummer → nichts');
  const svg = renderDiagram(flow, PALETTES.light, h.front);
  ok((svg.match(/class="dg-hidden"/g) ?? []).length === 1 && !svg.includes('>Erhebung<') && svg.includes('>Planung<') && svg.includes('>?<'), 'genau ein Feld ist verdeckt, die anderen bleiben sichtbar');
  const back = renderDiagram(flow, PALETTES.dark, h.back);
  ok((back.match(/class="dg-reveal"/g) ?? []).length === 1 && back.includes('>Erhebung<'), 'beim Umdrehen ist die Lösung markiert');
  const st = renderDiagram(flow, PALETTES.light, { steps: true });
  ok((st.match(/class="dg-step"/g) ?? []).length >= 4 && st.includes('animation-delay:0.15s'), 'Ablauf baut sich Schritt für Schritt auf');
  ok(!renderDiagram(parseDiagram({ type: 'bars', bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] })!, PALETTES.light, { steps: true }).includes('dg-step'), 'andere Formen erscheinen auf einmal');
  const ans = 'Die Schritte<br>' + diagramHtml(flow);
  const q = graphicQuiz(ans, 6)!;
  ok(!!q && q.label === labels[6 % 4] && q.graphic.includes('data-view="{&quot;hide&quot;:2}"') && q.answer.includes('data-view="{&quot;reveal&quot;:2}"') && q.answer.startsWith('Die Schritte'), 'Abfrage: Frage mit verdecktem Feld, Antwort mit markierter Lösung');
  ok(graphicQuiz('nur Text', 1) === null && graphicQuiz(diagramHtml(parseDiagram({ type: 'compare', columns: [{ title: 'A', items: [] }, { title: 'B', items: [] }] })!), 1) === null, 'ohne Grafik oder mit zu wenig Beschriftungen keine Abfrage');
  ok(withDiagramView(ans + ans, { steps: true }).split('data-view=').length === 3 && withDiagramView(ans + ans, { steps: true }, true).split('data-view=').length === 2, 'Ansicht für alle oder nur die erste Grafik');
  const { repairMath, emphasisHtml } = await import('../src/lib/emphasis');
  const mangled = JSON.parse('"Varianz: \\\\( s^2 = \\frac{1}{n} \\\\) und \\\\( \\theta \\\\)"');
  ok(repairMath(mangled) === 'Varianz: \\( s^2 = \\frac{1}{n} \\) und \\( \\theta \\)', 'Formel: im JSON verschluckte Backslashes kommen zurück');
  ok(emphasisHtml('a\nb \\( x < 1 \\)') === 'a<br>b \\( x &lt; 1 \\)', 'Formel bleibt im Karten-HTML erhalten');
  const { repairJson } = await import('../src/lib/jsonRepair');
  const r = repairJson('{"back":"\\( a \\) und **b**",') as any;
  ok(r && r.back === '\\( a \\) und **b**', 'JSON-Reparatur behält LaTeX-Backslashes');
}

console.log('Folien-Bilder für die KI');
{
  // the app's store reads browser storage when loaded: a small stand-in for these tests
  if (typeof (globalThis as any).localStorage === 'undefined') {
    const mem = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
    (globalThis as any).sessionStorage = (globalThis as any).localStorage;
  }
  const { providerMessages, supportsImages, imagesRejected, cardsPrompt, AiError, rememberVision } = await import('../src/lib/ai');
  const img = 'data:image/jpeg;base64,QUJD';
  const msgs = [{ role: 'user' as const, content: 'Text', images: [img] }, { role: 'assistant' as const, content: 'ok', images: [img] }];
  const oa = providerMessages('openai', msgs) as any[];
  ok(Array.isArray(oa[0].content) && oa[0].content[0].type === 'text' && oa[0].content[1].image_url.url === img && oa[1].content === 'ok', 'OpenAI/OpenRouter: Bild als image_url, nur bei Nutzer-Nachrichten');
  const an = providerMessages('anthropic', msgs) as any[];
  ok(an[0].content[0].type === 'image' && an[0].content[0].source.data === 'QUJD' && an[0].content[0].source.media_type === 'image/jpeg' && an[0].content[1].text === 'Text', 'Claude: Bild als base64-Block vor dem Text');
  const ge = providerMessages('gemini', msgs) as any[];
  ok(ge[0].parts[0].inline_data.data === 'QUJD' && ge[0].parts[1].text === 'Text' && ge[1].role === 'model' && ge[1].parts.length === 1, 'Gemini: inline_data');
  ok((providerMessages('openai', [{ role: 'user', content: 'nur Text' }]) as any[])[0].content === 'nur Text', 'ohne Bilder bleibt die Nachricht reiner Text');
  ok(supportsImages({ provider: 'anthropic', model: 'x' }) && supportsImages({ provider: 'gemini', model: 'y' }), 'Claude und Gemini lesen Bilder');
  ok(supportsImages({ provider: 'openai', model: 'gpt-4o-mini' }) && supportsImages({ provider: 'openai', model: 'gpt-5' }) && !supportsImages({ provider: 'openai', model: 'gpt-3.5-turbo' }), 'OpenAI je nach Modell');
  ok(!supportsImages({ provider: 'custom', model: 'llama' }, false) && supportsImages({ provider: 'custom', model: 'llama' }, true), 'eigener Server nur mit Haken');
  ok(supportsImages({ provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free' }) && !supportsImages({ provider: 'openrouter', model: 'deepseek/deepseek-chat' }), 'OpenRouter ohne Liste: nach dem Namen');
  rememberVision([{ id: 'deepseek/deepseek-chat', architecture: { input_modalities: ['text'] } }, { id: 'foo/bar', architecture: { input_modalities: ['text', 'image'] } }]);
  ok(supportsImages({ provider: 'openrouter', model: 'foo/bar' }) && !supportsImages({ provider: 'openrouter', model: 'deepseek/deepseek-chat' }), 'OpenRouter: Angaben aus der Modellliste zählen');
  ok(imagesRejected(new AiError('No endpoints found that support image input')) && !imagesRejected(new AiError('Der API-Key wurde abgelehnt (invalid image key).')) && !imagesRejected(new Error('image')), 'abgelehnte Bilder werden erkannt');
  const withSlides = cardsPrompt('Material', 5, '', true, undefined, false, ['Folie 3 aus a.pdf', 'Folie 9 aus a.pdf']);
  ok(withSlides.system.includes('Angehängt sind Bilder') && withSlides.user.includes('Bild 1 = Folie 3 aus a.pdf; Bild 2 = Folie 9 aus a.pdf'), 'Prompt nennt die angehängten Folien');
  const plain = cardsPrompt('Material', 5, '', true);
  ok(!plain.system.includes('Angehängt sind Bilder') && plain.system.includes('etwa jeder dritten Karte') && plain.system.includes('"diagram":{"type":"scene"') && !plain.system.includes('(optional)'), 'Grafik-Ziel im Prompt, Bilder-Hinweis nur mit Bildern');
  ok(plain.maxTokens === 400 + 5 * 500, 'mehr Platz pro Karte mit Grafik');

  const { slidesInPart } = await import('../src/lib/slideImages');
  const part = 'x\n[Abbildung 1 – Folie 3 aus V1.pdf]\nText\n[Abbildung 2 – Folie 7 aus V 2.pdf]\n[Abbildung 1 – Folie 3 aus V1.pdf]\n' + Array.from({ length: 12 }, (_, i) => `[Abbildung ${i + 3} – Folie ${i + 10} aus V1.pdf]`).join('\n');
  const sl = slidesInPart(part);
  ok(sl.length === 6 && sl[0].file === 'V1.pdf' && sl[0].page === 3 && sl[1].file === 'V 2.pdf' && sl[1].page === 7 && sl.filter((x) => x.page === 3).length === 1, 'Folien eines Teils: in Reihenfolge, ohne Doppelte, höchstens 6');
  ok(slidesInPart('kein Marker').length === 0, 'ohne markierte Folien keine Bilder');
}

console.log('Grafiken: tolerantes Lesen');
{
  const { parseDiagram, normalizeDiagram } = await import('../src/lib/diagram');
  const { parseCards } = await import('../src/lib/ai');
  ok(parseDiagram('{"type":"flow","steps":["A","B","C"]}')?.type === 'flow', 'Grafik als JSON-Text');
  ok(parseDiagram({ diagram: { type: 'cycle', steps: ['A', 'B', 'C'] } })?.type === 'cycle', 'doppelt verpackte Grafik');
  ok(parseDiagram({ type: 'Ablauf', steps: ['A', 'B'] })?.type === 'flow' && parseDiagram({ type: 'Kreisdiagramm', slices: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] })?.type === 'pie' && parseDiagram({ type: 'ishikawa', effect: 'X', causes: [{ label: 'a', items: [] }, { label: 'b', items: [] }] })?.type === 'fishbone', 'andere Namen für die Formen');
  ok((normalizeDiagram({ type: 'kurve', x: 'Zeit', y: 'Wert', shape: 'steigend' }) as any).type === 'axes', 'Kurve ohne Formel bleibt eine Skizze');
  ok(normalizeDiagram('kein json') === null && parseDiagram({ type: 'unbekannt' }) === null, 'Unlesbares → keine Grafik');
  const cards = parseCards('{"cards":[{"front":"F","back":"A","diagram":"{\\"type\\":\\"flow\\",\\"steps\\":[\\"a\\",\\"b\\"]}"}]}');
  ok(typeof cards[0].diagram === 'string' && parseDiagram(cards[0].diagram)?.type === 'flow', 'Karte mit Grafik als Text behält die Grafik');
  const { madeText } = await import('../src/lib/jobs');
  ok(madeText(12, 4) === '12 Karten, davon 4 mit Grafik' && madeText(1, 0) === '1 Karte', 'Meldung zählt die Grafiken');
}

console.log('Handy: Update und Synchronisieren');
{
  const { afterInstallAnswer } = await import('../src/lib/androidUpdate');
  ok(afterInstallAnswer('ok').status === 'installing' && afterInstallAnswer('timeout').status === 'installing' && afterInstallAnswer('permission').status === 'permission', 'Installer gestartet / Erlaubnis nötig');
  const e = afterInstallAnswer('error: No Activity found');
  ok(e.status === 'error' && e.error === 'Android konnte den Installer nicht öffnen: No Activity found', 'Fehler beim Öffnen wird angezeigt');
  const { errorText } = await import('../src/lib/sync');
  ok(errorText('Keine Daten erhalten.') === 'Keine Daten erhalten.' && errorText(new Error('x')) === 'x' && errorText(undefined) === '', 'Fehler als Text (auch wenn Tauri nur Text liefert)');
}

console.log('Abgeschnittene Antworten und Fortsetzung');
{
  const { repairJsonInfo, repairJson } = await import('../src/lib/jsonRepair');
  const full = '{"cards":[{"front":"A","back":"a"},{"front":"B","back":"b"}]}';
  ok(repairJsonInfo(full)?.cut === false && (repairJsonInfo(full)?.value as any).cards.length === 2, 'vollständige Antwort: nicht abgeschnitten');
  const cutText = '{"cards":[{"front":"A","back":"a"},{"front":"B","back":"b"},{"front":"C","back":"c"},{"front":"D","ba';
  const c = repairJsonInfo(cutText);
  ok(c?.cut === true && (c.value as any).cards.filter((x: any) => x.back).length === 3, 'abgeschnittene Antwort: die 3 vollständigen Karten bleiben, als abgeschnitten erkannt');
  const chatty = 'Auf [Bild 1] sieht man ein Modell, auf {Folie 3} eine Tabelle.\n\n```json\n' + full + '\n```';
  ok(((repairJson(chatty, 'cards') as any)?.cards?.length ?? 0) === 2, 'JSON wird auch nach einer Beschreibung mit Klammern gefunden');
  ok(((repairJson('{"note":"x"} und dann ' + full, 'cards') as any)?.cards?.length ?? 0) === 2, 'von zwei JSON-Blöcken zählt der mit "cards"');

  const { parseCardsInfo, wasCut, cardsPrompt } = await import('../src/lib/ai');
  ok(parseCardsInfo(chatty).cards.length === 2 && parseCardsInfo(chatty).cut === false, 'Karten aus einer Antwort mit Vortext');
  const pc = parseCardsInfo(cutText, false);
  ok(pc.cut && pc.cards.length === 3, 'Karten einer abgeschnittenen Antwort');
  ok(parseCardsInfo('{"cards":[{"front":"A","ba', false).cards.length === 0, 'abgeschnitten vor der ersten Karte: keine Karte, aber kein Abbruch');
  ok(wasCut('openai', { choices: [{ finish_reason: 'length' }] }) && !wasCut('openai', { choices: [{ finish_reason: 'stop' }] }), 'OpenAI/OpenRouter: Längenlimit erkannt');
  ok(wasCut('anthropic', { stop_reason: 'max_tokens' }) && !wasCut('anthropic', { stop_reason: 'end_turn' }), 'Claude: Längenlimit erkannt');
  ok(wasCut('gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] }) && !wasCut('gemini', { candidates: [{ finishReason: 'STOP' }] }), 'Gemini: Längenlimit erkannt');
  const more = cardsPrompt('Material', 0, '', true, { i: 1, n: 1, more: true, avoid: ['Was ist A?', 'Was ist B?'] });
  ok(more.user.includes('abgeschnitten') && more.user.includes('- Was ist A?') && !more.user.includes('Dies ist Teil'), 'Fortsetzung nennt die schon vorhandenen Fragen');
  const few = cardsPrompt('Material', 0, '', true, { i: 2, n: 3, few: true, avoid: ['X?'] });
  ok(few.user.includes('mehr prüfungsrelevante Inhalte') && few.user.split('- X?').length === 2, 'zweiter Versuch bei zu wenigen Karten, Fragen nur einmal genannt');

  const { followUp } = await import('../src/lib/jobs');
  const long = 'x'.repeat(16000);
  ok(followUp({ text: 'kurz' }, 5, true) === 'more' && followUp({ text: 'kurz', more: 3 }, 5, true) === null, 'Fortsetzung bei abgeschnittener Antwort (höchstens 3-mal)');
  ok(followUp({ text: long }, 1, false) === 'few' && followUp({ text: long, few: true }, 1, false) === null && followUp({ text: 'kurz' }, 1, false) === null && followUp({ text: long, count: 5 }, 1, false) === null, 'viel Material, kaum Karten: einmal nachfragen');

  const { dropDuplicates } = await import('../src/lib/chunks');
  const kept = dropDuplicates(
    [{ front: 'Was ist Osmose?' }, { front: 'Was ist <b>Osmose</b>' }, { front: 'Was beschreibt das Modell von Lasswell genau?' }, { front: 'Was beschreibt das Modell von Lasswell genau' }, { front: 'Was ist Diffusion?' }],
    ['Was ist Diffusion ?'],
  );
  ok(kept.map((c) => c.front).join('|') === 'Was ist Osmose?|Was beschreibt das Modell von Lasswell genau?', 'doppelte Karten aus gleichzeitig laufenden Teilen fallen weg');
  ok(
    dropDuplicates([{ front: 'Teil 2 Frage 1' }, { front: 'Teil 1 Frage 2' }, { front: 'Welche Rolle spielt die Agenda-Setting-Theorie für die Medienwirkung heute' }, { front: 'Welche Rolle spielt die Agenda-Setting-Theorie für die Medienwirkung heute noch?' }], []).length === 3,
    'gleiche Wörter in anderer Reihenfolge sind verschiedene Fragen, ein Wort mehr am Ende bleibt doppelt',
  );

  const { helpfulSlides } = await import('../src/lib/slideImages');
  ok(helpfulSlides(['Titel', 'x'.repeat(400), 'Modell', ''], [1, 2, 3, 4]).join() === '1,3,4', 'Bilder nur für Grafik-Folien mit wenig Text');
}

console.log('Handy: Dateien als Text übertragen');
{
  const { toBase64, fromBase64 } = await import('../src/lib/desktop');
  const bytes = new Uint8Array(70000).map((_, i) => (i * 37) % 256);
  const back = fromBase64(toBase64(bytes));
  ok(back.length === bytes.length && back.every((b, i) => b === bytes[i]), 'Datei kommt als Text hin und zurück unverändert an (auch große Dateien)');
}

console.log('Gleichzeitige Teile: Anzeige');
{
  const { runProgress } = await import('../src/lib/jobs');
  const j = (i: number, status: string, created: number, more = 0) => ({ id: `${i}-${more}`, kind: 'cards', deckId: 'd', title: '', status, createdAt: created, params: { run: 'r', part: { i, n: 2 }, ...(more ? { more } : {}) } }) as any;
  const jobs = [j(1, 'running', 100), j(2, 'running', 101)];
  const p = runProgress(jobs, jobs[1])!;
  ok(p.n === 2 && p.done === 0 && p.running === 2 && p.since === 100, 'beide Teile laufen gleichzeitig, keiner fertig (nicht „Teil 2 von 2“)');
  const later = [j(1, 'done', 100), j(2, 'done', 101), j(2, 'running', 150, 1)];
  const q = runProgress(later, later[2])!;
  ok(q.done === 1 && q.running === 1, 'Teil mit laufender Fortsetzung zählt noch nicht als fertig');
  ok(runProgress([j(1, 'running', 1)].map((x) => ({ ...x, params: { run: 'r' } })), { params: { run: 'r' } } as any) === null, 'ein einzelner Auftrag: keine Teile-Anzeige');
}

console.log('Tokens sparen, ganzes Deck nutzen');
{
  const { spreadClip, sampleCards } = await import('../src/lib/sample');
  const secs = Array.from({ length: 30 }, (_, i) => `Abschnitt ${i}. ` + 'Ein Satz über das Thema. '.repeat(120));
  const long = secs.join('\n\n');
  const sc = spreadClip(long, 24000);
  ok(sc.length <= 24000 && sc.includes('Abschnitt 0.') && sc.includes('Abschnitt 15.') && sc.includes('Abschnitt 29.'), 'Material von Anfang, Mitte und Ende, im Limit');
  ok(sc.split('[…]').every((p) => /[.\s]$/.test(p.trimEnd().slice(-1)) || p.trim().endsWith('.')), 'Stücke enden an Satzenden');
  ok(spreadClip('kurz', 100) === 'kurz', 'kurzes Material bleibt wie es ist');
  const huge = Array.from({ length: 400 }, (_, i) => `Kapitel ${i}. ` + 'Text. '.repeat(600)).join('\n\n');
  const hc = spreadClip(huge, 24000);
  ok(hc.length <= 24000 && hc.includes('Kapitel 0.') && /Kapitel 3\d\d\./.test(hc), 'sehr langes Material: ganze Abschnitte in gleichen Abständen');
  const cards = Array.from({ length: 300 }, (_, i) => ({ front: 'F' + i, back: 'A', ...(i === 250 ? { srs: { lapses: 4 } } : {}), ...(i === 10 ? { marked: true } : {}) }));
  const pick = sampleCards(cards, 60);
  ok(pick.length === 60 && pick.some((c) => c.front === 'F250') && pick.some((c) => c.front === 'F10') && pick.some((c) => Number(c.front.slice(1)) > 280) && pick.every((c, i) => !i || Number(c.front.slice(1)) > Number(pick[i - 1].front.slice(1))), 'Karten: schwere/markierte zuerst, sonst über das ganze Deck, Reihenfolge bleibt');

  const { materialFrom, chatWindow, systemFor, CACHE_FROM_CHARS, tokenSettings, thinkingModel } = await import('../src/lib/ai');
  const mf = materialFrom('', cards, 6000);
  ok(mf.includes('Auswahl:') && mf.includes('F299') === false ? mf.includes('F2') : true, 'Kartenauswahl wird gekennzeichnet');
  ok(materialFrom('', cards.slice(0, 5), 6000).includes('F4') && !materialFrom('', cards.slice(0, 5), 6000).includes('Auswahl'), 'wenige Karten: alle, ohne Auswahl');

  const msgs = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: 'm' + i }));
  const w = chatWindow(msgs);
  ok(w.length <= 12 && w[0].role === 'user' && w[w.length - 1].content === 'm29', 'Chat: höchstens 12 Nachrichten, beginnt mit einer Frage');

  const big = 'x'.repeat(CACHE_FROM_CHARS + 10);
  ok(JSON.stringify(systemFor('anthropic', 'claude-haiku-5-5', big)).includes('"cache_control":{"type":"ephemeral"}') && systemFor('anthropic', 'm', 'kurz') === 'kurz', 'Claude: lange Anleitung wird zwischengespeichert, kurze nicht');
  ok(JSON.stringify(systemFor('openrouter', 'anthropic/claude-haiku-5-5', big)).includes('cache_control') && systemFor('openrouter', 'deepseek/deepseek-chat', big) === big && systemFor('openai', 'gpt-5', big) === big, 'OpenRouter-Claude markiert, andere cachen selbst');

  ok(thinkingModel('gemini', 'gemini-2.5-flash') && thinkingModel('openai', 'gpt-5-mini') && thinkingModel('openai', 'o4-mini') && !thinkingModel('openai', 'gpt-4o') && !thinkingModel('anthropic', 'claude-haiku-5-5'), 'denkende Modelle werden erkannt');
  const g = tokenSettings('gemini', 'gemini-2.5-flash', 800) as any;
  ok(g.maxOutputTokens === 2800 && g.thinkingConfig.thinkingBudget === 512, 'Gemini Flash: Platz fürs Denken, wenig Denken bei kleinen Aufgaben');
  const o = tokenSettings('openai', 'gpt-5', 900) as any;
  ok(o.max_completion_tokens === 2900 && o.reasoning_effort === 'low' && !(tokenSettings('openai', 'gpt-5', 16000) as any).reasoning_effort, 'OpenAI: mehr Platz, kleine Aufgaben denken wenig, große voll');
  ok((tokenSettings('openai', 'gpt-4o', 900) as any).max_completion_tokens === 900, 'Modelle ohne Denken: unverändert');
  const or = tokenSettings('openrouter', 'anthropic/claude-haiku-5-5', 700) as any;
  ok(or.max_tokens === 3700 && or.reasoning.effort === 'low' && (tokenSettings('openrouter', 'x/y:free', 700) as any).reasoning.effort === 'none', 'OpenRouter: kleine Aufgaben mit wenig Denken, kostenlose ohne');

  const { avoidFronts } = await import('../src/lib/jobs');
  const deck = [...Array.from({ length: 200 }, (_, i) => ({ front: 'alt ' + i, back: 'a' })), { front: 'neu 1', back: 'a', run: 'r' }, { front: 'neu 2', back: 'a', run: 'r' }];
  const av = avoidFronts(deck, 'r');
  ok(av.length === 62 && av.includes('neu 1') && av.includes('alt 199') && !av.includes('alt 0') && av[av.length - 1] === 'neu 2', '„Fragen gibt es schon“: dieser Durchgang plus die 60 neuesten');

  const { courseMaterial } = await import('../src/lib/mockExam');
  const decks = Array.from({ length: 30 }, (_, i) => ({ name: 'Deck ' + i, size: 20000, make: (n: number) => 'x'.repeat(n) }));
  const cm = courseMaterial(decks);
  ok(cm.length <= 60000 && cm.includes('Deck 0') && cm.includes('Deck 29'), 'Kurs-Prüfung: Budget eingehalten, auch mit 30 Decks');

  const { estimate } = await import('../src/lib/costs');
  const e0 = estimate.cards(20000, 10, true);
  const e1 = estimate.cards(20000, 10, true, 4000, 3);
  ok(e1.input - e0.input === Math.ceil(4000 / 3.5) - Math.ceil(1600 / 3.5) + 2400, 'Kosten zählen die Anleitung und die Folien-Bilder');
}

console.log('Übungsaufgaben: Mathe, Labore, Java');
{
  const L = await import('../src/lib/labs');
  const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e;
  ok(near(L.binomPmf(10, 0.3, 3), 0.2668) && near(L.binomRange(10, 0.3, 0, 10), 1, 1e-9), 'Binomialverteilung: P(X=3) für n=10, p=0,3 ≈ 0,2668');
  ok(near(L.normalCdf(1.96), 0.975) && near(L.normalCdf(100, 100, 15), 0.5) && near(L.normalCdf(1) - L.normalCdf(-1), 0.6827), 'Normalverteilung: Φ(1,96) ≈ 0,975, 68-%-Regel');
  const bt = L.bayesTable(0.01, 0.95, 0.9);
  ok(near(bt.truePos, 9.5) && near(bt.falsePos, 99) && near(bt.ppv, 9.5 / 108.5), 'Bayes: von 1000 Personen 9,5 richtig und 99 falsch positiv');
  ok(near(L.hypergeom(10, 3, 4, 1), 0.5), 'Ziehen ohne Zurücklegen (hypergeometrisch)');
  const t = L.treePaths(0.3, 0.8, 0.1);
  ok(near(t.B, 0.31) && near(t.AB + t.AnB + t.nAB + t.nAnB, 1), 'Baumdiagramm: Pfad- und Summenregel');
  const c1 = L.simulateCoin(1000, 0.5, 7), c2 = L.simulateCoin(1000, 0.5, 7);
  ok(c1.join() === c2.join() && Math.abs(c1[999] - 0.5) < 0.06, 'Münzwurf: gleiche Simulation bei gleichem Startwert, nahe 0,5');
  ok(near(L.diceSumDist(2)[7], 1 / 6) && L.simulateDice(600, 2, 3).reduce((a, b) => a + b, 0) === 600, 'Würfelsummen: exakte Verteilung und Simulation');
  const sq = (x: number) => x * x;
  ok(near(L.derivative(sq, 3), 6) && near(L.integral(sq, 0, 1), 1 / 3, 1e-9), 'Ableitung f(x)=x² bei 3 = 6, Integral 0–1 = 1/3');
  const zs = L.zeros((x) => x * x - 4, -5, 5);
  ok(zs.length === 2 && near(zs[0], -2) && near(zs[1], 2), 'Nullstellen von x² − 4');
  const ex = L.extrema((x) => x * x * x - 3 * x, -3, 3);
  ok(ex.length === 2 && ex[0].kind === 'max' && near(ex[0].x, -1, 1e-3) && ex[1].kind === 'min', 'Hoch- und Tiefpunkt von x³ − 3x');
  ok(L.det([[2, 1], [1, 3]]) === 5 && L.apply([[0, -1], [1, 0]], [1, 0]).join() === '0,1', 'Matrix: Determinante, Drehung um 90°');

  const P = await import('../src/lib/practice');
  ok(P.parseNumber('0,2668') === 0.2668 && P.parseNumber('26,68 %') === 0.2668 && P.parseNumber('3/8') === 0.375 && P.parseNumber('≈ 1.234,5') === 1234.5 && P.parseNumber('-2') === -2 && P.parseNumber('abc') === null, 'Zahlen: Komma, Prozent, Bruch, Tausender');
  const num = { type: 'number' as const, value: '0,2668' };
  ok(P.checkAnswer(num, '0,2668') === 'right' && P.checkAnswer(num, '26,68 %') === 'right' && P.checkAnswer(num, '0,27') === 'wrong' && P.checkAnswer(num, '') === 'invalid', 'Zahlen-Antwort: genau auf die Stellen der Lösung');
  ok(P.checkAnswer({ type: 'number', value: '0,27', tolerance: 0.01 }, '0,2668') === 'right', 'Toleranz wird beachtet');
  ok(P.checkAnswer({ type: 'fraction', value: '3/8' }, '0,375') === 'right' && P.checkAnswer({ type: 'fraction', value: '3/8' }, '6/16') === 'right' && P.checkAnswer({ type: 'fraction', value: '1/3' }, '0,333') === 'right' && P.checkAnswer({ type: 'fraction', value: '1/3' }, '0,3') === 'wrong', 'Bruch-Antwort');
  ok(P.checkAnswer({ type: 'number', value: '6' }, '6') === 'right' && P.checkAnswer({ type: 'number', value: '6' }, '5,6') === 'wrong', 'ganze Zahl muss genau stimmen');
  ok(P.sameFormula('2*x+2', '2(x+1)') && !P.sameFormula('2*x+2', '2x+1') && P.checkAnswer({ type: 'expr', value: '3*x^2' }, '3x^2') === 'right', 'gleichwertige Formeln werden erkannt');
  ok(P.checkAnswer({ type: 'choice', value: 'B', options: ['A', 'B', 'C'] }, 'b') === 'right' && P.checkAnswer({ type: 'choice', value: '1', options: ['A', 'B'] }, 'B') === 'right', 'Auswahl-Antwort');
  ok(P.checkAnswer({ type: 'text', value: 'weil …' }, 'egal') === 'ai', 'freie Antwort geht an die KI');
  const ms = P.parsePractice(
    {
      kind: 'math', topic: 'Binomial', intro: 'i',
      problems: [{ problem: 'P(X=3)?', answer: { type: 'number', value: '0,2668' }, hints: ['h'], steps: ['s'] }, { problem: '', answer: { type: 'number', value: '1' } }, { problem: 'x', answer: { type: 'expr', value: 'alert(1)' } }],
      labs: [{ type: 'binomial', n: 500, p: 2 }, { type: 'unbekannt' }, { type: 'function', expr: 'a*x^2+b', params: { a: 2 } }],
    },
    'id1', 1,
  )!;
  const mt = P.taskList(ms) as any[];
  ok(ms.kind === 'math' && mt.length === 2 && mt[0].type === 'calc' && mt[1].answer.type === 'text' && ms.progress.length === 2, 'Mathe-Satz: leere Aufgaben fallen weg, ungültige Formel wird Text');
  ok(ms.labs.length === 2 && (ms.labs[0] as any).n === 100 && (ms.labs[0] as any).p === 1, 'Labore: Werte begrenzt, unbekannte fallen weg');
  ok(P.withParams('a*x^2+b', { a: 2, b: -1 }) === '(2)*x^2+(-1)', 'Funktionen-Labor setzt Parameter ein');
  const js = P.parsePractice({ kind: 'java', topic: 'Arrays', problems: [{ title: 'Summe', task: 'Summiere', starter: 'class Solution {}', tests: [{ call: 'Solution.sum(new int[]{1})', expected: '1' }, { call: '', expected: 'x' }] }, { title: 'ohne Tests', task: 't', starter: 's', tests: [] }] }, 'id2', 1)!;
  const jt = P.taskList(js) as any[];
  ok(js.kind === 'java' && jt.length === 1 && jt[0].type === 'code' && jt[0].tests.length === 1, 'Java-Satz: Aufgaben ohne Tests fallen weg');
  const old = { id: 'o', createdAt: 1, kind: 'java', topic: 't', intro: '', labs: [], progress: [{ tries: 0, hints: 0 }], java: [{ title: 'a', task: 'b', starter: 'c', tests: [{ call: 'x', expected: '1' }], hints: [], solution: '' }] } as any;
  ok(P.taskList(old).length === 1 && P.taskList(old)[0].type === 'code' && P.problemCount(old) === 1, 'Aufgaben aus v0.9.5 bleiben lesbar');
  ok(P.parsePractice({ kind: 'math', problems: [] }, 'x', 1) === null, 'ohne Aufgaben kein Satz');
  const pp = P.practicePrompt('Material', 'java', 8);
  ok(pp.system.includes('class Solution') && !pp.system.includes('"kind":"math"') && pp.user === 'Material', 'Java-Prompt ohne Mathe-Teil');

  const J = await import('../src/lib/javaRun');
  const tests = [{ call: 'Solution.sum(new int[]{1,2,3})', expected: '6' }, { call: 'Solution.arr()', expected: '[1, 2]' }];
  const src = J.buildHarness('public class Solution {\n  static int sum(int[] a) { return 0; }\n}', tests);
  ok(src.indexOf('class MerkoraTest') < src.indexOf('class Solution') && !/public class Solution/.test(src) && src.includes('show(Solution.sum(new int[]{1,2,3}))'), 'Testklasse zuerst, Lernenden-Code ohne public');
  const pr = J.parseResults('Hallo\n#T1|OK\n#T2|FAIL|[2, 1]\n', tests);
  ok(pr.results[0].ok && !pr.results[1].ok && pr.results[1].got === '[2, 1]' && pr.output === 'Hallo', 'Testergebnisse und eigene Ausgabe werden getrennt');
  const pe = J.parseResults('#T1|ERR|java.lang.ArithmeticException: / by zero', tests);
  ok(!pe.results[0].ok && pe.results[0].error!.includes('ArithmeticException') && pe.results[1].error === 'nicht ausgeführt', 'Fehler im Test werden gezeigt');
  const off = J.harnessOffset(tests);
  ok(J.mapErrors(`prog.java:${off + 2}: error: ';' expected`, off) === "Zeile 2: ';' expected" && J.mapErrors('prog.java:3: error: x', off).startsWith('Testcode'), 'Compilerfehler mit Zeile im eigenen Code');
  const userCode = 'class Solution {\n    static int f() {\n        return a\n    }\n}';
  const javacLine = J.buildHarness(userCode, tests).split('\n').findIndex((l) => l.includes('return a')) + 1;
  ok(J.mapErrors(`prog.java:${javacLine}: error: x`, off) === 'Zeile 3: x', 'Zeilennummer zeigt genau auf die eigene Zeile');

  const { highlightJava } = await import('../src/lib/javaHighlight');
  const h = highlightJava('public int x = 5; // Kommentar\nString s = "a // b < c";');
  ok(h.includes('<span class="tk-kw">public</span>') && h.includes('<span class="tk-type">int</span>') && h.includes('<span class="tk-com">// Kommentar</span>') && h.includes('<span class="tk-str">"a // b &lt; c"</span>') && h.includes('<span class="tk-num">5</span>'), 'Java-Hervorhebung: Schlüsselwörter, Typen, Kommentare, Strings');
}

console.log('Skills: aktive Aufgaben und Musik');
{
  const T = await import('../src/lib/tasks');
  const order = T.parseActive({ type: 'order', prompt: 'Prüfungsschema', items: ['Tatbestand', 'Rechtswidrigkeit', 'Schuld'] }) as any;
  ok(order && T.checkOrder(order, ['Tatbestand', 'Rechtswidrigkeit', 'Schuld']).right && !T.checkOrder(order, ['Schuld', 'Tatbestand', 'Rechtswidrigkeit']).right, 'Reihenfolge prüfen');
  ok(T.parseActive({ type: 'order', items: ['a', 'a', 'b'] }) === null && T.shuffled(order.items, 3).join() !== order.items.join(), 'Reihenfolge: Doppelte verworfen, Mischen nie schon richtig');
  const cl = T.parseActive({ type: 'classify', groups: ['Kaufvertrag', 'Mietvertrag'], items: [{ text: 'Auto kaufen', group: 0 }, { text: 'Wohnung mieten', group: 'Mietvertrag' }, { text: 'Brot kaufen', group: 0 }, { text: 'x', group: 5 }] }) as any;
  ok(cl && cl.items.length === 3 && cl.items[1].group === 1 && T.checkClassify(cl, [0, 1, 0]).right && !T.checkClassify(cl, [0, 0, 0]).right, 'Zuordnen: Gruppen auch per Name, ungültige weg');
  const cz = T.parseActive({ type: 'cloze', text: 'Ein {{1}} ist ein {{2}} Vertrag.', gaps: [['Kaufvertrag'], ['gegenseitiger', 'synallagmatischer']] }) as any;
  ok(cz && T.checkCloze(cz, ['kaufvertrag', 'Synallagmatischer']).right && T.checkCloze(cz, ['Kaufvertag', 'gegenseitiger']).right && !T.checkCloze(cz, ['Miete', 'gegenseitiger']).right, 'Lückentext tolerant (Groß/klein, Synonym, ein Tippfehler)');
  ok(T.parseActive({ type: 'cloze', text: 'Nur {{1}} Lücke', gaps: [['a'], ['b']] }) === null && T.clozeParts('A {{1}} B {{2}}').join('|') === 'A |0| B |1|', 'Lückentext: Lücken passen zum Text');
  const mu = T.parseActive({ type: 'multi', prompt: 'p', options: ['a', 'b', 'c', 'd'], correct: [2, 0, 9] }) as any;
  ok(mu.correct.join() === '0,2' && T.checkMulti(mu, [2, 0]).right && !T.checkMulti(mu, [0]).right, 'mehrere richtige Antworten');
  const cs = T.parseActive({ type: 'case', facts: 'A kauft bei B ein Rad.', question: 'Anspruch?', rubric: [{ criterion: 'Anspruchsgrundlage § 433 II', points: 2 }, { criterion: 'Ergebnis', points: 1 }], solution: 'Ja.' }) as any;
  const g = T.parseCaseGrade(cs, { criteria: [{ points: 5, feedback: 'gut' }, { points: 0.5 }], summary: 's' });
  ok(g.total === 2.5 && g.max === 3 && g.criteria[0].points === 2, 'Fallbewertung: Punkte nie über dem Maximum, halbe Punkte');
  ok(T.parseActive({ type: 'case', facts: 'x', question: 'y', rubric: [{ criterion: 'nur eins' }] }) === null, 'Fall braucht ein Bewertungsschema');

  const M = await import('../src/lib/music');
  const D = M.parseNote('D4')!;
  ok(M.spell(M.chordNotes(D, 'Dur')) === 'D – Fis – A' && M.spell(M.chordNotes(M.parseNote('F')!, 'Moll')) === 'F – As – C', 'Akkorde richtig geschrieben (D-Dur, f-Moll)');
  ok(M.spell(M.scaleNotes(M.parseNote('A3')!, 'Moll')) === 'A – H – C – D – E – F – G' && M.spell(M.scaleNotes(M.parseNote('B')!, 'Dur')) === 'B – C – D – Es – F – G – A', 'Tonleitern (a-Moll, B-Dur)');
  ok(M.intervalBySemis(7) === 'reine Quinte' && M.noteName(M.transpose(M.parseNote('E')!, 3, 2)) === 'G' && M.noteName(M.transpose(M.parseNote('Fis')!, 4, 2)) === 'Ais', 'Intervalle mit richtiger Schreibweise');
  const dDur = M.chordNotes(D, 'Dur');
  ok(M.checkChord(dDur, [62, 66, 69]) && M.checkChord(dDur, [50, 69, 66, 74]) && !M.checkChord(dDur, [62, 65, 69]), 'Akkord gespielt: Lage egal, falscher Ton fällt auf');
  const cDur = M.scaleNotes(M.parseNote('C4')!, 'Dur');
  ok(M.checkScale(cDur, [60, 62, 64, 65, 67, 69, 71, 72]) && M.checkScale(cDur, [60, 62, 64, 65, 67, 69, 71]) && !M.checkScale(cDur, [60, 62, 63, 65, 67, 69, 71]), 'Tonleiter gespielt: aufwärts, Oktave am Ende erlaubt');
  ok(M.checkNoteName(M.parseNote('Fis4')!, 'fis') && !M.checkNoteName(M.parseNote('Fis4')!, 'Ges') && M.checkNoteName(M.parseNote('B3')!, 'b'), 'Note benennen: Schreibweise zählt');
  ok(M.staffStep(M.parseNote('E4')!, 'treble') === 0 && M.staffStep(M.parseNote('F5')!, 'treble') === 8 && M.staffStep(M.parseNote('G2')!, 'bass') === 0 && M.staffStep(M.parseNote('C4')!, 'treble') === -2, 'Notensystem: Linien und Hilfslinien');
  const beat = 60000 / 60;
  ok(M.checkRhythm([1, 0.5, 0.5, 1], 60, [0, beat, beat * 1.5, beat * 2.05]).right && !M.checkRhythm([1, 1, 1], 60, [0, 500, 1000]).right, 'Rhythmus geklopft: Toleranz 20 % eines Schlags');
  ok(M.parseMusic({ mode: 'build-chord', root: 'D4', chord: 'moll' })?.mode === 'build-chord' && M.parseMusic({ mode: 'build-chord', root: 'D4', chord: 'Quatsch' }) === null && M.parseMusic({ mode: 'name-note', note: 'C9' }) === null, 'Musikaufgaben werden geprüft gelesen');

  const P = await import('../src/lib/practice');
  const set = P.parsePractice({ kind: 'Recht', topic: 'Kaufvertrag', problems: [{ type: 'case', facts: 'A kauft.', question: 'Anspruch?', rubric: [{ criterion: 'a', points: 1 }, { criterion: 'b', points: 1 }], solution: 'x' }, { type: 'order', items: ['1', '2', '3'] }, { type: 'music', music: { mode: 'chord-ear', root: 'C4', chord: 'Dur' } }] }, 's', 1)!;
  ok(set.kind === 'law' && P.taskList(set).map((t) => t.type).join() === 'case,order,music', 'gemischter Satz mit Fall, Reihenfolge und Musik');
  ok(P.taskRules('law').includes('"type":"case"') && !P.taskRules('law').includes('"type":"code"') && P.taskRules('music').includes('build-chord'), 'Aufgabentypen passend zum Fach');
}

console.log('Skills: Lernpfad planen und lernen');
{
  const S = await import('../src/lib/skills');
  const q = S.parseQuestions({ title: 'Musiktheorie', domain: 'Musik', levels: ['Einsteiger', 'Grundlagen', 'Fortgeschritten', 'Profi'], questions: [{ q: 'Spielst du ein Instrument?', options: ['Ja', 'Nein'] }, { q: 'leer', options: ['nur eine'] }, { q: 'Ziel?', options: ['Prüfung', 'Hobby', 'Band'], multi: true }] })!;
  ok(q.domain === 'music' && q.levels.length === 4 && q.questions.length === 2 && q.questions[1].multi === true, 'Fragen der Planung: unvollständige fallen weg, Fach erkannt');
  ok(S.parseQuestions({ levels: ['nur'], questions: [{ q: 'x', options: ['a', 'b'] }] }) === null, 'ohne Niveaustufen keine Planung');

  const base = { id: 'sk', topic: 'Musiktheorie', title: 'Musiktheorie', domain: 'music', levels: q.levels, targetLevel: 2, level: 'Hobby', status: 'planning', plan: { questions: q.questions, answers: { 0: 'Ja', 1: 'Hobby · Band' } }, stages: [], createdAt: 1, updatedAt: 1 } as any;
  const prop = S.parseProposal({ title: 'Musiktheorie praktisch', approach: 'So …', duration: '6 Wochen', stages: [{ name: 'Einsteiger', goal: 'Noten lesen', lessons: [{ title: 'Notennamen', goal: 'g' }, { title: 'Intervalle hören', goal: 'g', known: true }, { title: '' }] }, { name: 'Grundlagen', lessons: [] }] })!;
  ok(prop.stages.length === 1 && prop.stages[0].lessons.length === 2 && prop.stages[0].lessons[1].known === true && prop.duration === '6 Wochen', 'Vorschlag: leere Stufen und Lektionen fallen weg, „kann ich schon“ bleibt');
  const withSet = { ...prop.stages[0], lessons: [{ ...prop.stages[0].lessons[0], set: { id: 'x' } as any }, prop.stages[0].lessons[1]] };
  const again = S.parseProposal({ stages: [{ name: 'Einsteiger', lessons: [{ title: 'notennamen', goal: '' }, { title: 'Akkorde', goal: 'a' }] }] }, [withSet])!;
  ok(again.stages[0].id === withSet.id && (again.stages[0].lessons[0] as any).set?.id === 'x' && again.stages[0].lessons[0].goal === 'g', 'angepasster Vorschlag behält schon begonnene Lektionen');

  let st = prop.stages;
  const [l1, l2] = st[0].lessons;
  st = S.moveLesson(st, l2.id, -1);
  ok(st[0].lessons[0].id === l2.id && S.moveLesson(st, l2.id, -1)[0].lessons[0].id === l2.id, 'Lektion verschieben (nicht über den Rand)');
  st = S.addLesson(st, st[0].id, '  Dreiklänge  ');
  ok(st[0].lessons.length === 3 && st[0].lessons[2].title === 'Dreiklänge', 'eigene Lektion hinzufügen');
  ok(S.removeLesson(S.removeLesson(S.removeLesson(st, l1.id), l2.id), st[0].lessons[2].id).length === 0, 'leere Stufe verschwindet nach dem Entfernen');
  ok(S.toggleKnown(st, l1.id)[0].lessons.find((l) => l.id === l1.id)!.known === true, '„kann ich schon“ umschalten');

  const set = (solved: number, n: number) => ({ id: 's' + solved, createdAt: 1, kind: 'music', topic: 't', intro: '', labs: [], tasks: Array.from({ length: n }, () => ({ type: 'calc', problem: 'p', answer: { type: 'number', value: '1' }, hints: [], steps: [] })), progress: Array.from({ length: n }, (_, k) => ({ tries: 1, hints: 0, solved: k < solved })) }) as any;
  const skill = { ...base, status: 'active', stages: [
    { id: 'a', name: 'Einsteiger', goal: '', lessons: [{ id: 'l1', title: 'A', goal: '', set: set(4, 5) }, { id: 'l2', title: 'B', goal: '', known: true }, { id: 'l3', title: 'C', goal: '', set: set(1, 5) }] },
    { id: 'b', name: 'Grundlagen', goal: '', lessons: [{ id: 'l4', title: 'D', goal: '' }, { id: 'l5', title: 'E', goal: '' }] },
  ] } as any;
  ok(S.lessonDone(skill.stages[0].lessons[0]) && S.lessonDone(skill.stages[0].lessons[1]) && !S.lessonDone(skill.stages[0].lessons[2]), 'Lektion geschafft ab 80 % (oder „kann ich schon“)');
  ok(S.nextLesson(skill)!.lesson.id === 'l3' && S.lessonAfter(skill, 'l3')!.lesson.id === 'l4', 'nächste Lektion und die, die im Hintergrund vorbereitet wird');
  const pr = S.skillProgress(skill);
  ok(pr.done === 1 && pr.skipped === 1 && pr.total === 4, 'Fortschritt des Skills: übersprungene Lektionen zählen weder als geschafft noch als offen');
  ok(!S.stageReady(skill.stages[0]) && !S.canReview(skill), 'Stufentest erst nach allen Lektionen, Wiederholung erst nach 2 geübten');
  // Skipping a task („Weiß nicht“) still lets Pip advance to the next level once all tasks of the lesson are through
  const withSkip = set(3, 4);
  withSkip.progress[3] = { tries: 0, hints: 0, dunno: true, shown: true };
  const halfSkipped = set(1, 4);
  halfSkipped.progress[1] = { tries: 0, hints: 0, dunno: true, shown: true };
  skill.stages[0].lessons[2].set = halfSkipped;
  ok(!S.lessonDone(skill.stages[0].lessons[2]) && S.nextLesson(skill)!.lesson.id === 'l3', 'übersprungene Aufgabe mitten in der Lektion schließt noch nicht ab');
  skill.stages[0].lessons[2].set = withSkip;
  ok(
    !S.mastered(withSkip) && S.setFinished(withSkip) && S.lessonDone(skill.stages[0].lessons[2]) && S.nextLesson(skill)!.lesson.id === 'l4' && S.stageReady(skill.stages[0]),
    'Lektion mit übersprungener Aufgabe zählt nach Abschluss als erledigt – Pip zieht weiter zum nächsten Level',
  );
  skill.stages[0].lessons[2].set = set(5, 5);
  ok(S.stageReady(skill.stages[0]) && S.canReview(skill) && S.reachedStage(skill) === -1, 'Stufe bereit für den Test');
  skill.stages[0].passed = true;
  ok(S.reachedStage(skill) === 0, 'bestandener Stufentest: Stufe erreicht');

  const lp = S.lessonPrompt(skill, skill.stages[1], skill.stages[1].lessons[0]);
  ok(lp.user.includes('LEKTION 4 von 5: D') && lp.user.includes('Vorher gelernt: A; B; C') && lp.user.includes('Hobby · Band') && lp.system.includes('build-chord'), 'Lektion kennt Ziel, Vorwissen, Antworten und Musik-Aufgaben');
  ok(S.proposalPrompt({ ...skill, plan: { ...skill.plan, placementNote: 'Intervalle: gekonnt' } }).user.includes('Einstufung: Intervalle: gekonnt'), 'Einstufung fließt in den Vorschlag');
  ok(S.revisePrompt(skill, 'mehr Praxis').user.includes('WUNSCH DER PERSON: mehr Praxis') && S.questionsPrompt('Jura', 'Uni').user.includes('Skill: Jura'), 'Anpassen und Fragen');
  ok(S.placementNote(set(1, 2), [{ label: 'Noten' }, { label: 'Akkorde' }]) === 'Noten: gekonnt; Akkorde: nicht gekonnt', 'Einstufungsergebnis als Notiz');

  const { mergeSkill } = await import('../src/lib/sync');
  const a = { ...skill, updatedAt: 5, stages: [{ ...skill.stages[0], lessons: [{ id: 'l1', title: 'A', goal: '', set: set(1, 5) }] }] };
  const b = { ...skill, updatedAt: 9, stages: [{ ...skill.stages[0], passed: undefined, lessons: [{ id: 'l1', title: 'A', goal: '', set: { ...set(0, 5), id: 's1', progress: set(0, 5).progress.map((p: any, k: number) => ({ ...p, solved: k === 3, tries: 3 })) } }] }] };
  const m = mergeSkill(a as any, b as any);
  const prog = m.stages[0].lessons[0].set!.progress;
  ok(prog[0].solved && prog[3].solved && prog[0].tries === 3 && m.stages[0].passed === true, 'Sync: Fortschritt beider Geräte bleibt erhalten');
}

console.log('Skills: Speichern und Laden');
{
  const { normalize } = await import('../src/lib/store');
  const loaded = normalize({ version: 2, workspaces: [], courses: [], decks: [{ id: 'd', name: 'x', cards: [], practice: [{ id: 'p' }] }], reviews: [], skills: [{ id: 's1', title: 'Musik' }], settings: {}, game: {}, jobs: [], exams: [] })!;
  ok(loaded.skills?.length === 1 && loaded.skills[0].id === 's1' && (loaded.decks[0] as any).practice?.[0].id === 'p', 'Skills und Deck-Aufgaben überstehen das Neuladen');
}

console.log('To-do-Seite: Schnelleingabe, Wiederholen, Unteraufgaben');
{
  const T = await import('../src/lib/todos');
  const now = new Date(2026, 10, 21, 10, 0).getTime(); // Sa, 21.11.2026
  const decks = [{ id: 'b', name: 'Biologie' }, { id: 'z', name: 'Zelle und Gewebe' }];
  const q = T.parseQuickTodo('Zusammenfassung schreiben morgen 14:00 !hoch #Biologie 30min', decks, now);
  ok(q.text === 'Zusammenfassung schreiben' && q.due === '2026-11-22' && q.time === '14:00' && q.priority === 'high' && q.deckId === 'b' && q.minutes === 30, 'Schnelleingabe erkennt Datum, Uhrzeit, Priorität, Deck, Dauer: ' + JSON.stringify(q));
  ok(T.parseQuickTodo('Karten lernen am Mo', decks, now).due === '2026-11-23' && T.parseQuickTodo('Abgabe 24.12.', decks, now).due === '2026-12-24' && T.parseQuickTodo('Rückblick 3.1.', decks, now).due === '2027-01-03', 'Wochentag und Datum (auch nächstes Jahr)');
  ok(T.parseQuickTodo('Wiederholen jede Woche 1,5h', decks, now).repeat === 'weekly' && T.parseQuickTodo('Wiederholen jede Woche 1,5h', decks, now).minutes === 90 && T.parseQuickTodo('Vokabeln täglich 9 uhr', decks, now).time === '09:00', 'Wiederholen, Dauer in Stunden, Uhrzeit mit „uhr“');
  ok(T.parseQuickTodo('Mitose #Zelle und Gewebe wiederholen', decks, now).deckId === 'z' && T.parseQuickTodo('Mitose #Zelle und Gewebe wiederholen', decks, now).text === 'Mitose wiederholen', 'Deck mit mehreren Wörtern');
  ok(T.parseQuickTodo('Termin 99:99 #unbekannt', decks, now).text === 'Termin 99:99 #unbekannt', 'Unbekanntes bleibt im Text');
  ok(T.nextDue('2026-11-20', 'daily') === '2026-11-21' && T.nextDue('2026-11-20', 'weekdays') === '2026-11-23' && T.nextDue('2026-11-20', 'weekly') === '2026-11-27', 'nächstes Datum: täglich, werktags (Fr → Mo), wöchentlich');
  ok(T.nextDue('2026-01-31', 'monthly') === '2026-02-28' && T.nextDue('2026-12-15', 'monthly') === '2027-01-15', 'monatlich, auch am Monatsende und Jahreswechsel');
  ok(JSON.stringify(T.subtaskProgress({ subtasks: [{ id: 'a', text: 'a', done: true }, { id: 'b', text: 'b' }] })) === '{"done":1,"total":2}' && T.subtaskProgress({}) === null, 'Fortschritt der Unteraufgaben');
  const sorted = T.sortTodos([{ createdAt: 1, priority: 'low' as const }, { createdAt: 2, priority: 'high' as const }, { createdAt: 3, order: 0 }]);
  ok(sorted[0].createdAt === 3 && sorted[1].priority === 'high', 'Sortierung: eigene Reihenfolge, dann Priorität');
  ok(T.plannedDays([{ due: '2026-11-22' }, { due: '2026-11-22', doneAt: 1 }], now, 3)[1].items.length === 1, 'Geplant: Tage mit offenen To-dos');

  const { clampPos } = await import('../src/lib/toolWindows');
  ok(JSON.stringify(clampPos(-50, 9999, 300, 1200, 800)) === '{"x":8,"y":752}' && JSON.stringify(clampPos(100, 100, 300, 1200, 800)) === '{"x":100,"y":100}', 'Fenster bleiben sichtbar');

  const { setFrame, PLAIN_RULE, simplerPrompt, parseSimpler } = await import('../src/lib/practice');
  ok(setFrame('math').startsWith(PLAIN_RULE) && PLAIN_RULE.includes('Alltagsbeispiel'), 'einfache Sprache in jeder Aufgaben-Anfrage');
  const sp = simplerPrompt({ topic: 'Varianz', intro: 'x', example: { problem: 'p', steps: ['s'] } } as any, 'Gymnasium');
  ok(sp.user.includes('THEMA: Varianz') && sp.system.includes('Gymnasium') && parseSimpler({ intro: '- einfach' })!.intro === '- einfach' && parseSimpler({}) === null, '„Einfacher erklären“: Anfrage und Antwort');
}

console.log('Skills-Lernpfad: Sterne');
{
  const { lessonStars } = await import('../src/lib/skills');
  const set = (solved: number, total: number) => ({ tasks: Array.from({ length: total }, () => ({ type: 'calc', q: 'x' })), progress: Array.from({ length: total }, (_, i) => ({ solved: i < solved })) }) as any;
  ok(lessonStars({ id: 'a', title: 'a', goal: '', known: true }) === 0 && lessonStars({ id: 'a', title: 'a', goal: '' }) === 0, 'kannst du schon = übersprungen, keine Sterne; ohne Aufgaben = 0');
  ok([lessonStars({ id: 'a', title: 'a', goal: '', set: set(10, 10) }), lessonStars({ id: 'a', title: 'a', goal: '', set: set(9, 10) }), lessonStars({ id: 'a', title: 'a', goal: '', set: set(8, 10) }), lessonStars({ id: 'a', title: 'a', goal: '', set: set(5, 10) })].join() === '3,2,1,0', 'alles / 90 % / 80 % / halb gelöst');
}

console.log('Arbeitsplanung: Blöcke, feste Minuten, Uhrzeiten, Prüfungen');
{
  const W = await import('../src/lib/workPlan');
  const big = W.buildWorkPlan([{ id: 'x', title: 'Hausarbeit', motivation: 2, size: 'l' }], 90, true);
  const parts = big.steps.filter((s) => s.kind === 'task');
  ok(parts.length === 2 && big.steps[1].kind === 'break' && big.totalMinutes === 90 && parts.every((s) => s.minutes <= W.MAX_BLOCK), 'große Aufgabe in 90 Min.: zwei Teile mit Pause dazwischen, Summe 90: ' + big.steps.map((s) => s.kind + s.minutes).join(' '));
  ok(JSON.stringify(W.splitBlock(85)) === '[45,40]' && JSON.stringify(W.splitBlock(40)) === '[40]' && W.splitBlock(173).reduce((a, b) => a + b, 0) === 173, 'Blöcke teilen (höchstens 50 Min.)');
  const tasks = [
    { id: 'a', title: 'A', motivation: 3 as const, size: 's' as const },
    { id: 'b', title: 'B', motivation: 1 as const, size: 'l' as const },
    { id: 'c', title: 'C', motivation: 2 as const, size: 'm' as const },
  ];
  const fixedPlan = W.buildWorkPlan(tasks, 60, false, { overrides: { b: 30 } });
  const sumOf = (p: typeof fixedPlan, id: string) => p.steps.filter((s) => s.kind === 'task' && s.taskId === id).reduce((n, s) => n + s.minutes, 0);
  ok(sumOf(fixedPlan, 'b') === 30 && fixedPlan.workMinutes === 60 && fixedPlan.overflow === 0, 'feste Minuten bleiben, der Rest wird verteilt');
  const over = W.buildWorkPlan(tasks, 60, false, { overrides: { a: 40, b: 40 } });
  ok(over.overflow > 0 && sumOf(over, 'a') === 40, 'zu viel geplant: wird gemeldet (' + over.overflow + ' Min.)');
  const timed = W.buildWorkPlan(tasks, 90, true, { start: '14:00' });
  ok(timed.steps[0].from === '14:00' && timed.steps[timed.steps.length - 1].to === '15:30' && timed.steps.every((s, i) => i === 0 || s.from === timed.steps[i - 1].to), 'Uhrzeiten ab Startzeit, lückenlos');
  ok(W.clockText(24 * 60 + 30) === '23:59' && W.nextStartTime(new Date(2026, 10, 21, 9, 12).getTime()) === '09:15', 'Uhrzeit: nicht über Mitternacht, Start auf 5 Min. gerundet');
  const soon = W.examSoonDecks(
    [{ date: '2026-11-24', deckIds: ['bio'] }, { date: '2026-12-20', deckIds: ['chem'] }, { date: '2026-11-01', deckIds: ['alt'] }],
    (e) => e.deckIds,
    new Date(2026, 10, 21, 10).getTime(),
  );
  ok(soon.has('bio') && !soon.has('chem') && !soon.has('alt'), 'Prüfung in 3 Tagen macht das Deck wichtig');
}

console.log('Farbwelten');
{
  const { accentFor } = await import('../src/lib/util');
  const seen = new Set(Array.from({ length: 60 }, (_, i) => accentFor('deck' + i)));
  ok(accentFor('abc') === accentFor('abc') && seen.size === 6 && [...seen].every((n) => n >= 1 && n <= 6), 'Akzentfarbe pro Deck: immer gleich, alle 6 Farben kommen vor');
  const { normalize } = await import('../src/lib/store');
  const old = normalize({ decks: [], settings: { theme: 'dark' } } as any);
  const kept = normalize({ decks: [], settings: { palette: 'beere' } } as any);
  ok(old.settings.palette === 'bunt' && old.settings.theme === 'dark' && kept.settings.palette === 'beere', 'alte Daten bekommen „Bunt“, gewählte Farbwelt bleibt');
}

console.log('Rückgängig und KI-Fortschritt');
{
  const { restoreChange } = await import('../src/lib/undo');
  const deckA = { id: 'a', name: 'A', cards: [{ id: 'c1' }, { id: 'c2' }], updatedAt: 1 };
  const deckB = { id: 'b', name: 'B', cards: [], updatedAt: 1 };
  const exam = { id: 'e', deckIds: ['a', 'b'] };
  const rev = { deckId: 'a', at: 5 };
  const before = { decks: [deckA, deckB], exams: [exam], reviews: [rev], deleted: {} } as any;
  // delete deck A: deck, its reviews and the exam link are gone, a deletion mark is set
  const after = { ...before, decks: [deckB], exams: [{ ...exam, deckIds: ['b'] }], reviews: [], deleted: { a: 9 } };
  // meanwhile deck B got a new card – that must stay
  const current = { ...after, decks: [{ ...deckB, cards: [{ id: 'new' }] }] };
  const r = restoreChange(before, after, current);
  ok(r.decks.map((d: any) => d.id).join() === 'a,b' && r.decks[1].cards.length === 1 && r.decks[0].cards.length === 2, 'Deck kommt an seinen Platz zurück, spätere Änderung an B bleibt');
  ok(r.exams[0].deckIds.join() === 'a,b' && r.reviews.length === 1 && !('a' in r.deleted), 'Prüfungs-Verknüpfung, Verlauf und Löschmarke werden zurückgesetzt');
  // a card deleted (deck changed) – undo puts the old deck version back if nobody touched it since
  const afterCard = { ...before, decks: [{ ...deckA, cards: [deckA.cards[1]] }, deckB], deleted: { c1: 3 } };
  const r2 = restoreChange(before, afterCard, afterCard);
  ok(r2.decks[0].cards.length === 2 && !('c1' in r2.deleted), 'gelöschte Karte kommt zurück');

  const P = await import('../src/lib/jobProgress');
  const now = 1_000_000;
  const done = (s: number) => ({ id: 'd' + s, kind: 'cards', deckId: 'x', status: 'done', createdAt: now - 100000, finishedAt: now - 100000 + s * 1000, params: {}, title: '' });
  const hist = [done(40), done(60), done(80)] as any[];
  ok(P.typicalSeconds(hist, 'cards') === 60 && P.typicalSeconds([], 'quiz') === 45, 'typische Dauer aus früheren Aufträgen (Median), sonst Richtwert');
  const run = { id: 'r', kind: 'cards', deckId: 'x', status: 'running', createdAt: now - 20000, params: {}, title: '' } as any;
  ok(P.etaText(run, hist, now) === 'noch weniger als 1 Min.' && P.etaText({ ...run, createdAt: now - 200000 }, hist, now).includes('länger'), 'Restzeit-Schätzung');
  const prog = P.overallProgress([...hist, run], now);
  ok(prog.total === 1 && prog.share > 0.2 && prog.share < 0.5, 'Gesamtfortschritt eines laufenden Auftrags: ' + prog.share.toFixed(2));
}

console.log('Anfänger-Lektionen: Grundlagen zuerst');
{
  const { beginnerRule } = await import('../src/lib/skills');
  const { parsePractice } = await import('../src/lib/practice');
  const java = { domain: 'java' } as any, math = { domain: 'math' } as any;
  ok(beginnerRule(java, 0, 0).includes('ANFÄNGER-LEKTION') && beginnerRule(java, 0, 0).includes('"code"-Aufgaben') && beginnerRule(java, 0, 0).includes('nichts installieren'), 'erste Java-Lektion: Grundlagen und eigene kleine Programme');
  ok(beginnerRule(math, 0, 1).includes('ANFÄNGER-LEKTION') && !beginnerRule(math, 0, 1).includes('"code"-Aufgaben'), 'erste Mathe-Lektion: Grundlagen, keine Code-Aufgaben');
  ok(!beginnerRule(math, 2, 9).includes('ANFÄNGER'), 'spätere Lektion: Grundlagen nur wenn nötig');
  const set = parsePractice({ kind: 'java', topic: 'Start', theory: '### Worum geht\'s?\nText', intro: '- a', problems: [{ type: 'order', prompt: 'p', items: ['a', 'b', 'c'] }] }, 'x', 1);
  ok(!!set && set.theory!.startsWith('### Worum'), 'Grundlagen werden übernommen');
}

console.log('Sortieren per Ziehen');
{
  const { dropIndex } = await import('../src/lib/tasks');
  const rects = [0, 1, 2, 3].map((k) => ({ top: 100 + k * 60, bottom: 150 + k * 60 }));
  ok(dropIndex(rects, 20) === 0 && dropIndex(rects, 125) === 0 && dropIndex(rects, 300) === 3 && dropIndex(rects, 900) === 3, 'ganz nach oben und ganz nach unten – auch über und unter der Liste');
  ok(dropIndex(rects, 155) === 1 && dropIndex(rects, 215) === 2, 'in der Lücke zählt der Platz darunter');
}

console.log('Sortieren: weiches Ziehen');
{
  const { slotFor } = await import('../src/lib/tasks');
  const mids = [125, 185, 245];
  ok(slotFor(mids, 50) === 0 && slotFor(mids, 130) === 1 && slotFor(mids, 300) === 3, 'Platz nach der Mitte der Nachbarn – ganz oben bis ganz unten');
}

console.log('Arbeitsplanung ↔ To-do-Liste');
{
  const T = await import('../src/lib/todos');
  const now = new Date(2026, 10, 21, 10, 0).getTime();
  const todos = [
    { id: 'a', text: 'Heute', due: '2026-11-21', createdAt: 1 },
    { id: 'b', text: 'Überfällig', due: '2026-11-19', createdAt: 2, priority: 'high' as const },
    { id: 'c', text: 'Ohne Datum', createdAt: 3 },
    { id: 'd', text: 'Morgen', due: '2026-11-22', createdAt: 4 },
    { id: 'e', text: 'Erledigt', due: '2026-11-21', createdAt: 5, doneAt: now - 1000 },
  ];
  const c = T.planCandidates(todos, now);
  ok(c.today.map((t) => t.id).join() === 'b,a' && c.later.map((t) => t.id).join() === 'c,d', 'Checkliste: heute & überfällig zuerst (wichtige oben), dann ohne Datum / später, Erledigte nicht');
  const plan = [
    { id: '1', due: '2026-11-21', phase: 'start' as const, order: 0, time: '14:00', minutes: 15, createdAt: 1, doneAt: now - 500 },
    { id: '2', due: '2026-11-21', phase: 'main' as const, order: 1, time: '14:15', minutes: 45, createdAt: 2 },
    { id: '3', due: '2026-11-21', phase: 'end' as const, order: 2, time: '15:05', minutes: 20, createdAt: 3 },
    { id: '4', due: '2026-11-21', createdAt: 4 },
  ];
  const p = T.todayPlan(plan, now)!;
  ok(p.total === 3 && p.done === 1 && p.endsAt === '15:25' && p.steps[0].id === '1', 'Plan von heute: 1 von 3 erledigt, bis 15:25');
  ok(T.todayPlan([{ id: 'x', due: '2026-11-21', createdAt: 1 }], now) === null, 'ohne geplante Schritte kein Plan');
}

console.log('Gestaltung: Tageszeit, Pflanze, Deck-Cover');
{
  const L = await import('../src/lib/look');
  ok([L.timeOfDay(6), L.timeOfDay(12), L.timeOfDay(19), L.timeOfDay(23), L.timeOfDay(3)].join() === 'morning,day,evening,night,night', 'Tageszeit-Szene: Morgen, Tag, Abend, Nacht');
  ok([0, 10, 30, 50, 70, 95].map(L.plantStage).join() === '0,1,2,3,4,5' && L.plantStage(-5) === 0 && L.plantStage(150) === 5, 'Pflanze wächst mit der Beherrschung: Samen bis Blüte');
  const a = L.coverOf({ id: 'deck-1' });
  ok(JSON.stringify(a) === JSON.stringify(L.coverOf({ id: 'deck-1' })) && a.color >= 1 && a.color <= 6 && a.icon === 'cards', 'automatisches Cover: stabil je Deck');
  const own = L.coverOf({ id: 'deck-1', cover: { color: 3, pattern: 'waves', icon: 'flask' } });
  const bad = L.coverOf({ id: 'deck-1', cover: { color: 9, pattern: 'x' as any, icon: 'y' as any } });
  ok(own.color === 3 && own.pattern === 'waves' && own.icon === 'flask' && bad.color === a.color && bad.pattern === a.pattern && bad.icon === 'cards', 'eigenes Cover gilt, ungültige Werte fallen aufs automatische zurück');
}

console.log('Aquarium und Pip-Tipps');
{
  const A = await import('../src/lib/aquarium');
  const zero = { cards: 0, streak: 0, minutes: 0, decksMastered: 0, pathStars: 0, skillLessons: 0, mockPassed: 0, todosDone: 0, xp: 0 };
  ok(A.unlockedBy(zero).length === 0, 'ohne Lernen ist das Aquarium leer');
  const some = { ...zero, cards: 120, streak: 3, todosDone: 10 };
  const u = A.unlockedBy(some);
  ok(['shell', 'weed', 'starfish', 'clownfish', 'crab'].every((id) => u.includes(id)) && !u.includes('bluefish') && !u.includes('seahorse'), 'Bewohner nach klaren Regeln: ' + u.join(','));
  const blue = A.AQUA_ITEMS.find((i) => i.id === 'bluefish')!;
  ok(Math.round(A.progressOf(blue, some) * 100) === 48 && new Set(A.AQUA_ITEMS.map((i) => i.id)).size === A.AQUA_ITEMS.length, 'Fortschritt zum nächsten Bewohner (120 von 250 Karten)');
  const { aquaStats } = await import('../src/lib/aquarium');
  const s = aquaStats({ decks: [], reviews: [{ cardId: 'a', at: Date.now() }, { cardId: 'a', at: Date.now() }, { cardId: 'b', at: Date.now() }], game: { xpByDay: {}, dailyGoal: 50 }, todos: [{ doneAt: 1 }, {}], skills: [] } as any);
  ok(s.cards === 2 && s.todosDone === 1, 'Zahlen aus dem Lernstand (verschiedene Karten, erledigte To-dos)');

  const T = await import('../src/lib/pipTips');
  const first = T.pickTip('library', {}, '2026-11-21')!;
  ok(first.text === T.PIP_TIPS.library[0] && T.pickTip('library', first.mem, '2026-11-21') === null, 'höchstens ein Tipp pro Bereich und Tag');
  const next = T.pickTip('library', first.mem, '2026-11-22')!;
  ok(next.text === T.PIP_TIPS.library[1] && T.pickTip('nirgends', {}, '2026-11-21') === null, 'am nächsten Tag der nächste Tipp; Bereiche ohne Tipps bleiben still');
}

console.log('Skills: Bilder, Fehler erklären, Projekt, Zeitplan, Abschluss');
{
  const P = await import('../src/lib/practice');
  const figs = P.parseFigures([{ caption: 'Ablauf', diagram: { type: 'flow', title: 'Kompilieren', steps: ['Code', 'javac', 'java'] } }, { type: 'compare', title: 'X', columns: [{ title: 'A', items: ['1'] }, { title: 'B', items: ['2'] }] }, { type: 'flow', title: 'zu viel', steps: ['a', 'b'] }, 'Unsinn']);
  ok(figs.length === 3 && figs[0].caption === 'Ablauf' && figs[0].diagram.type === 'flow' && P.parseFigures('x').length === 0, 'Bilder in Lektionen: höchstens 3, Unsinn fällt weg');
  const set = { id: 's', createdAt: 1, kind: 'math', topic: 'T', intro: '', labs: [], tasks: [{ type: 'calc', problem: 'p1', answer: { type: 'number', value: '1' }, hints: [], steps: [] }, { type: 'calc', problem: 'p2', answer: { type: 'number', value: '2' }, hints: [], steps: [] }], progress: [{ tries: 1, hints: 0, last: '5' }, { tries: 0, hints: 0 }] } as any;
  const m = P.parseMistake({ explain: 'Du hast addiert statt multipliziert.', similar: { type: 'calc', problem: '2·3?', answer: { type: 'number', value: '6' }, hints: ['h'], steps: ['s'] } });
  ok(!!m && m.explain.startsWith('Du hast') && m.similar?.type === 'calc' && P.parseMistake({}) === null, '„Warum falsch?“: Erklärung und ähnliche Aufgabe');
  const ins = P.insertTaskAfter(set, 0, m!.similar!);
  ok(ins.tasks!.length === 3 && (ins.tasks![1] as any).problem === '2·3?' && ins.progress.length === 3 && ins.progress[1].tries === 0 && ins.progress[0].last === '5', 'ähnliche Aufgabe kommt direkt danach');
  ok(P.mistakePrompt(set, set.tasks[0], '5', 'Gymnasium').user.includes('ANTWORT DER PERSON:\n5'), 'Anfrage enthält die falsche Antwort');

  const S = await import('../src/lib/skills');
  const proj = S.parseProject({ title: 'Mini-Rechner', brief: 'Schreibe ein Programm …', steps: ['a', 'b'], deliverable: 'code', rubric: [{ criterion: 'läuft', points: 4 }, { criterion: 'lesbar', points: 6 }], solution: 'x', starter: 'class Solution {}' });
  ok(!!proj && proj.deliverable === 'code' && proj.rubric.length === 2 && proj.starter === 'class Solution {}' && S.parseProject({ title: 'x' }) === null, 'Mini-Projekt: Aufbau wird geprüft');
  const c = S.projectAsCase(proj!);
  ok(c.type === 'case' && c.facts.includes('1. a') && c.rubric.length === 2, 'Projekt wird wie eine Fallaufgabe bewertet');
  ok(S.projectPassed({ criteria: [], total: 7, max: 10, summary: '' }) && !S.projectPassed({ criteria: [], total: 6.5, max: 10, summary: '' }), 'Projekt geschafft ab 70 %');

  const days = S.planLessons(6, '2026-11-21', '2026-11-23', 3);
  ok(days.length === 6 && days[0] === '2026-11-21' && days[5] === '2026-11-23' && days.filter((d) => d === '2026-11-22').length === 2, 'Lektionen gleichmäßig bis zum Ziel-Datum verteilt: ' + days.join(','));
  const crowd = S.planLessons(5, '2026-11-21', '2026-11-21', 3);
  ok(crowd.every((d) => d === '2026-11-21'), 'zu wenig Tage: alles auf den letzten Tag');
  const L = (id: string, extra = {}) => ({ id, title: id, goal: '', ...extra });
  const sk = { id: 'k', status: 'active', title: 'T', levels: ['A'], targetLevel: 0, stages: [{ id: 's1', name: 'A', goal: '', passed: true, lessons: [L('a', { known: true }), L('b', { minutes: 30 }), L('c', { minutes: 10 })] }] } as any;
  ok(S.minutesPerLesson(sk) === 20 && S.openLessons(sk).length === 2 && S.remainingText(sk) === 'noch ca. 40 Min. · 2 Lektionen', 'Restzeit aus gemessener Zeit pro Lektion: ' + S.remainingText(sk));
  ok(S.skillComplete(sk) && !S.skillComplete({ ...sk, stages: [{ ...sk.stages[0], passed: false }] }), 'Skill komplett, wenn alle Stufen bestanden');

  const A = await import('../src/lib/aquarium');
  const zero = { cards: 0, streak: 0, minutes: 0, decksMastered: 0, pathStars: 0, skillsCompleted: 1, skillLessons: 0, mockPassed: 0, todosDone: 0, xp: 0 };
  ok(A.unlockedBy(zero).includes('goldfish'), 'geschaffter Skill: Goldfisch im Aquarium');
}

console.log('Skills: Tagesziel, Serie, Kompetenz-Karte');
{
  const S = await import('../src/lib/skills');
  const U = await import('../src/lib/util');
  const now = new Date('2026-11-21T15:00:00').getTime();
  const day = (k: number) => U.dayKey(U.startOfDay(now) - k * U.DAY + 3 * 3600_000);
  const set = (progress: any[]) => ({ id: 'x', createdAt: 1, kind: 'math', topic: 'T', intro: '', labs: [], tasks: progress.map(() => ({ type: 'calc', problem: 'p', answer: { type: 'number', value: '1' }, hints: [], steps: [] })), progress }) as any;
  const base = { id: 'k', stages: [] } as any;
  const before = set([{ tries: 0, hints: 0 }, { tries: 1, hints: 0, solved: true }]);
  const r1 = S.recordSolved(base, before, 0, { solved: true, tries: 1 }, now);
  ok(r1.activity?.[U.dayKey(now)] === 1, 'neu gelöste Aufgabe zählt für heute');
  ok(!S.recordSolved(base, before, 1, { solved: true }, now).activity && !S.recordSolved(base, before, 0, { tries: 1 }, now).activity, 'schon gelöste oder falsche Aufgaben zählen nicht doppelt');
  const sk = { ...base, activity: { [day(0)]: 2, [day(1)]: 6, [day(2)]: 7, [day(4)]: 9 } };
  ok(S.skillToday(sk, now).done === 2 && S.skillToday(sk, now).goal === 6 && !S.skillToday(sk, now).reached, 'Tagesziel: Standard 6 Aufgaben');
  ok(S.skillStreak(sk, now) === 2, 'Serie läuft ab gestern weiter, solange heute noch nicht geschafft: ' + S.skillStreak(sk, now));
  ok(S.skillStreak({ ...sk, activity: { ...sk.activity, [day(0)]: 6 } }, now) === 3, 'heute geschafft → Serie +1');
  ok(S.skillStreak({ ...sk, dailyGoal: 3 }, now) === 0 || S.skillStreak({ ...sk, dailyGoal: 2 }, now) === 3, 'Ziel-Stufe wirkt auf die Serie');
  ok(S.skillStreak({ ...base, activity: { [day(2)]: 9 } }, now) === 0, 'Lücke bricht die Serie');
  ok(S.skillDays([sk], 7, now).length === 7 && S.skillDays([sk], 7, now)[6].tasks === 2 && S.skillDays([sk], 7, now)[5].tasks === 6, 'Statistik: Aufgaben der letzten 7 Tage');

  ok(S.taskScore({ tries: 1, hints: 0, solved: true }) === 1 && S.taskScore({ tries: 3, hints: 0, solved: true }) === 0.7 && S.taskScore({ tries: 2, hints: 1, solved: true }) === 0.5 && S.taskScore({ tries: 1, hints: 0, solved: true, shown: true }) === 0.2 && S.taskScore({ tries: 2, hints: 0 }) === 0, 'Kompetenz pro Aufgabe');
  const L = (id: string, progress: any[] | null, known = false) => ({ id, title: id, goal: '', ...(known ? { known } : {}), ...(progress ? { set: set(progress) } : {}) });
  const good = [{ tries: 1, hints: 0, solved: true }, { tries: 1, hints: 0, solved: true }];
  const weak = [{ tries: 3, hints: 2 }, { tries: 2, hints: 1, solved: true }];
  const mid = [{ tries: 1, hints: 0, solved: true }, { tries: 2, hints: 1, solved: true }, { tries: 2, hints: 0, solved: true }];
  const skill = { ...base, stages: [{ id: 's1', name: 'A', goal: '', lessons: [L('gut', good), L('schwach', weak), L('mittel', mid), L('neu', null), L('kann', null, true)] }] } as any;
  const rows = S.competenceMap(skill)[0].rows.map((r) => r.state).join(',');
  ok(rows === 'good,weak,ok,new,skipped', 'Kompetenz-Karte: Zustände ' + rows);
  const withTest = { ...skill, stages: [{ ...skill.stages[0], test: set([{ tries: 1, hints: 0, solved: true }, { tries: 1, hints: 0, solved: true }]) }] };
  ok(S.competenceMap(withTest)[0].rows[1].share > S.competenceMap(skill)[0].rows[1].share, 'guter Stufentest hebt die Themen der Stufe');
  ok(S.weakLessons(skill).map((l) => l.id).join(',') === 'schwach,mittel', 'Schwachstellen: nur versuchte, schwächste zuerst');
  const fp = S.reviewPrompt({ ...skill, topic: 'T', title: 'T', domain: 'math', levels: [], targetLevel: 0, level: 'x', plan: {}, status: 'active', createdAt: 1, updatedAt: 1 } as any, [skill.stages[0].lessons[1]]);
  ok(fp.system.includes('Schwachstellen-Training') && fp.user.includes('UNSICHERE THEMEN: schwach') && !fp.user.includes('gut ('), 'Schwachstellen-Training fragt nur die schwachen Themen ab');
}

console.log('Klavier-Tastatur und neue Aufgabenarten');
{
  const M = await import('../src/lib/music');
  ok(M.keyToMidi('KeyZ') === 60 && M.keyToMidi('KeyS') === 61 && M.keyToMidi('KeyQ') === 72 && M.keyToMidi('Digit2') === 73 && M.keyToMidi('KeyU') === 83 && M.keyToMidi('KeyP') === null, 'Klavier: Tasten Y/S/Q/2/U → C4/Cis4/C5/Cis5/H5, P spielt nichts');
  ok(M.keyToMidi('KeyZ', 36) === 36 && M.pianoFrom([64, 67]) === 60 && M.pianoFrom([47]) === 36, 'Klavier beginnt beim C unter der tiefsten Note');
  const pn = M.parseMusic({ mode: 'play-notes', notes: ['C4', 'E4', 'G4'], clef: 'treble' });
  ok(pn?.mode === 'play-notes' && (pn as any).notes.length === 3 && M.parseMusic({ mode: 'play-notes', notes: ['C4', 'C6'] }) === null, 'Noten vom Blatt: Aufbau, höchstens zwei Oktaven');
  const tg = ['C4', 'Fis4'].map((x) => M.parseNote(x)!);
  ok(M.checkSequence(tg, [60, 66]).right && M.checkSequence([M.parseNote('Ges4')!], [66]).right && !M.checkSequence(tg, [60, 67]).right, 'Noten vom Blatt: Reihenfolge, Fis = Ges');

  const T = await import('../src/lib/tasks');
  const est = T.parseActive({ type: 'estimate', prompt: 'Wie viel % …?', min: 0, max: 100, answer: 37, tolerance: 3, unit: '%' }) as any;
  ok(est?.type === 'estimate' && T.checkEstimate(est, 39) === 'right' && T.checkEstimate(est, 44) === 'close' && T.checkEstimate(est, 80) === 'far' && T.parseActive({ type: 'estimate', prompt: 'x', min: 0, max: 10, answer: 20 }) === null, 'Schätzen: richtig, nah dran, weit weg; Antwort muss im Bereich liegen');
  ok(T.niceStep(100) === 1 && T.niceStep(1) === 0.01 && T.niceStep(2000) === 20, 'Schätzen: runde Schrittweite ' + T.niceStep(100));

  const lab = T.parseActive({ type: 'label', prompt: 'Beschrifte', diagram: { type: 'flow', title: 'Ablauf', steps: ['Planen', 'Bauen', 'Testen'] } }) as any;
  ok(lab?.type === 'label' && lab.labels.join(',') === 'Planen,Bauen,Testen' && T.checkLabels(lab, ['planen', 'Bauen', 'Testen']).right && !T.checkLabels(lab, ['Bauen', 'Planen', 'Testen']).right, 'Beschriften: Begriffe aus der Grafik, Prüfung je Nummer');
  const D = await import('../src/lib/diagram');
  const svg = D.renderDiagram(lab.diagram, D.PALETTES.light, { hideMany: lab.hide });
  ok(!svg.includes('>Planen<') && svg.includes('>1</text>') && svg.includes('>3</text>'), 'Beschriften: Felder verdeckt und nummeriert');

  const SH = await import('../src/lib/sheet');
  const v = SH.evalSheet([['2', '3', '=A1*B1'], ['=SUMME(A1:C1)', '=MITTELWERT(A1;B1)', '=C3'], ['1,5', '', '=C2']]);
  ok(v[0][2] === 6 && v[1][0] === 11 && v[1][1] === 2.5 && v[2][0] === 1.5 && SH.isErr(v[1][2]) && SH.isErr(v[2][2]), 'Tabelle: Formeln, Bereiche, Dezimalkomma, Zirkelbezug');
  ok(SH.evalSheet([['=MAX(1;7;3)', '=ANZAHL(A2:C2)', '=2^3+1'], ['x', '4', '5']])[0].join(',') === '7,2,9', 'Tabelle: MAX, ANZAHL, Potenz');
  const sh = T.parseActive({ type: 'sheet', prompt: 'Rechne', rows: [['Menge', 'Preis', 'Summe'], ['3', '0,5', ''], ['2', '1', '']], expect: { C2: '=A2*B2', C3: '=A3*B3' } }) as any;
  ok(sh?.type === 'sheet' && T.checkSheet(sh, { C2: '=A2*B2', C3: '2' }).right && !T.checkSheet(sh, { C2: '1,5', C3: '3' }).right && T.checkSheet(sh, { C2: '1,5', C3: '3' }).cells.C2, 'Tabelle: Formel oder Zahl zählt, falsche Zelle erkannt');

  const sc = { type: 'scenario', prompt: 'Was tust du?', start: 'a', nodes: [
    { id: 'a', text: 'Start', choices: [{ text: 'gut', next: 'b', score: 2, feedback: 'ja' }, { text: 'schlecht', next: 'e', score: 0, feedback: 'nein' }] },
    { id: 'b', text: 'Weiter', choices: [{ text: 'gut', next: 'e', score: 2, feedback: 'ja' }, { text: 'mittel', next: 'e', score: 1, feedback: 'naja' }] },
    { id: 'e', text: 'Ende', choices: [] },
  ] };
  const st = T.parseActive(sc) as any;
  ok(st?.type === 'scenario' && T.scenarioMax(st) === 4 && T.scenarioWalk(st, [0, 0]).done && T.scenarioPassed(st, 4) && !T.scenarioPassed(st, 2), 'Szenario: beste Punktzahl, Weg, bestanden ab 70 %');
  const loop = JSON.parse(JSON.stringify(sc));
  loop.nodes[1].choices[0].next = 'a';
  ok(T.parseActive(loop) === null && T.parseActive({ ...sc, start: 'x' }) === null, 'Szenario: Schleifen und fehlender Start werden abgelehnt');

  const rp = T.parseActive({ type: 'roleplay', prompt: 'Verhandle', scenario: 'Du kaufst ein Auto.', persona: 'Verkäufer, hart', goal: '10 % Rabatt', opening: 'Guten Tag!', turns: 12, rubric: [{ criterion: 'freundlich', points: 2 }, { criterion: 'Argumente', points: 3 }] }) as any;
  ok(rp?.type === 'roleplay' && rp.turns === 8 && T.parseActive({ type: 'roleplay', scenario: 'x' }) === null, 'Rollenspiel: Aufbau, höchstens 8 Beiträge');
  const chat = [{ me: false, text: 'Guten Tag!' }, { me: true, text: 'Ich möchte Rabatt.' }];
  const c = T.roleplayAsCase(rp, chat);
  ok(c.facts.includes('Lernende Person: Ich möchte Rabatt.') && c.rubric.length === 2 && T.roleplayReplyPrompt(rp, chat, '').user.includes('LERNENDE PERSON: Ich möchte Rabatt.'), 'Rollenspiel: Verlauf geht in Antwort und Bewertung');

  const P = await import('../src/lib/practice');
  const js = P.parseTask({ type: 'code', lang: 'javascript', title: 'Summe', task: 'Summe', starter: 'function f(a) {}', tests: [{ call: 'f([1,2])', expected: '3' }] }) as any;
  const sq = P.parseTask({ type: 'code', lang: 'sql', title: 'Alle', task: 'Alle Namen', schema: 'CREATE TABLE t(n TEXT);', solution: 'SELECT n FROM t' }) as any;
  ok(js?.lang === 'javascript' && sq?.lang === 'sql' && sq.starter === 'SELECT ' && P.parseTask({ type: 'code', lang: 'sql', task: 'x', schema: 'y' }) === null, 'Code: Sprache JavaScript/SQL, SQL braucht Datenbank und Lösung');
  const CR = await import('../src/lib/codeRun');
  ok(CR.sameOut('[1, 2]', '[1,2]') && CR.sameOut('abc', "'abc'") && CR.sameOut("['a']", '["a"]') && !CR.sameOut('3', '4'), 'Code: Ausgaben tolerant verglichen');
  const tA = { columns: ['n'], rows: [['a'], ['b']] }, tB = { columns: ['x'], rows: [['b'], ['a']] };
  ok(CR.sameRows(tA, tB, false) && !CR.sameRows(tA, tB, true) && CR.sqlOrdered('select * from t order by n') && !CR.sqlOrdered('select 1'), 'SQL: Zeilen vergleichen, Reihenfolge nur bei ORDER BY');
}

console.log('Weiß nicht und visuelle Erklärungen');
{
  const P = await import('../src/lib/practice');
  const S = await import('../src/lib/skills');
  const set = { id: 's', createdAt: 1, kind: 'math', topic: 'T', intro: '', labs: [], tasks: [{ type: 'calc', problem: '3·4?', answer: { type: 'number', value: '12' }, hints: [], steps: [] }], progress: [{ tries: 0, hints: 0 }] } as any;
  const d = P.mistakePrompt(set, set.tasks[0], '', '', true);
  ok(d.system.includes('Weiß nicht') && d.system.includes('Schritt für Schritt') && d.user.includes('weiß es nicht') && !P.mistakePrompt(set, set.tasks[0], '5').system.includes('Weiß nicht'), '„Weiß nicht“: Pip erklärt den Lösungsweg statt einen Denkfehler');
  ok(S.taskScore({ tries: 0, hints: 0, shown: true, dunno: true } as any) === 0.2, '„Weiß nicht“ zählt wie eine angezeigte Lösung');

  const V = await import('../src/lib/visuals');
  ok(V.keyFifths('G-Dur') === 1 && V.keyFifths('F-Dur') === -1 && V.keyFifths('e-Moll') === 1 && V.keyFifths('Es-Dur') === -3 && V.keyFifths('X-Dur') === null, 'Notenblatt: Tonarten → Vorzeichen');
  ok(V.keySignatureSteps(1, 'treble')[0] === 8 && V.keySignatureSteps(-1, 'treble')[0] === 4 && V.keySignatureSteps(1, 'bass')[0] === 6, 'Notenblatt: Fis/B an der richtigen Linie');
  const sc = V.parseScore({ clef: 'treble', key: 'G-Dur', time: '4/4', items: [{ notes: ['G4'], dur: 1 }, { notes: ['Fis4'], dur: 1 }, { notes: ['F4'], dur: 2 }, { notes: ['C4', 'E4', 'G4'], dur: 4, label: 'C' }, { notes: ['Q9'] }] })!;
  const L = V.layoutScore(sc);
  ok(sc.items.length === 4 && L.bars.length === 1 && L.items[1].notes[0].acc === '' && L.items[2].notes[0].acc === '♮' && L.items[3].notes.length === 3 && L.items[3].midis.join(',') === '60,64,67', 'Notenblatt: Takte, Vorzeichen nur wo nötig, Akkord');
  ok(V.parseScore({ items: [] }) === null && V.parseScore({ items: ['C4', 'D4'] })!.items.length === 2, 'Notenblatt: leere Noten abgelehnt, Kurzform erlaubt');

  const pr = V.parseProgram({ lang: 'python', code: 'a = 1\nb = a + 2\nprint(b)', output: '3', trace: [{ line: 1, vars: { a: 1 }, note: 'a wird 1' }, { line: 2, vars: { a: 1, b: 3 }, note: '' }, { line: 9, vars: {}, note: 'gibt es nicht' }] })!;
  ok(pr.lang === 'python' && pr.trace.length === 2 && pr.trace[0].vars.a === '1' && V.changedVars(pr.trace, 1).join() === 'b' && V.parseProgram({ code: '' }) === null, 'Beispielprogramm: Ablauf, nur gültige Zeilen, geänderte Variablen');

  const sk = V.parseSketch({ parties: [{ id: 'k', name: 'K', role: 'Käufer' }, { id: 'v', name: 'V' }], links: [{ from: 'k', to: 'v', label: '§ 433', kind: 'Kaufvertrag' }, { from: 'v', to: 'k', kind: 'Anspruch' }, { from: 'v', to: 'x' }] })!;
  ok(sk.links.length === 2 && sk.links[0].kind === 'vertrag' && sk.links[1].kind === 'anspruch' && V.parseSketch({ parties: [{ id: 'a', name: 'A' }], links: [] }) === null, 'Fallskizze: Arten erkannt, falsche Personen weggelassen');

  const sy = V.parseSyntax([{ sentence: 'Der Hund beißt den Mann.', parts: [{ text: 'Der Hund', role: 'Subjekt' }, { text: 'beißt', role: 'Verb' }, { text: 'den Mann', role: 'Akkusativobjekt' }] }]);
  ok(sy.length === 1 && sy[0].parts.map((p) => p.role).join(',') === 'subjekt,praedikat,akkobjekt', 'Satzbau: Rollen erkannt');
  ok(V.markedParts('geh[[st]]').length === 2 && V.markedParts('geh[[st]]')[1].mark === true && V.parseTables([{ title: 'x', head: ['a'], rows: [['ich', 'geh[[e]]'], ['du', 'geh[[st]]']] }]).length === 1, 'Tabellen: Endungen markiert');

  const lab = P.parseLab({ type: 'formula', expr: 'K*(1+p/100)^n', vars: [{ name: 'K', min: 100, max: 10000, value: 1000 }, { name: 'p', min: 0, max: 10, value: 10 }, { name: 'n', min: 0, max: 30, value: 2 }], result: { label: 'Endkapital', unit: '€' }, plot: 'n' }) as any;
  ok(lab?.type === 'formula' && Math.abs(V.formulaValue(lab, { K: 1000, p: 10, n: 2 })! - 1210) < 1e-6 && V.formulaCurve(lab, { K: 1000, p: 10, n: 2 })!.length === 81, 'Formel-Spielwiese: Ergebnis und Kurve');
  ok(P.parseLab({ type: 'formula', expr: 'sin*2', vars: [{ name: 'sin', min: 0, max: 1 }] }) === null && P.parseLab({ type: 'formula', expr: 'a+', vars: [{ name: 'a', min: 0, max: 1 }] }) === null, 'Formel-Spielwiese: Funktionsnamen und kaputte Formeln abgelehnt');

  const D = await import('../src/lib/diagram');
  const dg = { type: 'flow', steps: ['Planen', 'Bauen', 'Testen'] } as any;
  const part = D.renderDiagram(dg, D.PALETTES.light, { upto: 1 });
  ok(D.diagramBoxCount(dg) === 3 && (part.match(/opacity="0.06"/g) ?? []).length === 2 && !D.renderDiagram(dg, D.PALETTES.light).includes('dg-build'), 'Bild baut sich auf: spätere Kästen ausgeblendet');
  const ps = P.parsePractice({ kind: 'music', topic: 'T', intro: 'x', score: { items: ['C4'] }, figures: [{ diagram: dg, narration: ['a', 'b'] }], problems: [{ type: 'calc', problem: '1+1', answer: { type: 'number', value: '2' } }] }, 'id', 1)!;
  ok(!!ps.score && ps.figures![0].narration!.length === 2, 'Lektion: Notenblatt und Erzähl-Sätze werden übernommen');
}

console.log('Häppchen statt Textwand');
{
  const P = await import('../src/lib/practice');
  const S = await import('../src/lib/skills');
  const bites = P.parseBites(
    [
      { title: 'Worum geht es?', text: 'Ein **Akkord** sind drei Töne zugleich.', figure: 0, check: { q: 'Wie viele Töne?', options: ['1', '3', '7'], correct: 1, why: 'Drei Töne.' } },
      { title: 'Falsch', text: 'x', check: { q: 'q', options: ['a'], correct: 0 } },
      { title: 'Bild', text: 'y', figure: 5, check: { q: 'q', options: ['a', 'b'], correct: 'b' } },
      { title: 'leer', text: '' },
      { text: 'z', check: { q: 'q', options: ['a', 'b'], correct: 4 } },
    ],
    1,
  );
  ok(bites.length === 4 && bites[0].figure === 0 && bites[0].check?.correct === 1 && !bites[1].check && bites[2].figure === undefined && bites[2].check?.correct === 1 && !bites[3].check, 'Häppchen: Frage nur mit 2–4 Optionen und gültiger Antwort, Bild nur wenn vorhanden, leere weg');
  ok(P.parseBites(Array.from({ length: 9 }, () => ({ text: 'a' })), 0).length === 6 && P.parseBites('x', 0).length === 0, 'Häppchen: höchstens 6');
  const set = P.parsePractice({ kind: 'music', topic: 'T', intro: 'Kurz.', bites: [{ title: 'A', text: 'a', check: { q: 'q', options: ['x', 'y'], correct: 0 } }], problems: [{ type: 'calc', problem: '1+1', answer: { type: 'number', value: '2' } }] }, 'id', 1)!;
  ok(set.bites?.length === 1 && P.bitesFrom(set) === set.bites, 'Lektion übernimmt Häppchen');
  const old = P.bitesFrom({ theory: "### Worum geht's?\nZwei Sätze.\n\n### Begriffe\n- **A** – a", intro: '- Punkt' });
  ok(old.length === 3 && old[0].title === "Worum geht's?" && old[1].text === '- **A** – a' && old[2].title === 'Kurz gesagt' && !old[0].check, 'ältere Lektion: Grundlagen an Überschriften geteilt, Erklärung als letztes Häppchen');
  ok(P.bitesFrom({ intro: 'Nur das.' }).length === 1 && P.bitesFrom({ intro: '' }).length === 0 && P.bitesFrom({ theory: 'Ohne Titel', intro: '' })[0].title === '', 'ältere Lektion: nur Erklärung / gar nichts / Text ohne Überschrift');
  const sk = { id: 's', topic: 'T', title: 'T', domain: 'math', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: 'g', lessons: [{ id: 'l', title: 'L', goal: 'g' }] }], createdAt: 1, updatedAt: 1 } as any;
  const lp = S.lessonPrompt(sk, sk.stages[0], sk.stages[0].lessons[0]);
  ok(lp.system.includes('"bites"') && lp.system.includes('"check"') && !lp.system.includes('Pflichtfeld "theory"'), 'Lektions-Prompt verlangt Häppchen mit Kontrollfrage');
}

console.log('Themenvorschläge, Mini-Skills, nächster Skill');
{
  const S = await import('../src/lib/skills');
  const { levelLabel } = await import('../src/lib/mockExamCore');
  const a = S.pickTopics(S.TOPIC_POOL, 6, 100), b = S.pickTopics(S.TOPIC_POOL, 6, 100), c = S.pickTopics(S.TOPIC_POOL, 6, 101);
  ok(a.length === 6 && new Set(a).size === 6 && a.join() === b.join() && a.join() !== c.join(), 'Vorschläge: 6 verschiedene, gleich am selben Tag, anders am nächsten');
  ok(!S.pickTopics(S.TOPIC_POOL, 40, 5, ['stochastik', 'Java programmieren']).some((t) => t === 'Stochastik' || t === 'Java programmieren') && S.pickTopics(['A'], 3, 1).length === 1, 'Vorschläge: vorhandene Skills fallen weg');
  ok(S.TOPIC_POOL.length >= 30 && S.MINI_POOL.length >= 30, 'genug Themen für Abwechslung');
  ok(levelLabel('bachelor') === 'Universität – Bachelor', 'Stufe aus der Probeprüfung als Name statt „bachelor“');

  const mp = S.miniPrompt('Morsecode');
  ok(mp.user.includes('Morsecode') && mp.system.includes('genau 3 Lektionen'), 'Mini-Skill: ein Aufruf, 3 Lektionen');
  const mini = { id: 'm', topic: 'Morsecode', title: 'Morsecode', domain: 'general', levels: ['Mini-Skill'], targetLevel: 0, level: '', mini: true, status: 'active', plan: {}, createdAt: 1, updatedAt: 1,
    stages: [{ id: 's', name: 'Mini', goal: '', lessons: [{ id: 'l1', title: 'A', goal: '' }, { id: 'l2', title: 'B', goal: '', known: true }] }] } as any;
  const miniP1 = S.lessonPrompt(mini, mini.stages[0], mini.stages[0].lessons[0]).system;
  ok(!S.skillComplete(mini) && miniP1.includes('MINI-SKILL') && miniP1.includes('dann 4 Aufgaben'), 'Mini-Skill: kurze Lektionen, noch nicht fertig');
  ok(miniP1.includes('Genau 4 tiefere') && miniP1.includes('typische Falle') && miniP1.includes('2 → 2 → 3 → 3') && miniP1.includes('NICHT mit einer bloßen Wissens-Auswahl'), 'Mini-Skill Lektion 1: tieferer Theorie-Input (4 Häppchen + Falle) & direkter Start auf level 2');
  const mini3 = { ...mini, stages: [{ ...mini.stages[0], lessons: [...mini.stages[0].lessons, { id: 'l3', title: 'C', goal: '' }] }] };
  const miniP3 = S.lessonPrompt(mini3, mini3.stages[0], mini3.stages[0].lessons[2]).system;
  ok(miniP3.includes('"style": "sprint"') && miniP3.includes('90–120 Wörter') && miniP3.includes('2 → 3 → 3 → 3'), 'Mini-Skill Lektion 3: gehaltvoller Sprint-Überblick & anspruchsvoller Transfer');
  const solved = { id: 'x', createdAt: 1, kind: 'general', topic: 'A', intro: '', labs: [], tasks: [{ type: 'calc', problem: '1', answer: { type: 'number', value: '1' } }], progress: [{ tries: 1, hints: 0, solved: true }] };
  mini.stages[0].lessons[0].set = solved;
  ok(S.skillComplete(mini) && S.wantsNextIdeas(mini), 'Mini-Skill fertig ohne Stufentest → „Wie geht\'s weiter?“');
  const np = S.nextSkillsPrompt(mini, ['Schach']);
  ok(np.user.includes('Morsecode') && np.user.includes('Schach') && np.system.includes('richtiger Skill'), 'nächster Skill: kennt Thema und vorhandene Skills, Mini zuerst vertiefen');
  const ideas = S.parseNextIdeas({ ideas: [{ title: 'Funk', why: 'w', mini: true }, { title: '' }, { title: 'B' }, { title: 'C' }, { title: 'D' }] });
  ok(ideas.length === 3 && ideas[0].mini === true && !ideas[1].mini && S.parseNextIdeas(null).length === 0, 'nächster Skill: höchstens 3, leere weg');
}

console.log('Jura-Fälle: Rechtsordnung, Kontext, Musterlösung; Tempo mit Vorwissen');
{
  const S = await import('../src/lib/skills');
  const T = await import('../src/lib/tasks');
  const P = await import('../src/lib/practice');
  const sk = (title: string, material = '') => ({ title, topic: title, material });
  ok(S.jurisdictionOf(sk('Schweizer Sachenrecht')) === 'ch' && S.jurisdictionOf(sk('BGB Allgemeiner Teil')) === 'de' && S.jurisdictionOf(sk('ABGB Schuldrecht')) === 'at', 'Rechtsordnung aus dem Thema');
  ok(S.jurisdictionOf(sk('Vertragsrecht'), 'ch') === 'ch' && S.jurisdictionOf(sk('Vertragsrecht')) === undefined && S.jurisdictionOf(sk('Vertragsrecht', 'Art. 1 OR … Art. 97 OR')) === 'ch' && S.jurisdictionOf(sk('Contract law', 'this or that or more')) === undefined, 'Rechtsordnung aus Material / Notenskala, „or“ im Text zählt nicht');
  const law = { id: 'j', topic: 'Sachenrecht', title: 'Sachenrecht', domain: 'law', jurisdiction: 'ch', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: 'g', lessons: [{ id: 'l', title: 'Besitz', goal: 'g' }] }], createdAt: 1, updatedAt: 1 } as any;
  const lp = S.lessonPrompt(law, law.stages[0], law.stages[0].lessons[0]);
  ok(lp.user.includes('RECHTSORDNUNG: Schweiz') && lp.system.includes('"norms"') && lp.system.includes('ALLE Angaben'), 'Jura-Lektion: Schweizer Recht, Sachverhalt mit allen Angaben, Normen zum Nachschlagen');

  const task = P.parseTask({ type: 'case', law: 'Schweizer Recht', facts: 'F', question: 'Q', norms: ['Art. 641 ZGB – Eigentum', '', ...Array.from({ length: 10 }, (_, k) => 'Art. ' + k)], rubric: [{ criterion: 'A', points: 2 }, { criterion: 'B', points: 3 }], solution: 'S' }) as any;
  ok(task.law === 'Schweizer Recht' && task.norms.length === 8 && task.norms[0].startsWith('Art. 641'), 'Fall: Rechtsordnung und höchstens 8 Normen');
  const sol = 'A könnte gegen B einen Anspruch auf Herausgabe des Velos gemäss Art. 641 Abs. 2 ZGB haben. Voraussetzung ist, dass A Eigentümer ist und B das Velo ohne Recht besitzt. A hat das Velo gekauft und übergeben erhalten, also ist er Eigentümer. B hat kein Recht zum Besitz. Ergebnis: Der Anspruch besteht.';
  ok(T.matchesSolution(sol, sol) && T.matchesSolution(sol.toUpperCase().replace(/ /g, '   ').replace(/\./g, ''), sol), 'Musterlösung erkannt – auch mit anderen Abständen, Groß/klein, Satzzeichen');
  ok(!T.matchesSolution(sol.slice(0, sol.length / 2), sol) && !T.matchesSolution('', sol) && !T.matchesSolution('kurz', 'kurz') && !T.matchesSolution(sol + ' ' + sol, sol), 'halbe Lösung, leer, zu kurz oder doppelt → nicht automatisch volle Punkte');
  const full = T.fullGrade({ ...task, rubric: [{ criterion: 'A', points: 2 }, { criterion: 'B', points: 3 }] });
  ok(full.total === 5 && full.max === 5 && full.criteria.every((c) => c.points === c.max), 'Musterlösung = volle Punktzahl');
  ok(T.caseGradePrompt(task, 'x', '').system.includes('volle Punktzahl') && T.caseGradePrompt(task, 'x', '').system.includes('nicht Wortlaut'), 'Bewertung: Inhalt zählt, Musterlösung = volle Punktzahl');

  const base = { ...law, domain: 'math', jurisdiction: undefined, plan: { questions: [{ q: 'Wie viel Vorwissen hast du?', options: ['Keins', 'Etwas', 'Viel'] }], answers: { 0: 'Keins' } } } as any;
  ok(S.paceOf(base) === 'normal' && S.paceOf({ ...base, plan: { ...base.plan, answers: { 0: 'Etwas' } } }) === 'fast' && S.paceOf({ ...base, plan: { ...base.plan, answers: { 0: 'Viel' } } }) === 'fast', 'Tempo: kein Vorwissen → normal, etwas/viel → schneller');
  const placement = { progress: [{ solved: true }, { solved: true }, { solved: true }, { tries: 1 }, { tries: 0 }] };
  ok(S.paceOf({ ...base, plan: { ...base.plan, placement } }) === 'fast' && S.paceOf({ ...base, stages: [{ ...base.stages[0], lessons: [{ id: 'x', title: 'x', goal: '', known: true }, ...base.stages[0].lessons] }] }) === 'fast', 'Tempo: gute Einstufung oder „kann ich schon“ → schneller');
  const fast = S.lessonPrompt({ ...base, plan: { ...base.plan, answers: { 0: 'Viel' } } }, base.stages[0], base.stages[0].lessons[0]);
  ok(!fast.system.includes('ANFÄNGER') && fast.system.includes('TEMPO'), 'Lektion mit Vorwissen: keine Anfänger-Regel, direkt zum Neuen');
  ok(P.problemCount !== undefined, 'Module geladen');
}

console.log('Weiß nicht ohne Sackgasse, abwechslungsreiche Folgeaufgaben, weniger Karten');
{
  const P = await import('../src/lib/practice');
  const C = await import('../src/lib/cardCount');
  const A = await import('../src/lib/ai');
  const t = (k: number) => ({ type: 'calc', problem: 'p' + k, answer: { type: 'number', value: '1' }, hints: [], steps: [] });
  const set = { id: 's', createdAt: 1, kind: 'math', topic: 'T', intro: '', labs: [], tasks: [t(0), t(1), t(2), t(3)], progress: [{ tries: 1, hints: 0, solved: true }, { tries: 0, hints: 0, dunno: true }, { tries: 0, hints: 0 }, { tries: 0, hints: 0 }] } as any;
  ok(P.settledCount(set) === 2 && P.solvedCount(set) === 1, 'gelöst oder „Weiß nicht“ zählt als erledigt – gelöst bleibt ehrlich');
  ok(P.nextOpen(set, 0) === 2 && P.nextOpen(set, 3) === 2 && P.nextOpen(set, 2) === 3, '„Weiter“: zur nächsten offenen Aufgabe, übersprungene und gelöste vorbei, rundum');
  const allDone = { ...set, progress: set.progress.map(() => ({ tries: 1, hints: 0, solved: true })) };
  ok(P.nextOpen(allDone, 1) === null, '„Weiter“: nichts mehr offen → Lektion durch');
  const later = P.insertTaskLater(set, 0, t(9) as any);
  ok((later.tasks![2] as any).problem === 'p9' && later.progress[2].extra === true && later.tasks!.length === 5, 'Folgeaufgabe kommt nach der nächsten Aufgabe, als Zusatz markiert');
  const end = P.insertTaskLater(set, 3, t(9) as any);
  ok((end.tasks![4] as any).problem === 'p9', 'Folgeaufgabe nach der letzten Aufgabe: ans Ende');
  const mp = P.mistakePrompt(set, set.tasks[0], '5');
  ok(mp.system.includes('anderer Aufgabentyp') && mp.system.includes('anderer Kontext') && !mp.system.includes('genau im selben Format'), 'Folgeaufgabe in anderer Form, nicht dieselbe mit neuen Zahlen');

  ok(C.maxCardsFor(3000, 'thorough') === 6 && C.maxCardsFor(40000, 'thorough') === 27 && C.maxCardsFor(200000, 'thorough') === 40, 'Gründlich: Sicherheitsnetz je Teil 6 bis 40 Karten');
  const r = C.cardRange(40000, 'thorough');
  ok(r.high === 27 && r.low <= r.high, 'Kostenschätzung nutzt dieselbe Obergrenze');
  ok(C.uncovered(['A', 'B', 'C'], [1, 3, 7, 'x', undefined]).join() === 'B' && C.uncovered(['A'], []).join() === 'A' && C.uncovered([], [1]).length === 0, 'Themen-Check: Themen ohne Karte gefunden, falsche Nummern zählen nicht');
  const parsed = A.parseCardsInfo(JSON.stringify({ topics: ['Osmose', 'Diffusion', ''], cards: [{ front: 'Was ist Osmose?', back: 'X', topic: 1 }, { front: 'Diffusion?', back: 'Y', topic: 'zwei' }] }));
  ok(parsed.topics.join() === 'Osmose,Diffusion' && parsed.cards[0].topic === 1 && parsed.cards[1].topic === undefined && A.parseCardsInfo(JSON.stringify({ cards: [{ front: 'a', back: 'b' }] })).topics.length === 0, 'Karten: Themenliste und Themen-Nummer gelesen, alte Antworten bleiben gültig');
  const first = A.cardsPrompt('Stoff', 0);
  const cont = A.cardsPrompt('Stoff', 0, '', false, { i: 1, n: 2, more: true, topics: ['Osmose', 'Diffusion'] });
  const gapsP = A.cardsPrompt('Stoff', 0, '', false, { i: 1, n: 2, gaps: ['Diffusion'] });
  ok(first.system.includes('"topics"') && first.user.includes('HAUPTTHEMEN') && cont.user.includes('1. Osmose; 2. Diffusion') && !cont.system.includes('"topics"') && gapsP.user.includes('- Diffusion') && !gapsP.user.includes('HAUPTTHEMEN'), 'Prompt: erst Themenliste, Fortsetzung nummeriert danach, fehlende Themen gezielt');
  ok(!A.cardsPrompt('Stoff', 10).system.includes('"topics"'), 'feste Anzahl: ohne Themenliste wie bisher');
  const J = await import('../src/lib/jobs');
  const job = (id: string, run: string, status: string) => ({ id, kind: 'cards', deckId: 'd', title: '', status, createdAt: 1, params: { run } }) as any;
  const jobs = [job('a', 'r1', 'running'), job('b', 'r1', 'queued'), job('c', 'r1', 'done'), job('d', 'r2', 'queued')];
  ok(J.runJobsToCancel(jobs, 'a').sort().join() === 'a,b' && J.runJobsToCancel(jobs, 'd').join() === 'd' && J.runJobsToCancel(jobs, 'x').length === 0, 'Stoppen: alle laufenden Teile des Auftrags, fertige und andere Aufträge bleiben');
  ok(C.applyCuration(10, [1, 3, 3, 99, 'x', 0, 5, 6, 7, 8]).join() === '0,2,4,5' && C.applyCuration(10, null).length === 0, 'Aussortieren: nur gültige Nummern, höchstens 40 %');
  const cp = A.curatePrompt([{ front: '<b>Was ist X?</b>', back: 'X ist …' }, { front: 'Was ist Y?', back: 'Y' }]);
  ok(cp.user.startsWith('1. Was ist X?') && cp.user.includes('2. Was ist Y?') && cp.system.includes('Dopplungen') && cp.system.includes('Im Zweifel behalten'), 'Aussortieren: KI sieht alle Fragen nummeriert, behält im Zweifel');
}

console.log('Wortsalat-Erkennung: fremde Schrift im Lernstoff ist erlaubt');
{
  const A = await import('../src/lib/ai');
  const input = 'Erstelle eine Lektion zum Thema Hiragana: die ersten zehn Zeichen. Antworte auf Deutsch.';
  const hiragana = JSON.stringify({ topic: 'Hiragana', bites: [{ title: 'Vokale', text: 'あ (a), い (i), う (u), え (e), お (o) – das sind die Vokale. か き く け こ kommen danach.' }] });
  ok(!A.looksLikeSalad(hiragana, input), 'Hiragana-Lektion ist kein Wortsalat');
  const greek = 'Das griechische Alphabet: α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω – Alpha, Beta, Gamma …';
  ok(!A.looksLikeSalad(greek, input), 'griechische Buchstaben sind kein Wortsalat');
  ok(!A.looksLikeSalad('Привет! Как дела? Das heißt „Hallo! Wie geht es?“ – Привет = Hallo, Как = wie, дела = Sachen', input), 'russische Wörter sind kein Wortsalat');
  const salad = 'и ж 漢字 ქართ ภาษา עברית حروف अक्षर 문자 Ελλ the и ж ქართ ภาษา עברית حروف अक्षर 문자 Ελλ ქართ ภาษา עברית حروف';
  ok(A.looksLikeSalad(salad, input), 'echter Wortsalat aus vielen Alphabeten wird erkannt');
  ok(!A.looksLikeSalad('Eine ganz normale deutsche Antwort.', input), 'normale Antwort bleibt');
}

console.log('Kompakt: wenige Karten auch aus langen Zusammenfassungen');
{
  const C = await import('../src/lib/cardCount');
  const A = await import('../src/lib/ai');
  ok(C.maxCardsFor(10000) === 4 && C.maxCardsFor(40000) === 11 && C.maxCardsFor(200000) === 15, 'Kompakt (Standard): Sicherheitsnetz 4 bis 15 je Teil');
  const k = C.autoCardInstruction(40000, 'compact');
  ok(k.includes('HAUPTTHEMEN') && k.includes('nicht jeden Satz') && k.includes('höchstens 11 ') && !C.autoCardInstruction(40000, 'thorough').includes('nicht jeden Satz'), 'Kompakt: Hauptthemen, nicht jeden Satz zur Karte');
  ok(C.cardRange(40000).high < C.cardRange(40000, 'thorough').high && C.cardRange(40000).low <= C.cardRange(40000).high, 'Kostenschätzung: kompakt weniger als gründlich');
  const stoff = 'x'.repeat(40000);
  ok(A.cardsPrompt(stoff, 0).user.includes('höchstens 11 ') && A.cardsPrompt(stoff, 0, '', false, undefined, false, [], 'thorough').user.includes('höchstens 27 '), 'Prompt: Umfang wird weitergegeben');
  ok(A.curatePrompt([{ front: 'a', back: 'b' }]).system.includes('KOMPAKTER') && !A.curatePrompt([{ front: 'a', back: 'b' }], [], 'thorough').system.includes('KOMPAKTER'), 'Aussortieren: kompakt behält je Hauptthema die beste Karte');
  ok(C.shouldCurate(20, [18800]) && !C.shouldCurate(6, [18800]) && !C.shouldCurate(12, [40000], 'thorough') && C.shouldCurate(12, [40000, 40000]) && !C.shouldCurate(11, [40000, 40000]), 'Aussortieren: ein Teil erst bei deutlich mehr Karten als erlaubt, mehrere Teile ab 12');
}

console.log('Schlauer „Weiter“-Knopf und Schwierigkeit, die sich anpasst');
{
  const P = await import('../src/lib/practice');
  const S = await import('../src/lib/skills');
  const t = (k: number, level?: number) => ({ type: 'calc', problem: 'p' + k, answer: { type: 'number', value: '1' }, hints: [], steps: [], ...(level ? { level } : {}) });
  const clean = { tries: 1, hints: 0, solved: true };
  const open = { tries: 0, hints: 0 };
  ok((P.parseTask({ type: 'calc', problem: 'x', answer: { type: 'number', value: '1' }, level: 3 }) as any).level === 3 && (P.parseTask({ type: 'calc', problem: 'x', answer: { type: 'number', value: '1' }, level: 7 }) as any).level === undefined, 'Aufgaben: Stufe 1–3 übernommen, Unsinn weg');
  const set = (progress: any[], levels = [1, 2, 1, 3, 2]) => ({ id: 's', createdAt: 1, kind: 'math', topic: 'T', intro: '', labs: [], tasks: levels.map((lv, k) => t(k, lv)), progress }) as any;
  // two clean solves (tasks 0 and 1, level 2 at 1) → next harder open (task 3, level 3), not task 2 (level 1)
  ok(P.pickNext(set([clean, clean, open, open, open]), 1) === 3, 'läuft gut → nächste schwerere Aufgabe');
  ok(P.pickNext(set([clean, { tries: 3, hints: 1, solved: true }, open, open, open]), 1) === 2, 'mit Mühe gelöst → nicht schwerer');
  ok(P.pickNext(set([open, open, open, open, open], [0, 0, 0, 0, 0] as any), 0) === 1, 'ohne Stufen → der Reihe nach');
  const withExtra = { ...set([clean, open, open, open, open]), progress: [clean, open, open, open, { ...clean, extra: true }] };
  ok(P.problemCount(withExtra) === 4 && P.solvedCount(withExtra) === 1 && P.settledCount(withExtra) === 1, 'Zusatz- und Bonus-Aufgaben zählen nicht für das Meistern');
  ok(P.goingWell(set([clean, clean, clean, open, open])) && !P.goingWell(set([clean, clean, open, open, open])) && !P.goingWell(set([clean, clean, { tries: 2, hints: 0, solved: true }, open, open])), 'Bonus nur, wenn mindestens 3 Aufgaben sauber gelöst sind');
  const hp = P.harderPrompt(set([clean]), t(0, 2) as any);
  ok(hp.system.includes('schwerer') && hp.user.includes('"p0"') && (P.parseHarder({ task: { type: 'calc', problem: 'b', answer: { type: 'number', value: '2' }, level: 3 } }) as any)?.level === 3, 'Bonus-Aufgabe: eine Stufe schwerer');

  const DAY = 86_400_000, now = 10 * DAY;
  const done = (id: string, doneAt?: number) => ({ id, title: id, goal: '', ...(doneAt ? { doneAt } : {}), set: { id: 'x' + id, createdAt: 1, kind: 'math', topic: id, intro: '', labs: [], tasks: [t(0), t(1), t(2), t(3), t(4)], progress: [clean, clean, clean, clean, clean] } });
  const sk = (lessons: any[], extra: any = {}) => ({ id: 'k', topic: 'T', title: 'T', domain: 'math', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: '', lessons }], createdAt: 1, updatedAt: 1, ...extra }) as any;
  const fresh = [done('a', now - 3 * DAY), done('b', now - DAY), { id: 'c', title: 'c', goal: '' }];
  ok(S.nextStep(sk(fresh), now)?.kind === 'review', 'nach 2 neuen Lektionen: kurze Wiederholung');
  ok(S.nextStep(sk(fresh, { lastReviewAt: now - 2 * DAY }), now)?.kind === 'lesson', 'seit der letzten Wiederholung erst 1 neue Lektion → neue Lektion');
  ok(S.nextStep(sk([done('a', now - 5 * DAY), done('b', now - 4 * DAY), { id: 'c', title: 'c', goal: '' }], { lastReviewAt: now - 3 * DAY }), now)?.kind === 'lesson', 'Lektionen vor der letzten Wiederholung zählen nicht');
  ok(S.nextStep(sk(fresh, { lastReviewAt: now - 3600_000 }), now)?.kind === 'lesson', 'höchstens eine Wiederholung pro Tag');
  const shaky = { ...done('w', now - 5 * DAY), set: { ...done('w').set, progress: [clean, clean, clean, clean, { tries: 1, hints: 0, solved: true, dunno: false, shown: true }].map((x, k) => (k < 4 ? { tries: 3, hints: 2, solved: true } : x)) } };
  const weakStep = S.nextStep(sk([shaky, { id: 'c', title: 'c', goal: '' }], { lastReviewAt: now }), now);
  ok(weakStep?.kind === 'weak' && (weakStep as any).lesson.id === 'w' && S.nextStep(sk([shaky, { id: 'c', title: 'c', goal: '' }], { lastReviewAt: now, lastWeakAt: now - DAY }), now)?.kind === 'lesson', 'Schwachstelle unter 50 % → festigen, aber nicht öfter als alle 2 Tage');
  ok(S.nextStep(sk([done('a')], { mini: true }), now) === null, 'alles geschafft → kein nächster Schritt (Stufentest wie bisher)');

  const easy = [done('a'), done('b'), { id: 'c', title: 'c', goal: '' }];
  ok(S.paceOf(sk(easy)) === 'fast', 'letzte zwei Lektionen sauber → schneller');
  const hard = (id: string) => ({ ...done(id), set: { ...done(id).set, progress: Array.from({ length: 5 }, () => ({ tries: 3, hints: 2, solved: true })) } });
  const gentle = sk([hard('a'), hard('b'), { id: 'c', title: 'c', goal: '' }]);
  ok(S.paceOf(gentle) === 'gentle' && S.lessonPrompt(gentle, gentle.stages[0], gentle.stages[0].lessons[2]).system.includes('Kleinere Schritte'), 'letzte Lektionen schwer → kleinere Schritte');
  ok(S.reviewPrompt(sk(easy), undefined, 4).system.includes('4 Aufgaben') && S.reviewPrompt(sk(easy)).system.includes('8 Aufgaben'), 'kurze Wiederholung: 4 Aufgaben');
}

console.log('Gegenprüfung neuer Aufgaben');
{
  const C = await import('../src/lib/taskCheck');
  const calc = (k: number, value = String(k)) => ({ type: 'calc', problem: 'p' + k, answer: { type: 'number', value }, hints: [], steps: [] });
  const set = (n: number, progress?: any[]) => ({ id: 's', createdAt: 1, kind: 'math', topic: 'Rechnen', intro: '', labs: [], tasks: Array.from({ length: n }, (_, k) => calc(k)), progress: progress ?? Array.from({ length: n }, () => ({ tries: 0, hints: 0 })) }) as any;

  ok(C.plausibility({ type: 'estimate', prompt: 'x', min: 0, max: 10, step: 1, unit: '', answer: 12, tolerance: 1, hints: [] } as any)?.includes('außerhalb') === true, 'Schätzen: Lösung außerhalb des Reglers erkannt');
  ok(C.plausibility({ type: 'calc', problem: 'x', answer: { type: 'choice', value: 'C', options: ['A', 'B'] }, hints: [], steps: [] } as any)?.includes('Auswahl') === true && C.plausibility(calc(1) as any) === null, 'Auswahl ohne richtige Antwort erkannt, normale Aufgabe ok');

  const p = C.verifyPrompt(set(3), { 2: 'Die Musterlösung besteht 1 von 3 Tests nicht' }, 'RECHTSORDNUNG: Schweiz');
  ok(p.user.includes('AUFGABE 2 – BEFUND: Die Musterlösung') && p.user.includes('"p0"') && p.system.includes('RECHTSORDNUNG: Schweiz') && p.system.includes('Rechne bzw. löse sie selbst'), 'Prüf-Anweisung enthält Aufgaben, Befunde und Rechtsordnung');

  const v = C.parseVerify({ fixes: [{ task: 2, why: 'falsch', fixed: calc(99, '42') }, { task: 9, fixed: calc(1) }, { task: 3, fixed: { type: 'calc' } }], drop: [4, 'x', 2] }, set(6));
  ok(v.fixes.length === 1 && v.fixes[0].index === 1 && (v.fixes[0].task as any).answer.value === '42' && v.drop.join() === '3', 'Urteil: nur gültige Korrekturen, unsinnige Nummern weg');
  const many = C.parseVerify({ fixes: [1, 2, 3, 4].map((k) => ({ task: k, fixed: calc(k, '9') })), drop: [5, 6] }, set(6));
  ok(many.fixes.length === 3 && many.drop.length === 0, 'höchstens die Hälfte der Aufgaben wird geändert');
  ok(C.parseVerify({ drop: [1, 2] }, set(4)).drop.length === 1, 'nach dem Entfernen bleiben mindestens 3 Aufgaben');

  const touched = set(5, [{ tries: 1, hints: 0 }, { tries: 0, hints: 0 }, { tries: 0, hints: 0 }, { tries: 0, hints: 0, solved: true }, { tries: 0, hints: 0 }]);
  const a = C.applyVerify(touched, { fixes: [{ index: 0, why: '', task: calc(50) as any }, { index: 1, why: '', task: calc(51) as any }], drop: [3, 4] });
  ok(a.fixed === 1 && a.dropped === 1 && (a.patch.tasks![0] as any).problem === 'p0' && (a.patch.tasks![1] as any).problem === 'p51' && a.patch.progress[1].fixed === true && a.patch.tasks!.length === 4 && a.patch.progress.length === 4, 'nur unberührte Aufgaben werden korrigiert oder entfernt, Fortschritt bleibt passend');
}

console.log('Fortschritt während die KI arbeitet');
{
  const T = await import('../src/lib/aiTiming');
  ok(T.kindOfKey('sk1:questions') === 'questions' && T.kindOfKey('sk1:test:st') === 'test' && T.kindOfKey('sk1:l123') === 'lesson' && T.kindOfKey('sk1:check:x') === 'check' && T.kindOfKey('sk1:project:s') === 'project', 'Art der Anfrage aus dem Schlüssel');
  ok(T.typicalAiSeconds('lesson', []) === 45 && T.typicalAiSeconds('lesson', [20, 30, 100]) === 30 && T.typicalAiSeconds('lesson', [20, 40]) === 30, 'übliche Dauer: eigene Messungen (Median), sonst Richtwert');
  const at = (e: number) => T.aiProgress(e, 40);
  ok(at(0) === 0 && at(10) < at(20) && Math.abs(at(40) - 0.7) < 0.02 && at(80) > 0.9 && at(1000) === 0.95, 'Balken: läuft stetig, ~70 % bei üblicher Dauer, nie „fertig“ vor der Antwort');
  ok(T.aiStep(0, 5) === 0 && T.aiStep(0.5, 5) === 2 && T.aiStep(0.95, 5) === 4 && T.aiStep(2, 5) === 4, 'Schritte folgen dem Balken, der letzte bleibt bis zur Antwort');
}

console.log('Lücken fair bewerten');
{
  const P = await import('../src/lib/practice');
  const T = await import('../src/lib/tasks');
  const S = await import('../src/lib/skills');
  const gap = (answer: string[]) => ({ type: 'gap', prompt: 'Ein Antigen ist ein ___', answer }) as any;
  ok(P.checkBiteGap(gap(['Eiweiß']), 'eiweiss') && P.checkBiteGap(gap(['Eiweiß']), 'Eiweisse') && P.checkBiteGap(gap(['Zelle']), 'Zellen') && P.checkBiteGap(gap(['Muskulatur']), 'Muskelatur'), 'ß/ss, Mehrzahl und ein Tippfehler werden erkannt');
  ok(P.checkBiteGap(gap(['Grüne']), 'gruene') && P.checkBiteGap(gap(['0,5']), '1/2') && !P.checkBiteGap(gap(['Molekül']), 'Zelle') && !P.checkBiteGap(gap(['Rot']), 'Rotation'), 'ä/ae und Zahlen ja, falsche oder nur ähnliche Wörter nein');
  const q = T.gapCheckPrompt('Ein Antigen ist ein ____ auf der Oberfläche.', ['Molekül'], 'Eiweiß', 'Antigene sind meist Eiweiße.');
  ok(q.user.includes('Molekül') && q.user.includes('Eiweiß') && q.user.includes('____') && q.system.includes('Nur verwandt'), 'KI-Nachprüfung kennt Satz, Lösung und Antwort und ist streng');
  ok(T.parseGapCheck({ ok: true, note: 'x' }).ok && !T.parseGapCheck({ ok: 'yes' }).ok && !T.parseGapCheck(null).ok, 'nur ein klares „ok: true“ zählt');
  const sk = { id: 'k', topic: 'T', title: 'T', domain: 'general', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: '', lessons: [{ id: 'l', title: 'L', goal: '' }] }], createdAt: 1, updatedAt: 1 } as any;
  ok(S.lessonPrompt(sk, sk.stages[0], sk.stages[0].lessons[0]).system.includes('ALLE richtigen Varianten'), 'Lücken-Regel: eindeutig, alle richtigen Varianten');
}

console.log('Lange Lektionen: Aufgaben gehen nicht verloren');
{
  const S = await import('../src/lib/skills');
  const sk = { id: 'k', topic: 'PR', title: 'PR', domain: 'general', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: '', lessons: [{ id: 'l', title: 'L', goal: '' }] }], createdAt: 1, updatedAt: 1 } as any;
  const p = S.lessonPrompt(sk, sk.stages[0], sk.stages[0].lessons[0]);
  ok(p.system.includes('"bites" (die vollständige Erklärung)') && p.system.includes('ERST DANACH "problems"') && p.maxTokens >= 12000, 'Lektion: Erklärung vor Aufgaben im JSON, genug Platz für die Antwort');
  const R = await import('../src/lib/skillRun');
  ok(R.RETRY_SHORTER.includes('KÜRZER') && R.RETRY_SHORTER.includes('"problems"'), 'zweiter Versuch: kürzer und unbedingt mit Aufgaben');
}

console.log('Beschriften per Drag & Drop, Aufgabentypen passend zum Thema');
{
  const S = await import('../src/lib/skills');
  const D = await import('../src/lib/diagram');
  const C = await import('../src/lib/taskCheck');
  const sk = (title: string, domain = 'general') => ({ id: 'k', topic: title, title, domain, levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: '', lessons: [{ id: 'l', title: 'L', goal: '' }] }], createdAt: 1, updatedAt: 1 }) as any;
  ok(!S.numericTopic(sk('Public Relations auf Bachelor-Praxisniveau')) && S.numericTopic(sk('Statistik für die Uni')) && S.numericTopic(sk('Buchhaltung Grundlagen')) && S.numericTopic(sk('Ableitungen', 'math')), 'Zahlen-Thema erkannt: PR nein, Statistik/Buchhaltung/Mathe ja');
  const pr = sk('Public Relations');
  const pp = S.lessonPrompt(pr, pr.stages[0], pr.stages[0].lessons[0]).system;
  const st = sk('Statistik für die Uni');
  const sp = S.lessonPrompt(st, st.stages[0], st.stages[0].lessons[0]).system;
  ok(!pp.includes('{"type":"sheet"') && pp.includes('keine erfundenen Zahlen') && !/Einstiegs-Typen[^\n]*"sheet"/.test(pp) && sp.includes('{"type":"sheet"') && !sp.includes('keine erfundenen Zahlen'), 'PR-Lektion: keine Tabellen-Aufgaben, keine erfundenen Zahlen; Statistik behält sie');
  ok(C.verifyPrompt({ id: 's', createdAt: 1, kind: 'general', topic: 'PR', intro: '', labs: [], tasks: [], progress: [] } as any).system.includes('Passt der Aufgabentyp zum Thema'), 'Gegenprüfung ersetzt unpassende Aufgabentypen');

  const dg = { type: 'flow', steps: ['Press Agentry', 'Public Information', 'Two-Way asymmetrisch', 'Two-Way symmetrisch'] } as any;
  const svg = D.renderDiagram(dg, D.PALETTES.light, { hideMany: [0, 1, 2, 3], filled: ['Press Agentry', undefined, 'X', undefined], marks: [true, undefined, false, undefined] });
  ok((svg.match(/data-slot="/g) ?? []).length === 4 && svg.includes('>Press Agentry<') && svg.includes('#1f9d6b') && svg.includes('#d93f3f') && svg.includes('>2<'), 'Grafik: Ablagefelder, abgelegte Begriffe, richtig/falsch farbig, freie Felder mit Nummer');
}

console.log('Skill-Vorschläge: getrennt blättern, Kategorien, Kurzinfo');
{
  const S = await import('../src/lib/skills');
  const P = await import('../src/lib/topicPool');
  const p0 = S.pageTopics(S.TOPIC_POOL, 6, 42, 0), p1 = S.pageTopics(S.TOPIC_POOL, 6, 42, 1);
  ok(p0.length === 6 && p1.length === 6 && !p0.some((t) => p1.includes(t)) && S.pageTopics(S.TOPIC_POOL, 6, 42, 1).join() === p1.join(), 'Andere: nächster Block ohne Wiederholung, gleiche Seite = gleiche Themen');
  const seen = new Set<string>();
  for (let k = 0; k < Math.floor(S.TOPIC_POOL.length / 6); k++) S.pageTopics(S.TOPIC_POOL, 6, 7, k).forEach((t) => seen.add(t));
  ok(seen.size === Math.floor(S.TOPIC_POOL.length / 6) * 6, 'Durchblättern zeigt jedes Thema höchstens einmal');
  ok(!S.pageTopics(S.TOPIC_POOL, 6, 3, 0, ['Stochastik']).includes('Stochastik') && S.pageTopics(['A', 'B'], 6, 1, 3).length === 2, 'vorhandene Skills fallen weg, kleiner Pool geht');
  const prefer = P.SKILL_IDEAS.filter((x) => x.cat === 'recht').map((x) => x.t);
  ok(S.pageTopics(S.TOPIC_POOL, 6, 9, 0, [], prefer).every((t) => prefer.includes(t)), 'Interessen kommen zuerst');
  const all = [...P.SKILL_IDEAS, ...P.MINI_IDEAS];
  const names = all.map((x) => x.t.toLowerCase());
  ok(P.SKILL_IDEAS.length >= 90 && P.MINI_IDEAS.length >= 90 && new Set(names).size === names.length, 'je mind. 90 Themen, keine Dopplungen (auch nicht zwischen den Listen)');
  ok(all.every((x) => P.TOPIC_CATS.includes(x.cat) && x.info.trim().length > 0 && x.info.length <= 140), 'jedes Thema hat Kategorie und Kurzinfo');
  ok(P.TOPIC_CATS.every((c) => P.SKILL_IDEAS.some((x) => x.cat === c) && P.MINI_IDEAS.some((x) => x.cat === c)), 'jede Kategorie hat Skills und Mini-Skills');
}
console.log('Erklär es mir, Zuordnen, Mini-Projekt im Weiter');
{
  const T = await import('../src/lib/tasks');
  const P = await import('../src/lib/practice');
  const S = await import('../src/lib/skills');
  const ex = T.parseActive({ type: 'explain', concept: 'Public Relations', prompt: 'Erkläre PR', keyPoints: [{ criterion: 'was es ist', points: 2 }, { criterion: 'Abgrenzung zu Werbung', points: 2 }], solution: 'PR ist …' });
  ok(!!ex && ex.type === 'explain' && ex.keyPoints.length === 2 && !T.parseActive({ type: 'explain', concept: 'X', keyPoints: ['nur einer'], solution: 'y' }) && !T.parseActive({ type: 'explain', concept: 'X', keyPoints: ['a', 'b'] }), 'Erklär-Aufgabe: gültig nur mit Begriff, mind. 2 Kernpunkten und Mustererklärung');
  const c = T.explainAsCase(ex as any);
  ok(c.type === 'case' && c.rubric.length === 2 && c.solution === 'PR ist …' && c.question.includes('eigenen Worten'), 'Erklär-Aufgabe wird wie ein Fall bewertet (Kernpunkte = Schema)');
  ok(P.taskRules('law').includes('"type":"explain"') && !P.taskRules('java').includes('"type":"explain"'), 'Erklär-Aufgabe bei Recht ja, bei Programmieren nein');
  const lesson = (id: string) => ({ id, title: id, goal: '', set: { id: 's' + id, createdAt: 1, kind: 'general', topic: '', intro: '', labs: [], tasks: [{ type: 'multi', prompt: 'p', options: ['a', 'b', 'c'], correct: [0], hints: [] }], progress: [{ tries: 1, hints: 0, solved: true }] } });
  const sk = { id: 'k', topic: 'T', title: 'T', domain: 'general', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, lastReviewAt: Date.now(), createdAt: 1, updatedAt: 1,
    stages: [{ id: 'a', name: 'Stufe A', goal: '', passed: true, lessons: [lesson('l1')] }, { id: 'b', name: 'Stufe B', goal: '', lessons: [{ id: 'l2', title: 'l2', goal: '' }] }] } as any;
  const st = S.nextStep(sk);
  ok(st?.kind === 'project' && st.stage.id === 'a', 'Weiter schlägt nach bestandener Stufe das Mini-Projekt vor');
  sk.stages[0].projectSkipped = true;
  ok(S.nextStep(sk)?.kind === 'lesson', 'übersprungenes Projekt wird nicht mehr vorgeschlagen');
}
console.log('Formeln in Erklärungen, mehr Grafiken');
{
  const E = await import('../src/lib/emphasis');
  const P = await import('../src/lib/practice');
  const S = await import('../src/lib/skills');
  const a = E.splitMath('Faktor \\( 1 + p/100 \\) teurer');
  ok(a.length === 3 && !a[0].math && a[1].math && !(a[1] as any).display && a[1].text === '\\( 1 + p/100 \\)' && a[2].text === ' teurer', 'Formel im Text wird als eigener Teil erkannt');
  const b = E.splitMath('Es gilt $$K_n = K_0 (1+p)^n$$ und \\[x_i\\]');
  ok(b.filter((x) => x.math).length === 2 && b.filter((x) => x.math).every((x: any) => x.display) && b[1].text.includes('K_n'), 'Block-Formeln $$…$$ und \\[…\\]');
  ok(E.splitMath('ganz ohne _Formel_').length === 1 && !E.splitMath('ganz ohne _Formel_')[0].math && E.splitMath('').length === 1, 'Text ohne Formel bleibt ein Stück');
  const set = P.parsePractice({ kind: 'general', topic: 'Zins', intro: 'x', bites: [{ title: 'T', text: 'Mit \\( \x0crac{1}{2} \\) rechnen' }], problems: [{ type: 'calc', problem: 'Was ist \\( \x0crac{1}{2} \\)?', answer: { type: 'number', value: '0,5' } }] }, 'id', 1);
  ok(!!set && !!set.bites?.[0].text.includes('\\frac{1}{2}') && (set.tasks?.[0] as any).problem.includes('\\frac'), 'kaputter Backslash (Seitenvorschub statt \\f) wird beim Einlesen repariert');
  const sk = { id: 'k', topic: 'Inflation', title: 'Inflation und Kaufkraft', domain: 'general', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: '', lessons: [{ id: 'l', title: 'L', goal: '' }] }], createdAt: 1, updatedAt: 1 } as any;
  const sys = S.lessonPrompt(sk, sk.stages[0], sk.stages[0].lessons[0]).system;
  ok(sys.includes('Mindestens ein Häppchen') && sys.includes('"plot" mit der Formel') && sys.includes('1–3 Grafiken'), 'Lektion: mindestens eine Grafik, Formeln als Kurve');
  const figs = P.parsePractice({ kind: 'general', topic: 't', intro: 'x', figures: [1, 2, 3, 4].map((k) => ({ diagram: { type: 'flow', steps: ['a' + k, 'b', 'c'] } })), problems: [{ type: 'calc', problem: 'p', answer: { type: 'number', value: '1' } }] }, 'i', 1);
  ok(figs?.figures?.length === 3, 'bis zu 3 Grafiken pro Lektion');
}
console.log('Nur Erklärtes abfragen, weniger Abfragen, Wörter statt Tippen');
{
  const S = await import('../src/lib/skills');
  const P = await import('../src/lib/practice');
  const T = await import('../src/lib/tasks');
  const C = await import('../src/lib/taskCheck');
  const sk = { id: 'k', topic: 'Börse', title: 'Börse', domain: 'general', levels: ['a'], targetLevel: 0, level: '', status: 'active', plan: {}, stages: [{ id: 'st', name: 'S', goal: '', lessons: [{ id: 'l', title: 'L', goal: '' }] }], createdAt: 1, updatedAt: 1 } as any;
  const sys = S.lessonPrompt(sk, sk.stages[0], sk.stages[0].lessons[0]).system;
  ok(sys.includes('NUR ERKLÄRTES ABFRAGEN') && sys.includes('dann 5 Aufgaben') && sys.includes('Höchstens 2 Häppchen pro Lektion bekommen einen "check"'), 'Lektion: nur Erklärtes abfragen, 5 Aufgaben, höchstens 2 Kurz-Checks');
  const set = { id: 's', createdAt: 1, kind: 'general', topic: 'Börse', intro: 'x', labs: [], bites: [{ title: 'Kurs', text: 'Der Kurs ist der Preis des letzten Abschlusses.' }], tasks: [{ type: 'multi', prompt: 'p', options: ['a', 'b', 'c'], correct: [0], hints: [] }], progress: [{ tries: 0, hints: 0 }] } as any;
  const v = C.verifyPrompt(set);
  ok(v.user.includes('ERKLÄRUNG DER LEKTION') && v.user.includes('Preis des letzten Abschlusses') && v.system.includes('Orderbuch'), 'Gegenprüfung kennt die Erklärung und ersetzt Aufgaben zu nicht Erklärtem');
  ok(!C.verifyPrompt({ ...set, bites: undefined, intro: '' }).system.includes('7. Wurde alles'), 'ohne Erklärung (z. B. Stufentest) keine solche Prüfung');
  const cz = T.parseActive({ type: 'cloze', text: 'Ein {{1}} ist ein {{2}}.', gaps: [['Hund'], ['Tier']], distractors: ['Katze', 'tier', 'Baum'] }) as any;
  ok(cz.distractors.join() === 'Katze,Baum', 'Lückentext: Ablenker-Wörter, keine die in eine Lücke passen');
  const b = P.parseBites([{ title: 'T', text: 'x', check: { type: 'gap', prompt: 'Der ___ ist …', answer: ['Kurs'], options: ['Kurs', 'Zins', 'Index'] } }, { title: 'U', text: 'y', check: { type: 'gap', prompt: 'a ___', answer: ['Kurs'], options: ['Zins', 'Index'] } }], 0) as any;
  ok(b[0].check.options.length === 3 && !b[1].check.options, 'Kurz-Lücke: Wörter zum Antippen nur, wenn das richtige dabei ist');
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

console.log('Arbeitsplanung & To-do-Reihenfolge');
{
  const { buildWorkPlan } = await import('../src/lib/workPlan');
  const { todoGroups } = await import('../src/lib/todos');

  const empty = buildWorkPlan([], 60);
  ok(empty.steps.length === 0 && empty.parked.length === 0, 'ohne Aufgaben: leerer Plan');

  const plan = buildWorkPlan(
    [
      { id: 't1', title: 'Trockene Theorie', motivation: 1, size: 'l', important: true },
      { id: 't2', title: 'Lieblingsthema Einstieg', motivation: 3, size: 's' },
      { id: 't3', title: 'Zusammenfassung', motivation: 2, size: 's' },
    ],
    90,
    true,
  );
  const taskSteps = plan.steps.filter((s) => s.kind === 'task');
  ok(plan.totalMinutes === 90, 'Gesamtzeit stimmt exakt (90 Min.)');
  ok(taskSteps[0].taskId === 't2' && taskSteps[0].phase === 'start', 'Einstieg wählt motivierende/leichte Aufgabe zuerst');
  ok(taskSteps[1].taskId === 't1' && taskSteps[1].phase === 'main', 'Hauptteil bekommt wichtige/schwere Aufgabe');
  ok(taskSteps[taskSteps.length - 1].taskId === 't3' && taskSteps[taskSteps.length - 1].phase === 'end', 'Abschluss bekommt machbare Aufgabe am Ende');
  ok(plan.breakMinutes > 0 && plan.steps.some((s) => s.kind === 'break'), 'bei 90 Min. wird mindestens eine Pause eingeplant');

  const tight = buildWorkPlan(
    [
      { id: 'a', title: 'A', motivation: 3, size: 'm', important: true },
      { id: 'b', title: 'B', motivation: 2, size: 'm' },
      { id: 'c', title: 'C', motivation: 1, size: 'l' },
      { id: 'd', title: 'D', motivation: 1, size: 'l' },
    ],
    25,
    false,
  );
  ok(tight.parked.length >= 2 && tight.steps.filter((s) => s.kind === 'task').length === 2, 'bei knapper Zeit werden überschüssige Aufgaben geparkt');

  const now = new Date('2026-11-20T10:00:00Z').getTime();
  const g = todoGroups(
    [
      { id: '2', text: 'Zweite', due: '2026-11-20', order: 2, createdAt: 1 },
      { id: '1', text: 'Erste', due: '2026-11-20', order: 1, createdAt: 99 },
    ],
    now,
  );
  ok(g[0].items[0].id === '1' && g[0].items[1].id === '2', 'To-dos eines Tages folgen der Arbeitsplan-Reihenfolge');
}

console.log('Abwechslung in Skills: Häppchen-Checks, Lektions-Stile, Aufgaben-Regie');
{
  const P = await import('../src/lib/practice');
  const S = await import('../src/lib/skills');

  const bites = P.parseBites(
    [
      { title: 'Mythos', text: 'Text 1', check: { type: 'tf', statement: 'Wasser kocht immer bei 100 °C.', answer: false, why: 'Vom Luftdruck abhängig.' } },
      { title: 'Lücke', text: 'Text 2', check: { type: 'gap', prompt: 'Die Hälfte als Dezimalzahl: ___', answer: ['0,5', 'ein halb'], why: '1/2 = 0,5' } },
      { title: 'Denken', text: 'Text 3', check: { type: 'reveal', q: 'Warum sinkt der Siedepunkt am Berg?', answer: 'Geringerer Luftdruck.' } },
      { title: 'Schätzen', text: 'Text 4', check: { type: 'estimate', q: 'Siedepunkt auf dem Mount Everest?', min: 50, max: 100, answer: 70, unit: '°C', tolerance: 5 } },
      { title: 'Ungültig', text: 'Text 5', check: { type: 'estimate', q: 'Kaputt', min: 100, max: 50, answer: 70 } },
    ],
    0,
  );
  ok(
    bites.length === 5 &&
      bites[0].check?.type === 'tf' &&
      bites[0].check.answer === false &&
      bites[1].check?.type === 'gap' &&
      bites[2].check?.type === 'reveal' &&
      bites[3].check?.type === 'estimate' &&
      bites[3].check.unit === '°C' &&
      !bites[4].check,
    'Häppchen-Checks: tf, gap, reveal, estimate geparst; ungültige verworfen',
  );
  const gap = bites[1].check as Extract<import('../src/lib/practice').BiteCheck, { type: 'gap' }>;
  ok(
    P.checkBiteGap(gap, '0,5') && P.checkBiteGap(gap, '0.5') && P.checkBiteGap(gap, '1/2') && P.checkBiteGap(gap, '50%') && P.checkBiteGap(gap, 'Ein Halb.') && !P.checkBiteGap(gap, '0,8'),
    'Mini-Lücke: Text, Synonyme und Zahlenformate (Komma, Punkt, Bruch, Prozent) erkannt',
  );

  const disc = P.parsePractice(
    {
      kind: 'general',
      topic: 'Erste Hilfe',
      style: 'discovery',
      hook: { title: 'Kurzer Check', text: 'Jemand verbrennt sich die Hand.', check: { type: 'tf', statement: 'Eiswürfel sind am besten.', answer: false, why: 'Lauwarmes Wasser schont das Gewebe.' } },
      intro: 'Kurz.',
      bites: [{ title: 'Warum?', text: 'Lauwarm kühlt sanft.' }],
      problems: [{ type: 'calc', problem: '1+1', answer: { type: 'number', value: '2' } }],
    },
    'd1',
    1,
  )!;
  ok(disc.style === 'discovery' && disc.hook?.check?.type === 'tf' && disc.hook.check.answer === false, 'parsePractice: style und discovery-hook übernommen');
  const badHook = P.parsePractice({ kind: 'general', topic: 'X', style: 'discovery', hook: { title: 'Ohne Check', text: 'nur text' }, intro: '', problems: [{ type: 'calc', problem: '1', answer: { type: 'number', value: '1' } }] }, 'd2', 1)!;
  ok(badHook.style === 'discovery' && !badHook.hook, 'parsePractice: hook ohne gültigen Check verworfen');

  const mkSet = (style: 'classic' | 'discovery' | 'sprint', types: string[]) =>
    ({
      id: 'x',
      createdAt: 1,
      kind: 'general',
      topic: 'T',
      intro: '',
      style,
      labs: [],
      tasks: types.map((type) =>
        type === 'classify'
          ? { type: 'classify', prompt: 'p', groups: ['A', 'B'], items: [{ text: '1', group: 0 }, { text: '2', group: 1 }, { text: '3', group: 0 }], hints: [] }
          : type === 'order'
            ? { type: 'order', prompt: 'p', items: ['a', 'b', 'c'], hints: [] }
            : { type: 'calc', problem: 'p', answer: { type: 'number', value: '1' }, hints: [], steps: [] },
      ),
      progress: types.map((_, idx) => ({ tries: 1, hints: idx === 0 ? 1 : 0, solved: true })),
    }) as any;

  const sk = {
    id: 'v',
    topic: 'Erste Hilfe',
    title: 'Erste Hilfe',
    domain: 'general',
    levels: ['Basis'],
    targetLevel: 0,
    level: '',
    status: 'active',
    plan: {},
    stages: [
      {
        id: 'st1',
        name: 'Basis',
        goal: 'g',
        lessons: [
          { id: 'l1', title: 'L1', goal: 'g', set: mkSet('classic', ['order', 'classify', 'calc']) },
          { id: 'l2', title: 'L2', goal: 'g', set: mkSet('discovery', ['calc', 'calc', 'order']) },
          { id: 'l3', title: 'L3', goal: 'g' },
          { id: 'l4', title: 'L4', goal: 'g' },
        ],
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  } as any;

  ok(S.lessonStyleOf(sk, 0, 0, 0) === 'classic', 'Lektion 1 normal → classic');
  ok(S.lessonStyleOf(sk, 0, 1, 1) === 'classic', 'Lektion 2 normal → classic (immer erst Theorie, nie discovery)');
  ok(S.lessonStyleOf(sk, 0, 2, 2) === 'sprint', 'Lektion 3 in Stufe → sprint');
  const fastSk = { ...sk, plan: { questions: [{ q: 'Vorwissen?', options: ['Keins', 'Viel'] }], answers: { 0: 'Viel' } } };
  ok(S.lessonStyleOf(fastSk, 0, 0, 0) === 'classic' && S.lessonStyleOf(fastSk, 0, 1, 1) === 'sprint' && S.lessonStyleOf(fastSk, 0, 2, 2) === 'sprint', 'Tempo fast: Einstieg classic (Theorie zuerst), danach sprint');
  const gentleSk = {
    ...sk,
    stages: [{ ...sk.stages[0], lessons: [{ id: 'l1', title: 'L1', goal: 'g', set: { ...mkSet('classic', ['calc', 'calc', 'calc']), progress: [{ tries: 3, hints: 2 }, { tries: 2, hints: 1 }, { tries: 2, hints: 1 }] } }, { id: 'l2', title: 'L2', goal: 'g' }] }],
  };
  ok(S.lessonStyleOf(gentleSk, 0, 1, 1) === 'classic', 'Tempo gentle bleibt immer bei classic');
  const miniSk = { ...sk, mini: true };
  ok(S.lessonStyleOf(miniSk, 0, 0, 0) === 'classic' && S.lessonStyleOf(miniSk, 0, 1, 1) === 'classic' && S.lessonStyleOf(miniSk, 0, 2, 2) === 'sprint', 'Mini-Skill: classic → classic → sprint (nie discovery)');
  const v3 = S.lessonVariety(sk, 0, 2, 2);
  ok(!v3.preferredOpeners.includes('classify') && !v3.preferredOpeners.includes('estimate'), 'classify und blindes Schätzen werden nie als Einstieg vorgeschlagen');
  ok(!v3.preferredOpeners.includes('order') && !v3.preferredOpeners.includes('calc'), 'kürzliche Einstiege werden rotiert');
  ok(v3.avoidClassify && v3.overused.includes('calc'), 'Verlauf erkennt classify und häufige Typen');
  const lp3 = S.lessonPrompt(sk, sk.stages[0], sk.stages[0].lessons[2]);
  ok(lp3.system.includes('"style": "sprint"') && lp3.system.includes('KEIN "hook"') && lp3.system.includes('Starte Aufgabe 1 NICHT mit "classify"') && lp3.system.includes('höchstens 1× "choice"'), 'lessonPrompt übernimmt Stil, Häppchen-Mix und Aufgaben-Regie');
  ok(lp3.system.indexOf('"bites" (die vollständige Erklärung)') > 0 && lp3.system.indexOf('"bites" (die vollständige Erklärung)') < lp3.system.indexOf('ERST DANACH "problems"'), 'lessonPrompt verlangt bites vor problems im JSON');
  ok(P.DOMAIN_TASKS.general[P.DOMAIN_TASKS.general.length - 1] === 'classify' && P.DOMAIN_TASKS.math.includes('label'), 'classify am Ende der Domain-Listen, math hat label');
}

console.log('Bildhafte Erklärgrafiken (forces, scene, callout, illustration)');
{
  const D = await import('../src/lib/diagram');
  const I = await import('../src/lib/illustrations');
  const P = await import('../src/lib/practice');

  const checkClean = (L: ReturnType<typeof D.layoutDiagram>, name: string) => {
    const tbs = L.boxes.filter((b) => b.lines.length);
    const inBounds = tbs.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= L.width + 1 && b.y + b.h <= L.height + 1);
    let overlap = false;
    for (let i = 0; i < tbs.length; i++)
      for (let j = i + 1; j < tbs.length; j++) {
        const a = tbs[i], b = tbs[j];
        if (a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1) overlap = true;
      }
    ok(inBounds && !overlap, `${name}: innerhalb des Rahmens, keine Text-Überlappungen`);
  };

  const forces = D.parseDiagram({
    type: 'kräfte',
    title: 'Kräfte am Flugzeug',
    subject: 'Flugzeug',
    icon: 'flugzeug',
    vectors: [
      { dir: 'oben', label: 'Auftrieb', note: 'trägt nach oben' },
      { dir: 'unten', label: 'Gewicht', note: 'zieht nach unten' },
      { dir: 'vorn', label: 'Schub', note: 'treibt nach vorn' },
      { dir: 'hinten', label: 'Widerstand', note: 'bremst ab' },
    ],
    states: [
      { name: 'Reiseflug', sizes: { oben: 'm', unten: 'm', vorn: 'm', hinten: 'm' }, note: 'Gleichgewicht' },
      { name: 'Steigflug', sizes: { oben: 'l', vorn: 'l', unten: 'm', hinten: 's' }, tilt: -7, note: 'Steigt' },
    ],
  })!;
  ok(forces?.type === 'forces' && forces.vectors.length === 4 && forces.states?.length === 2, 'forces: deutsche Richtungen & Zustände geparst');
  checkClean(D.layoutDiagram(forces, 0), 'forces Reiseflug');
  checkClean(D.layoutDiagram(forces, 1), 'forces Steigflug');
  const fSvg = D.renderDiagram(forces, D.PALETTES.dark, { state: 1 });
  ok(fSvg.includes('rotate(-7') && fSvg.includes('Auftrieb') && D.diagramLabels(forces).length === 4, 'forces: geneigtes Flugzeug-Motiv, Pfeile und 4 Quiz-Labels');

  const scene = D.parseDiagram({
    type: 'szene',
    title: 'Kaufvertrag',
    actors: [
      { id: 'k', label: 'Käufer', icon: 'person', sub: 'will die Ware' },
      { id: 'v', label: 'Verkäufer', icon: 'fabrik', sub: 'will das Geld' },
    ],
    arrows: [
      { from: 'k', to: 'v', label: 'Zahlung' },
      { from: 'v', to: 'k', label: 'Übergabe der Ware' },
    ],
  })!;
  ok(scene?.type === 'scene' && scene.actors.length === 2 && scene.arrows.length === 2, 'scene: Akteure & Gegenpfeile geparst');
  checkClean(D.layoutDiagram(scene), 'scene 2 Akteure');
  ok(D.renderDiagram(scene, D.PALETTES.light).includes('<path class="dg-vec"'), 'scene: Gegenpfeile werden sauber gebogen');

  const callout = D.parseDiagram({
    type: 'aufbau',
    title: 'Aufbau einer Zelle',
    subject: 'Tierzelle',
    icon: 'zelle',
    parts: [
      { side: 'left', label: 'Zellkern', note: 'Steuerzentrale' },
      { side: 'left', label: 'Mitochondrien', note: 'Kraftwerke' },
      { side: 'right', label: 'Zellmembran', note: 'Schutzhülle' },
      { side: 'right', label: 'Zytoplasma', note: 'Zellflüssigkeit' },
    ],
  })!;
  ok(callout?.type === 'callout' && callout.parts.length === 4 && D.diagramLabels(callout).length === 4, 'callout: Teile & 4 Quiz-Labels');
  checkClean(D.layoutDiagram(callout), 'callout 4 Teile');

  const ill = D.parseDiagram({
    type: 'svg',
    title: 'Tragfläche',
    width: 600,
    height: 300,
    svg: '<svg viewBox="0 0 600 300"><script>alert(1)</script><path d="M20 150 Q300 50 580 150" stroke="{{teal}}" onclick="evil()"/><circle cx="100" cy="150" r="20" fill="{{amber}}"/><image href="https://evil.com/x.png"/></svg>',
  })!;
  ok(ill?.type === 'illustration' && !ill.svg.includes('script') && !ill.svg.includes('onclick') && !ill.svg.includes('evil.com') && !ill.svg.includes('<image'), 'sanitizeSvg entfernt Skripte, Event-Handler und externe Bilder');
  const illSvg = D.renderDiagram(ill, D.PALETTES.dark);
  ok(illSvg.includes(D.PALETTES.dark.tones[0].line) && illSvg.includes(D.PALETTES.dark.tones[2].line), 'illustration setzt Merkora-Farbplatzhalter um');
  ok(D.sanitizeSvg('<script>alert(1)</script>') === null && D.sanitizeSvg('<rect x="0" y="0" width="10" height="10"/>') === null, 'sanitizeSvg lehnt leere oder zu kleine SVGs ab');
  ok(I.resolveIllustration('flugzeug')?.key === 'flugzeug' && I.resolveIllustration(undefined, 'Pflanzenzelle')?.key === 'zelle' && I.resolveIllustration('reise')?.key === 'flugzeug', 'resolveIllustration findet Motive per Name, Alias und Teilwort');
  ok(I.ILLUSTRATION_NAMES.length >= 65, `Studyflix-Bibliothek hat ${I.ILLUSTRATION_NAMES.length} Bildmotive (mind. 65)`);
  ok(
    I.matchIllustration('Paketvermittlung') === 'paket' &&
      I.matchIllustration('Leitungsvermittlung') === 'kabel' &&
      I.matchIllustration('Kaufvertrag') === 'vertrag' &&
      I.matchIllustration('DNA-Replikation') === 'dna' &&
      I.matchIllustration('Führung') === null &&
      I.matchIllustration('automatisch') === null,
    'matchIllustration erkennt deutsche Zusammensetzungen ohne Fehlzuordnungen',
  );

  const layers = D.parseDiagram({
    type: 'schichten',
    title: 'TCP/IP-Schichtenmodell',
    layers: [
      { label: 'Anwendung', note: 'HTTP, DNS, E-Mail', icon: 'browser' },
      { label: 'Transport', note: 'Pakete nummerieren & sichern', icon: 'paket' },
      { label: 'Internet', note: 'Routing durch das Netz', icon: 'router' },
      { label: 'Netzzugang', note: 'Kabel & WLAN', icon: 'kabel' },
    ],
  })!;
  ok(layers?.type === 'layers' && layers.layers.length === 4 && D.diagramLabels(layers).length === 4, 'layers: Schichtenmodell & 4 Quiz-Labels');
  const layersL = D.layoutDiagram(layers);
  checkClean(layersL, 'layers 4 Schichten');
  ok((layersL.art?.length ?? 0) === 4, 'layers: jede Schicht hat ein Studyflix-Motiv');

  const flowArt = D.parseDiagram({
    type: 'flow',
    title: 'Vom Brief zum Paket',
    steps: ['Nachricht in Pakete zerlegen', 'Jedes Paket einzeln senden', 'Pakete nehmen unterschiedliche Wege', 'Empfänger setzt Pakete zusammen'],
  })!;
  const flowL = D.layoutDiagram(flowArt);
  checkClean(flowL, 'Studyflix-Flow Brief zum Paket');
  ok((flowL.art?.length ?? 0) === 4, 'flow: Schritte bekommen automatisch Studyflix-Motive/Badges');

  const cmpArt = D.parseDiagram({
    type: 'compare',
    title: 'Leitung gegen Paket',
    columns: [
      { title: 'Leitungsvermittlung', items: ['Feste Leitung', 'Blockiert bei Stille'] },
      { title: 'Paketvermittlung', items: ['Daten in Pakete zerlegt', 'Jedes Paket sucht seinen Weg'] },
    ],
  })!;
  const cmpL = D.layoutDiagram(cmpArt);
  checkClean(cmpL, 'Studyflix-Compare Leitung vs Paket');
  ok((cmpL.art?.length ?? 0) === 3 && cmpL.art!.some((a) => a.badge === 'VS'), 'compare: Spalten bekommen Studyflix-Motive und VS-Badge');

  const cycArt = D.parseDiagram({
    type: 'cycle',
    title: 'Wasserkreislauf',
    steps: ['Verdunstung', 'Wolkenbildung', 'Niederschlag', 'Abfluss'],
  })!;
  const cycL = D.layoutDiagram(cycArt);
  checkClean(cycL, 'Studyflix-Cycle Wasserkreislauf');
  ok((cycL.art?.length ?? 0) === 1, 'cycle: passendes Studyflix-Motiv im Zentrum');

  ok(P.FIGURE_RULE.includes('"forces"') && P.FIGURE_RULE.includes('"scene"') && P.FIGURE_RULE.includes('"callout"') && P.FIGURE_RULE.includes('"layers"') && P.FIGURE_RULE.includes('"illustration"'), 'FIGURE_RULE beschreibt alle 5 bildhaften Formen');

  // Studyflix explanation animations (diagram animate mode + semantic motif motion + safe SVG animation classes)
  ok(
    I.illustrationMotion('flugzeug') === 'float' &&
      I.illustrationMotion('schiff') === 'bob' &&
      I.illustrationMotion('herz') === 'pulse' &&
      I.illustrationMotion('zahnrad') === 'spin' &&
      I.illustrationMotion('atom') === 'rock' &&
      I.illustrationMotion('vertrag') === 'idle',
    'illustrationMotion liefert passende Studyflix-Bewegung pro Motiv',
  );
  const fAnim = D.renderDiagram(forces, D.PALETTES.light, { state: 1, animate: true });
  ok(
    fAnim.includes('class="dg-animated dg-type-forces"') &&
      fAnim.includes('dg-alive-float') &&
      fAnim.includes('dg-anim-draw') &&
      fAnim.includes('dg-flow-stream dg-flow-force') &&
      fAnim.includes('rotate(-7') &&
      !D.renderDiagram(forces, D.PALETTES.light, { state: 1 }).includes('dg-animated'),
    'forces: animate-Modus animiert Motiv, Pfeile, Kraftfluss & Neigung ohne Standard-Rendering zu ändern',
  );
  const sAnim = D.renderDiagram(scene, D.PALETTES.light, { animate: true });
  ok(sAnim.includes('dg-anim-backdrop') && sAnim.includes('dg-anim-art') && sAnim.includes('dg-flow-stream'), 'scene: animate-Modus animiert Karten, Motive und Datenfluss');
  const cAnim = D.renderDiagram(callout, D.PALETTES.light, { animate: true });
  ok(cAnim.includes('dg-dot-ring') && cAnim.includes('dg-alive-pulse'), 'callout: animate-Modus animiert Anker-Ringe und Motiv');
  const barAnim = D.renderDiagram(D.parseDiagram({ type: 'bars', bars: [{ label: 'A', value: 10 }, { label: 'B', value: 25 }] })!, D.PALETTES.light, { animate: true });
  ok(barAnim.includes('dg-anim-bar'), 'bars: Balken wachsen animiert');
  const vennAnim = D.renderDiagram(D.parseDiagram({ type: 'venn', sets: [{ label: 'A', items: ['x'] }, { label: 'B', items: ['y'] }], shared: ['z'] })!, D.PALETTES.light, { animate: true });
  ok(vennAnim.includes('dg-anim-venn-l') && vennAnim.includes('dg-anim-venn-r'), 'venn: Kreise gleiten animiert zusammen');
  const plotAnim = D.renderDiagram(D.parseDiagram({ type: 'plot', x: { label: 'x', min: 0, max: 10 }, y: { label: 'y', min: 0, max: 10 }, functions: [{ label: 'f(x)', expr: 'x' }] })!, D.PALETTES.light, { animate: true });
  ok(plotAnim.includes('dg-anim-curve'), 'plot: Kurve zeichnet sich animiert');
  const safeCls = D.sanitizeSvg('<g class="dg-float evil-class"><circle cx="20" cy="20" r="10" class="dg-pulse"/><rect x="40" y="10" width="20" height="20" class="unknown"/></g>');
  ok(!!safeCls && safeCls.svg.includes('class="dg-float"') && safeCls.svg.includes('class="dg-pulse"') && !safeCls.svg.includes('evil-class') && !safeCls.svg.includes('unknown'), 'sanitizeSvg behält nur sichere Animationsklassen');

  // Stage 1 + 3: Handcrafted animated visual presets (30 presets, interactive parts & states, topic-aware prompt hint)
  const VP = await import('../src/lib/visualPresets');
  ok(VP.VISUAL_PRESETS.length >= 30, `Mindestens 30 animierte Grafik-Presets vorhanden (${VP.VISUAL_PRESETS.length})`);
  let allPresetsOk = true;
  const badPresets: string[] = [];
  for (const pr of VP.VISUAL_PRESETS) {
    const d1 = D.parseDiagram({ type: 'preset', preset: pr.id, title: pr.title, highlight: pr.parts[0]?.id });
    const d2 = D.parseDiagram({ type: pr.id });
    if (!d1 || d1.type !== 'preset' || d1.preset !== pr.id || !d2 || d2.type !== 'preset' || d2.preset !== pr.id) {
      allPresetsOk = false;
      badPresets.push(pr.id + ':parse');
      continue;
    }
    const svgL = D.renderDiagram(d1, D.PALETTES.light, { animate: true, focus: pr.parts[0]?.id, state: pr.states ? 1 : undefined });
    const svgD = D.renderDiagram(d1, D.PALETTES.dark, { animate: true });
    const gOpen = (svgL.match(/<g\b/g) ?? []).length;
    const gClose = (svgL.match(/<\/g>/g) ?? []).length;
    const animTransformClash = /<[^>]*\bclass="[^"]*\b(dg-preset|dg-anim-raw|ps-pulse|ps-float|ps-breathe|ps-heartbeat|ps-orbit|ps-glow)\b[^"]*"[^>]*\btransform=|<[^>]*\btransform="[^"]*"[^>]*\bclass="[^"]*\b(dg-preset|dg-anim-raw|ps-pulse|ps-float|ps-breathe|ps-heartbeat|ps-orbit|ps-glow)\b/.test(svgL);
    if (!svgL.startsWith('<svg') || !svgL.endsWith('</svg>') || !svgL.includes('dg-preset') || !svgL.includes('data-part=') || !svgL.includes('ps-focus') || !svgD.includes('dg-preset') || gOpen !== gClose || animTransformClash) {
      allPresetsOk = false;
      badPresets.push(`${pr.id}:svg(g=${gOpen}/${gClose}${animTransformClash ? ',clash' : ''})`);
    }
  }
  ok(allPresetsOk, `Alle ${VP.VISUAL_PRESETS.length} Presets parsen (explizit & per Typ-Alias) und rendern sauberes animiertes Light/Dark-SVG` + (badPresets.length ? ` [${badPresets.join(', ')}]` : ''));

  // Disambiguation: anatomie with parts stays callout, without parts resolves to preset
  const anaPreset = D.parseDiagram({ type: 'anatomie', title: 'Organe des Menschen' });
  const anaCallout = D.parseDiagram({ type: 'anatomie', subject: 'Herz', parts: [{ side: 'left', label: 'Vorhof' }, { side: 'right', label: 'Kammer' }] });
  ok(anaPreset?.type === 'preset' && anaPreset.preset === 'anatomie' && anaCallout?.type === 'callout', 'anatomie: ohne parts → Preset, mit parts → callout');

  const astroPicks = VP.relevantPresetsFor('general', 'Planeten im Sonnensystem und Mondphasen', 5).map((x) => x.id);
  const bioPicks = VP.relevantPresetsFor('general', 'Blutkreislauf, Herz und Atmung der Lunge', 5).map((x) => x.id);
  const lawPicks = VP.relevantPresetsFor('law', 'Gewaltenteilung Legislative Exekutive', 5).map((x) => x.id);
  const musPicks = VP.relevantPresetsFor('music', 'Quintenzirkel Dur und Moll Tonarten', 5).map((x) => x.id);
  ok(astroPicks.includes('sonnensystem') && astroPicks.includes('mondphasen'), 'relevantPresetsFor findet Sonnensystem & Mondphasen für Astronomie');
  ok(bioPicks.includes('blutkreislauf') && bioPicks.includes('atmung'), 'relevantPresetsFor findet Blutkreislauf & Atmung für Biologie');
  ok(lawPicks.includes('gewaltenteilung') && musPicks.includes('musik_kreis'), 'relevantPresetsFor findet Gewaltenteilung (Recht) & Quintenzirkel (Musik)');
  ok(VP.presetPromptHint('general', 'Sonnensystem').includes('sonnensystem'), 'presetPromptHint enthält thematisch passende Preset-IDs');

  // Stage 2: 4 universal parametric animated builders (orbit, wave, balance, zoom)
  const orbitD = D.parseDiagram({
    type: 'orbit',
    title: 'Schalenmodell des Atoms',
    center: 'Atomkern',
    rings: [
      { label: 'K-Schale', count: 2, note: 'max. 2 Elektronen' },
      { label: 'L-Schale', count: 6, note: 'Valenzschale' },
      { label: 'M-Schale', count: 3 },
    ],
    highlight: 'L-Schale',
  })!;
  ok(orbitD?.type === 'orbit', 'orbit: korrekt geparst');
  checkClean(D.layoutDiagram(orbitD), 'orbit Schalenmodell');
  const orbitSvg = D.renderDiagram(orbitD, D.PALETTES.light, { animate: true });
  ok(orbitSvg.includes('dg-orbit-rot') && orbitSvg.includes('dg-orbit-dot'), 'orbit: rendert rotierende Bahnen & Satelliten');

  const waveD = D.parseDiagram({
    type: 'wave',
    title: 'Hoher vs. tiefer Ton',
    x: 'Zeit t',
    y: 'Auslenkung',
    waves: [
      { label: 'Hoher Ton (schnell)', freq: 3, amp: 0.8 },
      { label: 'Tiefer Ton (langsam)', freq: 1.2, amp: 0.7 },
    ],
    showLength: true,
    showAmp: true,
  })!;
  ok(waveD?.type === 'wave', 'wave: korrekt geparst');
  checkClean(D.layoutDiagram(waveD), 'wave Schallwellen');
  const waveSvg = D.renderDiagram(waveD, D.PALETTES.light, { animate: true });
  ok(waveSvg.includes('dg-wave-run') && waveSvg.includes('--wave-shift:') && waveSvg.includes('>λ<') && waveSvg.includes('>A<'), 'wave: rendert laufende Sinuswellen mit λ- und A-Markern');

  const balD = D.parseDiagram({
    type: 'balance',
    title: 'Abwägung im Kaufrecht',
    left: { label: 'Käuferinteressen', weight: 6, items: ['Mängelfreie Ware', 'Rücktrittsrecht'] },
    right: { label: 'Verkäuferinteressen', weight: 4, items: ['Recht zur Nacherfüllung', 'Planungssicherheit'] },
    fulcrum: '§ 437 BGB',
    states: [
      { name: 'Ausgeglichen', tilt: 0, note: 'Beide Seiten im Gleichgewicht.' },
      { name: 'Käufer überwiegt', tilt: -10, note: 'Nach gescheiterter Nacherfüllung kippt die Waage.' },
    ],
  })!;
  ok(balD?.type === 'balance', 'balance: korrekt geparst');
  checkClean(D.layoutDiagram(balD, 0), 'balance Ausgeglichen');
  checkClean(D.layoutDiagram(balD, 1), 'balance Gekippt');
  const balSvg0 = D.renderDiagram(balD, D.PALETTES.light, { state: 0, animate: true });
  const balSvg1 = D.renderDiagram(balD, D.PALETTES.light, { state: 1, animate: true });
  ok(balSvg0.includes('dg-bal-beam') && balSvg0.includes('rotate(0deg)') && balSvg1.includes('rotate(-10deg)'), 'balance: kippt Waage je nach Zustand');

  const zoomD = D.parseDiagram({
    type: 'zoom',
    title: 'Vom Körper bis zur DNA',
    levels: [
      { label: 'Körper', scale: '1,7 m', icon: 'person', note: 'Gesamtorganismus' },
      { label: 'Organ', scale: '10 cm', icon: 'herz', note: 'z. B. Herz' },
      { label: 'Zelle', scale: '20 µm', icon: 'zelle', note: 'Grundbaustein' },
      { label: 'DNA', scale: '2 nm', icon: 'dna', note: 'Erbinformation' },
    ],
  })!;
  ok(zoomD?.type === 'zoom', 'zoom: korrekt geparst');
  checkClean(D.layoutDiagram(zoomD), 'zoom Körper bis DNA');
  const zoomSvg = D.renderDiagram(zoomD, D.PALETTES.light, { animate: true });
  ok(zoomSvg.includes('dg-flow-stream') && zoomSvg.includes('2 nm'), 'zoom: rendert Maßstabs-Karten und animierte Zoom-Pfeile');

  // Stage 3: Interactive custom SVG illustration with data-part focus & expanded animation vocabulary
  const illInteractive = D.parseDiagram({
    type: 'illustration',
    title: 'Destillation',
    width: 600,
    height: 320,
    svg: '<g data-part="kolben" class="dg-breathe bad-cls"><circle cx="150" cy="200" r="50" fill="{{teal}}"/></g><g data-part="kuehler" class="dg-flow-fast"><rect x="260" y="120" width="160" height="30" fill="{{blue}}"/></g>',
    parts: [
      { id: 'kolben', label: 'Siedekolben', note: 'Hier verdampft der Stoff mit niedrigerem Siedepunkt zuerst.' },
      { id: 'kuehler', label: 'Liebigkühler', note: 'Kühlt den Dampf wieder ab, sodass er kondensiert.' },
    ],
    highlight: 'kolben',
  })!;
  ok(illInteractive?.type === 'illustration' && illInteractive.parts?.length === 2 && illInteractive.highlight === 'kolben', 'Stage 3 illustration: parst interaktive parts & highlight');
  const illIntSvg = D.renderDiagram(illInteractive, D.PALETTES.light, { animate: true, focus: 'kuehler' });
  ok(
    illIntSvg.includes('dg-breathe') &&
      illIntSvg.includes('dg-flow-fast') &&
      !illIntSvg.includes('bad-cls') &&
      illIntSvg.includes('data-part="kolben"') &&
      illIntSvg.includes('ps-dim') &&
      illIntSvg.includes('ps-focus'),
    'Stage 3 illustration: behält sichere Animationsklassen & setzt ps-focus/ps-dim auf data-part',
  );

  ok(
    P.FIGURE_RULE.includes('"preset"') &&
      P.FIGURE_RULE.includes('"orbit"') &&
      P.FIGURE_RULE.includes('"wave"') &&
      P.FIGURE_RULE.includes('"balance"') &&
      P.FIGURE_RULE.includes('"zoom"') &&
      P.FIGURE_RULE.includes('data-part') &&
      P.FIGURE_RULE.includes('narration'),
    'FIGURE_RULE dokumentiert Preset-Engine, alle 4 Baukästen, interaktive Illustrationen & narration',
  );

  // Structured bite callouts (analogy, takeaway, pitfall), per-bite simpler explanation & read-aloud
  const ST = await import('../src/lib/speechText');
  const SK = await import('../src/lib/skills');
  const parsedBites = P.parseBites(
    [
      {
        title: 'Spannung verstehen',
        text: 'Elektrische **Spannung** treibt Ladungen durch einen Leiter.',
        analogy: 'Wie Wasserdruck in einem Gartenschlauch.',
        takeaway: 'Ohne Spannung fließt kein Strom.',
        pitfall: 'Spannung (Volt) nicht mit Stromstärke (Ampere) verwechseln!',
      },
      {
        title: 'Deutsche Aliase',
        text: 'Zweiter Abschnitt.',
        alltagsbild: 'Wie Autos auf einer Autobahn.',
        merksatz: 'Widerstand bremst den Strom.',
        falle: 'Größerer Widerstand bedeutet weniger Strom, nicht mehr.',
      },
    ],
    0,
  );
  ok(
    parsedBites.length === 2 &&
      parsedBites[0].analogy?.includes('Wasserdruck') &&
      parsedBites[0].takeaway?.includes('Ohne Spannung') &&
      parsedBites[0].pitfall?.includes('verwechseln') &&
      parsedBites[1].analogy?.includes('Autobahn') &&
      parsedBites[1].takeaway?.includes('Widerstand') &&
      parsedBites[1].pitfall?.includes('weniger Strom'),
    'parseBites liest analogy, takeaway & pitfall (inkl. deutscher Aliase)',
  );
  const spBite = P.simplerBitePrompt('Stromkreis', parsedBites[0], 'Schule');
  ok(spBite.user.includes('Spannung verstehen') && spBite.system.includes('"simple"'), 'simplerBitePrompt baut gezielten Prompt für ein einzelnes Häppchen');
  ok(P.parseSimplerBite({ simple: 'Stell dir vor …' }) === 'Stell dir vor …' && P.parseSimplerBite({}) === null, 'parseSimplerBite parst gültige Antworten und lehnt leere ab');
  const speech = ST.biteSpeechParts(parsedBites[0]);
  ok(
    speech.some((x) => x.includes('Spannung verstehen')) &&
      speech.some((x) => x.includes('Alltagsbild:') && x.includes('Wasserdruck')) &&
      speech.some((x) => x.includes('Merksatz:') && x.includes('Ohne Spannung')) &&
      speech.some((x) => x.includes('Typische Falle:')) &&
      !speech.join(' ').includes('**'),
    'biteSpeechParts bereitet Häppchen + Callouts sauber ohne Markdown fürs Vorlesen auf',
  );
  ok(
    SK.BITE_RULE.includes('"analogy"') && SK.BITE_RULE.includes('"takeaway"') && SK.BITE_RULE.includes('"pitfall"'),
    'BITE_RULE weist die KI auf Alltagsbild, Merksatz & Typische Falle hin',
  );
}

console.log('Merkora Tools Upgrade: Rechner, Periodensystem, Klavier, Pomodoro, Arbeitsplanung, Popups');
{
  // 1. Scientific calculator & unit converter
  const C = await import('../src/lib/calc');
  ok(Math.abs(C.evalCalcExpr('2 + 3 * 4') - 14) < 1e-9, 'Rechner: Punkt vor Strich');
  ok(Math.abs(C.evalCalcExpr('sin(30)', 'deg') - 0.5) < 1e-9 && Math.abs(C.evalCalcExpr('cos(pi)', 'rad') + 1) < 1e-9, 'Rechner: DEG & RAD Winkelmaße');
  ok(Math.abs(C.evalCalcExpr('sqrt(16) + 5! - 1,5 * 2') - 121) < 1e-9, 'Rechner: Wurzeln, Fakultät und deutsches Komma');
  ok(Math.abs(C.evalCalcExpr('200 * 15%') - 30) < 1e-9 && C.evalCalcExpr('10 % 3') === 1 && Number.isNaN(C.evalCalcExpr('alert(1)')), 'Rechner: Prozent, Modulo & sichere Ablehnung ungültiger Ausdrücke');
  ok(C.toFraction(0.75) === '3/4' && C.toFraction(1 / 3) === '1/3' && C.toFraction(4) === null, 'Rechner: exakte Bruch-Umwandlung');
  ok(C.UNIT_CATEGORIES.length === 8, 'Einheiten-Umrechner: alle 8 Kategorien vorhanden');
  ok(Math.abs(C.convertUnit(100, 'temp', 'c', 'f') - 212) < 1e-6 && Math.abs(C.convertUnit(0, 'temp', 'c', 'k') - 273.15) < 1e-6, 'Einheiten: Temperatur °C ↔ °F ↔ K');
  ok(Math.abs(C.convertUnit(36, 'speed', 'kmh', 'ms') - 10) < 1e-6 && Math.abs(C.convertUnit(2, 'length', 'km', 'm') - 2000) < 1e-6, 'Einheiten: Geschwindigkeit & Länge');

  // 2. 118-element Periodic Table + animated Bohr orbit diagram
  const PT = await import('../src/lib/periodicTable');
  const DG = await import('../src/lib/diagram');
  ok(PT.ELEMENTS.length === 118 && new Set(PT.ELEMENTS.map((e) => e.z)).size === 118, 'Periodensystem: alle 118 Elemente eindeutig');
  const carbon = PT.ELEMENTS.find((e) => e.sym === 'C')!;
  const gold = PT.ELEMENTS.find((e) => e.sym === 'Au')!;
  const cOrbit = PT.elementOrbitDiagram(carbon);
  const cSvg = DG.renderDiagram(cOrbit, DG.PALETTES.light);
  ok(carbon.z === 6 && gold.z === 79 && cOrbit.type === 'orbit' && cSvg.includes('<svg') && cSvg.includes('K-Schale'), 'Periodensystem: Element-Metadaten & animiertes Bohr-Schalenmodell');

  // 3. Piano scale & chord theory
  const PN = await import('../src/lib/pianoTheory');
  ok(PN.PIANO_ROOTS.length === 12 && PN.MUSIC_PATTERNS.length >= 10, 'Klavier-Theorie: 12 Grundtöne und ≥10 Tonleitern/Akkorde');
  ok(JSON.stringify(PN.patternMidis(0, 'dur', 60)) === '[60,62,64,65,67,69,71,72]', 'Klavier: C-Dur-Tonleiter ab C4 (MIDI 60)');
  const aMin = PN.patternMidis(9, 'min', 60);
  ok(aMin.length === 3 && aMin.every((m) => m >= 60 && m < 84), 'Klavier: Akkord-Markierung bleibt innerhalb der 2 Oktaven');

  // 4. Pomodoro long break (every 4th round) & auto-start
  const PR = await import('../src/lib/pomodoroRule');
  const p3 = { phase: 'work' as const, running: true, endsAt: 1000, left: 1000, rounds: 3 };
  const tLong = PR.tick(p3, 1500, 25, 5, 15, false);
  ok(tLong.ended === 'work' && tLong.pomo.phase === 'break' && tLong.pomo.rounds === 4 && tLong.pomo.longBreak === true && tLong.pomo.left === 15 * PR.MIN, 'Pomodoro: 4. Runde startet lange Pause (15 Min.)');
  const tAuto = PR.tick({ phase: 'break', running: true, endsAt: 2000, left: 1000, rounds: 4, longBreak: true }, 2500, 25, 5, 15, true);
  ok(tAuto.ended === 'break' && tAuto.pomo.phase === 'work' && tAuto.pomo.running === true && !tAuto.pomo.longBreak, 'Pomodoro: Auto-Start wechselt nach Pause automatisch in die nächste Lernrunde');

  // 5. Todos groupMinutes & skillId
  const TD = await import('../src/lib/todos');
  ok(TD.groupMinutes([{ minutes: 25 }, { minutes: 15 }, {}]) === 40, 'To-dos: groupMinutes summiert geplante Minuten pro Gruppe');

  // 6. WorkPlan energy profiles
  const WP = await import('../src/lib/workPlan');
  const mixTasks = [
    { id: 'easy', title: 'Leicht', motivation: 3 as const, size: 's' as const },
    { id: 'hard', title: 'Schwer', motivation: 1 as const, size: 'l' as const, important: true },
    { id: 'mid', title: 'Mittel', motivation: 2 as const, size: 'm' as const },
  ];
  const freshPlan = WP.buildWorkPlan(mixTasks, 90, false, { energy: 'fresh' });
  const tiredPlan = WP.buildWorkPlan(mixTasks, 90, false, { energy: 'tired' });
  const firstFresh = freshPlan.steps.find((s) => s.kind === 'task');
  const firstTired = tiredPlan.steps.find((s) => s.kind === 'task');
  ok(firstFresh?.kind === 'task' && firstFresh.taskId === 'hard' && firstTired?.kind === 'task' && firstTired.taskId === 'easy', 'Arbeitsplanung: Energie-Profil „Frisch“ startet schwer, „Müde“ startet leicht');

  // 7. ToolWindows supports all 5 floating popup IDs
  const TW = await import('../src/lib/toolWindows');
  TW.toolWindows.open('notes');
  TW.toolWindows.open('calc');
  TW.toolWindows.open('sounds');
  const snap = TW.toolWindows.get();
  ok(snap.notes.open && snap.calc.open && snap.sounds.open && 'todos' in snap && 'pomodoro' in snap, 'ToolWindows: alle 5 schwebenden Popups (Pomodoro, To-dos, Klänge, Notizen, Rechner)');
  TW.toolWindows.close('notes');
  TW.toolWindows.close('calc');
  TW.toolWindows.close('sounds');
}

console.log('Bibliothek & Decks Upgrade: Text-Import, Lückentext, Duplikate, Prognose, Druckbogen, Store-Aktionen');
{
  const DT = await import('../src/lib/deckTools');
  const NC = await import('../src/lib/newCards');
  const ST = await import('../src/lib/store');
  const DAY = 86_400_000;
  const now = new Date(2026, 10, 20, 12, 0, 0).getTime();

  // 1. Delimiter detection & CSV / Quizlet / Markdown text import
  ok(DT.detectDelimiter('A\tB\nC\tD') === 'tab', 'Text-Import: Tabulator (Quizlet/Excel) erkannt');
  ok(DT.detectDelimiter('Frage;Antwort\nH2O;Wasser') === 'semicolon', 'Text-Import: Semikolon-CSV erkannt');
  ok(DT.detectDelimiter('- **Mitose** :: Kernteilung\n- **Meiose** :: Reifeteilung') === 'colon', 'Text-Import: Markdown :: erkannt');

  const csvCards = DT.parseTextImport('Begriff;Definition;Tags\n"Zelle; Grundbaustein";"Kleinste Einheit";Biologie, Kapitel 1\nMitose;Kernteilung;Biologie', {
    extraTags: ['Import'],
  });
  ok(
    csvCards.length === 2 &&
      csvCards[0].front === 'Zelle; Grundbaustein' &&
      csvCards[0].back === 'Kleinste Einheit' &&
      csvCards[0].tags?.includes('Biologie') &&
      csvCards[0].tags?.includes('Import'),
    'Text-Import: Kopfzeile übersprungen, Anführungszeichen & Tags aus 3. Spalte geparst',
  );
  const mdCards = DT.parseTextImport('1. **Osmose** - Diffusion durch Membran\n2. **ATP** - Energieträger');
  ok(mdCards.length === 2 && mdCards[0].front === 'Osmose' && mdCards[1].back === 'Energieträger', 'Text-Import: Markdown-Aufzählung mit „ - “ und **Fett** sauber erkannt');

  // 2. Cloze syntax ({{Lücke}} / {{Lücke::Hinweis}})
  ok(DT.hasCloze('Die {{Mitochondrien}} sind Kraftwerke') && !DT.hasCloze('Normaler Text'), 'Lückentext: hasCloze erkennt {{…}}');
  ok(
    DT.renderClozeQuestion('Die {{Mitochondrien::Organell}} liefern {{ATP}}.', false) === 'Die [ Organell ] liefern [ … ].',
    'Lückentext (Plain): Frage zeigt Hinweis bzw. [ … ]',
  );
  ok(
    DT.renderClozeAnswer('Die {{Mitochondrien::Organell}} liefern {{ATP}}.', false) === 'Die **Mitochondrien** liefern **ATP**.',
    'Lückentext (Plain): Antwort hebt Lösung fett hervor',
  );
  const clozeQHtml = DT.renderClozeQuestion('Formel: {{H2O::<Wasser>}}', true);
  const clozeAHtml = DT.renderClozeAnswer('Formel: {{H2O::<Wasser>}}', true);
  ok(
    clozeQHtml.includes('class="cloze-blank"') && clozeQHtml.includes('&lt;Wasser&gt;') && clozeAHtml.includes('class="cloze-filled"') && clozeAHtml.includes('H2O'),
    'Lückentext (HTML): cloze-blank / cloze-filled Spans & HTML-Escaping beim Hinweis',
  );

  // 3. Duplicate detection (best progress kept first)
  const mkCard = (id: string, front: string, back: string, extra: Partial<any> = {}): any => ({
    id,
    front,
    back,
    createdAt: extra.createdAt ?? 100,
    srs: { ...newSrs(0), ...(extra.srs ?? {}) },
    ...extra,
  });
  const dupGroups = DT.findDuplicateGroups([
    mkCard('c1', 'Was ist Osmose?', 'A1', { createdAt: 200, srs: { reps: 1 } }),
    mkCard('c2', '  was ist {{osmose}} ', 'A2', { createdAt: 300, srs: { reps: 5 } }),
    mkCard('c3', 'Mitose', 'Kernteilung'),
  ]);
  ok(dupGroups.length === 1 && dupGroups[0].length === 2 && dupGroups[0][0].id === 'c2', 'Duplikate: erkennt gleiche Vorderseite unabhängig von Großschreibung/Satzzeichen und behält höchsten Lernstand zuerst');

  // 4. Card status filter & sorting
  const cNew = mkCard('n', 'Zebra', 'Tier', { createdAt: 10 });
  const cDue = mkCard('d', 'Affe', 'Tier', { createdAt: 30, srs: { last: now - 2 * DAY, due: now - DAY, reps: 2, interval: 1, lapses: 4, ease: 1.7 } });
  const cMaster = mkCard('m', 'Bär', 'Tier', { createdAt: 20, srs: { last: now - DAY, due: now + 40 * DAY, reps: 8, interval: 40, lapses: 0, ease: 2.6 } });
  const cSusp = mkCard('s', 'Pausiert', 'X', { createdAt: 40, suspended: true, srs: { last: now - DAY, due: now - DAY, reps: 1, interval: 1 } });
  ok(
    DT.matchesCardStatus(cNew, 'new', now) &&
      DT.matchesCardStatus(cDue, 'due', now) &&
      DT.matchesCardStatus(cDue, 'learning', now) &&
      DT.matchesCardStatus(cMaster, 'mastered', now) &&
      DT.matchesCardStatus(cSusp, 'suspended', now) &&
      !DT.matchesCardStatus(cSusp, 'due', now),
    'Karten-Statusfilter: Neu, Fällig, Lernend, Gemeistert und Pausiert sauber getrennt',
  );
  ok(DT.sortCardList([cNew, cDue, cMaster], 'newest')[0].id === 'd', 'Sortierung: Neueste zuerst');
  ok(DT.sortCardList([cNew, cDue, cMaster], 'hardest')[0].id === 'd', 'Sortierung: Schwierigste (meiste Fehlversuche) zuerst');
  ok(DT.sortCardList([cNew, cDue, cMaster], 'due')[0].id === 'd', 'Sortierung: Fälligkeit zuerst');
  ok(DT.sortCardList([cNew, cDue, cMaster], 'alpha').map((x) => x.id).join(',') === 'd,m,n', 'Sortierung: Alphabetisch A–Z');

  // 5. 14-day forecast, study time estimation & hardest cards
  const fc = DT.upcomingDueByDay([cNew, cDue, cMaster, cSusp, mkCard('f3', 'In 3 Tagen', 'X', { srs: { last: now - DAY, due: now + 3 * DAY, reps: 2, interval: 3 } })], 14, now);
  ok(fc.length === 14 && fc[0].count === 1 && fc[3].count === 1 && fc.reduce((a, b) => a + b.count, 0) === 2, '14-Tage-Prognose: überfällige heute, zukünftige am Zieltag, pausierte/neue ignoriert');
  const estDefault = DT.estimateStudyMinutes(30, []);
  const estFast = DT.estimateStudyMinutes(30, [0, 5000, 10000, 15000, 20000].map((at) => ({ at })));
  ok(estDefault === 5 && estFast === 3 && DT.formatEstMinutes(estDefault) === '≈ 5 Min.' && DT.formatEstMinutes(75) === '≈ 1 Std. 15 Min.', 'Lernzeit-Schätzung passt sich Tempo an und formatiert lesbar');
  const hard = DT.hardestCards([cNew, cDue, cMaster, cSusp], 5);
  ok(hard.length === 1 && hard[0].id === 'd', 'Schwierigste Karten: nur aktive Karten mit Fehlversuchen/niedriger Ease');

  // 6. Print HTML sheet builder
  const printDeck: any = { id: 'p1', name: 'Bio <Test>', cards: [mkCard('p', 'Was ist {{ATP}}?', 'Energieträger', { hint: 'Adenosin...' }), cSusp] };
  const htmlTable = DT.buildPrintHtml(printDeck, 'table');
  const htmlFold = DT.buildPrintHtml(printDeck, 'fold');
  const htmlCards = DT.buildPrintHtml(printDeck, 'cards');
  ok(
    htmlTable.includes('Bio &lt;Test&gt;') &&
      htmlTable.includes('ATP') &&
      htmlTable.includes('Adenosin...') &&
      !htmlTable.includes('Pausiert') &&
      htmlFold.includes('fold-list') &&
      htmlCards.includes('cut-grid'),
    'Druckbogen-Export: alle 3 Layouts (Tabelle, Falt-Zettel, Ausschneide-Karten), Escaping & Ausschluss pausierter Karten',
  );

  // 7. Suspended cards skipped in newCards.ts (pickDue & unseenCount)
  const pool = [
    { id: 'u1', srs: newSrs(0) },
    { id: 'u2', suspended: true, srs: newSrs(0) },
    { id: 'r1', srs: { ...newSrs(0), last: 1, due: now - 100 } },
    { id: 'r2', suspended: true, srs: { ...newSrs(0), last: 1, due: now - 100 } },
  ];
  ok(NC.unseenCount(pool) === 1 && NC.pickDue(pool, now, 10).map((x) => x.id).join(',') === 'r1,u1', 'newCards: pausierte Karten zählen weder als neu noch als fällig');

  // 8. Store actions: pin/archive, per-deck limits, suspend, bulk ops, duplicate, merge, reorder
  const ws = ST.addWorkspace('Test-WS');
  const course = ST.addCourse(ws.id, 'Test-Kurs');
  ST.togglePinCourse(course.id);
  ST.toggleArchiveCourse(course.id);
  const cState = ST.getState().data.courses.find((c) => c.id === course.id)!;
  ok(cState.pinned === true && cState.archived === true, 'Store: Kurs anheften & archivieren');
  ST.toggleArchiveCourse(course.id);

  const dA = ST.addDeck(course.id, 'Deck A', { newPerDay: 1, maxReviewsPerDay: 1 });
  const dB = ST.addDeck(course.id, 'Deck B');
  ST.addCards(dA.id, [
    { front: 'F1', back: 'B1', hint: 'Tipp 1' },
    { front: 'F2', back: 'B2' },
    { front: 'F3', back: 'B3', srs: { ...newSrs(0), last: now - 2 * DAY, due: now - DAY, reps: 2, interval: 1 } },
    { front: 'F4', back: 'B4', srs: { ...newSrs(0), last: now - 2 * DAY, due: now - DAY + 10, reps: 2, interval: 1 } },
  ]);
  let deckA = ST.getState().data.decks.find((x) => x.id === dA.id)!;
  ok(deckA.cards[0].hint === 'Tipp 1', 'Store: Karten-Hinweis wird gespeichert');
  // Per-deck limits: 1 review + 1 new = 2 due
  const dueLimited = ST.dueCards(deckA);
  ok(dueLimited.length === 2, `Store: Deck-Tageslimits (maxReviewsPerDay=1 + newPerDay=1 → 2 fällig, war ${dueLimited.length})`);

  // Archive deck -> 0 due cards
  ST.togglePinDeck(dA.id);
  ST.toggleArchiveDeck(dA.id);
  deckA = ST.getState().data.decks.find((x) => x.id === dA.id)!;
  ok(deckA.pinned === true && deckA.archived === true && ST.dueCards(deckA).length === 0, 'Store: archiviertes Deck hat 0 fällige Karten');
  ST.toggleArchiveDeck(dA.id);

  // Suspend & bulk operations
  const ids = ST.getState().data.decks.find((x) => x.id === dA.id)!.cards.map((c) => c.id);
  ST.toggleSuspendCard(dA.id, ids[0]);
  ok(ST.getState().data.decks.find((x) => x.id === dA.id)!.cards[0].suspended === true, 'Store: Karte pausieren');
  ST.bulkUpdateCards(dA.id, [ids[0], ids[1]], (c) => ({ marked: true, tags: [...(c.tags ?? []), 'Klausur'] }));
  ST.bulkResetCards(dA.id, [ids[2]]);
  deckA = ST.getState().data.decks.find((x) => x.id === dA.id)!;
  ok(deckA.cards[0].marked && deckA.cards[1].tags?.includes('Klausur') && deckA.cards[2].srs.reps === 0, 'Store: Bulk-Update (Markieren/Taggen) & Bulk-Reset');
  ST.bulkDeleteCards(dA.id, [ids[3]]);
  ok(ST.getState().data.decks.find((x) => x.id === dA.id)!.cards.length === 3, 'Store: Bulk-Löschen');

  // Duplicate deck (without & with progress)
  const copyFresh = ST.duplicateDeck(dA.id, false)!;
  const copyKeep = ST.duplicateDeck(dA.id, true)!;
  ok(copyFresh && copyFresh.cards.length === 3 && copyFresh.cards.every((c) => c.srs.reps === 0) && copyKeep.cards.length === 3, 'Store: Deck duplizieren (mit & ohne Lernstand)');

  // Reorder decks
  ST.reorderDecks([dB.id, dA.id]);
  const rA = ST.getState().data.decks.find((x) => x.id === dA.id)!;
  const rB = ST.getState().data.decks.find((x) => x.id === dB.id)!;
  ok(rB.order === 0 && rA.order === 1, 'Store: Deck-Reihenfolge per Drag & Drop gespeichert');

  // Merge decks
  const merged = ST.mergeDecks(copyFresh.id, dB.id);
  ok(
    merged === 3 &&
      !ST.getState().data.decks.some((x) => x.id === copyFresh.id) &&
      ST.getState().data.decks.find((x) => x.id === dB.id)!.cards.length === 3,
    'Store: Decks zusammenführen verschiebt alle Karten und entfernt das Quelldeck',
  );
}

console.log('App-weite Upgrades: Offline-Quiz, Statistik-Analyse, Zusammenfassung, Kalender-Fälligkeiten, Befehlspalette');
{
  const AX = await import('../src/lib/appExtras');
  const SR = await import('../src/lib/search');
  const DAY = 86_400_000;
  const baseDay = new Date(2026, 10, 16, 9, 0, 0).getTime(); // Monday 09:00

  // 1. Offline Quiz builder
  const qCards: any[] = [
    { id: 'q1', front: 'Was ist {{Osmose}}?', back: 'Diffusion durch eine Membran', hint: 'Wasser wandert', createdAt: 1, srs: newSrs(0) },
    { id: 'q2', front: 'Was ist Mitose?', back: 'Kernteilung', createdAt: 2, srs: newSrs(0) },
    { id: 'q3', front: 'Was ist ATP?', back: 'Energieträger der Zelle', createdAt: 3, srs: newSrs(0) },
    { id: 'q4', front: 'Was sind Ribosomen?', back: 'Orte der Proteinbiosynthese', createdAt: 4, srs: newSrs(0) },
    { id: 'q5', front: 'Pausiert', back: 'Soll nicht erscheinen', suspended: true, createdAt: 5, srs: newSrs(0) },
  ];
  const quiz = AX.buildOfflineQuiz(qCards, 4, 42);
  ok(
    quiz.length === 4 &&
      quiz.every((q) => q.options.length === 4 && new Set(q.options).size === 4 && q.answer >= 0 && q.answer < 4) &&
      !quiz.some((q) => q.question.includes('Pausiert')) &&
      quiz.some((q) => q.question.includes('[ … ]') && q.explanation.includes('Wasser wandert')),
    'Offline-Quiz: 4 eindeutige Optionen je Frage, Lückentext auf Frage-Seite, Hinweise als Erklärung, pausierte Karten ignoriert',
  );
  ok(AX.buildOfflineQuiz(qCards.slice(0, 3), 4, 1).length === 0, 'Offline-Quiz: weniger als 4 unterschiedliche Antworten → leer');

  // 2. Stats analytics: bestStreak, ratingBreakdown, timeOfDayStats, weekdayStats, CSV
  const revs: any[] = [
    { at: baseDay, rating: 4 }, // Mon 09:00
    { at: baseDay + DAY, rating: 3 }, // Tue 09:00
    { at: baseDay + 2 * DAY, rating: 1 }, // Wed 09:00
    { at: baseDay + 5 * DAY + 10 * 3600_000, rating: 3 }, // Sat 19:00
    { at: baseDay + 6 * DAY + 10 * 3600_000, rating: 2 }, // Sun 19:00
  ];
  ok(AX.bestStreak(revs) === 3, 'Statistik: bestStreak findet längste zusammenhängende Lernserie (3 Tage)');
  const rb = AX.ratingBreakdown(revs);
  ok(rb.total === 5 && rb[1] === 1 && rb[2] === 1 && rb[3] === 2 && rb[4] === 1, 'Statistik: ratingBreakdown zählt Bewertungen 1–4 korrekt');
  const tod = AX.timeOfDayStats(revs);
  const morning = tod.find((x) => x.id === 'morning')!;
  const evening = tod.find((x) => x.id === 'evening')!;
  ok(morning.total === 3 && morning.percent === 67 && evening.total === 2 && evening.percent === 50, 'Statistik: Trefferquote nach Tageszeit (Morgens/Abends)');
  const wd = AX.weekdayStats(revs);
  ok(wd.length === 7 && wd[0].label === 'Mo' && wd[0].percent === 100 && wd[2].percent === 0, 'Statistik: Trefferquote nach Wochentag');
  const csv = AX.statsToCsv([{ deckId: 'd1', course: 'Biologie', name: 'Zelle; Basis', cards: 10, mastery: 80, due: 2, reviews: 5, known: 4 }]);
  ok(csv.startsWith('\uFEFF') && csv.includes('"Zelle; Basis"') && csv.includes(';80'), 'Statistik: CSV-Export mit UTF-8-BOM und Semikolon-Escaping');

  // 3. Summary TOC & Print HTML
  const toc = AX.extractMarkdownHeadings('# Titel\n## **Einleitung**\nText\n### Unterpunkt `A`\n## Fazit');
  ok(toc.length === 3 && toc[0].level === 2 && toc[0].text === 'Einleitung' && toc[1].level === 3 && toc[1].text === 'Unterpunkt A', 'Zusammenfassung: Inhaltsverzeichnis extrahiert ## und ### Überschriften');
  const pHtml = AX.buildSummaryPrintHtml('Bio <1>', '<h2>Test</h2><p>Inhalt</p>');
  ok(pHtml.includes('Bio &lt;1&gt;') && pHtml.includes('<h2>Test</h2>'), 'Zusammenfassung: Druck-HTML escaped Titel sauber');

  // 4. Calendar due counts by day (skips archived decks & suspended cards)
  const calMap = AX.dueCountsByDay(
    [
      {
        archived: false,
        cards: [
          { id: 'a', front: '', back: '', createdAt: 0, srs: { ...newSrs(0), last: baseDay - 5 * DAY, due: baseDay - DAY } },
          { id: 'b', front: '', back: '', createdAt: 0, srs: { ...newSrs(0), last: baseDay - DAY, due: baseDay + 2 * DAY } },
          { id: 'c', front: '', back: '', createdAt: 0, suspended: true, srs: { ...newSrs(0), last: baseDay - DAY, due: baseDay + 2 * DAY } },
        ],
      },
      {
        archived: true,
        cards: [{ id: 'd', front: '', back: '', createdAt: 0, srs: { ...newSrs(0), last: baseDay - DAY, due: baseDay } }],
      },
    ],
    baseDay,
  );
  ok(calMap.get('2026-11-16') === 1 && calMap.get('2026-11-18') === 1 && calMap.size === 2, 'Kalender: fällige Karten je Tag (überfällige heute, pausierte & archivierte ignoriert)');

  // 5. Global search across Skills, Exams, Todos, Tools, Tags, Hints & Cloze
  const searchData = {
    courses: [{ id: 'c1', name: 'Biologie', workspaceId: 'w1' }],
    decks: [
      {
        id: 'd1',
        name: 'Zellbiologie',
        courseId: 'c1',
        cards: [{ id: 'k1', front: 'Was ist {{Photosynthese}}?', back: 'Lichtenergie in Glukose', hint: 'Chloroplasten', tags: ['Botanik'] }],
      },
    ],
    skills: [{ id: 's1', title: 'Stochastik Grundlagen', topic: 'Wahrscheinlichkeit', mini: false }],
    exams: [{ id: 'e1', title: 'Bio Klausur', date: '2026-12-01' }],
    todos: [
      { id: 't1', text: 'Übungsblatt Mathe abgeben', due: '2026-11-20' },
      { id: 't2', text: 'Erledigtes Mathe Blatt', doneAt: 1234 },
    ],
  };
  ok(SR.searchAll(searchData, 'Photosynthese').some((h) => h.kind === 'card' && !h.title.includes('{{')), 'Globale Suche: findet Lückentext-Karte ohne {{}}-Klammern');
  ok(SR.searchAll(searchData, 'Chloroplasten').some((h) => h.kind === 'card') && SR.searchAll(searchData, 'Botanik').some((h) => h.kind === 'card'), 'Globale Suche: durchsucht auch Hinweise und Tags');
  ok(SR.searchAll(searchData, 'Stochastik').some((h) => h.kind === 'skill' && h.id === 's1'), 'Globale Suche: findet Skills');
  ok(SR.searchAll(searchData, 'Klausur').some((h) => h.kind === 'exam' && h.id === 'e1'), 'Globale Suche: findet Prüfungen');
  const todoHits = SR.searchAll(searchData, 'Mathe').filter((h) => h.kind === 'todo');
  ok(todoHits.length === 1 && todoHits[0].id === 't1', 'Globale Suche: findet offene To-dos (erledigte ignoriert)');
  ok(SR.searchAll(searchData, 'Periodensystem').some((h) => h.kind === 'tool' && h.id === 'ptable'), 'Globale Suche: findet Merkora-Werkzeuge');

  // 6. Animation regression checks: orbit wrapper & seamless dashed flow loops
  const DG = await import('../src/lib/diagram');
  const VP = await import('../src/lib/visualPresets');
  const PT = await import('../src/lib/periodicTable');
  const beSvg = DG.renderDiagram(PT.elementOrbitDiagram(PT.ELEMENTS[3]), DG.PALETTES.dark, { animate: true });
  ok(beSvg.includes('class="dg-orbit-wrap"') && !beSvg.includes('class="dg-orbit"') && beSvg.includes('class="dg-orbit-rot"'), 'Schalenmodell: äußere Atom-Gruppe dreht sich nicht mit (nur dg-orbit-rot)');
  const badDash: string[] = [];
  for (const pr of VP.VISUAL_PRESETS) {
    const svg = DG.renderDiagram({ type: 'preset', preset: pr.id }, DG.PALETTES.dark, { animate: true });
    for (const m of svg.matchAll(/<path[^>]*class="[^"]*ps-flow[^"]*"[^>]*stroke-dasharray="([^"]+)"[^>]*>/g)) {
      const period = m[1].trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0);
      if (!period || 24 % period !== 0) badDash.push(`${pr.id}(${m[1]})`);
    }
  }
  ok(badDash.length === 0, `Animierte gestrichelte Linien: alle 30 Presets loopen nahtlos ohne Zucken${badDash.length ? ' [' + badDash.join(', ') + ']' : ''}`);

  // 7. 3D Models Studio, Visual Formula Editor, Studio Piano & Lo-Fi Sounds
  const M3 = await import('../src/lib/models3d');
  const FT = await import('../src/lib/formulaTemplates');
  const MA = await import('../src/lib/musicAudio');
  const AM = await import('../src/lib/ambient');

  ok(M3.MODELS_3D.length === 8, '3D-Studio: alle 8 interaktiven 3D-Modelle vorhanden');
  const all3dValid = M3.MODELS_3D.every((m) => {
    const vars = m.variants?.length ? m.variants.map((v) => v.id) : [undefined];
    return vars.every((vid) => {
      const sc = m.build(1.25, vid);
      return sc.primitives.length >= 4 && sc.hotspots.length >= 1;
    });
  });
  ok(all3dValid, '3D-Studio: alle 8 Modelle inkl. Sub-Varianten (H2O, CH4, CO2, Benzol, NaCl, Diamant, Vektoren) bauen gültige 3D-Szenen & Hotspots');
  const rot = M3.rotate3D([1, 0, 0], 0, Math.PI / 2);
  const proj = M3.project3D(rot, 200, 150);
  ok(Math.abs(rot[0]) < 1e-6 && Math.abs(rot[2] + 1) < 1e-6 && Number.isFinite(proj.x) && proj.scale > 0, '3D-Mathe: Rotation & Perspektiv-Projektion exakt');

  ok(FT.FORMULA_CATEGORIES.length === 6 && FT.wrapFormula('\\frac{1}{2}', false) === '$\\frac{1}{2}$' && FT.wrapFormula('$$x^2$$', true) === '$$x^2$$', 'Formeleditor: 6 Kategorien & sauberes Inline/Display-Wrapping');

  MA.setPianoVoice('rhodes');
  MA.setSustain(true);
  ok(MA.getPianoVoice() === 'rhodes' && MA.getSustain() === true, 'Studio-Klavier: Klangfarbe (Grand/Rhodes/Warm) & Haltepedal schaltbar');
  MA.setPianoVoice('grand');
  MA.setSustain(false);

  const sndIds = new Set(AM.SOUNDS.map((s) => s.id));
  ok(sndIds.has('lofi') && sndIds.has('cafe') && sndIds.has('night') && AM.PRESETS.some((p) => p.name.includes('Lo-Fi')), 'Klänge: neue Soundscapes (Lo-Fi Beats, Bibliothek & Café, Sommernacht) + Presets');
  ok(SR.searchAll(searchData, 'DNA').some((h) => h.kind === 'tool' && h.id === 'models3d'), 'Globale Suche: findet 3D-Modelle (z. B. DNA)');

  // 8. Neural-TTS: automatic language detection, Natural OS voice ranking & Piper voice matching
  const SL = await import('../src/lib/speechLang');
  ok(
    SL.detectSpeechLang('Was ist der Unterschied zwischen Mitose und Meiose?') === 'de' &&
      SL.detectSpeechLang('What is the difference between mitosis and meiosis?') === 'en' &&
      SL.detectSpeechLang("Quelle est la différence entre la mitose et la méiose ?") === 'fr' &&
      SL.detectSpeechLang('¿Cuál es la diferencia entre la mitosis y la meiosis?') === 'es' &&
      SL.detectSpeechLang('Qual è la differenza tra la mitosi e la meiosi?') === 'it',
    'TTS-Spracherkennung: erkennt DE, EN, FR, ES und IT zuverlässig',
  );
  ok(SL.detectSpeechLang('ATP', 'de') === 'de', 'TTS-Spracherkennung: kurze/neutrale Begriffe bleiben bei Fallback-Sprache');

  const sampleVoices = [
    { name: 'Microsoft Hedda Desktop - German', lang: 'de-DE', voiceURI: 'hedda' },
    { name: 'Microsoft Katja Online (Natural) - German (Germany)', lang: 'de-DE', voiceURI: 'katja' },
    { name: 'eSpeak English', lang: 'en-US', voiceURI: 'espeak-en' },
    { name: 'Samantha (Enhanced)', lang: 'en-US', voiceURI: 'samantha' },
  ];
  ok(
    SL.pickBestSystemVoice(sampleVoices, 'de')?.voiceURI === 'katja' &&
      SL.pickBestSystemVoice(sampleVoices, 'en')?.voiceURI === 'samantha',
    'TTS-Stimmenauswahl: bevorzugt Natural-/Enhanced-Stimmen vor Roboter-Stimmen',
  );
  ok(
    SL.pickPiperVoiceForLang(['de_DE-thorsten-medium', 'de_DE-thorsten-high', 'en_US-amy-medium'], 'de') === 'de_DE-thorsten-high' &&
      SL.pickPiperVoiceForLang(['de_DE-thorsten-medium', 'en_US-amy-medium'], 'en', 'de_DE-thorsten-medium', true) === 'en_US-amy-medium' &&
      SL.pickPiperVoiceForLang(['de_DE-thorsten-medium'], 'fr', 'de_DE-thorsten-medium', true) === undefined,
    'Piper-Stimmenwahl: wählt beste Qualität je Sprache und fällt sauber auf Systemstimme zurück, wenn Sprache fehlt',
  );
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle SRS-Tests bestanden');
process.exit(failures ? 1 : 0);





