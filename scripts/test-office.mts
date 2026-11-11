// Checks reading Word, PowerPoint and OpenDocument files. Run: npm run test:office
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { officeText } from '../src/lib/officeText';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) failures++;
  console.log(cond ? '  ok  ' : '  FAIL', msg);
};
const zip = (files: Record<string, string>) => unzipSync(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));

console.log('Word (.docx)');
{
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Zellbiologie</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Mitochondrien </w:t></w:r><w:r><w:t>sind die Kraftwerke der Zelle.</w:t></w:r></w:p>
<w:p><w:r><w:t>Begriff</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Erklärung</w:t></w:r></w:p>
<w:p><w:r><w:t>Zeile 1</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Zeile 2 &amp; mehr &lt;ATP&gt;</w:t></w:r></w:p>
<w:p/>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tabellenzelle</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
  const foot = `<w:footnotes ${W}><w:footnote w:id="1"><w:p><w:r><w:t>Quelle: Lehrbuch S. 12</w:t></w:r></w:p></w:footnote></w:footnotes>`;
  const t = officeText('Skript.docx', zip({ 'word/document.xml': doc, 'word/footnotes.xml': foot, '[Content_Types].xml': '<Types/>' }));
  ok(t.startsWith('Zellbiologie\nMitochondrien sind die Kraftwerke der Zelle.'), 'Überschrift und Absatz aus mehreren Textstücken');
  ok(t.includes('Begriff\tErklärung'), 'Tabulator bleibt erhalten');
  ok(t.includes('Zeile 1\nZeile 2 & mehr <ATP>'), 'Zeilenumbruch und Sonderzeichen');
  ok(t.includes('Tabellenzelle'), 'Text aus Tabellen');
  ok(t.includes('Fußnoten:\nQuelle: Lehrbuch S. 12'), 'Fußnoten');
  ok(!/<|w:/.test(t.replace('<ATP>', '')), 'keine XML-Reste');
}

console.log('PowerPoint (.pptx)');
{
  const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const slide = (title: string, bullets: string[]) =>
    `<p:sld ${A}><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="de-DE"/><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:sp><p:txBody>${bullets.map((b) => `<a:p><a:pPr lvl="1"/><a:r><a:t>${b}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const files = zip({
    'ppt/slides/slide1.xml': slide('Einführung', ['Was ist eine Zelle?']),
    'ppt/slides/slide2.xml': slide('Mitochondrien', ['Kraftwerke', 'erzeugen ATP']),
    'ppt/slides/slide10.xml': slide('Zusammenfassung', ['Zellen &amp; Organellen']),
    'ppt/slides/_rels/slide2.xml.rels':
      '<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    'ppt/notesSlides/notesSlide1.xml': `<p:notes ${A}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hier Beispiel aus dem Alltag nennen.</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
  });
  const t = officeText('Vorlesung.pptx', files);
  ok(t.indexOf('Folie 1:') < t.indexOf('Folie 2:') && t.indexOf('Folie 2:') < t.indexOf('Folie 10:'), 'Folien in richtiger Reihenfolge (1, 2, 10)');
  ok(t.includes('Folie 2:\nMitochondrien\nKraftwerke\nerzeugen ATP'), 'Titel und Aufzählungspunkte einer Folie');
  ok(t.includes('Notizen: Hier Beispiel aus dem Alltag nennen.') && !t.includes('Notizen: Hier Beispiel aus dem Alltag nennen. 2'), 'Sprechernotizen (ohne Seitenzahl)');
  ok(t.includes('Zellen & Organellen'), 'Sonderzeichen');
}

console.log('OpenDocument (.odt / .odp)');
{
  const odt = officeText(
    'Notizen.odt',
    zip({ 'content.xml': '<office:document-content><office:body><office:text><text:h>Titel</text:h><text:p>Erster<text:tab/>Absatz</text:p><text:p>A<text:line-break/>B</text:p></office:text></office:body></office:document-content>' }),
  );
  ok(odt === 'Titel\nErster\tAbsatz\nA\nB', 'Text-Dokument');
  const odp = officeText(
    'Folien.odp',
    zip({ 'content.xml': '<office:document-content><draw:page draw:name="1"><text:p>Folie A</text:p></draw:page><draw:page draw:name="2"><text:p>Folie B</text:p></draw:page></office:document-content>' }),
  );
  ok(odp === 'Folie 1:\nFolie A\n\nFolie 2:\nFolie B', 'Präsentation');
}

console.log('Fehlerfälle');
{
  let msg = '';
  try {
    officeText('leer.pptx', zip({ '[Content_Types].xml': '<Types/>' }));
  } catch (e) {
    msg = (e as Error).message;
  }
  ok(/keine Folien/.test(msg), `Präsentation ohne Folien: „${msg}“`);
  msg = '';
  try {
    officeText('bilder.docx', zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:drawing/></w:r></w:p></w:body></w:document>' }));
  } catch (e) {
    msg = (e as Error).message;
  }
  ok(/kein Text/.test(msg), `Dokument nur mit Bildern: „${msg}“`);
}

// Optional: real files created by Word/PowerPoint (OFFICE_DIR=folder npm run test:office)
if (process.env.OFFICE_DIR) {
  const { readFileSync, readdirSync } = await import('node:fs');
  for (const name of readdirSync(process.env.OFFICE_DIR).filter((n) => /\.(docx|pptx|odt|odp)$/i.test(n))) {
    console.log(`Echte Datei: ${name}`);
    const text = officeText(name, unzipSync(new Uint8Array(readFileSync(`${process.env.OFFICE_DIR}/${name}`))));
    console.log(text.split('\n').map((l) => '    | ' + l).join('\n'));
    ok(text.length > 20, `${name}: Text gelesen`);
  }
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Office-Tests bestanden');
process.exit(failures ? 1 : 0);
