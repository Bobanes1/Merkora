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
  report.finished = Date.now();
  await smokeDone(report);
}
