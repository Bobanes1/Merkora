// Checks the spaced-repetition intervals. Run: npm run test:srs
import { formatDelay, newSrs, schedule, type Rating, type Srs } from '../src/lib/srs';

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

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle SRS-Tests bestanden');
process.exit(failures ? 1 : 0);
