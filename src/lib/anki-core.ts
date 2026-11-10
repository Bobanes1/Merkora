/**
 * Anki package reader without browser-only parts (so it can also be tested in Node).
 * Reads old (collection.anki2 / .anki21 with JSON note types) and new (zstd-compressed collection.anki21b,
 * protobuf note types and media list) formats. Cards are rendered from their note type's templates.
 */
import { unzipSync } from 'fflate';
import { Decompress } from 'fzstd';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

export type AnkiCard = {
  front: string;
  back: string;
  styleId?: string;
  cardClass?: string;
  tags?: string[];
  progress?: { kind: number; due: number; ivl: number; factor: number; reps: number; lapses: number; suspended?: boolean };
};
export type AnkiDeck = { name: string; cards: AnkiCard[] };
export type AnkiMedia = { id: string; name: string; type: string; bytes: Uint8Array };
export type ParsedApkg = {
  decks: AnkiDeck[];
  styles: Record<string, string>;
  media: AnkiMedia[];
  missingMedia: number;
  skipped: number;
  crt: number;
  withProgress: number;
};
type Progress = (text: string) => void;
export type ParseOptions = { sanitize: (html: string) => string; uid: () => string; onProgress?: Progress };
// ---------- small helpers ----------
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b: Uint8Array) => b.length > 4 && ZSTD_MAGIC.every((m, i) => b[i] === m);

function unzstd(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  const d = new Decompress((chunk) => chunks.push(chunk));
  d.push(b, true);
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
const maybeUnzstd = (b: Uint8Array) => (isZstd(b) ? unzstd(b) : b);
const tick = () => new Promise((r) => setTimeout(r, 0));
const utf8 = new TextDecoder();

/** Minimal protobuf reader: field number → list of values (numbers for varints, bytes for length-delimited). */
function readProto(buf: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const out = new Map<number, (number | Uint8Array)[]>();
  let i = 0;
  const varint = () => {
    let result = 0;
    let mul = 1;
    for (;;) {
      const b = buf[i++];
      result += (b & 0x7f) * mul;
      if (b < 0x80) break;
      mul *= 128;
    }
    return result;
  };
  while (i < buf.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    let val: number | Uint8Array;
    if (wire === 0) val = varint();
    else if (wire === 2) {
      const len = varint();
      val = buf.subarray(i, i + len);
      i += len;
    } else if (wire === 1) {
      val = 0;
      i += 8;
    } else if (wire === 5) {
      val = 0;
      i += 4;
    } else break;
    if (!out.has(field)) out.set(field, []);
    out.get(field)!.push(val);
  }
  return out;
}
const protoStr = (m: Map<number, (number | Uint8Array)[]>, f: number) => {
  const v = m.get(f)?.[0];
  return v instanceof Uint8Array ? utf8.decode(v) : '';
};
const protoNum = (m: Map<number, (number | Uint8Array)[]>, f: number) => {
  const v = m.get(f)?.[0];
  return typeof v === 'number' ? v : 0;
};

function rows(db: Database, sql: string): SqlValue[][] {
  const r = db.exec(sql);
  return r.length ? r[0].values : [];
}
function hasTable(db: Database, name: string) {
  return rows(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0;
}

// ---------- note types ----------
type Tmpl = { q: string; a: string };
type NoteType = { cloze: boolean; css: string; fields: string[]; tmpls: Tmpl[] };

function readNoteTypes(db: Database): Map<string, NoteType> {
  const map = new Map<string, NoteType>();
  if (hasTable(db, 'notetypes')) {
    for (const [id, config] of rows(db, 'SELECT id, config FROM notetypes')) {
      const cfg = config instanceof Uint8Array ? readProto(config) : new Map();
      map.set(String(id), { cloze: protoNum(cfg, 1) === 1, css: protoStr(cfg, 3), fields: [], tmpls: [] });
    }
    for (const [ntid, ord, name] of rows(db, 'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')) {
      const nt = map.get(String(ntid));
      if (nt) nt.fields[Number(ord)] = String(name);
    }
    for (const [ntid, ord, config] of rows(db, 'SELECT ntid, ord, config FROM templates ORDER BY ntid, ord')) {
      const nt = map.get(String(ntid));
      if (!nt) continue;
      const cfg = config instanceof Uint8Array ? readProto(config) : new Map();
      nt.tmpls[Number(ord)] = { q: protoStr(cfg, 1), a: protoStr(cfg, 2) };
    }
  } else {
    const [[models]] = rows(db, 'SELECT models FROM col');
    const json = JSON.parse(String(models)) as Record<
      string,
      { type: number; css?: string; flds: { name: string; ord: number }[]; tmpls: { ord: number; qfmt: string; afmt: string }[] }
    >;
    for (const [id, m] of Object.entries(json)) {
      const fields: string[] = [];
      m.flds.forEach((f) => (fields[f.ord] = f.name));
      const tmpls: Tmpl[] = [];
      m.tmpls.forEach((t) => (tmpls[t.ord] = { q: t.qfmt, a: t.afmt }));
      map.set(String(id), { cloze: m.type === 1, css: m.css ?? '', fields, tmpls });
    }
  }
  return map;
}

function readDecks(db: Database): Map<string, string> {
  const map = new Map<string, string>();
  if (hasTable(db, 'decks')) {
    for (const [id, name] of rows(db, 'SELECT id, name FROM decks')) map.set(String(id), String(name).split('\x1f').join('::'));
  } else {
    const [[decks]] = rows(db, 'SELECT decks FROM col');
    for (const [id, d] of Object.entries(JSON.parse(String(decks)) as Record<string, { name: string }>)) map.set(String(id), d.name);
  }
  return map;
}

// ---------- template rendering ----------
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
/** Same rule as Anki: only whitespace and empty line breaks/divs count as empty (an image alone is not empty). */
const isEmptyField = (s: string | undefined) => !s || /^(?:\s|&nbsp;|<\/?(?:br|div|p)\s*\/?>)*$/i.test(s);

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

function renderCloze(text: string, n: number, side: 'q' | 'a'): string {
  return text.replace(CLOZE_RE, (_m, num: string, ans: string, hint?: string) => {
    if (Number(num) !== n) return ans;
    return side === 'q' ? `<span class="cloze">[${hint ? hint : '…'}]</span>` : `<span class="cloze">${ans}</span>`;
  });
}

function furigana(s: string, mode: 'furigana' | 'kana' | 'kanji') {
  return s.replace(/ ?([^ >[]+?)\[(.+?)\]/g, (_m, base: string, reading: string) =>
    mode === 'kana' ? reading : mode === 'kanji' ? base : `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`,
  );
}

type Ctx = { fields: Record<string, string>; cloze: number; side: 'q' | 'a'; frontSide: string; deck: string; tags: string };

function lookup(ctx: Ctx, name: string): string | undefined {
  if (name in ctx.fields) return ctx.fields[name];
  const lower = name.toLowerCase();
  const k = Object.keys(ctx.fields).find((x) => x.toLowerCase() === lower);
  return k ? ctx.fields[k] : undefined;
}

function renderTemplate(tmpl: string, ctx: Ctx): string {
  let s = tmpl;
  // Conditional sections, innermost first.
  const section = /\{\{([#^])\s*([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;
  for (let guard = 0; guard < 200 && section.test(s); guard++) {
    s = s.replace(section, (_m, kind: string, name: string, body: string) => {
      const field = name.includes(':') ? name.split(':').pop()! : name;
      let empty = isEmptyField(lookup(ctx, field));
      if (name.startsWith('cloze:') && !empty) empty = !new RegExp(`\\{\\{c${ctx.cloze}::`).test(lookup(ctx, field)!);
      return (kind === '#' ? !empty : empty) ? body : '';
    });
  }
  return s.replace(/\{\{([^}]+?)\}\}/g, (_m, raw: string) => {
    const tag = raw.trim();
    if (tag === 'FrontSide') return ctx.frontSide;
    if (tag === 'Tags') return ctx.tags;
    if (tag === 'Deck') return ctx.deck;
    if (tag === 'Subdeck') return ctx.deck.split('::').pop() ?? '';
    if (tag === 'Card' || tag === 'Type' || tag === 'CardFlag') return '';
    const parts = tag.split(':');
    const name = parts.pop()!.trim();
    const filters = parts.map((f) => f.trim());
    let v = lookup(ctx, name);
    if (v === undefined) return '';
    for (const f of filters.reverse()) {
      if (f === 'type' || f.startsWith('type')) return '';
      if (f === 'cloze') v = renderCloze(v, ctx.cloze, ctx.side);
      else if (f === 'text') v = stripHtml(v);
      else if (f === 'furigana' || f === 'kana' || f === 'kanji') v = furigana(v, f);
      else if (f.startsWith('tts')) v = stripHtml(v);
      // hint and unknown filters: show the field as is
    }
    return v;
  });
}

// ---------- media ----------
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
  m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
};
const mimeOf = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

function readMediaMap(files: Record<string, Uint8Array>): Map<string, string> {
  const map = new Map<string, string>(); // file name → zip entry
  const raw = files['media'];
  if (!raw) return map;
  const first = raw[0];
  if (first === 0x7b /* { */) {
    const json = JSON.parse(utf8.decode(raw)) as Record<string, string>;
    for (const [k, name] of Object.entries(json)) map.set(name, k);
    return map;
  }
  try {
    const entries = readProto(maybeUnzstd(raw)).get(1) ?? [];
    entries.forEach((e, i) => {
      if (!(e instanceof Uint8Array)) return;
      const m = readProto(e);
      const legacy = m.get(255)?.[0];
      map.set(protoStr(m, 1), typeof legacy === 'number' ? String(legacy) : String(i));
    });
  } catch {
    /* unknown media list */
  }
  return map;
}

const unescapeName = (s: string) => {
  const t = s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
};

// ---------- main ----------
export async function parseApkg(zipBytes: Uint8Array, SQL: SqlJsStatic, opts: ParseOptions): Promise<ParsedApkg> {
  const onProgress = opts.onProgress ?? (() => undefined);
  onProgress('Datei wird entpackt …');
  await tick();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new Error('Die Datei ist keine gültige Anki-Datei (.apkg) oder beschädigt.');
  }
  // Newer Anki versions put a dummy "please update Anki" collection.anki2 next to the real collection.anki21b.
  const colName = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find((n) => files[n]);
  if (!colName) throw new Error('Das ist keine Anki-Datei (keine Sammlung gefunden).');

  onProgress('Sammlung wird geöffnet …');
  await tick();
  const db = new SQL.Database(maybeUnzstd(files[colName]));
  try {
    const noteTypes = readNoteTypes(db);
    const deckNames = readDecks(db);
    const mediaMap = readMediaMap(files);

    onProgress('Karten werden gelesen …');
    await tick();
    const cardRows = rows(
      db,
      'SELECT c.did, c.odid, c.ord, n.mid, n.flds, n.tags, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.odue FROM cards c JOIN notes n ON n.id = c.nid ORDER BY c.did, c.due, n.id, c.ord',
    );

    const byDeck = new Map<string, AnkiCard[]>();
    const usedMedia = new Map<string, string>(); // file name → media id
    const mediaId = (name: string) => {
      let id = usedMedia.get(name);
      if (!id) {
        id = opts.uid();
        usedMedia.set(name, id);
      }
      return id;
    };
    const linkMedia = (html: string) =>
      html
        .replace(/\[sound:([^\]]+)\]/g, (_m, name: string) => `<audio controls data-media="${mediaId(unescapeName(name.trim()))}"></audio>`)
        .replace(/<img\b[^>]*>/gi, (tag) => {
          const m = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
          const src = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
          if (!src || /^(https?:|data:)/i.test(src)) return tag;
          return tag.replace(m![0], ` data-media="${mediaId(unescapeName(src))}"`);
        });

    let skipped = 0;
    let n = 0;
    const styles: Record<string, string> = {};
    const crt = Number(rows(db, 'SELECT crt FROM col')[0]?.[0] ?? 0);
    let withProgress = 0;
    for (const [did, odid, ord, mid, flds, tags, ctype, queue, due, ivl, factor, reps, lapses, odue] of cardRows) {
      const nt = noteTypes.get(String(mid));
      const deck = deckNames.get(String(Number(odid) ? odid : did)) ?? 'Anki-Import';
      const values = String(flds).split('\x1f');
      let front: string;
      let back: string;
      const fields: Record<string, string> = {};
      nt?.fields.forEach((name, i) => (fields[name] = values[i] ?? ''));
      const tmpl = nt ? (nt.cloze ? nt.tmpls.find(Boolean) : nt.tmpls[Number(ord)] ?? nt.tmpls.find(Boolean)) : undefined;
      if (nt && tmpl && (tmpl.q || tmpl.a)) {
        const ctx: Ctx = { fields, cloze: Number(ord) + 1, side: 'q', frontSide: '', deck, tags: String(tags ?? '').trim() };
        front = renderTemplate(tmpl.q, ctx);
        back = renderTemplate(tmpl.a, { ...ctx, side: 'a', frontSide: '' }).replace(/^\s*(<br\s*\/?>\s*)*<hr[^>]*id\s*=\s*["']?answer["']?[^>]*>/i, '');
      } else {
        // Unknown note type: first field is the question, the rest the answer.
        front = values[0] ?? '';
        back = values.slice(1).filter((v) => !isEmptyField(v)).join('<br>');
      }
      front = opts.sanitize(linkMedia(front)).trim();
      back = opts.sanitize(linkMedia(back)).trim();
      if (!stripHtml(front).trim() && !/data-media=|<img|<svg/i.test(front)) {
        skipped++;
        continue;
      }
      if (!byDeck.has(deck)) byDeck.set(deck, []);
      const styleId = nt?.css.trim() ? String(mid) : undefined;
      if (styleId && !styles[styleId]) styles[styleId] = nt!.css;
      const kind = Number(ctype);
      const progress =
        kind >= 1 && kind <= 3
          ? {
              kind,
              due: Number(Number(odid) && Number(odue) ? odue : due),
              ivl: Number(ivl),
              factor: Number(factor),
              reps: Number(reps),
              lapses: Number(lapses),
              suspended: Number(queue) === -1,
            }
          : undefined;
      if (progress) withProgress++;
      const tagList = String(tags ?? '').split(/s+/).filter(Boolean);
      byDeck.get(deck)!.push({
        front,
        back,
        ...(styleId ? { styleId } : {}),
        cardClass: `card card${Number(ord) + 1}`,
        ...(tagList.length ? { tags: tagList } : {}),
        ...(progress ? { progress } : {}),
      });
      if (++n % 500 === 0) {
        onProgress(`Karten werden gelesen … (${n})`);
        await tick();
      }
    }

    // The referenced pictures and sounds.
    const media: AnkiMedia[] = [];
    let missing = 0;
    for (const [name, id] of usedMedia) {
      const entry = mediaMap.get(name) ?? mediaMap.get(name.normalize('NFC')) ?? mediaMap.get(name.normalize('NFD'));
      const bytes = entry !== undefined ? files[entry] : undefined;
      if (!bytes) {
        missing++;
        continue;
      }
      media.push({ id, name, type: mimeOf(name), bytes: maybeUnzstd(bytes) });
    }

    const decks = [...byDeck.entries()].map(([name, cards]) => ({ name, cards }));
    if (!decks.length) throw new Error('In dieser Datei wurden keine Karten gefunden.');
    return { decks, styles, media, missingMedia: missing, skipped, crt, withProgress };
  } finally {
    db.close();
  }
}