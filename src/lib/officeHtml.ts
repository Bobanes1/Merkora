/**
 * Word and PowerPoint files shown in the app as they look (simplified): headings, bold/italic/underline,
 * lists, tables and pictures for Word; title, points and pictures per slide for PowerPoint.
 * Only own tags are produced and all text is escaped. Pure – tested in scripts/test-srs.mts.
 */
import { decodeXml, type ZipFiles } from './officeText';

const utf8 = new TextDecoder();
const read = (files: ZipFiles, name: string) => (files[name] ? utf8.decode(files[name]) : '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const IMG_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };
/** A picture of the archive as a data address (null for formats a browser cannot show, e.g. EMF). */
function imageData(files: ZipFiles, path: string): string | null {
  const data = files[path];
  const ext = (path.toLowerCase().match(/\.([a-z]+)$/) ?? [])[1] ?? '';
  if (!data || !IMG_TYPE[ext]) return null;
  return `data:${IMG_TYPE[ext]};base64,${toBase64(data)}`;
}
/** Relationship id → target path, resolved against the folder of the part. */
function relations(files: ZipFiles, relsPath: string, baseDir: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of read(files, relsPath).matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) {
    const parts = (baseDir + '/' + r[2]).split('/');
    const out: string[] = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p && p !== '.') out.push(p);
    }
    m.set(r[1], out.join('/'));
  }
  return m;
}
const attr = (xml: string, tag: string, name = 'w:val') => xml.match(new RegExp(`<${tag}\\b[^>]*?${name}="([^"]*)"`))?.[1];
/** <w:b/> means on, <w:b w:val="0"/> or "false" means off. */
const flag = (rpr: string, tag: string) => {
  const m = rpr.match(new RegExp(`<${tag}(\\s[^>]*)?/?>`));
  if (!m) return false;
  const v = (m[1] ?? '').match(/w:val="([^"]*)"/)?.[1];
  return !(v === '0' || v === 'false' || v === 'none');
};

// ---------- Word ----------
function runsHtml(p: string, files: ZipFiles, rels: Map<string, string>): string {
  let out = '';
  for (const r of p.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) ?? []) {
    const rpr = r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    let text = '';
    for (const t of r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g)) {
      if (t[0].startsWith('<w:tab')) text += '\t';
      else if (t[0].startsWith('<w:br')) text += '\n';
      else text += decodeXml(t[1]);
    }
    let h = esc(text).replace(/\n/g, '<br>');
    if (h) {
      if (flag(rpr, 'w:b')) h = `<b>${h}</b>`;
      if (flag(rpr, 'w:i')) h = `<i>${h}</i>`;
      if (flag(rpr, 'w:u')) h = `<u>${h}</u>`;
    }
    for (const b of r.matchAll(/<a:blip\b[^>]*?r:embed="([^"]+)"/g)) {
      const src = rels.get(b[1]) ? imageData(files, rels.get(b[1])!) : null;
      if (src) h += `<img src="${src}" alt="">`;
    }
    out += h;
  }
  return out;
}

function headingLevel(style: string | undefined): number {
  if (!style) return 0;
  const s = style.toLowerCase();
  if (s === 'title' || s === 'titel') return 1;
  const m = s.match(/(?:heading|berschrift|überschrift)(\d)/);
  return m ? Math.min(3, Number(m[1])) : 0;
}

function paragraphHtml(p: string, files: ZipFiles, rels: Map<string, string>): { html: string; list: boolean } {
  const ppr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const inner = runsHtml(p, files, rels);
  const level = headingLevel(attr(ppr, 'w:pStyle'));
  const list = /<w:numPr>/.test(ppr) || /list/i.test(attr(ppr, 'w:pStyle') ?? '');
  if (!inner.trim()) return { html: '', list: false };
  if (level) return { html: `<h${level}>${inner}</h${level}>`, list: false };
  if (list) return { html: `<li>${inner}</li>`, list: true };
  return { html: `<p>${inner}</p>`, list: false };
}

/** A Word document as simple, safe HTML. */
export function docxHtml(files: ZipFiles): string {
  const doc = read(files, 'word/document.xml');
  if (!doc) throw new Error('In dieser Word-Datei wurde kein Inhalt gefunden.');
  const rels = relations(files, 'word/_rels/document.xml.rels', 'word');
  const body = doc.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? doc;
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) out.push('</ul>');
    inList = false;
  };
  for (const block of body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
    if (block.startsWith('<w:tbl')) {
      closeList();
      const rows = (block.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []).map(
        (tr) =>
          '<tr>' +
          (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? [])
            .map((tc) => `<td>${(tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []).map((p) => runsHtml(p, files, rels)).filter(Boolean).join('<br>')}</td>`)
            .join('') +
          '</tr>',
      );
      out.push(`<table>${rows.join('')}</table>`);
      continue;
    }
    const { html, list } = paragraphHtml(block, files, rels);
    if (!html) continue;
    if (list && !inList) {
      out.push('<ul>');
      inList = true;
    } else if (!list) closeList();
    out.push(html);
  }
  closeList();
  return out.join('\n');
}

// ---------- PowerPoint ----------
export type Slide = { n: number; title: string; points: { text: string; level: number }[]; images: string[] };

const naturalNumber = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);

/** All slides of a presentation in order (also empty ones): title, points with their level, pictures. */
export function pptxSlides(files: ZipFiles): Slide[] {
  const names = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b));
  if (!names.length) throw new Error('In dieser PowerPoint-Datei wurden keine Folien gefunden.');
  return names.map((name) => {
    const n = naturalNumber(name);
    const xml = read(files, name);
    const rels = relations(files, `ppt/slides/_rels/slide${n}.xml.rels`, 'ppt/slides');
    let title = '';
    const points: Slide['points'] = [];
    for (const sp of xml.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) ?? []) {
      const isTitle = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(sp);
      for (const para of sp.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? []) {
        const text = decodeXml([...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('')).trim();
        if (!text) continue;
        if (isTitle) title = title ? `${title} ${text}` : text;
        else points.push({ text, level: Number(para.match(/<a:pPr\b[^>]*lvl="(\d)"/)?.[1] ?? 0) });
      }
    }
    const images = [...xml.matchAll(/<a:blip\b[^>]*?r:embed="([^"]+)"/g)]
      .map((m) => (rels.get(m[1]) ? imageData(files, rels.get(m[1])!) : null))
      .filter((x): x is string => !!x);
    return { n, title, points, images };
  });
}

/** A CSV text as rows of cells (comma or semicolon, quotes respected). */
export function csvRows(text: string, max = 500): string[][] {
  const first = text.split('\n')[0] ?? '';
  const sep = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length && rows.length < max; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
