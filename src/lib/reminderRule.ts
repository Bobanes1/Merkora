import { dayKey } from './util';

/** Whether the reminder should fire now (pure – tested in scripts/test-srs.mts). */
export function reminderDue(now: Date, time: string, lastDay: string | null, due: number): boolean {
  if (due <= 0) return false;
  const today = dayKey(now.getTime());
  if (lastDay === today) return false;
  const [h, m] = time.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= (h || 0) * 60 + (m || 0);
}
