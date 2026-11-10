// Self-test for the Anki importer: builds old- and new-format .apkg files like Anki does and reads them back.
// Run: npx tsx scripts/test-anki.mts
import { zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import { zstdCompressSync } from 'node:zlib';
import { parseApkg } from '../src/lib/anki-core';

const SQL = await initSqlJs();
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const MP3 = new Uint8Array([73, 68, 51, 3, 0, 0]);
let failures = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) {
    failures++;
    console.log('  FAIL', msg);
  } else console.log('  ok  ', msg);
};
let n = 0;
const opts = { sanitize: (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, ''), uid: () => `m${++n}` };

const OLD_SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`;

function oldCollection(models: object, decks: object, notes: [number, number, string, string][], cards: [number, number, number, number][]) {
  const db = new SQL.Database();
  db.run(OLD_SCHEMA);
  db.run('INSERT INTO col VALUES (1,0,0,0,11,0,0,0,?,?,?,?,?)', ['{}', JSON.stringify(models), JSON.stringify(decks), '{}', '{}']);
  for (const [id, mid, flds, tags] of notes) db.run('INSERT INTO notes VALUES (?,?,?,0,0,?,?,?,0,0,"")', [id, `g${id}`, mid, tags, flds, flds.split('\x1f')[0]]);
  for (const [id, nid, did, ord] of cards) db.run('INSERT INTO cards VALUES (?,?,?,?,0,0,0,0,?,0,0,0,0,0,0,0,0,"")', [id, nid, did, ord, id]);
  const bytes = db.export();
  db.close();
  return bytes;
}

// ---------- 1) classic format (collection.anki2 + JSON media list) ----------
{
  console.log('Classic .apkg (Anki 2.1 legacy export)');
  const models = {
    '100': {
      type: 0,
      flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
      tmpls: [
        { ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}' },
        { ord: 1, qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id="answer">{{Front}}' },
      ],
    },
    '200': {
      type: 1,
      flds: [{ name: 'Text', ord: 0 }, { name: 'Back Extra', ord: 1 }],
      tmpls: [{ ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{#Back Extra}}<i>{{Back Extra}}</i>{{/Back Extra}}' }],
    },
  };
  const decks = { '1': { name: 'Default' }, '10': { name: 'Biologie::Zelle' } };
  const notes: [number, number, string, string][] = [
    [1, 100, 'Was ist ein Mitochondrium?\x1fDas Kraftwerk der Zelle <img src="cell.png">', 'bio'],
    [2, 100, 'Hund\x1fdog [sound:dog.mp3]', ''],
    [3, 200, 'Die {{c1::Zellmembran}} umgibt die {{c2::Zelle::Ort}}.\x1f', ''],
    [4, 100, '<b>Formel</b>\x1f\\(E=mc^2\\)<script>alert(1)</script>', ''],
  ];
  const cards: [number, number, number, number][] = [
    [11, 1, 10, 0],
    [12, 2, 10, 0],
    [13, 2, 10, 1],
    [14, 3, 10, 0],
    [15, 3, 10, 1],
    [16, 4, 1, 0],
  ];
  const zip = zipSync({
    'collection.anki2': oldCollection(models, decks, notes, cards),
    media: new TextEncoder().encode(JSON.stringify({ '0': 'cell.png', '1': 'dog.mp3' })),
    '0': PNG,
    '1': MP3,
  });
  if (process.env.WRITE_APKG) (await import('node:fs')).writeFileSync(process.env.WRITE_APKG, zip);
  const r = await parseApkg(zip, SQL, opts);
  const zelle = r.decks.find((d) => d.name === 'Biologie::Zelle');
  ok(r.decks.length === 2, `2 Decks gefunden (${r.decks.map((d) => d.name).join(', ')})`);
  ok(zelle && zelle.cards.length === 5, `5 Karten im Deck Zelle (${zelle?.cards.length})`);
  const c1 = zelle!.cards[0];
  ok(c1.front === 'Was ist ein Mitochondrium?', 'Vorderseite ohne Vorlage-Reste');
  ok(/Kraftwerk/.test(c1.back) && /<img data-media="m\d+"/.test(c1.back) && !/Mitochondrium/.test(c1.back), 'Rückseite mit Bild, ohne FrontSide');
  ok(/<audio controls data-media=/.test(zelle!.cards[1].back), 'Ton wird als Audio übernommen');
  ok(zelle!.cards[2].front.startsWith('dog'), 'Umgekehrte Karte (2. Vorlage) korrekt');
  const cl1 = zelle!.cards[3];
  ok(/\[…\]/.test(cl1.front) && /Zelle/.test(cl1.front) && !/Zellmembran/.test(cl1.front), 'Lückentext c1: Lücke vorne');
  ok(/<span class="cloze">Zellmembran<\/span>/.test(cl1.back), 'Lückentext c1: Lösung hinten');
  ok(/\[Ort\]/.test(zelle!.cards[4].front), 'Lückentext c2 mit Hinweis');
  ok(!/Back Extra|\{\{/.test(cl1.back), 'Leere Bedingungen entfernt');
  ok(r.media.length === 2 && r.missingMedia === 0, `2 Medien übernommen (${r.media.length}, fehlend ${r.missingMedia})`);
  const def = r.decks.find((d) => d.name === 'Default')!;
  ok(!/script/.test(def.cards[0].back) && /E=mc\^2/.test(def.cards[0].back), 'Formel bleibt, Skript entfernt');
}

// ---------- 2) new format (collection.anki21b zstd + protobuf) ----------
const enc = new TextEncoder();
function varint(n: number) {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
function pb(fields: [number, number | string | Uint8Array][]) {
  const out: number[] = [];
  for (const [f, v] of fields) {
    if (typeof v === 'number') out.push(...varint(f * 8), ...varint(v));
    else {
      const b = typeof v === 'string' ? enc.encode(v) : v;
      out.push(...varint(f * 8 + 2), ...varint(b.length), ...b);
    }
  }
  return new Uint8Array(out);
}
{
  console.log('Neues .apkg (Anki 23+/25, collection.anki21b)');
  const db = new SQL.Database();
  db.run(`
CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob);
CREATE TABLE fields (ntid integer, ord integer, name text, config blob);
CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob);
CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob);
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`);
  db.run("INSERT INTO col VALUES (1,0,0,0,18,0,0,0,'','','','','')");
  db.run('INSERT INTO notetypes VALUES (500, "Einfach", 0, 0, ?)', [pb([[1, 0], [3, '.card{}']])]);
  db.run('INSERT INTO notetypes VALUES (600, "Lückentext", 0, 0, ?)', [pb([[1, 1]])]);
  db.run(`INSERT INTO fields VALUES (500,0,'Vorderseite',X''),(500,1,'Rückseite',X''),(600,0,'Text',X''),(600,1,'Extra',X'')`);
  db.run('INSERT INTO templates VALUES (500,0,"Karte 1",0,0,?)', [pb([[1, '{{Vorderseite}}'], [2, '{{FrontSide}}<hr id=answer>{{Rückseite}}']])]);
  db.run('INSERT INTO templates VALUES (600,0,"Lückentext",0,0,?)', [pb([[1, '{{cloze:Text}}'], [2, '{{cloze:Text}}<br>{{Extra}}']])]);
  db.run(`INSERT INTO decks VALUES (1,'Default',0,0,X'',X''),(77,?,0,0,X'',X'')`, ['Sprachen\x1fFranzösisch']);
  db.run('INSERT INTO notes VALUES (1,"a",500,0,0,"","maison\x1fdas Haus <img src=\'haus bild.jpg\'>","maison",0,0,"")');
  db.run('INSERT INTO notes VALUES (2,"b",600,0,0,"","Paris ist die {{c1::Hauptstadt}} Frankreichs.\x1fGeografie","",0,0,"")');
  db.run('INSERT INTO cards VALUES (1,1,77,0,0,0,0,0,1,0,0,0,0,0,0,0,0,""),(2,2,77,0,0,0,0,0,2,0,0,0,0,0,0,0,0,"")');
  const col = db.export();
  db.close();
  const dummy = oldCollection(
    { '1': { type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }], tmpls: [{ ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] } },
    { '1': { name: 'Default' } },
    [[1, 1, 'Please update to the latest Anki version, then import the .colpkg/.apkg file again.\x1f', '']],
    [[1, 1, 1, 0]],
  );
  const mediaList = pb([[1, pb([[1, 'haus bild.jpg'], [2, PNG.length]])]]);
  const zip = zipSync({
    'collection.anki2': dummy,
    'collection.anki21b': new Uint8Array(zstdCompressSync(col)),
    media: new Uint8Array(zstdCompressSync(mediaList)),
    '0': new Uint8Array(zstdCompressSync(PNG)),
    meta: pb([[1, 3]]),
  });
  const r = await parseApkg(zip, SQL, opts);
  ok(r.decks.length === 1 && r.decks[0].name === 'Sprachen::Französisch', `Deckname mit Unterdeck (${r.decks.map((d) => d.name)})`);
  const [a, b] = r.decks[0].cards;
  ok(a.front === 'maison' && /das Haus/.test(a.back) && /data-media/.test(a.back) && !/maison/.test(a.back), 'Einfache Karte mit Bild (Leerzeichen im Dateinamen)');
  ok(/\[…\]/.test(b.front) && /Hauptstadt/.test(b.back) && /Geografie/.test(b.back), 'Lückentext im neuen Format');
  ok(r.media.length === 1 && r.media[0].bytes.length === PNG.length && r.media[0].bytes[0] === 137, 'Medien aus zstd entpackt');
  ok(!r.decks.some((d) => d.cards.some((c) => /Please update/.test(c.front))), 'Platzhalter-Sammlung ignoriert');
}

// ---------- 3) broken file ----------
{
  console.log('Fehlerfälle');
  try {
    await parseApkg(new Uint8Array([1, 2, 3]), SQL, opts);
    ok(false, 'Kaputte Datei wird abgelehnt');
  } catch (e) {
    ok(/gültige Anki-Datei|keine Anki-Datei/.test((e as Error).message), `Kaputte Datei: verständliche Meldung („${(e as Error).message}“)`);
  }
}

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Anki-Tests bestanden');
process.exit(failures ? 1 : 0);
