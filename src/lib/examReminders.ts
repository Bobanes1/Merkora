/** Reminds of exams when the app starts: 7 days before, the day before and on the exam day (once per day). */
import { daysUntil, upcomingExams } from './exams';
import { pushToast } from './jobs';
import { getState } from './store';
import { dayKey } from './util';

export function checkExamReminders(now = Date.now()) {
  for (const e of upcomingExams(getState().data, now)) {
    const n = daysUntil(e, now);
    if (n !== 7 && n !== 1 && n !== 0) continue;
    const key = `merkora.examReminder.${e.id}.${dayKey(now)}`;
    try {
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: remind anyway */
    }
    const when = n === 0 ? 'heute' : n === 1 ? 'morgen' : 'in einer Woche';
    const text = `Prüfung „${e.title}“ ist ${when}${e.time ? ` um ${e.time} Uhr` : ''}.`;
    pushToast({ text, ok: true, to: '/calendar', toLabel: 'Zum Kalender', sticky: true });
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden')
        new Notification('Merkora', { body: text, icon: '/favicon.svg' });
    } catch {
      /* ignore */
    }
  }
}

let started = false;
export function startExamReminders() {
  if (started) return;
  started = true;
  setTimeout(() => checkExamReminders(), 3000);
  setInterval(() => checkExamReminders(), 60 * 60 * 1000);
}
