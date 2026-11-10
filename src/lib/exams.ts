/** Exam dates: countdown, readiness, daily plan and scheduling that never pushes a card past the exam. */
import { levelOf, type Srs } from './srs';
import { masteryPercent } from './stats';
import type { Card, Data, Deck, Exam } from './store';
import { DAY, dayKey, startOfDay } from './util';

const MIN = 60_000;

/** Exam moment (without a time: 9:00). */
export function examAt(e: Pick<Exam, 'date' | 'time'>): number {
  const [y, m, d] = e.date.split('-').map(Number);
  const [hh, mm] = (e.time || '09:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime();
}
/** End of the exam day – until then an exam counts as upcoming. */
const examDayEnd = (e: Exam) => startOfDay(examAt(e)) + DAY;

export const upcomingExams = (data: Pick<Data, 'exams'>, now = Date.now()) =>
  (data.exams ?? []).filter((e) => examDayEnd(e) > now).sort((a, b) => examAt(a) - examAt(b));
export const pastExams = (data: Pick<Data, 'exams'>, now = Date.now()) =>
  (data.exams ?? []).filter((e) => examDayEnd(e) <= now).sort((a, b) => examAt(b) - examAt(a));

export const examsForDeck = (data: Pick<Data, 'exams'>, deckId: string, now = Date.now()) =>
  upcomingExams(data, now).filter((e) => e.deckIds.includes(deckId));
export const nextExamForDeck = (data: Pick<Data, 'exams'>, deckId: string, now = Date.now()) => examsForDeck(data, deckId, now)[0];

/** Moment of the next exam of this deck that is still ahead (for scheduling), or undefined. */
export function nextExamAt(data: Pick<Data, 'exams'>, deckId: string, now = Date.now()): number | undefined {
  const e = examsForDeck(data, deckId, now).find((x) => examAt(x) > now);
  return e ? examAt(e) : undefined;
}

/**
 * Keeps the next review before the exam: a card whose due date would fall after "exam − 1 day"
 * is pulled to that moment (at least 10 minutes from now). The interval stays, so after the exam
 * the normal rhythm continues.
 */
export function capForExam(s: Srs, exam: number | undefined, now = Date.now()): Srs {
  if (!exam || exam <= now) return s;
  const latest = Math.max(now + 10 * MIN, exam - DAY);
  return s.due > latest ? { ...s, due: latest } : s;
}

export const examDecks = (data: Pick<Data, 'decks'>, e: Exam): Deck[] => data.decks.filter((d) => e.deckIds.includes(d.id));
export const examCards = (data: Pick<Data, 'decks'>, e: Exam): Card[] => examDecks(data, e).flatMap((d) => d.cards);

/** Whole days until the exam day (0 = today). */
export const daysUntil = (e: Exam, now = Date.now()) => Math.round((startOfDay(examAt(e)) - startOfDay(now)) / DAY);

export function countdownText(e: Exam, now = Date.now()) {
  const n = daysUntil(e, now);
  if (n < 0) return n === -1 ? 'gestern' : `vor ${-n} Tagen`;
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n < 14) return `in ${n} Tagen`;
  const w = Math.round(n / 7);
  return n < 60 ? `in ${w} Wochen` : `in ${Math.round(n / 30)} Monaten`;
}

export function readiness(data: Pick<Data, 'decks'>, e: Exam) {
  const cards = examCards(data, e);
  const open = cards.filter((c) => levelOf(c.srs) !== 'mastered');
  return { percent: masteryPercent(cards), total: cards.length, open: open.length, fresh: cards.filter((c) => !c.srs.last).length };
}

/** Cards to work on today so that every not-yet-mastered card is seen before the exam. */
export function dailyPlan(data: Pick<Data, 'decks' | 'reviews'>, e: Exam, now = Date.now()) {
  const cards = examCards(data, e);
  const ids = new Set(cards.map((c) => c.id));
  const today = dayKey(now);
  const doneToday = new Set(data.reviews.filter((r) => ids.has(r.cardId) && dayKey(r.at) === today).map((r) => r.cardId)).size;
  const open = cards.filter((c) => levelOf(c.srs) !== 'mastered').length;
  // already learned cards that are due now; new cards are spread over the days until the exam
  const due = cards.filter((c) => c.srs.last && c.srs.due <= now).length;
  const days = Math.max(1, daysUntil(e, now));
  const target = Math.max(due, Math.ceil((open + doneToday) / days));
  return { target, doneToday, left: Math.max(0, target - doneToday), due };
}

// ---------- calendar file (.ics) ----------
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const pad = (n: number) => String(n).padStart(2, '0');
const icsDate = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
};

export function toIcs(exams: Exam[], decks: Deck[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Merkora//Pruefungskalender//DE', 'CALSCALE:GREGORIAN'];
  for (const e of exams) {
    const names = decks.filter((d) => e.deckIds.includes(d.id)).map((d) => d.name);
    const desc = [names.length ? `Decks: ${names.join(', ')}` : '', e.note ?? ''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@merkora`, `DTSTAMP:${icsDate(Date.now())}`);
    if (e.time) {
      lines.push(`DTSTART:${icsDate(examAt(e))}`, `DTEND:${icsDate(examAt(e) + 2 * 60 * MIN)}`);
    } else {
      const d = e.date.replace(/-/g, '');
      const next = new Date(examAt(e) + DAY);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`);
    }
    lines.push(`SUMMARY:${icsEscape(`Prüfung: ${e.title}`)}`);
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Morgen: ${e.title}`)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
