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
  const t = autoCardInstruction();
  ok(t.includes('Entscheide selbst') && !/\d/.test(t), 'Anweisung lässt die KI entscheiden und nennt keine Zahl');
  ok(/Organisatorisches/.test(t) && /nichts Prüfungsrelevantes aus/.test(t), 'Anweisung: nur Prüfungsrelevantes, aber nichts davon auslassen');
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
  ok(formatCost(0.004) === '< 0,01 $' && formatCost(0.042) === '0,04 $' && formatCost(0) === 'kostenlos', 'Betrag wird lesbar formatiert');
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
  ok(formatCostRange(0.1, 0.25) === '0,10–0,25 $' && formatCostRange(0.002, 0.004) === '< 0,01 $' && formatCostRange(0.004, 0.03) === 'bis 0,03 $', 'Kostenspanne lesbar');
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
    ok(/"type":"model"/.test(DIAGRAM_RULE) && /"type":"decision"/.test(DIAGRAM_RULE), 'KI-Anweisung kennt die neuen Arten');
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
  ok(!/<svg/i.test(DIAGRAM_RULE) && /"type":"flow"/.test(DIAGRAM_RULE), 'KI-Anweisung verlangt Beschreibung, kein SVG');
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
