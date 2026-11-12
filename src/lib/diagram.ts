/**
 * Diagrams on cards: the AI only describes a graphic (type + short labels), Merkora draws it itself with
 * fixed templates – clean layout without overlaps, Merkora colours, light and dark.
 * Pure (no DOM) – tested in scripts/test-srs.mts.
 */

export type Diagram =
  | { type: 'flow'; title?: string; steps: string[]; highlight?: string }
  | { type: 'cycle'; title?: string; steps: string[]; highlight?: string }
  | { type: 'hierarchy'; title?: string; root: string; children: { label: string; children?: string[] }[]; highlight?: string }
  | { type: 'compare'; title?: string; columns: { title: string; items: string[] }[] }
  | { type: 'timeline'; title?: string; events: { when: string; label: string }[] }
  | { type: 'concept'; title?: string; center: string; branches: string[]; highlight?: string }
  | { type: 'matrix'; title?: string; x: string; y: string; cells: string[] }
  | { type: 'axes'; title?: string; x: string; y: string; shape: Shape; marks?: { at: number; label: string }[]; label?: string; second?: { shape: Shape; label: string } }
  | { type: 'model'; title?: string; nodes: string[]; links: ModelLink[]; highlight?: string }
  | { type: 'venn'; title?: string; sets: { label: string; items: string[] }[]; shared: string[] }
  | { type: 'pyramid'; title?: string; levels: string[] }
  | { type: 'bars'; title?: string; unit?: string; bars: { label: string; value: number }[] }
  | { type: 'decision'; title?: string; question: string; yes: DecisionBranch; no: DecisionBranch };

/** Arrow of a model. `to` is a box – or "A -> B": then the arrow points at the middle of the arrow A→B (moderator). */
export type ModelLink = { from: string; to: string; label?: string; both?: boolean; dashed?: boolean };
export type DecisionBranch = string | { question: string; yes: string; no: string };

export type Shape = 'steigend' | 'fallend' | 'u' | 'umgekehrtes-u' | 's-kurve' | 'linear';
const SHAPES: Shape[] = ['steigend', 'fallend', 'u', 'umgekehrtes-u', 's-kurve', 'linear'];

// ---------- checking ----------
const MAX_LABEL = 60;
const str = (v: unknown, max = MAX_LABEL) => {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};
const list = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x))
    .filter(Boolean)
    .slice(0, max);

/** Checks and repairs an AI description; null if it cannot become a useful diagram. */
const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** The label in `labels` that `h` names (case and spaces ignored), else undefined. */
const pick = (h: unknown, labels: string[]) => {
  const k = key(str(h));
  return k ? labels.find((l) => key(l) === k) : undefined;
};
const shapeOf = (v: unknown): Shape => {
  const s = String(v ?? '').toLowerCase().replace(/[\s_]+/g, '-');
  return (SHAPES.find((k) => k === s) ?? (/(fall|sink|decreas)/.test(s) ? 'fallend' : /(umgekehrt|invert)/.test(s) ? 'umgekehrtes-u' : /^u/.test(s) ? 'u' : /s/.test(s) ? 's-kurve' : 'steigend')) as Shape;
};
const EDGE_RE = /^(.+?)\s*(?:->|→|-->|=>)\s*(.+)$/;

function parseModel(r: Record<string, unknown>, title: string | undefined): Diagram | null {
  const nodes: string[] = [];
  const alias = new Map<string, string>(); // ids the AI may use in links → label
  for (const n of Array.isArray(r.nodes) ? r.nodes : []) {
    const o = n as { label?: unknown; name?: unknown; id?: unknown };
    const label = typeof n === 'string' || typeof n === 'number' ? str(n) : str(o?.label ?? o?.name ?? o?.id);
    if (!label || nodes.some((x) => key(x) === key(label)) || nodes.length >= 8) continue;
    nodes.push(label);
    if (typeof n === 'object' && n && o.id != null) alias.set(key(str(o.id)), label);
  }
  const resolve = (v: unknown): string | undefined => {
    const s = str(v);
    if (!s) return undefined;
    const found = alias.get(key(s)) ?? pick(s, nodes);
    if (found) return found;
    if (nodes.length >= 8) return undefined;
    nodes.push(s); // unknown box → added
    return s;
  };
  const raws = (Array.isArray(r.links) ? r.links : Array.isArray(r.edges) ? r.edges : []) as Record<string, unknown>[];
  const links: ModelLink[] = [];
  const has = (from: string, to: string) => links.some((l) => l.from === from && l.to === to);
  const extra = (l: Record<string, unknown>) => {
    const label = str(l?.label, 40);
    return { ...(label ? { label } : {}), ...(l?.both === true ? { both: true } : {}), ...(l?.dashed === true ? { dashed: true } : {}) };
  };
  const target = (l: Record<string, unknown>) => EDGE_RE.exec(str(l?.to, 140));
  // ordinary arrows first, then arrows onto arrows (their target arrow must exist)
  for (const l of raws) {
    if (!l || typeof l !== 'object' || target(l)) continue;
    const from = resolve(l.from), to = resolve(l.to);
    if (from && to && from !== to && !has(from, to) && links.length < 10) links.push({ from, to, ...extra(l) });
  }
  for (const l of raws) {
    const m = l && typeof l === 'object' ? target(l) : null;
    if (!m) continue;
    const from = resolve(l.from), a = resolve(m[1]), b = resolve(m[2]);
    if (!from || !a || !b || a === b || from === a || from === b || links.length >= 10) continue;
    if (!has(a, b) && !has(b, a)) {
      if (links.length >= 9) continue;
      links.push({ from: a, to: b });
    }
    const to = has(a, b) ? `${a} -> ${b}` : `${b} -> ${a}`;
    if (!has(from, to)) links.push({ from, to, ...extra(l) });
  }
  if (nodes.length < 2 || !links.length) return null;
  const used = new Set(links.flatMap((l) => [l.from, ...(EDGE_RE.exec(l.to)?.slice(1) ?? [l.to])]));
  const kept = nodes.filter((n) => used.has(n)).concat(nodes.filter((n) => !used.has(n)).slice(0, 2)); // a few loose boxes are fine
  const highlight = pick(r.highlight, kept);
  return { type: 'model', title, nodes: kept, links, ...(highlight ? { highlight } : {}) };
}

function parseBranch(v: unknown, deep: boolean): DecisionBranch | null {
  if (typeof v === 'string' || typeof v === 'number') return str(v) || null;
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const q = str(o.question);
  if (deep && q) {
    const yes = parseBranch(o.yes, false), no = parseBranch(o.no, false);
    if (typeof yes === 'string' && typeof no === 'string') return { question: q, yes, no };
  }
  return str(o.label ?? o.answer ?? o.question) || null;
}

export function parseDiagram(raw: unknown): Diagram | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 70) || undefined;
  const t = String(r.type ?? '').toLowerCase();
  const hl = (labels: string[]) => {
    const h = pick(r.highlight, labels);
    return h ? { highlight: h } : {};
  };
  switch (t) {
    case 'flow':
    case 'cycle': {
      const steps = list(r.steps, 8);
      if (steps.length < (t === 'flow' ? 2 : 3)) return null;
      return { type: t, title, steps, ...hl(steps) };
    }
    case 'model':
      return parseModel(r, title);
    case 'venn': {
      const sets = (Array.isArray(r.sets) ? r.sets : [])
        .map((s) => ({ label: str((s as { label?: unknown })?.label ?? s, 40), items: list((s as { items?: unknown })?.items, 5) }))
        .filter((s) => s.label)
        .slice(0, 2);
      if (sets.length < 2) return null;
      return { type: 'venn', title, sets, shared: list(r.shared ?? r.both, 5) };
    }
    case 'pyramid': {
      const levels = list(r.levels ?? r.steps, 6);
      if (levels.length < 3) return null;
      return { type: 'pyramid', title, levels };
    }
    case 'bars': {
      const bars = (Array.isArray(r.bars) ? r.bars : [])
        .map((b) => ({ label: str((b as { label?: unknown })?.label, 40), value: Number(String((b as { value?: unknown })?.value ?? '').replace(',', '.')) }))
        .filter((b) => b.label && Number.isFinite(b.value))
        .slice(0, 8);
      if (bars.length < 2) return null;
      const unit = str(r.unit, 12);
      return { type: 'bars', title, ...(unit ? { unit } : {}), bars };
    }
    case 'decision': {
      const question = str(r.question);
      const yes = parseBranch(r.yes, true), no = parseBranch(r.no, true);
      if (!question || !yes || !no) return null;
      return { type: 'decision', title, question, yes, no };
    }
    case 'hierarchy': {
      const root = str(r.root);
      const children = (Array.isArray(r.children) ? r.children : [])
        .map((c) => (typeof c === 'string' ? { label: str(c) } : { label: str((c as { label?: unknown })?.label), children: list((c as { children?: unknown })?.children, 4) }))
        .filter((c) => c.label)
        .slice(0, 5)
        .map((c) => (c.children?.length ? c : { label: c.label }));
      if (!root || children.length < 2) return null;
      return { type: 'hierarchy', title, root, children, ...hl(children.map((c) => c.label)) };
    }
    case 'compare': {
      const columns = (Array.isArray(r.columns) ? r.columns : [])
        .map((c) => ({ title: str((c as { title?: unknown })?.title), items: list((c as { items?: unknown })?.items, 6) }))
        .filter((c) => c.title && c.items.length)
        .slice(0, 3);
      if (columns.length < 2) return null;
      return { type: 'compare', title, columns };
    }
    case 'timeline': {
      const events = (Array.isArray(r.events) ? r.events : [])
        .map((e) => ({ when: str((e as { when?: unknown })?.when, 20), label: str((e as { label?: unknown })?.label) }))
        .filter((e) => e.when && e.label)
        .slice(0, 8);
      if (events.length < 2) return null;
      return { type: 'timeline', title, events };
    }
    case 'concept': {
      const center = str(r.center);
      const branches = list(r.branches, 8);
      if (!center || branches.length < 3) return null;
      return { type: 'concept', title, center, branches, ...hl(branches) };
    }
    case 'matrix': {
      const cells = list(r.cells, 4);
      const x = str(r.x), y = str(r.y);
      if (cells.length !== 4 || !x || !y) return null;
      return { type: 'matrix', title, x, y, cells };
    }
    case 'axes': {
      const x = str(r.x, 40), y = str(r.y, 40);
      const shape = shapeOf(r.shape);
      const sec = r.second as { shape?: unknown; label?: unknown } | undefined;
      const second = sec && typeof sec === 'object' && str(sec.label, 30) ? { second: { shape: shapeOf(sec.shape), label: str(sec.label, 30) } } : {};
      const label = str(r.label, 30);
      const marks = (Array.isArray(r.marks) ? r.marks : [])
        .map((m) => ({ at: Math.min(0.95, Math.max(0.05, Number((m as { at?: unknown })?.at))), label: str((m as { label?: unknown })?.label, 30) }))
        .filter((m) => Number.isFinite(m.at) && m.label)
        .slice(0, 3);
      if (!x || !y) return null;
      return { type: 'axes', title, x, y, shape, ...(marks.length ? { marks } : {}), ...(label ? { label } : {}), ...second };
    }
    default:
      return null;
  }
}

// ---------- layout ----------
export const W = 600;
const PAD = 16;
const FS = 15; // label font size
const charW = (fs: number) => fs * 0.58;

/** Word wrap by estimated width; at most `maxLines`, the rest is shortened with "…". */
export function wrap(text: string, maxW: number, fs = FS, maxLines = 4): string[] {
  const per = Math.max(4, Math.floor(maxW / charW(fs)));
  const lines: string[] = [];
  let cur = '';
  for (let word of text.split(' ')) {
    while (word.length > per) {
      if (cur) (lines.push(cur), (cur = ''));
      lines.push(word.slice(0, per - 1) + '-');
      word = word.slice(per - 1);
    }
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= per) cur += ' ' + word;
    else (lines.push(cur), (cur = word));
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, per - 1).trimEnd() + '…';
    return kept;
  }
  return lines;
}

/**
 * node/accent: boxes (accent = highlighted); node2/accent2: the same in the second colour; soft: light box;
 * label: grey text; bold: heading; tag: small label on an arrow; text/textOn: text on a drawn area (dark / light text).
 */
export type Box = {
  x: number; y: number; w: number; h: number; lines: string[];
  kind: 'node' | 'accent' | 'soft' | 'label' | 'bold' | 'node2' | 'accent2' | 'tag' | 'text' | 'textOn';
  align?: 'middle' | 'start' | 'end'; fs?: number;
};
export type Line = { pts: [number, number][]; arrow?: boolean; dashed?: boolean; curve?: boolean; both?: boolean; tone?: 2; muted?: boolean };
/** Filled areas behind everything (Venn circles, pyramid steps). */
export type Area = { circle?: [number, number, number]; poly?: [number, number][]; tone: 'node' | 'accent' | 'accent2' | 'soft1' | 'soft2' };
export type Layout = { width: number; height: number; boxes: Box[]; lines: Line[]; areas: Area[]; fs: number };

let NF = FS; // font size of the boxes of the diagram being laid out
const nlh = () => Math.round(NF * 1.3);
const boxH = (lines: string[], py = 10) => lines.length * nlh() + 2 * py;

/** All box labels of a diagram, with the width they get – to pick one font size for the whole diagram. */
function nodeFont(labels: { text: string; w: number }[]): number {
  const fits = (fs: number) => labels.every((l) => l.text.split(' ').every((word) => word.length * charW(fs) <= l.w));
  return fits(FS) ? FS : fits(14) ? 14 : 13;
}

/** Point where the line from the box centre towards (tx, ty) leaves the box (plus a small gap). */
function edge(b: Box, tx: number, ty: number, gap = 4): [number, number] {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs((b.w / 2 + gap) / (dx || 1e-9)), Math.abs((b.h / 2 + gap) / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}
const centre = (b: Box): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];
function connect(a: Box, b: Box): Line {
  const [bx, by] = centre(b), [ax, ay] = centre(a);
  return { pts: [edge(a, bx, by), edge(b, ax, ay, 6)], arrow: true };
}

const TAG_FS = 12;
/** Small label on an arrow, centred on (cx, cy). */
function tag(text: string, cx: number, cy: number, maxW: number, maxLines = 2): Box {
  const ls = wrap(text, Math.max(20, maxW - 12), TAG_FS, maxLines);
  const w = Math.min(maxW, Math.max(...ls.map((l) => l.length)) * charW(TAG_FS) + 14);
  const h = ls.length * 15 + 6;
  return { x: cx - w / 2, y: cy - h / 2, w, h, lines: ls, kind: 'tag', fs: TAG_FS };
}
const tagW = (text: string) => Math.min(120, text.length * charW(TAG_FS) + 14);
const mid = (p: [number, number][]): [number, number] => {
  // middle of the longest segment
  let best = 0, at: [number, number] = p[0];
  for (let i = 1; i < p.length; i++) {
    const len = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (len > best) (best = len), (at = [(p[i][0] + p[i - 1][0]) / 2, (p[i][1] + p[i - 1][1]) / 2]);
  }
  return at;
};

/** Boxes with arrows between them: ranks from the causes to the effects, arrows onto arrows for moderators. */
function layoutModel(d: Extract<Diagram, { type: 'model' }>, top: number, boxes: Box[], lines: Line[]): number {
  const inner = W - 2 * PAD;
  const n = d.nodes.length;
  const idx = new Map(d.nodes.map((l, i) => [l, i]));
  type E = { a: number; b: number; label?: string; both?: boolean; dashed?: boolean };
  const edges: E[] = [];
  const mods: { m: number; e: number; label?: string; dashed?: boolean }[] = [];
  for (const l of d.links) if (!EDGE_RE.test(l.to)) edges.push({ a: idx.get(l.from)!, b: idx.get(l.to)!, label: l.label, both: l.both, dashed: l.dashed });
  for (const l of d.links) {
    const m = EDGE_RE.exec(l.to);
    if (!m) continue;
    const e = edges.findIndex((x) => x.a === idx.get(m[1]) && x.b === idx.get(m[2]));
    if (e >= 0) mods.push({ m: idx.get(l.from)!, e, label: l.label, dashed: l.dashed });
  }
  const inEdge = new Set(edges.flatMap((e) => [e.a, e.b]));
  const isMod = d.nodes.map((_, i) => !inEdge.has(i) && mods.some((m) => m.m === i));
  const main = d.nodes.map((_, i) => i).filter((i) => !isMod[i]);

  // ranks: longest path over the directed arrows, arrows that close a loop are drawn back as a detour
  const out = new Map<number, number[]>();
  edges.forEach((e, k) => !e.both && out.set(e.a, [...(out.get(e.a) ?? []), k]));
  const state = new Array(n).fill(0);
  const back = new Set<number>();
  const order: number[] = [];
  const visit = (u: number) => {
    state[u] = 1;
    for (const k of out.get(u) ?? []) {
      const v = edges[k].b;
      if (state[v] === 1) back.add(k);
      else if (!state[v]) visit(v);
    }
    state[u] = 2;
    order.unshift(u);
  };
  main.forEach((u) => !state[u] && visit(u));
  const rank = new Array(n).fill(0);
  for (const u of order) for (const k of out.get(u) ?? []) if (!back.has(k)) rank[edges[k].b] = Math.max(rank[edges[k].b], rank[u] + 1);
  const R = Math.max(...main.map((i) => rank[i])) + 1;
  const layers: number[][] = Array.from({ length: R }, () => []);
  main.forEach((i) => layers[rank[i]].push(i));
  // order inside a layer by the average place of the neighbours (fewer crossings)
  const pos = new Map<number, number>();
  const setPos = () => layers.forEach((L) => L.forEach((v, k) => pos.set(v, k - (L.length - 1) / 2)));
  setPos();
  const nb = (v: number, dir: 1 | -1) => edges.filter((e) => (dir === 1 ? e.b === v && rank[e.a] < rank[v] : e.a === v && rank[e.b] > rank[v])).map((e) => pos.get(dir === 1 ? e.a : e.b)!);
  const sweep = (r: number, dir: 1 | -1) => {
    const bc = (v: number) => {
      const p = nb(v, dir);
      return p.length ? p.reduce((s, x) => s + x, 0) / p.length : pos.get(v)!;
    };
    layers[r].sort((u, v) => bc(u) - bc(v));
    setPos();
  };
  for (let r = 1; r < R; r++) sweep(r, 1);
  for (let r = R - 2; r >= 0; r--) sweep(r, -1);

  const adjacent = (e: E) => Math.abs(rank[e.a] - rank[e.b]) === 1 && !back.has(edges.indexOf(e));
  const sameRank = (e: E) => rank[e.a] === rank[e.b];
  const straightTags = edges.filter((e) => e.label && (adjacent(e) || sameRank(e))).map((e) => tagW(e.label!));
  const detours = edges.filter((e) => !adjacent(e) && !sameRank(e));
  const modTarget = new Set(mods.map((m) => m.e));
  const node = (i: number): Box['kind'] => (d.highlight === d.nodes[i] ? 'accent' : isMod[i] ? 'node2' : 'node');

  // left → right if it fits (≤ 4 ranks, boxes at least 110 wide), else top → bottom
  const side = detours.length ? 22 : 0;
  // boxes up to 170 wide; spare room goes into the gaps (up to 110), so arrows and their labels breathe
  const gapX = Math.max(48, ...straightTags.map((w) => w + 16), R > 1 ? Math.min(110, (inner - 2 * side - R * 170) / (R - 1)) : 0);
  const bwH = Math.min(190, (inner - 2 * side - (R - 1) * gapX) / R);
  const horizontal = R <= 4 && bwH >= 110;
  const by = new Map<number, Box>();
  const modBoxes: Box[] = [];
  const tagsOut: Box[] = [];
  let bottom = top;

  if (horizontal) {
    const bw = bwH;
    const mw = Math.min(bw, 170);
    NF = nodeFont(d.nodes.map((t, i) => ({ text: t, w: (isMod[i] ? mw : bw) - 16 })));
    const ls = d.nodes.map((t, i) => wrap(t, (isMod[i] ? mw : bw) - 16, NF, 3));
    const bh = Math.max(...ls.map((l) => boxH(l)));
    const sameTags = edges.some((e) => sameRank(e) && e.label);
    const gapY = sameTags ? 34 : 26;
    const maxCol = Math.max(...layers.map((L) => L.length));
    const colH = maxCol * bh + (maxCol - 1) * gapY;
    const modTagH = Math.max(0, ...mods.map((m) => (m.label ? tag(m.label, 0, 0, 120).h : 0)));
    const bandGap = 30 + modTagH;
    // moderators go above, unless the arrow they point at is a detour below
    const above = mods.some((m) => isMod[m.m] && !detours.includes(edges[m.e]));
    const y0 = top + (above ? bh + bandGap : 0);
    const used = R * bw + (R - 1) * gapX;
    const x0 = PAD + (inner - used) / 2;
    layers.forEach((L, r) => {
      const h = L.length * bh + (L.length - 1) * gapY;
      L.forEach((v, k) => {
        const b: Box = { x: x0 + r * (bw + gapX), y: y0 + (colH - h) / 2 + k * (bh + gapY), w: bw, h: bh, lines: ls[v], kind: node(v) };
        by.set(v, b);
        boxes.push(b);
      });
    });
    bottom = y0 + colH;
    // arrows
    const edgeLine = new Map<number, Line>();
    let level = 0;
    edges.forEach((e, k) => {
      const a = by.get(e.a)!, b = by.get(e.b)!;
      let ln: Line;
      if (adjacent(e) || sameRank(e)) ln = { ...connect(a, b), both: e.both, dashed: e.dashed };
      else {
        // detour below the boxes, along the gaps between the columns
        const yk = y0 + colH + 22 + level * 26;
        const right = b.x > a.x;
        const gx1 = right ? a.x + a.w + 10 + level * 6 : a.x - 10 - level * 6;
        const gx2 = right ? b.x - 10 - level * 6 : b.x + b.w + 10 + level * 6;
        const ay = a.y + a.h / 2, byy = b.y + b.h / 2;
        // the lowest box of a column is left / entered from below, the others from the side
        const lowest = (v: number) => layers[rank[v]][layers[rank[v]].length - 1] === v;
        const start: [number, number][] = lowest(e.a) ? [[a.x + a.w / 2 + level * 8, a.y + a.h + 4]] : [[right ? a.x + a.w + 4 : a.x - 4, ay], [gx1, ay]];
        const end: [number, number][] = lowest(e.b) ? [[b.x + b.w / 2 - level * 8, b.y + b.h + 6]] : [[gx2, byy], [right ? b.x - 6 : b.x + b.w + 6, byy]];
        ln = { pts: [...start, [start[start.length - 1][0], yk], [end[0][0], yk], ...end], arrow: true, both: e.both, dashed: e.dashed };
        bottom = Math.max(bottom, yk + 12);
        level++;
      }
      edgeLine.set(k, ln);
      lines.push(ln);
      if (e.label) {
        const [mx, my] = mid(ln.pts);
        const detour = ln.pts.length > 2;
        const t = tag(e.label, mx, my, detour ? 160 : sameRank(e) ? 120 : gapX - 12, detour || sameRank(e) ? 1 : 2);
        // an arrow that a moderator points at keeps its middle free
        if (modTarget.has(k)) t.y = my + 6;
        tagsOut.push(t);
        if (detour) bottom = Math.max(bottom, t.y + t.h + 4);
      }
    });
    // moderators: centred over (or under) the middle of their arrow
    const placed: { m: number; box: Box; p: [number, number]; label?: string; dashed?: boolean; below: boolean; own?: boolean }[] = [];
    for (const md of mods) {
      const ln = edgeLine.get(md.e)!;
      // a detour: the middle of its bottom segment
      const yb = Math.max(...ln.pts.map((q) => q[1]));
      const k = ln.pts.findIndex((q, i) => i > 0 && q[1] === yb && ln.pts[i - 1][1] === yb);
      const p: [number, number] = ln.pts.length > 2 && k > 0 ? [(ln.pts[k - 1][0] + ln.pts[k][0]) / 2, yb] : mid(ln.pts);
      if (!isMod[md.m]) {
        // the box is already part of the model: just an arrow from it
        placed.push({ m: md.m, box: by.get(md.m)!, p, label: md.label, dashed: md.dashed, below: false, own: true });
        continue;
      }
      const existing = placed.find((x) => x.m === md.m);
      if (existing) {
        placed.push({ ...existing, p, label: md.label, dashed: md.dashed });
        continue;
      }
      const below = ln.pts.length > 2;
      const box: Box = { x: p[0] - mw / 2, y: below ? bottom + bandGap : top, w: mw, h: bh, lines: ls[md.m], kind: node(md.m) };
      by.set(md.m, box);
      placed.push({ m: md.m, box, p, label: md.label, dashed: md.dashed, below });
    }
    // no two moderators on top of each other, all inside the picture
    for (const row of [false, true]) {
      const bx = [...new Set(placed.filter((x) => x.below === row && !x.own).map((x) => x.box))].sort((a, b) => a.x - b.x);
      bx.forEach((b, i) => (b.x = Math.max(PAD, i ? Math.max(b.x, bx[i - 1].x + bx[i - 1].w + 12) : b.x)));
      const over = bx.length ? bx[bx.length - 1].x + bx[bx.length - 1].w - (W - PAD) : 0;
      if (over > 0) bx.forEach((b) => (b.x = Math.max(PAD, b.x - over)));
      modBoxes.push(...bx);
      if (row && bx.length) bottom = Math.max(bottom, bx[0].y + bh);
    }
    boxes.push(...modBoxes);
    for (const pl of placed) {
      const [px, py] = pl.p;
      lines.push({ pts: [edge(pl.box, px, py, 4), [px, py]], arrow: true, tone: 2, dashed: pl.dashed });
      if (pl.label && pl.own) tagsOut.push(tag(pl.label, (pl.box.x + pl.box.w / 2 + px) / 2, (pl.box.y + pl.box.h / 2 + py) / 2, 120, 1));
      else if (pl.label) {
        const cx = pl.box.x + pl.box.w / 2;
        const t = tag(pl.label, cx, 0, 120);
        t.y = pl.below ? pl.box.y - t.h - 6 : pl.box.y + pl.box.h + 6;
        tagsOut.push(t);
      }
    }
  } else {
    // top → bottom: one row per rank, moderators in a band on the left
    const band = mods.some((m) => isMod[m.m]) ? 150 : 0;
    const right = detours.length ? 26 : 0;
    const maxRow = Math.max(...layers.map((L) => L.length));
    const area = inner - (band ? band + 20 : 0) - right;
    const bw = Math.min(180, (area - (maxRow - 1) * 20) / maxRow);
    NF = nodeFont(d.nodes.map((t, i) => ({ text: t, w: (isMod[i] ? band : bw) - 16 })));
    const ls = d.nodes.map((t, i) => wrap(t, (isMod[i] ? band : bw) - 16, NF, 3));
    const bh = Math.max(...ls.map((l) => boxH(l)));
    const tagH = Math.max(0, ...edges.map((e) => (e.label ? tag(e.label, 0, 0, 140).h : 0)));
    const gapY = Math.max(40, tagH + 22);
    const ax0 = PAD + (band ? band + 20 : 0);
    layers.forEach((L, r) => {
      const used = L.length * bw + (L.length - 1) * 20;
      L.forEach((v, k) => {
        const b: Box = { x: ax0 + (area - used) / 2 + k * (bw + 20), y: top + r * (bh + gapY), w: bw, h: bh, lines: ls[v], kind: node(v) };
        by.set(v, b);
        boxes.push(b);
      });
    });
    bottom = top + R * bh + (R - 1) * gapY;
    const all = [...by.values()];
    const xr = Math.max(...all.map((b) => b.x + b.w)) + 12;
    const xl = Math.min(...all.map((b) => b.x)) - 12;
    const lastIn = (v: number, end: 'first' | 'last') => {
      const L = layers[rank[v]];
      return (end === 'first' ? L[0] : L[L.length - 1]) === v;
    };
    const edgeLine = new Map<number, Line>();
    let levelR = 0, levelL = 0;
    edges.forEach((e, k) => {
      const a = by.get(e.a)!, b = by.get(e.b)!;
      let ln: Line;
      if (adjacent(e) || sameRank(e)) ln = { ...connect(a, b), both: e.both, dashed: e.dashed };
      else {
        // detour along the outside, on the side where no other box of the row is in the way
        const left = !(lastIn(e.a, 'last') && lastIn(e.b, 'last')) && lastIn(e.a, 'first') && lastIn(e.b, 'first');
        const ay = a.y + a.h / 2, byy = b.y + b.h / 2;
        if (left) {
          const x = xl - levelL++ * 7;
          ln = { pts: [[a.x - 4, ay], [x, ay], [x, byy], [b.x - 6, byy]], arrow: true, both: e.both, dashed: e.dashed };
        } else {
          const x = xr + levelR++ * 7;
          ln = { pts: [[a.x + a.w + 4, ay], [x, ay], [x, byy], [b.x + b.w + 6, byy]], arrow: true, both: e.both, dashed: e.dashed };
        }
      }
      edgeLine.set(k, ln);
      lines.push(ln);
      if (e.label && ln.pts.length === 2) {
        const [mx, my] = mid(ln.pts);
        const t = tag(e.label, mx, my, 140);
        // an arrow that a moderator points at keeps its middle free: label beside it
        if (modTarget.has(k)) t.x = mx + 10;
        tagsOut.push(t);
      }
    });
    let lastBottom = -Infinity;
    const placed = new Map<number, Box>();
    for (const md of [...mods].sort((a, b) => mid(edgeLine.get(a.e)!.pts)[1] - mid(edgeLine.get(b.e)!.pts)[1])) {
      const ln = edgeLine.get(md.e)!;
      const [px, py] = mid(ln.pts);
      let box = placed.get(md.m);
      if (!box) {
        if (!isMod[md.m]) box = by.get(md.m)!;
        else {
          const y = Math.max(py - bh / 2, lastBottom + 30, top);
          box = { x: PAD, y, w: band, h: bh, lines: ls[md.m], kind: node(md.m) };
          lastBottom = y + bh + (md.label ? 22 : 0);
          boxes.push(box);
          bottom = Math.max(bottom, lastBottom);
          if (md.label) tagsOut.push({ ...tag(md.label, PAD + band / 2, 0, band, 1), y: y + bh + 4 });
        }
        placed.set(md.m, box);
      }
      lines.push({ pts: [edge(box, px, py, 4), [px, py]], arrow: true, tone: 2, dashed: md.dashed });
    }
  }
  boxes.push(...tagsOut);
  return bottom;
}

const NODE_KINDS = (hl: boolean, i: number, highlightIndex: number): Box['kind'] => (hl ? (i === highlightIndex ? 'accent' : 'node') : i === 0 ? 'accent' : 'node');

export function layoutDiagram(d: Diagram): Layout {
  NF = FS;
  const boxes: Box[] = [];
  const lines: Line[] = [];
  const areas: Area[] = [];
  let y = PAD;
  if (d.title) {
    const tl = wrap(d.title, W - 2 * PAD, 17, 2);
    boxes.push({ x: PAD, y, w: W - 2 * PAD, h: tl.length * 22, lines: tl, kind: 'bold' });
    y += tl.length * 22 + 12;
  }
  const inner = W - 2 * PAD;

  if (d.type === 'flow') {
    const n = d.steps.length;
    const cols = n <= 4 ? n : Math.ceil(n / Math.ceil(n / 4));
    const gap = 30;
    const bw = (inner - (cols - 1) * gap) / cols;
    NF = nodeFont(d.steps.map((t) => ({ text: t, w: bw - 16 })));
    const rows: Box[][] = [];
    for (let i = 0; i < n; i += cols) {
      const row = d.steps.slice(i, i + cols).map((s) => wrap(s, bw - 16, NF));
      const h = Math.max(...row.map((l) => boxH(l)));
      rows.push(row.map((l, k) => ({ x: PAD + k * (bw + gap), y, w: bw, h, lines: l, kind: NODE_KINDS(!!d.highlight, i + k, d.steps.indexOf(d.highlight ?? '')) })));
      y += h + 40;
    }
    y -= 40;
    const flat = rows.flat();
    boxes.push(...flat);
    flat.forEach((b, i) => {
      const nb = flat[i + 1];
      if (!nb) return;
      if (nb.y === b.y) lines.push({ pts: [[b.x + b.w + 4, b.y + b.h / 2], [nb.x - 6, nb.y + nb.h / 2]], arrow: true });
      else {
        const midY = b.y + b.h + 20;
        lines.push({ pts: [[b.x + b.w / 2, b.y + b.h + 4], [b.x + b.w / 2, midY], [nb.x + nb.w / 2, midY], [nb.x + nb.w / 2, nb.y - 6]], arrow: true });
      }
    });
  } else if (d.type === 'cycle' || d.type === 'concept') {
    const items = d.type === 'cycle' ? d.steps : d.branches;
    const n = items.length;
    const bw = n > 6 ? 130 : 150;
    NF = nodeFont(items.map((t) => ({ text: t, w: bw - 16 })));
    const ls = items.map((s) => wrap(s, bw - 16, NF, 3));
    const bh = Math.max(...ls.map((l) => boxH(l, 8)));
    const minR = (bw + 14) / (2 * Math.sin(Math.PI / n));
    const centreBox = d.type === 'concept' ? wrap(d.center, 160, 16, 3) : null;
    const rX = Math.max(minR, 150);
    const R = centreBox ? inner / 2 - bw / 2 : Math.min(rX, inner / 2 - bw / 2);
    let rY = Math.max(R * 0.72, bh + (centreBox ? boxH(centreBox) / 2 + 16 : 30));
    if (centreBox) {
      // branches beside the centre box must clear it vertically
      const ch2 = boxH(centreBox) / 2;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const sideGap = Math.abs(R * Math.cos(a)) - bw / 2 - 90;
        if (sideGap < 10 && Math.abs(Math.sin(a)) > 0.05) rY = Math.max(rY, (ch2 + bh / 2 + 12) / Math.abs(Math.sin(a)));
      }
    }
    const cx = W / 2, cy = y + rY + bh / 2;
    const nodes = ls.map((l, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const x = cx + R * Math.cos(a), yy = cy + rY * Math.sin(a);
      return { x: x - bw / 2, y: yy - bh / 2, w: bw, h: bh, lines: l, kind: (items[i] === d.highlight ? 'accent' : 'node') as Box['kind'] };
    });
    boxes.push(...nodes);
    if (centreBox) {
      const cb: Box = { x: cx - 90, y: cy - boxH(centreBox) / 2, w: 180, h: boxH(centreBox), lines: centreBox, kind: 'accent' };
      boxes.push(cb);
      nodes.forEach((b) => lines.push({ ...connect(cb, b), arrow: false }));
    } else nodes.forEach((b, i) => lines.push({ ...connect(b, nodes[(i + 1) % n]), curve: true }));
    y = cy + rY + bh / 2;
  } else if (d.type === 'hierarchy') {
    const rl = wrap(d.root, 220, 16, 2);
    const root: Box = { x: W / 2 - 120, y, w: 240, h: boxH(rl), lines: rl, kind: 'accent' };
    boxes.push(root);
    y += root.h + 36;
    const k = d.children.length;
    const gap = 14;
    const cw = (inner - (k - 1) * gap) / k;
    NF = nodeFont(d.children.map((c) => ({ text: c.label, w: cw - 14 })));
    const cl = d.children.map((c) => wrap(c.label, cw - 14, NF, 3));
    const ch = Math.max(...cl.map((l) => boxH(l)));
    const busY = y - 18;
    lines.push({ pts: [[root.x + root.w / 2, root.y + root.h], [root.x + root.w / 2, busY]] });
    let bottom = y + ch;
    d.children.forEach((c, i) => {
      const b: Box = { x: PAD + i * (cw + gap), y, w: cw, h: ch, lines: cl[i], kind: c.label === d.highlight ? 'accent' : 'node' };
      boxes.push(b);
      lines.push({ pts: [[root.x + root.w / 2, busY], [b.x + b.w / 2, busY], [b.x + b.w / 2, b.y - 6]], arrow: true });
      let gy = b.y + b.h + 10;
      for (const g of c.children ?? []) {
        const gl = wrap(g, cw - 26, 13, 3);
        const gb: Box = { x: b.x + 12, y: gy, w: cw - 12, h: gl.length * 17 + 12, lines: gl, kind: 'soft', align: 'start' };
        boxes.push(gb);
        lines.push({ pts: [[b.x + 6, gy - 10], [b.x + 6, gb.y + gb.h / 2], [gb.x - 2, gb.y + gb.h / 2]] });
        gy += gb.h + 8;
      }
      bottom = Math.max(bottom, gy - 8);
    });
    y = bottom;
  } else if (d.type === 'compare') {
    const k = d.columns.length;
    const gap = 14;
    const cw = (inner - (k - 1) * gap) / k;
    NF = nodeFont(d.columns.map((c) => ({ text: c.title, w: cw - 16 })));
    const heads = d.columns.map((c) => wrap(c.title, cw - 16, NF, 2));
    const hh = Math.max(...heads.map((l) => boxH(l, 8)));
    const bodies = d.columns.map((c) => c.items.flatMap((it) => wrap('• ' + it, cw - 20, 14, 3)));
    const bh = Math.max(...bodies.map((l) => l.length * 19 + 20));
    d.columns.forEach((_, i) => {
      const x = PAD + i * (cw + gap);
      boxes.push({ x, y, w: cw, h: hh, lines: heads[i], kind: i === 1 ? 'accent2' : 'accent' });
      boxes.push({ x, y: y + hh + 6, w: cw, h: bh, lines: bodies[i], kind: 'soft', align: 'start' });
    });
    y += hh + 6 + bh;
  } else if (d.type === 'timeline') {
    const n = d.events.length;
    const step = inner / n;
    // labels alternate above/below; narrow enough that neighbours on the same side never touch, even at the edges
    const lw = Math.min(170, step * 1.55);
    const labels = d.events.map((e) => wrap(e.label, lw - 8, 13, 3));
    const lh = Math.max(...labels.map((l) => l.length * 17 + 8));
    const lineY = y + 22 + lh + 14;
    lines.push({ pts: [[PAD, lineY], [W - PAD, lineY]], arrow: true });
    d.events.forEach((e, i) => {
      const x = PAD + step * (i + 0.5);
      const up = i % 2 === 0;
      boxes.push({ x: x - 4, y: lineY - 4, w: 8, h: 8, lines: [], kind: 'accent' });
      // the date always sits right under the line; labels alternate above / below so neighbours never collide
      const when: Box = { x: x - step / 2 + 2, y: lineY + 10, w: step - 4, h: 20, lines: [e.when], kind: 'bold' };
      const lab: Box = { x: Math.min(W - PAD - lw, Math.max(PAD, x - lw / 2)), y: up ? lineY - 14 - lh : lineY + 34, w: lw, h: lh, lines: labels[i], kind: 'label' };
      boxes.push(when, lab);
    });
    y = lineY + 34 + lh;
  } else if (d.type === 'matrix') {
    const lab = 26;
    const cw = (inner - lab - 10) / 2;
    NF = nodeFont(d.cells.map((c) => ({ text: c, w: cw - 20 })));
    const cl = d.cells.map((c) => wrap(c, cw - 20, NF, 4));
    const chh = Math.max(64, ...cl.map((l) => boxH(l, 12)));
    const x0 = PAD + lab + 10;
    cl.forEach((l, i) => boxes.push({ x: x0 + (i % 2) * (cw + 6), y: y + Math.floor(i / 2) * (chh + 6), w: cw - 3, h: chh, lines: l, kind: i === 1 ? 'accent' : 'node' }));
    const gridH = 2 * chh + 6;
    lines.push({ pts: [[x0 - 8, y + gridH], [x0 - 8, y - 4]], arrow: true });
    lines.push({ pts: [[x0 - 8, y + gridH + 8], [W - PAD, y + gridH + 8]], arrow: true });
    boxes.push({ x: PAD, y, w: lab, h: gridH, lines: [d.y], kind: 'label' }); // drawn rotated
    boxes.push({ x: x0, y: y + gridH + 14, w: W - PAD - x0, h: 20, lines: [d.x], kind: 'label' });
    y += gridH + 34;
  } else if (d.type === 'axes') {
    const plotH = 230;
    const x0 = PAD + 30, y0 = y + 26 + plotH, x1 = W - PAD - 10, y1 = y + 26;
    lines.push({ pts: [[x0, y0], [x0, y1 - 8]], arrow: true });
    lines.push({ pts: [[x0, y0], [x1, y0]], arrow: true });
    boxes.push({ x: x0 + 6, y: y, w: 300, h: 20, lines: [d.y], kind: 'bold', align: 'start' });
    boxes.push({ x: x1 - 300, y: y0 + 8, w: 300, h: 20, lines: [d.x], kind: 'bold', align: 'end' });
    const f = curve(d.shape);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push([x0 + 12 + t * (x1 - x0 - 30), y0 - 14 - f(t) * (plotH - 40)]);
    }
    lines.push({ pts, curve: false, arrow: false });
    if (d.second) {
      const g = curve(d.second.shape);
      const p2: [number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        p2.push([x0 + 12 + t * (x1 - x0 - 30), y0 - 14 - g(t) * (plotH - 40)]);
      }
      lines.push({ pts: p2, tone: 2 });
    }
    for (const m of d.marks ?? []) {
      const mx = x0 + 12 + m.at * (x1 - x0 - 30);
      const my = y0 - 14 - f(m.at) * (plotH - 40);
      lines.push({ pts: [[mx, y0], [mx, my]], dashed: true, muted: true });
      const lw = 130;
      boxes.push({ x: Math.min(x1 - lw, Math.max(x0 + 4, mx - lw / 2)), y: Math.max(y1, my - 30), w: lw, h: 20, lines: [m.label], kind: 'label' });
    }
    y = y0 + 30;
    if (d.second) {
      // legend: which curve is which
      const items: [string, 1 | 2][] = [[d.label || 'Kurve 1', 1], [d.second.label, 2]];
      let lx = x0;
      for (const [text, tone] of items) {
        lines.push({ pts: [[lx, y + 10], [lx + 26, y + 10]], ...(tone === 2 ? { tone: 2 as const } : {}) });
        const w = Math.min(200, text.length * charW(13) + 12);
        boxes.push({ x: lx + 32, y, w, h: 20, lines: [text], kind: 'label', align: 'start', fs: 13 });
        lx += 32 + w + 24;
      }
      y += 26;
    }
  } else if (d.type === 'model') {
    y = layoutModel(d, y, boxes, lines);
  } else if (d.type === 'venn') {
    const R = 150, dx = 80, cx = W / 2, labH = 22;
    const cy = y + labH + 8 + R;
    areas.push({ circle: [cx - dx, cy, R], tone: 'soft1' }, { circle: [cx + dx, cy, R], tone: 'soft2' });
    boxes.push({ x: cx - dx - 150, y, w: 200, h: labH, lines: [d.sets[0].label], kind: 'bold', fs: 15 });
    boxes.push({ x: cx + dx - 50, y, w: 200, h: labH, lines: [d.sets[1].label], kind: 'bold', fs: 15 });
    const region = (items: string[], x: number, w: number) => {
      // whole words: a smaller font rather than splitting a word
      const fs = [13, 12, 11].find((f) => items.every((t) => t.split(' ').every((wd) => wd.length * charW(f) <= w - 8))) ?? 11;
      const lh = Math.round(fs * 1.3);
      const ls = items.flatMap((t) => wrap(t, w - 8, fs, 2));
      if (!ls.length) return;
      const h = ls.length * lh + 6;
      boxes.push({ x: x - w / 2, y: cy - h / 2, w, h, lines: ls, kind: 'text', fs });
    };
    region(d.sets[0].items, cx - dx - (R - dx), 140);
    region(d.shared, cx, 2 * (R - dx) - 24);
    region(d.sets[1].items, cx + dx + (R - dx), 140);
    y = cy + R;
  } else if (d.type === 'pyramid') {
    const n = d.levels.length;
    const rowH = 52, aTop = 170, aBottom = inner;
    const widthAt = (k: number) => aTop + ((aBottom - aTop) * k) / n;
    d.levels.forEach((t, i) => {
      const yt = y + i * rowH, yb = yt + rowH - 4;
      const wt = widthAt(i), wb = widthAt(i + 1) - ((aBottom - aTop) / n) * (4 / rowH);
      areas.push({ poly: [[W / 2 - wt / 2, yt], [W / 2 + wt / 2, yt], [W / 2 + wb / 2, yb], [W / 2 - wb / 2, yb]], tone: i === 0 ? 'accent' : 'node' });
      const tw = Math.max(60, (wt + wb) / 2 - 36);
      const fs = [14, 13, 12].find((f) => t.split(' ').every((wd) => wd.length * charW(f) <= tw)) ?? 12;
      const ls = wrap(t, tw, fs, 2);
      const lh = Math.round(fs * 1.3);
      boxes.push({ x: W / 2 - tw / 2, y: yt + (rowH - 4) / 2 - (ls.length * lh) / 2, w: tw, h: ls.length * lh, lines: ls, kind: i === 0 ? 'textOn' : 'text', fs });
    });
    y += n * rowH - 4;
  } else if (d.type === 'bars') {
    const labW = 150, valW = 70;
    const x0 = PAD + labW + 10, maxW = W - PAD - valW - x0;
    const max = Math.max(...d.bars.map((b) => Math.abs(b.value))) || 1;
    const fmt = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',') + (d.unit ? (d.unit === '%' ? ' %' : ' ' + d.unit) : '');
    const top = Math.max(...d.bars.map((b) => b.value));
    const yTop = y;
    d.bars.forEach((b) => {
      const ls = wrap(b.label, labW - 4, 13, 2);
      const h = Math.max(28, ls.length * 17 + 6);
      const bw = Math.max(3, (Math.abs(b.value) / max) * maxW);
      boxes.push({ x: PAD, y, w: labW, h, lines: ls, kind: 'text', align: 'end', fs: 13 });
      boxes.push({ x: x0, y: y + h / 2 - 10, w: bw, h: 20, lines: [], kind: b.value === top ? 'accent' : 'node' });
      boxes.push({ x: x0 + bw + 6, y: y + h / 2 - 10, w: valW - 6, h: 20, lines: [fmt(b.value)], kind: 'label', align: 'start', fs: 13 });
      y += h + 8;
    });
    lines.push({ pts: [[x0 - 1, yTop - 4], [x0 - 1, y - 4]] });
    y -= 8;
  } else if (d.type === 'decision') {
    // leaves left → right: the yes side, then the no side
    type N = { text: string; depth: number; kids: { n: N; yes: boolean }[]; leaf0: number; leaves: number };
    let leaf = 0;
    const build = (text: string, depth: number, yes?: DecisionBranch, no?: DecisionBranch): N => {
      const nd: N = { text, depth, kids: [], leaf0: leaf, leaves: 0 };
      if (yes === undefined || no === undefined) {
        leaf++;
        nd.leaves = 1;
        return nd;
      }
      for (const [b, isYes] of [[yes, true], [no, false]] as const) {
        const child = typeof b === 'string' ? build(b, depth + 1) : build(b.question, depth + 1, b.yes, b.no);
        nd.kids.push({ n: child, yes: isYes });
      }
      nd.leaves = leaf - nd.leaf0;
      return nd;
    };
    const root = build(d.question, 0, d.yes, d.no);
    const cols = root.leaves, gap = 14;
    const cw = (inner - (cols - 1) * gap) / cols;
    const all: N[] = [];
    const walk = (nd: N) => (all.push(nd), nd.kids.forEach((k) => walk(k.n)));
    walk(root);
    const widthOf = (nd: N) => (nd.depth === 0 ? Math.min(300, inner) : Math.min(260, nd.leaves * cw + (nd.leaves - 1) * gap));
    const isQ = (nd: N) => nd.kids.length > 0;
    NF = nodeFont(all.filter(isQ).map((nd) => ({ text: nd.text, w: widthOf(nd) - 16 })));
    const label = (nd: N) => wrap(nd.text, widthOf(nd) - 16, isQ(nd) ? NF : 13, 3);
    const depthH = [0, 1, 2].map((dp) => Math.max(0, ...all.filter((nd) => nd.depth === dp).map((nd) => (isQ(nd) ? boxH(label(nd)) : label(nd).length * 17 + 16))));
    const rowGap = 56;
    const rowY = [y, y + depthH[0] + rowGap, y + depthH[0] + depthH[1] + 2 * rowGap];
    const place = new Map<N, Box>();
    for (const nd of all) {
      const span = nd.leaves * cw + (nd.leaves - 1) * gap;
      const cx = PAD + nd.leaf0 * (cw + gap) + span / 2;
      const w = widthOf(nd);
      const ls = label(nd);
      const h = isQ(nd) ? boxH(ls) : ls.length * 17 + 16;
      const b: Box = { x: cx - w / 2, y: rowY[nd.depth], w, h, lines: ls, kind: nd.depth === 0 ? 'accent' : isQ(nd) ? 'node' : 'soft', ...(isQ(nd) ? {} : { fs: 13 }) };
      place.set(nd, b);
      boxes.push(b);
      y = Math.max(y, b.y + b.h);
    }
    for (const nd of all) {
      const p = place.get(nd)!;
      for (const { n: c, yes } of nd.kids) {
        const b = place.get(c)!;
        const px = p.x + p.w / 2, cx = b.x + b.w / 2, midY = p.y + p.h + 18;
        lines.push({ pts: [[px, p.y + p.h + 2], [px, midY], [cx, midY], [cx, b.y - 6]], arrow: true, ...(yes ? {} : { tone: 2 as const }) });
        boxes.push(tag(yes ? 'Ja' : 'Nein', cx, (midY + b.y - 6) / 2 + 2, 60, 1));
      }
    }
  }
  return { width: W, height: Math.ceil(y + PAD), boxes, lines, areas, fs: NF };
}

function curve(s: Shape): (t: number) => number {
  switch (s) {
    case 'fallend':
      return (t) => 1 - Math.pow(t, 0.6);
    case 'u':
      return (t) => 4 * (t - 0.5) ** 2;
    case 'umgekehrtes-u':
      return (t) => 1 - 4 * (t - 0.5) ** 2;
    case 's-kurve':
      return (t) => 1 / (1 + Math.exp(-10 * (t - 0.5)));
    case 'linear':
      return (t) => t;
    default:
      return (t) => Math.pow(t, 1.6);
  }
}

// ---------- drawing ----------
export type Palette = {
  bg?: string; node: string; nodeStroke: string; text: string; accent: string; onAccent: string; soft: string; line: string; muted: string;
  accent2: string; node2: string; stroke2: string; line2: string; shadow: string;
};
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    node: '#dff3f2', nodeStroke: '#09817e', text: '#002a29', accent: '#09817e', onAccent: '#ffffff', soft: '#f4fcfc', line: '#09817e', muted: '#4f6f6d',
    accent2: '#a63d73', node2: '#fbe9f2', stroke2: '#a63d73', line2: '#a63d73', shadow: 'rgba(0,42,41,0.16)',
  },
  dark: {
    node: '#163634', nodeStroke: '#3fc6bf', text: '#e2f4f3', accent: '#1f7a75', onAccent: '#ffffff', soft: '#112725', line: '#3fc6bf', muted: '#9fbfbd',
    accent2: '#9c3f76', node2: '#3a1d2e', stroke2: '#e486bb', line2: '#e486bb', shadow: 'rgba(0,0,0,0.55)',
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n: number) => Math.round(n * 10) / 10;

export function renderDiagram(d: Diagram, p: Palette = PALETTES.light): string {
  const L = layoutDiagram(d);
  // ids per colour scheme, so several diagrams on one page never borrow each other's arrow colours
  const id = 'dg' + (p.line + p.line2 + (p.bg ?? '')).replace(/[^0-9a-z]/gi, '');
  const out: string[] = [];
  const marker = (name: string, color: string) =>
    `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1.2 L10 5 L0 8.8 z" fill="${color}"/></marker>`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" font-family="Manrope, Arial, sans-serif" role="img">`,
    `<defs>${marker('a', p.line)}${marker('b', p.line2)}<filter id="${id}-s" x="-10%" y="-10%" width="120%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="${p.shadow}"/></filter></defs>`,
  );
  if (p.bg) out.push(`<rect width="100%" height="100%" fill="${p.bg}"/>`);
  for (const a of L.areas) {
    if (a.circle) {
      const [cx, cy, r] = a.circle;
      const c = a.tone === 'soft2' ? p.line2 : p.line;
      out.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="2"/>`);
    } else if (a.poly) {
      const fill = a.tone === 'accent' ? p.accent : a.tone === 'accent2' ? p.accent2 : p.node;
      out.push(`<polygon points="${a.poly.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ')}" fill="${fill}" stroke="${a.tone === 'node' ? p.nodeStroke : fill}" stroke-width="1.4" stroke-linejoin="round" filter="url(#${id}-s)"/>`);
    }
  }
  for (const l of L.lines) {
    const pts = l.pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
    const color = l.tone === 2 ? p.line2 : l.muted ? p.muted : p.line;
    const m = `url(#${id}-${l.tone === 2 ? 'b' : 'a'})`;
    out.push(
      `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${l.muted ? 1.5 : l.pts.length > 10 ? 2.6 : 2}"${l.dashed ? ' stroke-dasharray="6 5"' : ''} stroke-linejoin="round" stroke-linecap="round"${l.arrow ? ` marker-end="${m}"` : ''}${l.both ? ` marker-start="${m}"` : ''}/>`,
    );
  }
  const isMatrixY = (b: Box) => d.type === 'matrix' && b.kind === 'label' && b.w < 40;
  const FILL: Partial<Record<Box['kind'], string>> = { accent: p.accent, accent2: p.accent2, node: p.node, node2: p.node2, soft: p.soft, tag: p.soft };
  for (const b of L.boxes) {
    const fill = FILL[b.kind];
    if (fill) {
      const stroke = b.kind === 'node' || b.kind === 'soft' || b.kind === 'tag' ? p.nodeStroke : b.kind === 'node2' ? p.stroke2 : null;
      const raised = b.lines.length && (b.kind === 'node' || b.kind === 'accent' || b.kind === 'node2' || b.kind === 'accent2');
      const rx = !b.lines.length ? 4 : b.kind === 'tag' ? b.h / 2 : 12;
      out.push(
        `<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="${r1(Math.min(rx, b.h / 2))}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${b.kind === 'soft' || b.kind === 'tag' ? 1 : 1.5}"` : ''}${raised ? ` filter="url(#${id}-s)"` : ''}/>`,
      );
    }
    if (!b.lines.length) continue;
    const color = b.kind === 'accent' || b.kind === 'accent2' || b.kind === 'textOn' ? p.onAccent : b.kind === 'label' ? p.muted : p.text;
    const fs = b.fs ?? (b.kind === 'bold' ? (d.title && b.y === PAD ? 17 : 14) : b.kind === 'soft' ? (d.type === 'compare' ? 14 : 13) : b.kind === 'label' ? 13 : L.fs);
    const lh = b.kind === 'tag' ? 15 : b.fs ? Math.round(b.fs * 1.3) : b.kind === 'soft' ? (d.type === 'compare' ? 19 : 17) : b.kind === 'label' ? 17 : b.kind === 'bold' ? 22 : Math.round(L.fs * 1.3);
    const weight = b.kind === 'accent' || b.kind === 'accent2' || b.kind === 'bold' || b.kind === 'textOn' ? 700 : b.kind === 'tag' ? 600 : 500;
    if (isMatrixY(b)) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      out.push(`<text x="${r1(cx)}" y="${r1(cy)}" font-size="13" fill="${p.muted}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${r1(cx)} ${r1(cy)})">${esc(b.lines[0])}</text>`);
      continue;
    }
    const start = b.align === 'start';
    const x = start ? b.x + (b.kind === 'label' ? 0 : 10) : b.align === 'end' ? b.x + b.w - 4 : b.x + b.w / 2;
    const top = b.y + b.h / 2 - ((b.lines.length - 1) * lh) / 2;
    const spans = b.lines.map((t, i) => `<tspan x="${r1(x)}" y="${r1(top + i * lh)}">${esc(t)}</tspan>`).join('');
    out.push(`<text font-size="${fs}" font-weight="${weight}" fill="${color}" text-anchor="${start ? 'start' : b.align === 'end' ? 'end' : 'middle'}" dominant-baseline="middle">${spans}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

// ---------- storing in card HTML ----------
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Placeholder stored on the card; Merkora draws it when the card is shown (in the current colour scheme). */
export const diagramHtml = (d: Diagram) => `<div class="diagram" data-diagram="${escAttr(JSON.stringify(d))}"></div>`;

/** For exports (Anki): placeholders → finished SVG in the light colours on white. */
export function diagramsToSvg(html: string): string {
  return html.replace(/<div class="diagram" data-diagram="([^"]*)"><\/div>/g, (all, attr: string) => {
    try {
      const json = attr.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const d = parseDiagram(JSON.parse(json));
      return d ? `<div class="diagram">${renderDiagram(d, { ...PALETTES.light, bg: '#ffffff' })}</div>` : '';
    } catch {
      return all;
    }
  });
}

// ---------- instruction for the AI ----------
/** What the AI is told when cards may get a graphic: describe it, never draw it. */
export const DIAGRAM_RULE = `Wo eine Grafik das Verständnis wirklich verbessert (Abläufe, Gliederungen, Vergleiche, Modelle, Kurven), ergänze das Feld "diagram" mit einer kurzen Beschreibung – kein SVG, keine Koordinaten, Merkora zeichnet sie selbst. Sonst lass "diagram" weg.
Beschriftungen sind kurze Stichworte (höchstens 6 Wörter). Erlaubte Formen (genau eine wählen):
{"type":"flow","title":"…","steps":["…","…"]} – Ablauf, 2–8 Schritte
{"type":"cycle","title":"…","steps":["…","…","…"]} – Kreislauf, 3–8 Schritte
{"type":"hierarchy","title":"…","root":"…","children":[{"label":"…","children":["…"]}]} – Gliederung, 2–5 Äste mit höchstens 4 Unterpunkten
{"type":"compare","title":"…","columns":[{"title":"…","items":["…"]}]} – Vergleich, 2–3 Spalten mit je höchstens 6 Punkten
{"type":"timeline","title":"…","events":[{"when":"1990","label":"…"}]} – Zeitstrahl, 2–8 Ereignisse
{"type":"concept","title":"…","center":"…","branches":["…","…","…"]} – Begriff mit 3–8 Merkmalen
{"type":"matrix","title":"…","x":"…","y":"…","cells":["oben links","oben rechts","unten links","unten rechts"]} – Vierfeldertafel
{"type":"axes","title":"…","x":"…","y":"…","shape":"steigend|fallend|u|umgekehrtes-u|s-kurve|linear","marks":[{"at":0.3,"label":"…"}]} – Verlauf/Kurve; für zwei Gruppen zusätzlich "label":"…","second":{"shape":"…","label":"…"}
{"type":"model","title":"…","nodes":["A","B","M"],"links":[{"from":"A","to":"B","label":"+"},{"from":"M","to":"A -> B","label":"moderiert"}]} – Modell mit Pfeilen zwischen Begriffen/Variablen (Hypothesen, Ursache–Wirkung, Mediator, Moderator, Kommunikationsmodelle); 2–8 Kästen; "to":"A -> B" zeigt auf den Pfeil A→B; optional "both":true (Wechselwirkung/Korrelation), "dashed":true (indirekt/vermutet)
{"type":"venn","title":"…","sets":[{"label":"…","items":["…"]},{"label":"…","items":["…"]}],"shared":["…"]} – Gemeinsamkeiten und Unterschiede zweier Begriffe
{"type":"pyramid","title":"…","levels":["Spitze","…","Basis"]} – Stufenmodell, 3–6 Stufen von oben nach unten
{"type":"bars","title":"…","unit":"%","bars":[{"label":"…","value":42}]} – Zahlenvergleich, 2–8 Balken, nur mit Zahlen aus dem Material
{"type":"decision","title":"…","question":"…?","yes":"…","no":{"question":"…?","yes":"…","no":"…"}} – Entscheidungsbaum, höchstens zwei Fragen tief
Bei flow, cycle, hierarchy, concept und model kann "highlight" einen Kasten hervorheben, der den Kern der Karte trifft.`;

// ---------- graphics of one card (improve per card) ----------
const DIAGRAM_RE = /<div class="diagram" data-diagram="([^"]*)"><\/div>/;
const SLIDE_RE = /<figure class="slide-figure">[\s\S]*?<\/figure>/;
// pictures that the AI used to draw (withGraphics stored them with alt="Grafik"); own pictures have no such alt
const OLD_AI_IMG_RE = /(?:<br\s*\/?>)?<img data-media="[^"]*" alt="Grafik">/;

const unescAttr = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Which graphic the back of a card has. */
export function cardGraphic(html: string): { kind: 'diagram' | 'slide' | 'image' | null; diagram?: Diagram } {
  const m = DIAGRAM_RE.exec(html);
  if (m) {
    try {
      const d = parseDiagram(JSON.parse(unescAttr(m[1])));
      if (d) return { kind: 'diagram', diagram: d };
    } catch {
      /* broken description */
    }
    return { kind: 'diagram' };
  }
  if (SLIDE_RE.test(html)) return { kind: 'slide' };
  if (OLD_AI_IMG_RE.test(html)) return { kind: 'image' };
  return { kind: null };
}

/** Removes the graphic (diagram, slide picture or older AI picture); text and own pictures stay. */
export function stripGraphics(html: string): string {
  return html
    .replace(new RegExp(DIAGRAM_RE.source, 'g'), '')
    .replace(new RegExp(SLIDE_RE.source, 'g'), '')
    .replace(new RegExp(OLD_AI_IMG_RE.source, 'g'), '')
    .replace(/(<br\s*\/?>\s*)+$/i, '');
}

/** The back with the new diagram instead of any earlier graphic. */
export const withDiagram = (html: string, d: Diagram) => stripGraphics(html) + diagramHtml(d);

/** Names of the diagram kinds (for choosing one). */
export const DIAGRAM_KINDS: { id: Diagram['type']; label: string }[] = [
  { id: 'flow', label: 'Ablauf' },
  { id: 'cycle', label: 'Kreislauf' },
  { id: 'hierarchy', label: 'Gliederung' },
  { id: 'compare', label: 'Vergleich' },
  { id: 'timeline', label: 'Zeitstrahl' },
  { id: 'concept', label: 'Begriffsnetz' },
  { id: 'matrix', label: 'Vierfeldertafel' },
  { id: 'axes', label: 'Graph / Kurve' },
  { id: 'model', label: 'Modell (Pfeile zwischen Begriffen)' },
  { id: 'venn', label: 'Venn-Diagramm' },
  { id: 'pyramid', label: 'Pyramide / Stufen' },
  { id: 'bars', label: 'Balkendiagramm' },
  { id: 'decision', label: 'Entscheidungsbaum' },
];
