/**
 * Diagrams on cards: the AI only describes a graphic (type + short labels), Merkora draws it itself with
 * fixed templates – clean layout without overlaps, Merkora colours, light and dark.
 * Pure (no DOM) – tested in scripts/test-srs.mts.
 */

export type Diagram =
  | { type: 'flow'; title?: string; steps: string[] }
  | { type: 'cycle'; title?: string; steps: string[] }
  | { type: 'hierarchy'; title?: string; root: string; children: { label: string; children?: string[] }[] }
  | { type: 'compare'; title?: string; columns: { title: string; items: string[] }[] }
  | { type: 'timeline'; title?: string; events: { when: string; label: string }[] }
  | { type: 'concept'; title?: string; center: string; branches: string[] }
  | { type: 'matrix'; title?: string; x: string; y: string; cells: string[] }
  | { type: 'axes'; title?: string; x: string; y: string; shape: Shape; marks?: { at: number; label: string }[] };

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
export function parseDiagram(raw: unknown): Diagram | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 70) || undefined;
  const t = String(r.type ?? '').toLowerCase();
  switch (t) {
    case 'flow':
    case 'cycle': {
      const steps = list(r.steps, 8);
      if (steps.length < (t === 'flow' ? 2 : 3)) return null;
      return { type: t, title, steps };
    }
    case 'hierarchy': {
      const root = str(r.root);
      const children = (Array.isArray(r.children) ? r.children : [])
        .map((c) => (typeof c === 'string' ? { label: str(c) } : { label: str((c as { label?: unknown })?.label), children: list((c as { children?: unknown })?.children, 4) }))
        .filter((c) => c.label)
        .slice(0, 5)
        .map((c) => (c.children?.length ? c : { label: c.label }));
      if (!root || children.length < 2) return null;
      return { type: 'hierarchy', title, root, children };
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
      return { type: 'concept', title, center, branches };
    }
    case 'matrix': {
      const cells = list(r.cells, 4);
      const x = str(r.x), y = str(r.y);
      if (cells.length !== 4 || !x || !y) return null;
      return { type: 'matrix', title, x, y, cells };
    }
    case 'axes': {
      const x = str(r.x, 40), y = str(r.y, 40);
      const s = String(r.shape ?? '').toLowerCase().replace(/[\s_]+/g, '-');
      const shape = (SHAPES.find((k) => k === s) ?? (/(fall|sink|decreas)/.test(s) ? 'fallend' : /(umgekehrt|invert)/.test(s) ? 'umgekehrtes-u' : /^u/.test(s) ? 'u' : /s/.test(s) ? 's-kurve' : 'steigend')) as Shape;
      const marks = (Array.isArray(r.marks) ? r.marks : [])
        .map((m) => ({ at: Math.min(0.95, Math.max(0.05, Number((m as { at?: unknown })?.at))), label: str((m as { label?: unknown })?.label, 30) }))
        .filter((m) => Number.isFinite(m.at) && m.label)
        .slice(0, 3);
      if (!x || !y) return null;
      return { type: 'axes', title, x, y, shape, ...(marks.length ? { marks } : {}) };
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

export type Box = { x: number; y: number; w: number; h: number; lines: string[]; kind: 'node' | 'accent' | 'soft' | 'label' | 'bold'; align?: 'middle' | 'start' | 'end' };
export type Line = { pts: [number, number][]; arrow?: boolean; dashed?: boolean; curve?: boolean };
export type Layout = { width: number; height: number; boxes: Box[]; lines: Line[]; fs: number };

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

export function layoutDiagram(d: Diagram): Layout {
  NF = FS;
  const boxes: Box[] = [];
  const lines: Line[] = [];
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
      rows.push(row.map((l, k) => ({ x: PAD + k * (bw + gap), y, w: bw, h, lines: l, kind: i + k === 0 ? 'accent' : 'node' })));
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
      return { x: x - bw / 2, y: yy - bh / 2, w: bw, h: bh, lines: l, kind: 'node' as const };
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
      const b: Box = { x: PAD + i * (cw + gap), y, w: cw, h: ch, lines: cl[i], kind: 'node' };
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
      boxes.push({ x, y, w: cw, h: hh, lines: heads[i], kind: 'accent' });
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
    for (const m of d.marks ?? []) {
      const mx = x0 + 12 + m.at * (x1 - x0 - 30);
      const my = y0 - 14 - f(m.at) * (plotH - 40);
      lines.push({ pts: [[mx, y0], [mx, my]], dashed: true });
      const lw = 130;
      boxes.push({ x: Math.min(x1 - lw, Math.max(x0 + 4, mx - lw / 2)), y: Math.max(y1, my - 30), w: lw, h: 20, lines: [m.label], kind: 'label' });
    }
    y = y0 + 30;
  }
  return { width: W, height: Math.ceil(y + PAD), boxes, lines, fs: NF };
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
export type Palette = { bg?: string; node: string; nodeStroke: string; text: string; accent: string; onAccent: string; soft: string; line: string; muted: string };
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: { node: '#dff3f2', nodeStroke: '#09817e', text: '#002a29', accent: '#09817e', onAccent: '#ffffff', soft: '#f4fcfc', line: '#09817e', muted: '#4f6f6d' },
  dark: { node: '#163634', nodeStroke: '#3fc6bf', text: '#e2f4f3', accent: '#1f7a75', onAccent: '#ffffff', soft: '#112725', line: '#3fc6bf', muted: '#9fbfbd' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n: number) => Math.round(n * 10) / 10;

export function renderDiagram(d: Diagram, p: Palette = PALETTES.light): string {
  const L = layoutDiagram(d);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" font-family="Manrope, Arial, sans-serif" role="img">`,
    `<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${p.line}"/></marker></defs>`,
  );
  if (p.bg) out.push(`<rect width="100%" height="100%" fill="${p.bg}"/>`);
  for (const l of L.lines) {
    const pts = l.pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
    out.push(
      `<polyline points="${pts}" fill="none" stroke="${l.dashed ? p.muted : p.line}" stroke-width="${l.dashed ? 1.5 : 2.2}"${l.dashed ? ' stroke-dasharray="5 5"' : ''} stroke-linejoin="round" stroke-linecap="round"${l.arrow ? ' marker-end="url(#dg-arrow)"' : ''}/>`,
    );
  }
  const isMatrixY = (b: Box) => d.type === 'matrix' && b.kind === 'label' && b.w < 40;
  for (const b of L.boxes) {
    const fill = b.kind === 'accent' ? p.accent : b.kind === 'node' ? p.node : b.kind === 'soft' ? p.soft : null;
    if (fill) out.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="${b.lines.length ? 10 : 4}" fill="${fill}"${b.kind === 'node' || b.kind === 'soft' ? ` stroke="${p.nodeStroke}" stroke-width="${b.kind === 'soft' ? 1 : 1.5}"` : ''}/>`);
    if (!b.lines.length) continue;
    const color = b.kind === 'accent' ? p.onAccent : b.kind === 'label' ? p.muted : p.text;
    const fs = b.kind === 'bold' ? (d.title && b.y === PAD ? 17 : 14) : b.kind === 'soft' ? (d.type === 'compare' ? 14 : 13) : b.kind === 'label' ? 13 : L.fs;
    const lh = b.kind === 'soft' ? (d.type === 'compare' ? 19 : 17) : b.kind === 'label' ? 17 : b.kind === 'bold' ? 22 : Math.round(L.fs * 1.3);
    const weight = b.kind === 'accent' || b.kind === 'bold' ? 700 : 500;
    if (isMatrixY(b)) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      out.push(`<text x="${r1(cx)}" y="${r1(cy)}" font-size="13" fill="${p.muted}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${r1(cx)} ${r1(cy)})">${esc(b.lines[0])}</text>`);
      continue;
    }
    const start = b.align === 'start';
    const x = start ? b.x + 10 : b.align === 'end' ? b.x + b.w - 4 : b.x + b.w / 2;
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
{"type":"axes","title":"…","x":"…","y":"…","shape":"steigend|fallend|u|umgekehrtes-u|s-kurve|linear","marks":[{"at":0.3,"label":"…"}]} – Verlauf/Kurve`;
