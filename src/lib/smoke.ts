/**
 * Self-test of the desktop app (only runs when started with MERKORA_SMOKE=<report file>):
 * checks the Rust bridge, saving, the Anki import with media and the AI network path, then quits.
 */
import { invoke } from '@tauri-apps/api/core';
import { mediaFileUrl, netFetch, smokeDone, smokeInfo } from './desktop';
import { flush, getState } from './store';

export async function runSmokeTest() {
  const info = await smokeInfo();
  if (!info) return;
  const report: Record<string, unknown> = { origin: location.origin, started: Date.now() };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      report[name] = await fn();
    } catch (e) {
      report[name] = `FEHLER: ${(e as Error)?.message ?? e}`;
    }
  };
  await new Promise((r) => setTimeout(r, 1500));
  await step('dataFolder', () => invoke('data_folder'));
  await step('decksAtStart', async () => getState().data.decks.length);
  if (info.apkg) {
    await step('import', async () => {
      const [{ readApkg }, { storeImport }] = await Promise.all([import('./anki'), import('../components/AnkiImport')]);
      const res = await readApkg(info.apkg!);
      const created = storeImport(res, { fileName: info.apkg! });
      const decks = getState().data.decks.filter((d) => created.some((c) => c.id === d.id));
      const deck = decks.find((d) => d.cards.some((c) => /data-media=/.test(c.front + c.back))) ?? decks[0];
      const html = deck.cards.map((c) => c.front + c.back).join('');
      const firstMedia = /data-media="([^"]+)"/.exec(html)?.[1];
      let mediaStatus: number | string = 'keine Medien';
      if (firstMedia) {
        const r = await fetch(mediaFileUrl(firstMedia));
        mediaStatus = `${r.status} ${r.headers.get('content-type')} ${(await r.arrayBuffer()).byteLength} B`;
      }
      return {
        decks: created,
        media: res.media,
        missing: res.missingMedia,
        styles: Object.keys(deck.styles ?? {}).length,
        styledCards: deck.cards.filter((c) => c.styleId).length,
        mediaStatus,
        sample: deck.cards[0]?.front.slice(0, 200),
      };
    });
  }
  await step('exams', async () => {
    const { addExam } = await import('./store');
    const deck = getState().data.decks[0];
    const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const exam = addExam({ title: 'Selbsttest-Prüfung', date, deckIds: [deck.id] });
    await flush();
    await new Promise((r) => setTimeout(r, 500));
    const raw = (await invoke<string | null>('load_data')) ?? '';
    return { saved: raw.includes(exam.id), deck: deck.name };
  });
  await step('save', async () => {
    await flush();
    await new Promise((r) => setTimeout(r, 800));
    const raw = await invoke<string | null>('load_data');
    return { bytes: raw?.length ?? 0, hasDecks: getState().data.decks.every((d) => raw?.includes(d.id)) };
  });
  await step('network', async () => {
    const r = await netFetch('https://openrouter.ai/api/v1/models', {});
    return `${r.status} ${(await r.text()).length} Zeichen`;
  });
  await step('updateCheck', async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check({ timeout: 20000 });
    return u ? `Update verfügbar: ${u.version}` : 'keine neuere Version';
  });
  await step('backups', async () => {
    const d = await import('./desktop');
    const dir = (await invoke<string>('data_folder')) + '/eigene-sicherungen';
    await d.setBackupDir(dir);
    const name = await d.backupNow();
    const list = await d.listBackups();
    const own = list.find((b) => b.place === 'eigener Ordner' && b.name === name);
    const text = own ? await d.readBackup(own.path) : '';
    let blocked = false;
    try {
      await d.readBackup(await invoke<string>('data_folder') + '/merkora-lernstand.json');
    } catch {
      blocked = true;
    }
    return { name, count: list.length, ownFolder: !!own, readable: text.length > 100, outsideBlocked: blocked };
  });
  report.finished = Date.now();
  // write the report, then close the window like a user does (must end the app by itself)
  await smokeDone(report, false);
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}
