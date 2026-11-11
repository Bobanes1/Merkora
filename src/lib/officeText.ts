/**
 * Text from Office files without extra libraries: Word (.docx), PowerPoint (.pptx) and their
 * OpenDocument counterparts (.odt, .odp) are ZIP archives with XML inside.
 * Pure functions on the unzipped files – also testable in Node (scripts/test-office.mts).
 */
export type ZipFiles = Record<string, Uint8Array>;

const utf8 = new TextDecoder();
const read = (files: ZipFiles, name: string) => (files[name] ? utf8.decode(files[name]) : '');

/** Decodes the XML entities that appear in document text. */
export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** All paragraphs of an XML part: `para` is the paragraph tag, `run` the text tag (e.g. w:p / w:t). */
function paragraphs(xml: string, para: string, run: string, extra: (inner: string) => string = (x) => x): string[] {
  const out: string[] = [];
  const paraRe = new RegExp(`<${para}[\\s>][\\s\\S]*?</${para}>|<${para}/>`, 'g');
  const runRe = new RegExp(`<${run}(?:\\s[^>]*)?>([\\s\\S]*?)</${run}>`, 'g');
  for (const m of xml.match(paraRe) ?? []) {
    const inner = extra(m);
    let text = '';
    for (const r of inner.matchAll(runRe)) text += r[1];
    text = decodeXml(text.replace(/<[^>]+>/g, '')).replace(/ {2,}/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

const naturalNumber = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);

/** Word: body text (with tabs and line breaks), then footnotes. */
export function docxText(files: ZipFiles): string {
  const doc = read(files, 'word/document.xml');
  if (!doc) throw new Error('In dieser Word-Datei wurde kein Text gefunden.');
  const keepBreaks = (p: string) => p.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br[^>]*\/>/g, '<w:t>\n</w:t>');
  const parts = [paragraphs(doc, 'w:p', 'w:t', keepBreaks).join('\n')];
  const notes = paragraphs(read(files, 'word/footnotes.xml'), 'w:p', 'w:t');
  if (notes.length) parts.push('Fußnoten:\n' + notes.join('\n'));
  return parts.join('\n\n').trim();
}

/** PowerPoint: slide by slide, each with its speaker notes. */
export function pptxText(files: ZipFiles): string {
  const slides = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b));
  if (!slides.length) throw new Error('In dieser PowerPoint-Datei wurden keine Folien gefunden.');
  const out: string[] = [];
  for (const s of slides) {
    const n = naturalNumber(s);
    const text = paragraphs(read(files, s), 'a:p', 'a:t');
    // the notes page of a slide is linked in the slide's relationships
    const rels = read(files, `ppt/slides/_rels/slide${n}.xml.rels`);
    const notesTarget = rels.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
    const notes = notesTarget
      ? paragraphs(read(files, `ppt/notesSlides/${notesTarget}`), 'a:p', 'a:t').filter((t) => !/^\d+$/.test(t))
      : [];
    if (!text.length && !notes.length) continue;
    out.push(`Folie ${n}:\n${text.join('\n')}${notes.length ? `\nNotizen: ${notes.join(' ')}` : ''}`);
  }
  return out.join('\n\n').trim();
}

/** OpenDocument text (.odt) and presentation (.odp). */
export function odfText(files: ZipFiles): string {
  const xml = read(files, 'content.xml');
  if (!xml) throw new Error('In dieser Datei wurde kein Text gefunden.');
  const pages = xml.match(/<draw:page[\s>][\s\S]*?<\/draw:page>/g);
  const textOf = (part: string) =>
    (part.match(/<text:(?:p|h)[\s>][\s\S]*?<\/text:(?:p|h)>/g) ?? [])
      .map((p) => decodeXml(p.replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<[^>]+>/g, '')).trim())
      .filter(Boolean);
  if (pages?.length) return pages.map((p, i) => `Folie ${i + 1}:\n${textOf(p).join('\n')}`).join('\n\n').trim();
  return textOf(xml).join('\n').trim();
}

/** Picks the reader by file name. */
export function officeText(name: string, files: ZipFiles): string {
  const n = name.toLowerCase();
  const text = n.endsWith('.docx') ? docxText(files) : n.endsWith('.pptx') ? pptxText(files) : odfText(files);
  if (!text.trim()) throw new Error('In dieser Datei wurde kein Text gefunden (vielleicht enthält sie nur Bilder).');
  return text;
}
