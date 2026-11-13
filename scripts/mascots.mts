// Writes a page with the companions in every mood (animated, light and dark): npx tsx scripts/mascots.mts <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinnFace, Mascot, type Mood, type Who } from '../src/components/Mascot';

const moods: Mood[] = ['idle', 'wave', 'think', 'happy', 'cheer', 'sad'];
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const row = (who: Who, size: number) =>
  `<div class="row">${moods
    .map((m) => `<figure>${renderToStaticMarkup(createElement(Mascot, { who, mood: m, size }))}<figcaption>${m}</figcaption></figure>`)
    .join('')}</div>`;
const panel = (dark: boolean) => `<section class="p ${dark ? 'dark' : ''}">
  <h2>Finn (Tutor im Chat)</h2>${row('finn', 110)}
  <p class="faces">${[20, 26, 40].map((s) => renderToStaticMarkup(createElement(FinnFace, { size: s }))).join(' ')} <span>Avatar neben den Antworten</span></p>
  <h2>Zum Vergleich: Pip und Flo</h2>${row('pip', 80)}${row('flo', 80)}
</section>`;
writeFileSync(
  process.argv[2] ?? 'mascots.html',
  `<!doctype html><meta charset="utf-8"><title>Figuren</title><style>${css}
body{margin:16px;background:#e9eeee;font-family:Manrope,Arial,sans-serif}
.p{background:#fff;border-radius:14px;padding:16px 20px;margin-bottom:16px}.p.dark{background:#172221;color:#e2f4f3}
.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;margin:6px 0 12px}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px}figcaption{font-size:12px;opacity:.7}
h2{font-size:15px;margin:6px 0}.faces{display:flex;gap:10px;align-items:center}.faces span{font-size:12px;opacity:.7}
</style>${panel(false)}${panel(true)}`,
);
console.log('ok');
