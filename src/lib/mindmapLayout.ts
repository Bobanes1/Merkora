/** Places of the boxes of an interactive mind map (see components/MindmapView). Pure – tested in scripts/test-srs.mts. */
import { wrap, type Diagram } from './diagram';

export type Map = Extract<Diagram, { type: 'mindmap' }>;
export type Pt = { x: number; y: number };
export type Node = {
  id: string;
  label: string;
  kind: 'center' | 'branch' | 'leaf';
  hue: number;
  branch: number; // index of its branch (-1 for the centre)
  /** where it should be now (a folded point sits on its branch, invisible) */
  home: Pt;
  shown: boolean;
  w: number;
  h: number;
  lines: string[];
  fs: number;
  icon?: string;
  phase: number;
};

export const CHAR = 0.58;
export const ICON_W = 22;
const GAP_GROUP = 26;
const GAP_LEAF = 10;

function box(label: string, kind: Node['kind'], icon?: string) {
  const fs = kind === 'center' ? 17 : kind === 'branch' ? 15 : 13;
  const maxW = kind === 'center' ? 190 : kind === 'branch' ? 170 : 160;
  const lines = wrap(label, maxW - (icon ? ICON_W : 0), fs);
  const textW = Math.max(...lines.map((l) => l.length)) * fs * CHAR;
  return { fs, lines, w: Math.max(kind === 'leaf' ? 70 : 90, textW + (icon ? ICON_W : 0) + 28), h: lines.length * Math.round(fs * 1.3) + (kind === 'leaf' ? 14 : 20) };
}

/**
 * Read from left to right: the topic on the left, its branches in a column to the right of it,
 * the points of an opened branch in the next column. Room is made only for opened branches.
 */
export function mindmapLayout(map: Map, open: Set<number>): Node[] {
  const icon = (l: string) => map.icons?.[l];
  const center: Node = { id: 'c', label: map.center, kind: 'center', hue: 1, branch: -1, home: { x: 0, y: 0 }, shown: true, phase: 0, icon: icon(map.center), ...box(map.center, 'center', icon(map.center)) };
  const nodes: Node[] = [center];
  type G = { i: number; b: Node; leaves: Node[]; h: number };
  const groups: G[] = [];
  map.branches.forEach((br, i) => {
    const hue = (i % 5) + 2 > 5 ? 1 : (i % 5) + 2;
    const b: Node = { id: `b${i}`, label: br.label, kind: 'branch', hue, branch: i, home: { x: 0, y: 0 }, shown: true, phase: i * 1.7, icon: icon(br.label), ...box(br.label, 'branch', icon(br.label)) };
    const leaves = br.children.map((c, j): Node => ({ id: `b${i}c${j}`, label: c, kind: 'leaf', hue, branch: i, home: { x: 0, y: 0 }, shown: open.has(i), phase: i * 1.7 + j * 2.3 + 0.8, icon: icon(c), ...box(c, 'leaf', icon(c)) }));
    const leavesH = leaves.reduce((n, l) => n + l.h, 0) + Math.max(0, leaves.length - 1) * GAP_LEAF;
    groups.push({ i, b, leaves, h: Math.max(b.h, open.has(i) ? leavesH : 0) });
  });
  // columns: left edges line up
  const branchLeft = center.w / 2 + 80;
  const branchW = Math.max(...groups.map((g) => g.b.w));
  const leafLeft = branchLeft + branchW + 64;
  const total = groups.reduce((n, g) => n + g.h, 0) + Math.max(0, groups.length - 1) * GAP_GROUP;
  let y = -total / 2;
  for (const g of groups) {
    const by = y + g.h / 2;
    g.b.home = { x: branchLeft + g.b.w / 2, y: by };
    nodes.push(g.b);
    // its points in the next column, stacked around the branch's height
    const leavesH = g.leaves.reduce((n, l) => n + l.h, 0) + Math.max(0, g.leaves.length - 1) * GAP_LEAF;
    let ly = by - leavesH / 2;
    for (const l of g.leaves) {
      l.home = l.shown ? { x: leafLeft + l.w / 2, y: ly + l.h / 2 } : { ...g.b.home };
      ly += l.h + GAP_LEAF;
      nodes.push(l);
    }
    y += g.h + GAP_GROUP;
  }
  return nodes;
}
