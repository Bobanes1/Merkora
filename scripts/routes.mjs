// Copies the single-page app shell to every route so each path works as a static file.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const routes = [
  'dashboard',
  'forgot-password',
  'settings',
  'sync-callback',
  'library',
  'library/erster-workspace',
  'library/erster-workspace/erster-kurs',
  'library/erster-workspace/erster-kurs/mein-erstes-deck',
];
const shell = join(dist, 'index.html');
for (const r of routes) {
  const dir = join(dist, ...r.split('/'));
  mkdirSync(dir, { recursive: true });
  copyFileSync(shell, join(dir, 'index.html'));
}
copyFileSync(shell, join(dist, '404.html'));
console.log(`routes: ${routes.length} pages + 404.html`);
