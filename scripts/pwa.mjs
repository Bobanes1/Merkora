// After the build: app icons (PNG, drawn here without extra tools) and the offline service worker.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

// ---------- PNG icons ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const c = pixel(((x + (sx + 0.5) / S) / size) * 36, ((y + (sy + 0.5) / S) / size) * 36);
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / (S * S); raw[o + 1] = g / (S * S); raw[o + 2] = b / (S * S); raw[o + 3] = a / (S * S);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const inRound = (x, y, x0, y0, w, h, r) => {
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r));
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inEllipse = (x, y, cx, cy, rx, ry, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = x - cx, dy = y - cy;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
};
// Same drawing as the favicon/logo, slightly inset so it also works as a "maskable" icon.
function icon(x, y) {
  const k = 0.82, o = 18 * (1 - k);
  const X = (x - o) / k, Y = (y - o) / k;
  if (inEllipse(X, Y, 27.2, 7, 4, 1.8, -0.7)) return hex('#a3e635');
  if (inEllipse(X, Y, 19.6, 9.2, 3, 1.4, 0.7)) return hex('#65a30d');
  if (X >= 21 && X <= 23 && Y >= 9 && Y <= 14.5) return hex('#65a30d');
  if (inRound(X, Y, 10, 19.5, 12, 2, 1) || inRound(X, Y, 10, 24, 9, 2, 1)) return hex('#ffffff');
  if (inRound(X, Y, 6, 14, 24, 17, 4)) return hex('#09817e');
  return hex('#dff3f2');
}
for (const s of [192, 512]) writeFileSync(join(dist, `icon-${s}.png`), png(s, icon));
writeFileSync(join(dist, 'apple-touch-icon.png'), png(180, icon));

// ---------- service worker (offline + installable) ----------
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push('/' + relative(dist, p).split(sep).join('/'));
  }
})(dist);
const precache = files.filter((f) => f !== '/sw.js' && !(/\/index\.html$/.test(f) && f !== '/index.html') && f !== '/404.html' && !/\.(ttf|woff)$/.test(f));
const version = `${pkg.version}-${Date.now().toString(36)}`;
writeFileSync(
  join(dist, 'sw.js'),
  `// Merkora ${pkg.version} – offline cache (generated)
const CACHE = 'merkora-${version}';
const FILES = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`,
);
console.log(`pwa: icons + service worker (${precache.length} files)`);
