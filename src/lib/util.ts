export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function slugify(s: string): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  const out = s
    .replace(/[äöüßÄÖÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || 'ohne-titel';
}

export function uniqueSlug(base: string, taken: string[]): string {
  let s = slugify(base);
  if (!taken.includes(s)) return s;
  let i = 2;
  while (taken.includes(`${s}-${i}`)) i++;
  return `${s}-${i}`;
}

export const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDue(due: number, now = Date.now()): string {
  const diff = due - now;
  if (diff <= 0) return 'jetzt fällig';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins} Min.`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} Std.`;
  const days = Math.round(diff / DAY);
  if (days < 31) return `in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  const months = Math.round(days / 30);
  return `in ${months} ${months === 1 ? 'Monat' : 'Monaten'}`;
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function download(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  // Desktop app: straight into the Downloads folder (the window has no download bar).
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    void import('./desktop').then(async ({ saveDownload }) => {
      const { pushToast } = await import('./jobs');
      try {
        const path = await saveDownload(filename, blob);
        pushToast({ text: `Gespeichert: ${path}`, ok: true });
      } catch (e) {
        pushToast({ text: `Speichern fehlgeschlagen: ${(e as Error)?.message ?? e}`, ok: false });
      }
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
