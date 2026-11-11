/**
 * Daily study reminder: from the chosen time on, once per day a system notification
 * "X Karten sind heute fällig" (only when something is due). Runs while the app is open or in the tray.
 */
import { notify } from './desktop';
import { dueCards, getState } from './store';
import { dayKey } from './util';
import { reminderDue } from './reminderRule';

const KEY = 'merkora.reminder.lastDay';

export function checkReminder(now = new Date()) {
  const { data } = getState();
  if (!data.settings.reminderOn) return;
  const due = data.decks.reduce((a, d) => a + dueCards(d, now.getTime()).length, 0);
  let last: string | null = null;
  try {
    last = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (!reminderDue(now, data.settings.reminderTime || '18:00', last, due)) return;
  try {
    localStorage.setItem(KEY, dayKey(now.getTime()));
  } catch {
    /* ignore */
  }
  void notify('Zeit zum Lernen 🌱', `${due} ${due === 1 ? 'Karte ist' : 'Karten sind'} heute fällig – ein paar Minuten reichen schon.`);
}

let started = false;
export function startReminders() {
  if (started) return;
  started = true;
  setTimeout(() => checkReminder(), 10_000);
  setInterval(() => checkReminder(), 60_000);
}
