/**
 * Diagrams on cards: the AI only describes a graphic (type + short labels), Merkora draws it itself with
 * fixed templates – clean layout without overlaps, Merkora colours, light and dark.
 * Pure (no DOM) – tested in scripts/test-srs.mts.
 */
import { ICON_NAMES, ICONS } from './diagramIcons';
import { renderIllustration, type IllustrationPalette } from './illustrations';
import { compileExpr, sampleCurve } from './plotExpr';

export type ForceDir = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
export type ForceVec = { dir: ForceDir; label: string; note?: string; size?: 's' | 'm' | 'l' };
export type ForceState = { name: string; note?: string; sizes?: Partial<Record<ForceDir, 's' | 'm' | 'l'>>; tilt?: number };
export type SceneActor = { id: string; label: string; icon?: string; sub?: string };
export type SceneArrow = { from: string; to: string; label?: string; both?: boolean; dashed?: boolean };
export type CalloutPart = { side: 'left' | 'right'; label: string; note?: string };

export type Diagram = DiagramBase & {
  /** Small symbol per box: box label → symbol name (see lib/diagramIcons.ts). */
  icons?: Record<string, string>;
};
type DiagramBase =
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
  | { type: 'decision'; title?: string; question: string; yes: DecisionBranch; no: DecisionBranch }
  | { type: 'mindmap'; title?: string; center: string; branches: { label: string; children: string[] }[] }
  | { type: 'plot'; title?: string; x: PlotAxis; y: PlotAxis; functions: { label: string; expr: string }[]; points?: { x: number; label: string }[] }
  | { type: 'pie'; title?: string; unit?: string; slices: { label: string; value: number }[] }
  | { type: 'fishbone'; title?: string; effect: string; causes: { label: string; items: string[] }[] }
  | { type: 'numberline'; title?: string; min: number; max: number; unit?: string; marks: { value: number; label: string }[]; ranges?: { from: number; to: number; label: string }[] }
  | { type: 'network'; title?: string; nodes: string[]; links: { from: string; to: string; label?: string }[] }
  | { type: 'forces'; title?: string; subject: string; icon?: string; vectors: ForceVec[]; states?: ForceState[] }
  | { type: 'scene'; title?: string; actors: SceneActor[]; arrows: SceneArrow[] }
  | { type: 'callout'; title?: string; subject: string; icon?: string; parts: CalloutPart[] }
  | { type: 'illustration'; title?: string; width: number; height: number; svg: string };

export type PlotAxis = { label: string; min: number; max: number };

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

function parseModel(r: Record<string, unknown>, title: string | undefined): DiagramBase | null {
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
    const label = str(l?.label);
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

/** The labels of a diagram that are drawn in boxes (they can carry a symbol). */
function boxLabels(d: DiagramBase): string[] {
  switch (d.type) {
    case 'flow':
    case 'cycle':
      return d.steps;
    case 'concept':
      return [d.center, ...d.branches];
    case 'hierarchy':
      return [d.root, ...d.children.flatMap((c) => [c.label, ...(c.children ?? [])])];
    case 'compare':
      return d.columns.map((c) => c.title);
    case 'matrix':
      return d.cells;
    case 'model':
      return d.nodes;
    case 'pyramid':
      return d.levels;
    case 'mindmap':
      return [d.center, ...d.branches.flatMap((b) => [b.label, ...b.children])];
    case 'network':
      return d.nodes;
    case 'fishbone':
      return [d.effect, ...d.causes.map((c) => c.label)];
    case 'decision': {
      const sub = (b: DecisionBranch) => (typeof b === 'string' ? [b] : [b.question, b.yes, b.no]);
      return [d.question, ...sub(d.yes), ...sub(d.no)];
    }
    default:
      return [];
  }
}
const iconKey = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');

/** Other names the AI uses for the forms (German or English). */
const TYPE_ALIASES: Record<string, string> = {
  process: 'flow', ablauf: 'flow', prozess: 'flow', steps: 'flow', sequence: 'flow', flowchart: 'flow',
  kreislauf: 'cycle', zyklus: 'cycle', loop: 'cycle',
  tree: 'hierarchy', gliederung: 'hierarchy', baum: 'hierarchy',
  comparison: 'compare', vergleich: 'compare', table: 'compare', tabelle: 'compare',
  zeitstrahl: 'timeline', zeitleiste: 'timeline',
  begriff: 'concept', merkmale: 'concept',
  quadrant: 'matrix', vierfeldertafel: 'matrix', swot: 'matrix',
  modell: 'model', causal: 'model',
  stufen: 'pyramid', stufenmodell: 'pyramid',
  bar: 'bars', balken: 'bars', 'bar-chart': 'bars', barchart: 'bars', balkendiagramm: 'bars',
  entscheidungsbaum: 'decision', 'decision-tree': 'decision',
  function: 'plot', graph: 'plot', kurve: 'plot', funktion: 'plot',
  kreisdiagramm: 'pie', 'pie-chart': 'pie', piechart: 'pie', tortendiagramm: 'pie',
  ishikawa: 'fishbone', 'ursache-wirkung': 'fishbone', 'cause-effect': 'fishbone',
  zahlenstrahl: 'numberline', 'number-line': 'numberline', skala: 'numberline', scale: 'numberline',
  netz: 'network', netzwerk: 'network', begriffsnetz: 'network', 'concept-map': 'network', graphnetwork: 'network',
  kraft: 'forces', kraefte: 'forces', kräfte: 'forces', force: 'forces', vektor: 'forces', vektoren: 'forces', vectors: 'forces',
  szene: 'scene', akteure: 'scene', wechselwirkung: 'scene', interaction: 'scene',
  beschriftung: 'callout', aufbau: 'callout', teile: 'callout', anatomie: 'callout', querschnitt: 'callout', annotated: 'callout',
  svg: 'illustration', skizze: 'illustration', zeichnung: 'illustration', bild: 'illustration', sketch: 'illustration',
};

/**
 * Small mistakes of the AI are forgiven: the diagram as a JSON text, wrapped once more ({"diagram": {…}}),
 * or with another name for the form ("ablauf", "kreisdiagramm" …). A curve without formula stays a sketch ("axes").
 */
export function normalizeDiagram(raw: unknown): unknown {
  let r = raw;
  if (typeof r === 'string') {
    try {
      r = JSON.parse(r);
    } catch {
      return null;
    }
  }
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const o = r as Record<string, unknown>;
    if (!o.type && o.diagram && typeof o.diagram === 'object') return normalizeDiagram(o.diagram);
    const t = String(o.type ?? '').toLowerCase().trim().replace(/[\s_]+/g, '-');
    let type = TYPE_ALIASES[t] ?? TYPE_ALIASES[t.replace(/-/g, '')] ?? t;
    if (type === 'plot' && !Array.isArray(o.functions)) type = 'axes';
    if (type !== o.type) return { ...o, type };
  }
  return r;
}

export function parseDiagram(input: unknown): Diagram | null {
  const raw = normalizeDiagram(input);
  const d = parseBase(raw);
  if (!d) return null;
  const given = (raw as { icons?: unknown }).icons;
  if (!given || typeof given !== 'object') return d;
  const labels = boxLabels(d);
  const icons: Record<string, string> = {};
  for (const [k, v] of Object.entries(given as Record<string, unknown>)) {
    const label = pick(k, labels);
    const name = ICON_NAMES.find((n) => n === iconKey(v));
    if (label && name && !icons[label] && Object.keys(icons).length < 12) icons[label] = name;
  }
  return Object.keys(icons).length ? { ...d, icons } : d;
}

function parseBase(raw: unknown): DiagramBase | null {
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
        .map((s) => ({ label: str((s as { label?: unknown })?.label ?? s), items: list((s as { items?: unknown })?.items, 5) }))
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
        .map((b) => ({ label: str((b as { label?: unknown })?.label), value: Number(String((b as { value?: unknown })?.value ?? '').replace(',', '.')) }))
        .filter((b) => b.label && Number.isFinite(b.value))
        .slice(0, 8);
      if (bars.length < 2) return null;
      const unit = str(r.unit, 12);
      return { type: 'bars', title, ...(unit ? { unit } : {}), bars };
    }
    case 'mindmap': {
      const center = str(r.center ?? r.root);
      const branches = (Array.isArray(r.branches) ? r.branches : Array.isArray(r.children) ? r.children : [])
        .map((b) => (typeof b === 'string' ? { label: str(b), children: [] } : { label: str((b as { label?: unknown })?.label), children: list((b as { children?: unknown })?.children, 5) }))
        .filter((b) => b.label)
        .slice(0, 8);
      if (!center || branches.length < 3) return null;
      return { type: 'mindmap', title, center, branches };
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
    case 'plot': {
      const axis = (v: unknown): PlotAxis | null => {
        const o = (v ?? {}) as Record<string, unknown>;
        const min = num(o.min), max = num(o.max);
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
        return { label: str(o.label, 40), min, max };
      };
      const x = axis(r.x), y = axis(r.y);
      const functions = (Array.isArray(r.functions) ? r.functions : [])
        .map((f) => ({ label: str((f as { label?: unknown })?.label, 30), expr: String((f as { expr?: unknown })?.expr ?? '').slice(0, 120) }))
        .filter((f) => f.expr && compileExpr(f.expr))
        .slice(0, 3);
      if (!x || !y || !functions.length) return null;
      const points = (Array.isArray(r.points) ? r.points : [])
        .map((pt) => ({ x: num((pt as { x?: unknown })?.x), label: str((pt as { label?: unknown })?.label, 30) }))
        .filter((pt) => Number.isFinite(pt.x) && pt.x >= x.min && pt.x <= x.max && pt.label)
        .slice(0, 3);
      return { type: 'plot', title, x, y, functions, ...(points.length ? { points } : {}) };
    }
    case 'pie': {
      const slices = (Array.isArray(r.slices) ? r.slices : [])
        .map((b) => ({ label: str((b as { label?: unknown })?.label, 40), value: num((b as { value?: unknown })?.value) }))
        .filter((b) => b.label && Number.isFinite(b.value) && b.value > 0)
        .slice(0, 6);
      if (slices.length < 2) return null;
      const unit = str(r.unit, 12);
      return { type: 'pie', title, ...(unit ? { unit } : {}), slices };
    }
    case 'fishbone': {
      const effect = str(r.effect ?? r.problem);
      const causes = (Array.isArray(r.causes) ? r.causes : [])
        .map((c) => ({ label: str((c as { label?: unknown })?.label ?? c, 30), items: list((c as { items?: unknown })?.items, 3) }))
        .filter((c) => c.label)
        .slice(0, 6);
      if (!effect || causes.length < 2) return null;
      return { type: 'fishbone', title, effect, causes };
    }
    case 'numberline': {
      const min = num(r.min), max = num(r.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
      const marks = (Array.isArray(r.marks) ? r.marks : [])
        .map((m) => ({ value: num((m as { value?: unknown })?.value), label: str((m as { label?: unknown })?.label, 30) }))
        .filter((m) => Number.isFinite(m.value) && m.value >= min && m.value <= max && m.label)
        .slice(0, 6);
      const ranges = (Array.isArray(r.ranges) ? r.ranges : [])
        .map((m) => ({ from: num((m as { from?: unknown })?.from), to: num((m as { to?: unknown })?.to), label: str((m as { label?: unknown })?.label, 30) }))
        .filter((m) => Number.isFinite(m.from) && Number.isFinite(m.to) && m.to > m.from && m.label)
        .map((m) => ({ ...m, from: Math.max(min, m.from), to: Math.min(max, m.to) }))
        .slice(0, 3);
      if (!marks.length && !ranges.length) return null;
      const unit = str(r.unit, 12);
      return { type: 'numberline', title, min, max, ...(unit ? { unit } : {}), marks, ...(ranges.length ? { ranges } : {}) };
    }
    case 'network': {
      const nodes = list(r.nodes, 8);
      const links = (Array.isArray(r.links) ? r.links : [])
        .map((l) => ({ from: pick((l as { from?: unknown })?.from, nodes), to: pick((l as { to?: unknown })?.to, nodes), label: str((l as { label?: unknown })?.label, 24) }))
        .filter((l): l is { from: string; to: string; label: string } => !!l.from && !!l.to && l.from !== l.to)
        .slice(0, 12)
        .map((l) => (l.label ? l : { from: l.from, to: l.to }));
      if (nodes.length < 3 || !links.length) return null;
      return { type: 'network', title, nodes, links };
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
    case 'forces': {
      const subject = str(r.subject ?? r.center ?? r.object ?? r.label, 40);
      if (!subject) return null;
      const icon = str(r.icon ?? r.motif, 30) || undefined;
      const seen = new Set<ForceDir>();
      const vectors: ForceVec[] = [];
      for (const rawV of Array.isArray(r.vectors ?? r.forces) ? ((r.vectors ?? r.forces) as unknown[]) : []) {
        const o = (rawV ?? {}) as Record<string, unknown>;
        const dir = parseForceDir(o.dir ?? o.direction ?? o.pos);
        const label = str(o.label ?? o.name, 40);
        if (!dir || !label || seen.has(dir)) continue;
        seen.add(dir);
        const note = str(o.note ?? o.text, 55) || undefined;
        const size = parseForceSize(o.size);
        vectors.push({ dir, label, ...(note ? { note } : {}), ...(size ? { size } : {}) });
        if (vectors.length >= 6) break;
      }
      if (vectors.length < 2) return null;
      const states: ForceState[] = [];
      for (const rawS of Array.isArray(r.states) ? (r.states as unknown[]) : []) {
        const o = (rawS ?? {}) as Record<string, unknown>;
        const name = str(o.name ?? o.label, 28);
        if (!name) continue;
        const note = str(o.note ?? o.text, 140) || undefined;
        const sizes: Partial<Record<ForceDir, 's' | 'm' | 'l'>> = {};
        if (o.sizes && typeof o.sizes === 'object') {
          for (const [dk, dv] of Object.entries(o.sizes as Record<string, unknown>)) {
            const d2 = parseForceDir(dk);
            const sz = parseForceSize(dv);
            if (d2 && sz) sizes[d2] = sz;
          }
        }
        const tiltNum = Number(o.tilt);
        const tilt = Number.isFinite(tiltNum) ? Math.max(-18, Math.min(18, Math.round(tiltNum))) : undefined;
        states.push({ name, ...(note ? { note } : {}), ...(Object.keys(sizes).length ? { sizes } : {}), ...(tilt !== undefined ? { tilt } : {}) });
        if (states.length >= 4) break;
      }
      return { type: 'forces', title, subject, ...(icon ? { icon } : {}), vectors, ...(states.length >= 2 ? { states } : {}) };
    }
    case 'scene': {
      const actors: SceneActor[] = [];
      const alias = new Map<string, string>();
      for (const rawA of Array.isArray(r.actors ?? r.nodes) ? ((r.actors ?? r.nodes) as unknown[]) : []) {
        const o = (rawA ?? {}) as Record<string, unknown>;
        const label = typeof rawA === 'string' || typeof rawA === 'number' ? str(rawA, 36) : str(o.label ?? o.name ?? o.id, 36);
        if (!label || actors.some((a) => key(a.label) === key(label)) || actors.length >= 4) continue;
        const id = typeof rawA === 'object' && rawA && o.id != null ? str(o.id, 24) || label : label;
        const icon = typeof rawA === 'object' && rawA ? str(o.icon ?? o.motif, 30) || undefined : undefined;
        const sub = typeof rawA === 'object' && rawA ? str(o.sub ?? o.note ?? o.role, 36) || undefined : undefined;
        actors.push({ id, label, ...(icon ? { icon } : {}), ...(sub ? { sub } : {}) });
        alias.set(key(id), id);
        alias.set(key(label), id);
      }
      if (actors.length < 2) return null;
      const resolveActor = (v: unknown) => alias.get(key(str(v, 36)));
      const arrows: SceneArrow[] = [];
      for (const rawL of Array.isArray(r.arrows ?? r.links) ? ((r.arrows ?? r.links) as unknown[]) : []) {
        const o = (rawL ?? {}) as Record<string, unknown>;
        const from = resolveActor(o.from), to = resolveActor(o.to);
        if (!from || !to || from === to) continue;
        if (arrows.some((a) => a.from === from && a.to === to)) continue;
        const label = str(o.label, 34) || undefined;
        arrows.push({ from, to, ...(label ? { label } : {}), ...(o.both === true ? { both: true } : {}), ...(o.dashed === true ? { dashed: true } : {}) });
        if (arrows.length >= 6) break;
      }
      if (!arrows.length) return null;
      return { type: 'scene', title, actors, arrows };
    }
    case 'callout': {
      const subject = str(r.subject ?? r.center ?? r.object, 40);
      if (!subject) return null;
      const icon = str(r.icon ?? r.motif, 30) || undefined;
      const rawParts = Array.isArray(r.parts ?? r.labels ?? r.items) ? ((r.parts ?? r.labels ?? r.items) as unknown[]) : [];
      const parts: CalloutPart[] = [];
      rawParts.forEach((rawP, idx) => {
        if (parts.length >= 6) return;
        const o = (rawP ?? {}) as Record<string, unknown>;
        const label = typeof rawP === 'string' || typeof rawP === 'number' ? str(rawP, 36) : str(o.label ?? o.name ?? o.text, 36);
        if (!label) return;
        const sideRaw = String(o.side ?? '').toLowerCase().trim();
        const side: 'left' | 'right' = sideRaw === 'left' || sideRaw === 'links' ? 'left' : sideRaw === 'right' || sideRaw === 'rechts' ? 'right' : idx % 2 === 0 ? 'left' : 'right';
        const note = typeof rawP === 'object' && rawP ? str(o.note ?? o.desc, 48) || undefined : undefined;
        parts.push({ side, label, ...(note ? { note } : {}) });
      });
      if (parts.length < 2) return null;
      return { type: 'callout', title, subject, ...(icon ? { icon } : {}), parts };
    }
    case 'illustration': {
      const cleaned = sanitizeSvg(r.svg, r.width, r.height);
      if (!cleaned) return null;
      return { type: 'illustration', title, width: cleaned.width, height: cleaned.height, svg: cleaned.svg };
    }
    default:
      return null;
  }
}

const FORCE_DIR_MAP: Record<string, ForceDir> = {
  up: 'up', oben: 'up', nord: 'up', n: 'up', hoch: 'up', top: 'up',
  down: 'down', unten: 'down', sued: 'down', s: 'down', runter: 'down', bottom: 'down',
  right: 'right', rechts: 'right', vorn: 'right', vorne: 'right', ost: 'right', e: 'right', forward: 'right', front: 'right',
  left: 'left', links: 'left', hinten: 'left', west: 'left', w: 'left', back: 'left', backward: 'left',
  'up-left': 'up-left', 'oben-links': 'up-left', 'links-oben': 'up-left', nw: 'up-left',
  'up-right': 'up-right', 'oben-rechts': 'up-right', 'rechts-oben': 'up-right', 'oben-vorn': 'up-right', ne: 'up-right',
  'down-left': 'down-left', 'unten-links': 'down-left', 'links-unten': 'down-left', sw: 'down-left',
  'down-right': 'down-right', 'unten-rechts': 'down-right', 'rechts-unten': 'down-right', se: 'down-right',
};
function parseForceDir(v: unknown): ForceDir | null {
  const k = String(v ?? '').toLowerCase().replace(/ü/g, 'ue').replace(/[\s_]+/g, '-').trim();
  return FORCE_DIR_MAP[k] ?? null;
}
function parseForceSize(v: unknown): 's' | 'm' | 'l' | undefined {
  const k = String(v ?? '').toLowerCase().trim();
  if (k === 's' || k === 'small' || k === 'klein' || k === 'kurz') return 's';
  if (k === 'm' || k === 'medium' || k === 'mittel' || k === 'normal') return 'm';
  if (k === 'l' || k === 'large' || k === 'gross' || k === 'groß' || k === 'lang') return 'l';
  return undefined;
}

const SVG_ALLOWED_TAGS = new Set([
  'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'marker', 'lineargradient', 'radialgradient', 'stop',
]);
const SVG_SHAPE_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const SVG_ALLOWED_ATTRS = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points',
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'transform', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'dx', 'dy',
  'id', 'marker-end', 'marker-start', 'viewbox', 'refx', 'refy', 'markerwidth', 'markerheight', 'orient',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits',
]);
const SVG_ATTR_CASE: Record<string, string> = {
  viewbox: 'viewBox', refx: 'refX', refy: 'refY', markerwidth: 'markerWidth', markerheight: 'markerHeight', gradientunits: 'gradientUnits',
};
const SVG_TAG_CASE: Record<string, string> = { lineargradient: 'linearGradient', radialgradient: 'radialGradient' };

/**
 * Strictly sanitizes AI-generated Studyflix SVG snippets (pure, no DOM).
 * Keeps only safe drawing tags/attributes, strips scripts/links/event handlers, and requires at least 2 shapes.
 */
export function sanitizeSvg(raw: unknown, widthHint?: unknown, heightHint?: unknown): { svg: string; width: number; height: number } | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text || text.length > 16000) return null;
  let w = Number(widthHint), h = Number(heightHint);
  const vb = /\bviewBox\s*=\s*["']\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(text);
  if (vb) {
    if (!Number.isFinite(w)) w = Number(vb[1]);
    if (!Number.isFinite(h)) h = Number(vb[2]);
  }
  const width = Number.isFinite(w) ? Math.max(320, Math.min(800, Math.round(w))) : 600;
  const height = Number.isFinite(h) ? Math.max(180, Math.min(480, Math.round(h))) : 320;
  // Strip outer <svg> wrapper and remove dangerous blocks completely
  text = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|foreignobject|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?svg\b[^>]*>/gi, '')
    .trim();
  if (!text) return null;

  let shapes = 0;
  const out = text.replace(/<(\/?)([a-zA-Z][\w:-]*)([^>]*)(\/?)>/g, (_m, close: string, rawTag: string, rawAttrs: string, selfClose: string) => {
    const tag = rawTag.toLowerCase();
    if (!SVG_ALLOWED_TAGS.has(tag)) return '';
    const canonTag = SVG_TAG_CASE[tag] ?? tag;
    if (close) return `</${canonTag}>`;
    if (SVG_SHAPE_TAGS.has(tag)) shapes++;
    const safeAttrs: string[] = [];
    const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(rawAttrs))) {
      const k = m[1].toLowerCase();
      const v = (m[2] ?? m[3] ?? '').trim();
      if (k.startsWith('on') || !SVG_ALLOWED_ATTRS.has(k)) continue;
      if (/javascript:|data:|vbscript:|expression\(|https?:\/\//i.test(v)) continue;
      if (/url\(/i.test(v) && !/^url\(#[\w-]+\)$/i.test(v)) continue;
      const canonAttr = SVG_ATTR_CASE[k] ?? k;
      safeAttrs.push(`${canonAttr}="${v.replace(/"/g, '&quot;')}"`);
    }
    return `<${canonTag}${safeAttrs.length ? ' ' + safeAttrs.join(' ') : ''}${selfClose ? '/' : ''}>`;
  });
  return shapes >= 2 ? { svg: out.trim(), width, height } : null;
}

// ---------- layout ----------
/** Round tick values for an axis (about `count` of them). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out.map((v) => Number(v.toPrecision(12)));
}
const fmtNum = (v: number) => (Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3) ? v.toExponential(1) : String(Number(v.toPrecision(6))).replace('.', ','));
const tickX = (tx: number) => Math.min(W - 2 - 44, Math.max(2, tx - 22));
const num = (v: unknown) => Number(String(v ?? '').replace(',', '.'));

export const W = 600;
const PAD = 16;
const FS = 15; // label font size
const charW = (fs: number) => fs * 0.58;

/** Word wrap by estimated width. Never shortens: the box grows instead (labels are at most 60 characters anyway). */
export function wrap(text: string, maxW: number, fs = FS, _maxLines?: number): string[] {
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
  return lines;
}

/**
 * node/accent: boxes (accent = highlighted); node2/accent2: the same in the second colour; soft: light box;
 * label: grey text; bold: heading; tag: small label on an arrow; text/textOn: text on a drawn area (dark / light text).
 */
export type Box = {
  x: number; y: number; w: number; h: number; lines: string[];
  kind: 'node' | 'accent' | 'soft' | 'label' | 'bold' | 'node2' | 'accent2' | 'tag' | 'text' | 'textOn';
  /** colour 1–5 (see Palette.tones); node2/accent2 mean colour 2 */
  align?: 'middle' | 'start' | 'end'; fs?: number; tone?: number;
  /** symbol name (lib/diagramIcons.ts), drawn left of the text */
  icon?: string;
};
const ICON_KINDS = new Set<Box['kind']>(['node', 'accent', 'node2', 'accent2', 'soft', 'text', 'textOn']);
export type Line = { pts: [number, number][]; arrow?: boolean; dashed?: boolean; curve?: boolean; both?: boolean; tone?: number; muted?: boolean; width?: number; quad?: [number, number]; dotStart?: boolean };
/** Filled areas behind everything (Venn circles, pyramid steps), in colour `hue` (1–5). */
export type Area = { circle?: [number, number, number]; poly?: [number, number][]; fill: 'node' | 'accent' | 'soft'; hue?: number };
/** Illustrated motif placed inside a visual diagram (forces, scene, callout). */
export type ArtItem = { icon?: string; subject?: string; x: number; y: number; w: number; h: number; tilt?: number; tone?: number };
const hueOf = (i: number) => (i % 5) + 1;
export type Layout = { width: number; height: number; boxes: Box[]; lines: Line[]; areas: Area[]; art?: ArtItem[]; rawSvg?: { svg: string; width: number; height: number; y: number }; fs: number };

let NF = FS; // font size of the boxes of the diagram being laid out
/** Symbols of the diagram being laid out (by label, spaces/hyphens ignored); a box with a symbol has 24 px less room for text. */
const IW = 24;
let ICON_OF = new Map<string, string>();
const nk = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '');
const iw = (label: string) => (ICON_OF.has(nk(label)) ? IW : 0);
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
function tag(text: string, cx: number, cy: number, maxW: number): Box {
  const room = Math.max(20, maxW - 12);
  // whole words: one step smaller rather than splitting a long word
  const fs = text.split(' ').every((w) => w.length * charW(TAG_FS) <= room) ? TAG_FS : 11;
  const ls = wrap(text, room, fs);
  const w = Math.min(maxW, Math.max(...ls.map((l) => l.length)) * charW(fs) + 14);
  const h = ls.length * (fs + 3) + 6;
  return { x: cx - w / 2, y: cy - h / 2, w, h, lines: ls, kind: 'tag', fs };
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
  const look = (e: E): Partial<Line> => (e.both ? { tone: 4 } : e.dashed ? { muted: true } : {});
  const node = (i: number): Box['kind'] => (d.highlight === d.nodes[i] ? 'accent' : isMod[i] ? 'node2' : 'node');

  // left → right if it fits (≤ 4 ranks, boxes at least 110 wide), else top → bottom
  const side = detours.length ? 22 : 0;
  // boxes up to 170 wide; spare room goes into the gaps (up to 110), so arrows and their labels breathe
  // labels between stacked boxes sit right of their arrow: keep room for them on the right
  const sameRight = Math.max(0, ...edges.filter((e) => sameRank(e) && e.label).map((e) => Math.min(160, e.label!.length * charW(TAG_FS) + 14) + 14));
  const room = inner - 2 * side - sameRight;
  const gapX = Math.max(48, ...straightTags.map((w) => w + 16), R > 1 ? Math.min(110, (room - R * 170) / (R - 1)) : 0);
  const bwH = Math.min(190, (room - (R - 1) * gapX) / R);
  const horizontal = R <= 4 && bwH >= 110;
  const by = new Map<number, Box>();
  const modBoxes: Box[] = [];
  const tagsOut: Box[] = [];
  let bottom = top;

  if (horizontal) {
    const bw = bwH;
    const mw = Math.min(bw, 170);
    NF = nodeFont(d.nodes.map((t, i) => ({ text: t, w: (isMod[i] ? mw : bw) - 16 - iw(t) })));
    const ls = d.nodes.map((t, i) => wrap(t, (isMod[i] ? mw : bw) - 16 - iw(t), NF, 3));
    const bh = Math.max(...ls.map((l) => boxH(l)));
    const sameTagH = Math.max(0, ...edges.filter((e) => sameRank(e) && e.label).map((e) => tag(e.label!, 0, 0, bw).h));
    const gapY = sameTagH ? Math.max(44, sameTagH + 24) : 26;
    const detourStep = Math.max(26, ...detours.filter((e) => e.label).map((e) => tag(e.label!, 0, 0, 160).h + 8));
    const maxCol = Math.max(...layers.map((L) => L.length));
    const colH = maxCol * bh + (maxCol - 1) * gapY;
    const modTagH = Math.max(0, ...mods.map((m) => (m.label ? tag(m.label, 0, 0, 120).h : 0)));
    const bandGap = 30 + modTagH;
    // moderators go above, unless the arrow they point at is a detour below
    const above = mods.some((m) => isMod[m.m] && !detours.includes(edges[m.e]));
    const y0 = top + (above ? bh + bandGap : 0);
    const used = R * bw + (R - 1) * gapX;
    const x0 = PAD + (inner - sameRight - used) / 2;
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
      if (adjacent(e) || sameRank(e)) ln = { ...connect(a, b), both: e.both, dashed: e.dashed, ...look(e) };
      else {
        // detour below the boxes, along the gaps between the columns
        const yk = y0 + colH + 22 + level * detourStep;
        const right = b.x > a.x;
        const gx1 = right ? a.x + a.w + 10 + level * 6 : a.x - 10 - level * 6;
        const gx2 = right ? b.x - 10 - level * 6 : b.x + b.w + 10 + level * 6;
        const ay = a.y + a.h / 2, byy = b.y + b.h / 2;
        // the lowest box of a column is left / entered from below, the others from the side
        const lowest = (v: number) => layers[rank[v]][layers[rank[v]].length - 1] === v;
        const start: [number, number][] = lowest(e.a) ? [[a.x + a.w / 2 + level * 8, a.y + a.h + 4]] : [[right ? a.x + a.w + 4 : a.x - 4, ay], [gx1, ay]];
        const end: [number, number][] = lowest(e.b) ? [[b.x + b.w / 2 - level * 8, b.y + b.h + 6]] : [[gx2, byy], [right ? b.x - 6 : b.x + b.w + 6, byy]];
        ln = { pts: [...start, [start[start.length - 1][0], yk], [end[0][0], yk], ...end], arrow: true, both: e.both, dashed: e.dashed, ...look(e) };
        bottom = Math.max(bottom, yk + 12);
        level++;
      }
      edgeLine.set(k, ln);
      lines.push(ln);
      if (e.label) {
        const [mx, my] = mid(ln.pts);
        const detour = ln.pts.length > 2;
        const t = tag(e.label, mx, my, detour ? 160 : sameRank(e) ? bw : gapX - 12);
        // an arrow that a moderator points at keeps its middle free; between stacked boxes the label goes beside the arrow
        if (modTarget.has(k)) t.y = my + 6;
        else if (sameRank(e)) t.x = Math.min(mx + 10, W - PAD - t.w);
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
      if (pl.label && pl.own) tagsOut.push({ ...tag(pl.label, (pl.box.x + pl.box.w / 2 + px) / 2, (pl.box.y + pl.box.h / 2 + py) / 2, 120), tone: 2 });
      else if (pl.label) {
        const cx = pl.box.x + pl.box.w / 2;
        const t = tag(pl.label, cx, 0, 120);
        t.y = pl.below ? pl.box.y - t.h - 6 : pl.box.y + pl.box.h + 6;
        tagsOut.push({ ...t, tone: 2 });
      }
    }
  } else {
    // top → bottom: one row per rank, moderators in a band on the left
    const band = mods.some((m) => isMod[m.m]) ? 150 : 0;
    const right = detours.length ? 26 : 0;
    const maxRow = Math.max(...layers.map((L) => L.length));
    const area = inner - (band ? band + 20 : 0) - right;
    const bw = Math.min(180, (area - (maxRow - 1) * 20) / maxRow);
    NF = nodeFont(d.nodes.map((t, i) => ({ text: t, w: (isMod[i] ? band : bw) - 16 - iw(t) })));
    const ls = d.nodes.map((t, i) => wrap(t, (isMod[i] ? band : bw) - 16 - iw(t), NF, 3));
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
      if (adjacent(e) || sameRank(e)) ln = { ...connect(a, b), both: e.both, dashed: e.dashed, ...look(e) };
      else {
        // detour along the outside, on the side where no other box of the row is in the way
        const left = !(lastIn(e.a, 'last') && lastIn(e.b, 'last')) && lastIn(e.a, 'first') && lastIn(e.b, 'first');
        const ay = a.y + a.h / 2, byy = b.y + b.h / 2;
        if (left) {
          const x = xl - levelL++ * 7;
          ln = { pts: [[a.x - 4, ay], [x, ay], [x, byy], [b.x - 6, byy]], arrow: true, both: e.both, dashed: e.dashed, ...look(e) };
        } else {
          const x = xr + levelR++ * 7;
          ln = { pts: [[a.x + a.w + 4, ay], [x, ay], [x, byy], [b.x + b.w + 6, byy]], arrow: true, both: e.both, dashed: e.dashed, ...look(e) };
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
          lastBottom = y + bh;
          boxes.push(box);
          bottom = Math.max(bottom, lastBottom);
          if (md.label) {
            const t = tag(md.label, PAD + band / 2, 0, band);
            tagsOut.push({ ...t, y: y + bh + 4, tone: 2 });
            lastBottom = y + bh + 8 + t.h;
            bottom = Math.max(bottom, lastBottom);
          }
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

export function layoutDiagram(d: Diagram, stateIndex?: number): Layout {
  NF = FS;
  ICON_OF = new Map(Object.entries(d.icons ?? {}).map(([l, i]) => [nk(l), i]));
  const boxes: Box[] = [];
  const lines: Line[] = [];
  const areas: Area[] = [];
  const art: ArtItem[] = [];
  let rawSvg: Layout['rawSvg'];
  let y = PAD;
  if (d.title) {
    const tl = wrap(d.title, W - 2 * PAD, 17);
    boxes.push({ x: PAD, y, w: W - 2 * PAD, h: tl.length * 22, lines: tl, kind: 'bold' });
    y += tl.length * 22 + 12;
  }
  const inner = W - 2 * PAD;

  if (d.type === 'flow') {
    const n = d.steps.length;
    const cols = n <= 4 ? n : Math.ceil(n / Math.ceil(n / 4));
    const gap = 30;
    const bw = (inner - (cols - 1) * gap) / cols;
    NF = nodeFont(d.steps.map((t) => ({ text: t, w: bw - 16 - iw(t) })));
    const rows: Box[][] = [];
    for (let i = 0; i < n; i += cols) {
      const row = d.steps.slice(i, i + cols).map((s) => wrap(s, bw - 16 - iw(s), NF));
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
    NF = nodeFont(items.map((t) => ({ text: t, w: bw - 16 - iw(t) })));
    const ls = items.map((s) => wrap(s, bw - 16 - iw(s), NF, 3));
    const bh = Math.max(...ls.map((l) => boxH(l, 8)));
    const minR = (bw + 14) / (2 * Math.sin(Math.PI / n));
    const centreBox = d.type === 'concept' ? wrap(d.center, 160 - iw(d.center), 16, 3) : null;
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
    const cx = W / 2;
    const place = (ry: number) => {
      const cy = y + ry + bh / 2;
      const nodes = ls.map((l, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const x = cx + R * Math.cos(a), yy = cy + ry * Math.sin(a);
        return { x: x - bw / 2, y: yy - bh / 2, w: bw, h: bh, lines: l, kind: (items[i] === d.highlight ? 'accent' : 'node') as Box['kind'], tone: hueOf(i) };
      });
      const cb: Box | null = centreBox ? { x: cx - 90, y: cy - boxH(centreBox) / 2, w: 180, h: boxH(centreBox), lines: centreBox, kind: 'accent' } : null;
      return { cy, nodes, cb };
    };
    const clash = (a: Box, b: Box) => a.x < b.x + b.w + 6 && b.x < a.x + a.w + 6 && a.y < b.y + b.h + 6 && b.y < a.y + a.h + 6;
    // tall boxes (long labels): stretch the circle until no two boxes touch
    let pl = place(rY);
    for (let k = 0; k < 40; k++) {
      const all = pl.cb ? [...pl.nodes, pl.cb] : pl.nodes;
      if (!all.some((a, i) => all.slice(i + 1).some((b) => clash(a, b)))) break;
      rY += 10;
      pl = place(rY);
    }
    const { cy, nodes } = pl;
    boxes.push(...nodes);
    if (pl.cb) {
      const cb = pl.cb;
      boxes.push(cb);
      nodes.forEach((b, i) => lines.push({ ...connect(cb, b), arrow: false, tone: hueOf(i) }));
    } else nodes.forEach((b, i) => lines.push({ ...connect(b, nodes[(i + 1) % n]), curve: true, tone: hueOf(i) }));
    y = cy + rY + bh / 2;
  } else if (d.type === 'hierarchy') {
    // a long root gets a wider box instead of many lines
    const rw = wrap(d.root, 220 - iw(d.root), 16).length > 2 ? Math.min(inner, 380) : 240;
    const rl = wrap(d.root, rw - 20 - iw(d.root), 16);
    const root: Box = { x: W / 2 - rw / 2, y, w: rw, h: rl.length * 21 + 20, lines: rl, kind: 'accent', fs: 16 };
    boxes.push(root);
    y += root.h + 36;
    const k = d.children.length;
    const gap = 14;
    const cw = (inner - (k - 1) * gap) / k;
    NF = nodeFont(d.children.map((c) => ({ text: c.label, w: cw - 14 - iw(c.label) })));
    const cl = d.children.map((c) => wrap(c.label, cw - 14 - iw(c.label), NF, 3));
    const ch = Math.max(...cl.map((l) => boxH(l)));
    const busY = y - 18;
    lines.push({ pts: [[root.x + root.w / 2, root.y + root.h], [root.x + root.w / 2, busY]] });
    let bottom = y + ch;
    d.children.forEach((c, i) => {
      const hue = hueOf(i);
      const b: Box = { x: PAD + i * (cw + gap), y, w: cw, h: ch, lines: cl[i], kind: c.label === d.highlight ? 'accent' : 'node', tone: hue };
      boxes.push(b);
      lines.push({ pts: [[root.x + root.w / 2, busY], [b.x + b.w / 2, busY], [b.x + b.w / 2, b.y - 6]], arrow: true, tone: hue });
      let gy = b.y + b.h + 10;
      for (const g of c.children ?? []) {
        const gl = wrap(g, cw - 26 - iw(g), 13, 3);
        const gb: Box = { x: b.x + 12, y: gy, w: cw - 12, h: gl.length * 17 + 12, lines: gl, kind: 'soft', align: 'start', tone: hue };
        boxes.push(gb);
        lines.push({ pts: [[b.x + 6, gy - 10], [b.x + 6, gb.y + gb.h / 2], [gb.x - 2, gb.y + gb.h / 2]], tone: hue });
        gy += gb.h + 8;
      }
      bottom = Math.max(bottom, gy - 8);
    });
    y = bottom;
  } else if (d.type === 'compare') {
    const k = d.columns.length;
    const gap = 14;
    const cw = (inner - (k - 1) * gap) / k;
    NF = nodeFont(d.columns.map((c) => ({ text: c.title, w: cw - 16 - iw(c.title) })));
    const heads = d.columns.map((c) => wrap(c.title, cw - 16 - iw(c.title), NF, 2));
    const hh = Math.max(...heads.map((l) => boxH(l, 8)));
    const bodies = d.columns.map((c) => c.items.flatMap((it) => wrap('• ' + it, cw - 20, 14, 3)));
    const bh = Math.max(...bodies.map((l) => l.length * 19 + 20));
    d.columns.forEach((_, i) => {
      const x = PAD + i * (cw + gap);
      boxes.push({ x, y, w: cw, h: hh, lines: heads[i], kind: 'accent', tone: hueOf(i) });
      boxes.push({ x, y: y + hh + 6, w: cw, h: bh, lines: bodies[i], kind: 'soft', align: 'start', tone: hueOf(i) });
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
    NF = nodeFont(d.cells.map((c) => ({ text: c, w: cw - 20 - iw(c) })));
    const cl = d.cells.map((c) => wrap(c, cw - 20 - iw(c), NF, 4));
    const chh = Math.max(64, ...cl.map((l) => boxH(l, 12)));
    const x0 = PAD + lab + 10;
    cl.forEach((l, i) => boxes.push({ x: x0 + (i % 2) * (cw + 6), y: y + Math.floor(i / 2) * (chh + 6), w: cw - 3, h: chh, lines: l, kind: 'node', tone: hueOf(i) }));
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
    boxes.push({ x: x0 + 6, y: y, w: 400, h: 20, lines: [d.y], kind: 'bold', align: 'start' });
    boxes.push({ x: x1 - 400, y: y0 + 8, w: 400, h: 20, lines: [d.x], kind: 'bold', align: 'end' });
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
      const ml = wrap(m.label, lw - 8, 13);
      const mh = ml.length * 17 + 4;
      boxes.push({ x: Math.min(x1 - lw, Math.max(x0 + 4, mx - lw / 2)), y: Math.max(y1, my - 12 - mh), w: lw, h: mh, lines: ml, kind: 'label' });
    }
    y = y0 + 30;
    if (d.second) {
      // legend: which curve is which
      const items: [string, 1 | 2][] = [[d.label || 'Kurve 1', 1], [d.second.label, 2]];
      let lx = x0;
      for (const [text, tone] of items) {
        lines.push({ pts: [[lx, y + 10], [lx + 26, y + 10]], ...(tone === 2 ? { tone: 2 } : {}) });
        const w = Math.min(200, text.length * charW(13) + 12);
        boxes.push({ x: lx + 32, y, w, h: 20, lines: [text], kind: 'label', align: 'start', fs: 13 });
        lx += 32 + w + 24;
      }
      y += 26;
    }
  } else if (d.type === 'plot') {
    const plotH = 240;
    const x0 = PAD + 46, y0 = y + 28 + plotH, x1 = W - PAD - 12, y1 = y + 28;
    const sx = (v: number) => x0 + ((v - d.x.min) / (d.x.max - d.x.min)) * (x1 - x0);
    const sy = (v: number) => y0 - ((v - d.y.min) / (d.y.max - d.y.min)) * (y0 - y1);
    lines.push({ pts: [[x0, y0], [x0, y1 - 8]], arrow: true });
    lines.push({ pts: [[x0, y0], [x1 + 6, y0]], arrow: true });
    if (d.y.label) boxes.push({ x: x0 + 6, y, w: 400, h: 20, lines: [d.y.label], kind: 'bold', align: 'start' });
    if (d.x.label) boxes.push({ x: x1 - 400, y: y0 + 28, w: 400, h: 20, lines: [d.x.label], kind: 'bold', align: 'end' });
    for (const t of niceTicks(d.x.min, d.x.max)) {
      const tx = sx(t);
      lines.push({ pts: [[tx, y0], [tx, y0 + 5]], muted: true });
      boxes.push({ x: tickX(tx), y: y0 + 9, w: 44, h: 16, lines: [fmtNum(t)], kind: 'label', fs: 11 });
    }
    for (const t of niceTicks(d.y.min, d.y.max)) {
      const ty = sy(t);
      lines.push({ pts: [[x0 - 5, ty], [x0, ty]], muted: true });
      boxes.push({ x: x0 - 50, y: ty - 8, w: 43, h: 16, lines: [fmtNum(t)], kind: 'label', fs: 11, align: 'end' });
    }
    const fns = d.functions.map((f) => compileExpr(f.expr)!);
    fns.forEach((f, i) => {
      let seg: [number, number][] = [];
      const flush = () => {
        if (seg.length > 1) lines.push({ pts: seg, ...(i ? { tone: i + 1 } : {}) });
        seg = [];
      };
      for (const pt of sampleCurve(f, d.x.min, d.x.max, 160)) {
        if (!pt || pt.y < d.y.min - 1e-9 || pt.y > d.y.max + 1e-9) flush();
        else seg.push([sx(pt.x), sy(pt.y)]);
      }
      flush();
    });
    for (const pt of d.points ?? []) {
      const v = fns[0](pt.x);
      if (!Number.isFinite(v) || v < d.y.min || v > d.y.max) continue;
      const px = sx(pt.x), py = sy(v);
      lines.push({ pts: [[px, y0], [px, py]], dashed: true, muted: true });
      areas.push({ circle: [px, py, 5], fill: 'accent', hue: 1 });
      const lw = 140;
      const ml = wrap(pt.label, lw - 8, 13);
      const mh = ml.length * 17 + 4;
      boxes.push({ x: Math.min(x1 - lw, Math.max(x0 + 4, px - lw / 2)), y: Math.max(y1, py - 14 - mh), w: lw, h: mh, lines: ml, kind: 'label' });
    }
    y = y0 + 54;
    if (d.functions.length > 1 || d.functions[0].label) {
      let lx = x0;
      d.functions.forEach((f, i) => {
        const text = f.label || f.expr;
        lines.push({ pts: [[lx, y + 10], [lx + 26, y + 10]], ...(i ? { tone: i + 1 } : {}) });
        const w = Math.min(200, text.length * charW(13) + 12);
        boxes.push({ x: lx + 32, y, w, h: 20, lines: [text], kind: 'label', align: 'start', fs: 13 });
        lx += 32 + w + 24;
      });
      y += 26;
    }
  } else if (d.type === 'pie') {
    const R = 115, cx = PAD + R + 6, cy = y + R + 4;
    const total = d.slices.reduce((a, b) => a + b.value, 0);
    let a0 = -Math.PI / 2;
    const legendX = cx + R + 30;
    const legendW = W - PAD - legendX;
    let ly = cy - (d.slices.length * 30) / 2;
    d.slices.forEach((sl, i) => {
      const a1 = a0 + (sl.value / total) * Math.PI * 2;
      const poly: [number, number][] = [[cx, cy]];
      const steps = Math.max(2, Math.ceil(((a1 - a0) * 180) / Math.PI / 4));
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps;
        poly.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
      areas.push({ poly, fill: 'node', hue: hueOf(i) });
      const pct = Math.round((sl.value / total) * 100);
      areas.push({ poly: [[legendX, ly + 4], [legendX + 14, ly + 4], [legendX + 14, ly + 18], [legendX, ly + 18]], fill: 'node', hue: hueOf(i) });
      const text = `${sl.label} – ${pct} %`;
      const tl = wrap(text, legendW - 24, 13);
      boxes.push({ x: legendX + 22, y: ly, w: legendW - 22, h: tl.length * 17 + 4, lines: tl, kind: 'label', align: 'start', fs: 13 });
      ly += Math.max(30, tl.length * 17 + 10);
      a0 = a1;
    });
    y = Math.max(cy + R, ly) + 8;
  } else if (d.type === 'fishbone') {
    const effW = 130;
    const n = d.causes.length;
    const top = d.causes.filter((_, i) => i % 2 === 0), bottom = d.causes.filter((_, i) => i % 2 === 1);
    const perSide = Math.max(top.length, bottom.length);
    const spineX0 = PAD, spineX1 = W - PAD - effW - 8;
    const slot = (spineX1 - spineX0) / perSide;
    const itemH = (c: { items: string[] }) => c.items.reduce((h, t) => h + wrap(t, slot - 26, 12).length * 15, 0);
    const side = Math.max(...d.causes.map((c) => 34 + 8 + itemH(c))) + 14;
    const spineY = y + side;
    const effL = wrap(d.effect, effW - 16, 14);
    const effH = Math.max(46, effL.length * 19 + 14);
    boxes.push({ x: W - PAD - effW, y: spineY - effH / 2, w: effW, h: effH, lines: effL, kind: 'accent', fs: 14 });
    lines.push({ pts: [[spineX0, spineY], [spineX1, spineY]], arrow: true });
    const draw = (cs: typeof d.causes, up: boolean) =>
      cs.forEach((c, k) => {
        const bx = spineX0 + slot * k + 8;
        const lw = slot - 18;
        const cl = wrap(c.label, lw - 12, 13);
        const ch = cl.length * 17 + 10;
        const by = up ? y : spineY + side - ch;
        boxes.push({ x: bx, y: by, w: lw, h: ch, lines: cl, kind: 'node', fs: 13, tone: hueOf(d.causes.indexOf(c)) });
        const meet = bx + lw * 0.85;
        lines.push({ pts: [[bx + lw / 2, up ? by + ch : by], [meet, spineY]], muted: true });
        let iy = up ? by + ch + 6 : spineY + 8;
        for (const it of c.items) {
          const il = wrap(it, lw - 30, 12);
          boxes.push({ x: bx + 4, y: iy, w: lw - 30, h: il.length * 15, lines: il, kind: 'label', align: 'start', fs: 12 });
          iy += il.length * 15;
        }
      });
    draw(top, true);
    draw(bottom, false);
    y = spineY + (bottom.length ? side : effH / 2) + (n ? 0 : 0);
  } else if (d.type === 'numberline') {
    const x0 = PAD + 10, x1 = W - PAD - 14;
    const sx = (v: number) => x0 + ((v - d.min) / (d.max - d.min)) * (x1 - x0);
    const markRows = d.marks.length > 3 ? 2 : 1;
    const lineY = y + markRows * 40 + 16;
    for (const [i, r] of (d.ranges ?? []).entries()) {
      const a = sx(r.from), b = sx(r.to);
      areas.push({ poly: [[a, lineY + 8], [b, lineY + 8], [b, lineY + 22], [a, lineY + 22]], fill: 'node', hue: hueOf(i + 1) });
      const rl = wrap(r.label, Math.max(60, b - a), 12);
      boxes.push({ x: (a + b) / 2 - Math.max(60, b - a) / 2, y: lineY + 26 + (i > 0 && r.from < (d.ranges![i - 1].to + 0.01 * (d.max - d.min)) && b - a < 80 ? 18 : 0), w: Math.max(60, b - a), h: rl.length * 15, lines: rl, kind: 'label', fs: 12 });
    }
    lines.push({ pts: [[x0 - 4, lineY], [x1 + 8, lineY]], arrow: true });
    for (const t of niceTicks(d.min, d.max, 8)) {
      const tx = sx(t);
      lines.push({ pts: [[tx, lineY - 5], [tx, lineY + 5]], muted: true });
      boxes.push({ x: tickX(tx), y: lineY + (d.ranges?.length ? 60 : 8), w: 44, h: 16, lines: [fmtNum(t) + (d.unit && t === d.max ? ' ' + d.unit : '')], kind: 'label', fs: 11 });
    }
    d.marks.forEach((m, i) => {
      const mx = sx(m.value);
      const row = markRows === 2 ? i % 2 : 0;
      const ly = y + row * 40;
      areas.push({ circle: [mx, lineY, 5], fill: 'accent', hue: 1 });
      lines.push({ pts: [[mx, ly + 30], [mx, lineY - 6]], muted: true });
      const lw = 120;
      const ml = wrap(`${m.label} (${fmtNum(m.value)})`, lw - 6, 12);
      boxes.push({ x: Math.min(x1 - lw, Math.max(x0 - 4, mx - lw / 2)), y: ly, w: lw, h: Math.max(30, ml.length * 15), lines: ml, kind: 'label', fs: 12 });
    });
    y = lineY + (d.ranges?.length ? 82 : 30);
  } else if (d.type === 'network') {
    const n = d.nodes.length;
    const bw = 130;
    NF = nodeFont(d.nodes.map((t) => ({ text: t, w: bw - 16 - iw(t) })));
    const ls = d.nodes.map((t) => wrap(t, bw - 16 - iw(t), NF, 3));
    const bh = Math.max(...ls.map((l) => boxH(l, 8)));
    const rx = (inner - bw) / 2, ry = n <= 4 ? 90 : 120;
    const cx = W / 2, cy = y + ry + bh / 2;
    const pos = d.nodes.map((_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: cx + rx * Math.cos(a) - bw / 2, y: cy + ry * Math.sin(a) - bh / 2 };
    });
    d.nodes.forEach((_, i) => boxes.push({ x: pos[i].x, y: pos[i].y, w: bw, h: bh, lines: ls[i], kind: 'node', tone: hueOf(i) }));
    const edge = (i: number, tx: number, ty: number): [number, number] => {
      const c = [pos[i].x + bw / 2, pos[i].y + bh / 2];
      const dx = tx - c[0], dy = ty - c[1];
      const t = Math.min((bw / 2 + 4) / Math.abs(dx || 1e-6), (bh / 2 + 4) / Math.abs(dy || 1e-6));
      return [c[0] + dx * t, c[1] + dy * t];
    };
    for (const l of d.links) {
      const a = d.nodes.indexOf(l.from), b = d.nodes.indexOf(l.to);
      const ca = [pos[a].x + bw / 2, pos[a].y + bh / 2], cb = [pos[b].x + bw / 2, pos[b].y + bh / 2];
      const p1 = edge(a, cb[0], cb[1]), p2 = edge(b, ca[0], ca[1]);
      lines.push({ pts: [p1, p2], arrow: true });
      if (l.label) {
        const tw = Math.min(140, l.label.length * charW(12) + 14);
        boxes.push({ x: (p1[0] + p2[0]) / 2 - tw / 2, y: (p1[1] + p2[1]) / 2 - 10, w: tw, h: 20, lines: [l.label], kind: 'tag', fs: 12 });
      }
    }
    y = cy + ry + bh / 2;
  } else if (d.type === 'model') {
    y = layoutModel(d, y, boxes, lines);
  } else if (d.type === 'venn') {
    const R = 150, dx = 80, cx = W / 2;
    const setL = d.sets.map((st) => wrap(st.label, 190, 15));
    const labH = Math.max(...setL.map((l) => l.length)) * 20 + 2;
    const cy = y + labH + 8 + R;
    areas.push({ circle: [cx - dx, cy, R], fill: 'soft', hue: 1 }, { circle: [cx + dx, cy, R], fill: 'soft', hue: 2 });
    boxes.push({ x: cx - dx - 150, y, w: 200, h: labH, lines: setL[0], kind: 'bold', fs: 15 });
    boxes.push({ x: cx + dx - 50, y, w: 200, h: labH, lines: setL[1], kind: 'bold', fs: 15 });
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
    const aTop = 170, aBottom = inner;
    const widthAt = (k: number) => aTop + ((aBottom - aTop) * k) / n;
    // text of each step first: the step height follows the longest text
    const texts = d.levels.map((t, i) => {
      const tw = Math.max(60, (widthAt(i) + widthAt(i + 1)) / 2 - 36);
      const fs = [14, 13, 12].find((f) => t.split(' ').every((wd) => wd.length * charW(f) <= tw - iw(t))) ?? 12;
      return { tw, fs, ls: wrap(t, tw - iw(t), fs), lh: Math.round(fs * 1.3) };
    });
    const rowH = Math.max(52, ...texts.map((x) => x.ls.length * x.lh + 20));
    texts.forEach(({ tw, fs, ls, lh }, i) => {
      const yt = y + i * rowH, yb = yt + rowH - 4;
      const wt = widthAt(i), wb = widthAt(i + 1) - ((aBottom - aTop) / n) * (4 / rowH);
      areas.push({ poly: [[W / 2 - wt / 2, yt], [W / 2 + wt / 2, yt], [W / 2 + wb / 2, yb], [W / 2 - wb / 2, yb]], fill: i === 0 ? 'accent' : 'node', hue: (i % 5) + 1 });
      boxes.push({ x: W / 2 - tw / 2, y: yt + (rowH - 4) / 2 - (ls.length * lh) / 2, w: tw, h: ls.length * lh, lines: ls, kind: i === 0 ? 'textOn' : 'text', fs, tone: (i % 5) + 1 });
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
  } else if (d.type === 'mindmap') {
    const cw = 190, gap = 24;
    const midW = inner - 2 * cw - 2 * gap;
    NF = nodeFont(d.branches.map((b) => ({ text: b.label, w: cw - 16 - iw(b.label) })));
    type G = { i: number; head: string[]; kids: string[][]; h: number };
    const groups: G[] = d.branches.map((b, i) => {
      const head = wrap(b.label, cw - 16 - iw(b.label), NF);
      const kids = b.children.map((c) => wrap(c, cw - 40 - iw(c), 13));
      const h = boxH(head) + kids.reduce((n, k) => n + 8 + k.length * 17 + 10, 0);
      return { i, head, kids, h };
    });
    const sides = [groups.filter((g) => g.i % 2 === 0), groups.filter((g) => g.i % 2 === 1)];
    const sideH = sides.map((gs) => gs.reduce((n, g) => n + g.h, 0) + Math.max(0, gs.length - 1) * 22);
    const cl = wrap(d.center, midW - 20 - iw(d.center), 16);
    const ch = cl.length * 21 + 24;
    const total = Math.max(...sideH, ch);
    const centre: Box = { x: PAD + cw + gap, y: y + (total - ch) / 2, w: midW, h: ch, lines: cl, kind: 'accent', fs: 16 };
    sides.forEach((gs, side) => {
      let gy = y + (total - sideH[side]) / 2;
      const x = side === 0 ? PAD : W - PAD - cw;
      for (const g of gs) {
        const hue = hueOf(g.i + 1);
        const head: Box = { x, y: gy, w: cw, h: boxH(g.head), lines: g.head, kind: 'accent', tone: hue };
        boxes.push(head);
        // curved link from the centre to the branch
        const sx = side === 0 ? centre.x - 2 : centre.x + centre.w + 2, sy = centre.y + centre.h / 2;
        const ex = side === 0 ? head.x + head.w + 2 : head.x - 2, ey = head.y + head.h / 2;
        const pts: [number, number][] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16, mt = 1 - t, mx = (sx + ex) / 2;
          // cubic Bézier with horizontal ends
          pts.push([mt ** 3 * sx + 3 * mt * mt * t * mx + 3 * mt * t * t * mx + t ** 3 * ex, mt ** 3 * sy + 3 * mt * mt * t * sy + 3 * mt * t * t * ey + t ** 3 * ey]);
        }
        lines.push({ pts, tone: hue });
        let ky = head.y + head.h + 8;
        for (const k of g.kids) {
          const kb: Box = { x: x + 20, y: ky, w: cw - 20, h: k.length * 17 + 10, lines: k, kind: 'soft', align: 'start', fs: 13, tone: hue };
          boxes.push(kb);
          lines.push({ pts: [[x + 9, ky - 8], [x + 9, kb.y + kb.h / 2], [kb.x - 2, kb.y + kb.h / 2]], tone: hue });
          ky += kb.h + 8;
        }
        gy += g.h + 22;
      }
    });
    boxes.push(centre);
    y += total;
  } else if (d.type === 'decision') {
    // leaves left → right: the yes side, then the no side
    type N = { text: string; depth: number; kids: { n: N; yes: boolean }[]; leaf0: number; leaves: number; no?: boolean };
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
    const mark = (nd: N, no: boolean) => ((nd.no = no), nd.kids.forEach((k) => mark(k.n, no || !k.yes)));
    mark(root, false);
    const cols = root.leaves, gap = 14;
    const cw = (inner - (cols - 1) * gap) / cols;
    const all: N[] = [];
    const walk = (nd: N) => (all.push(nd), nd.kids.forEach((k) => walk(k.n)));
    walk(root);
    const widthOf = (nd: N) => (nd.depth === 0 ? Math.min(300, inner) : Math.min(260, nd.leaves * cw + (nd.leaves - 1) * gap));
    const isQ = (nd: N) => nd.kids.length > 0;
    NF = nodeFont(all.filter(isQ).map((nd) => ({ text: nd.text, w: widthOf(nd) - 16 - iw(nd.text) })));
    const label = (nd: N) => wrap(nd.text, widthOf(nd) - 16 - iw(nd.text), isQ(nd) ? NF : 13, 3);
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
      const b: Box = { x: cx - w / 2, y: rowY[nd.depth], w, h, lines: ls, kind: nd.depth === 0 ? 'accent' : isQ(nd) ? 'node' : 'soft', ...(isQ(nd) ? {} : { fs: 13 }), ...(nd.no ? { tone: 2 } : {}) };
      place.set(nd, b);
      boxes.push(b);
      y = Math.max(y, b.y + b.h);
    }
    for (const nd of all) {
      const p = place.get(nd)!;
      for (const { n: c, yes } of nd.kids) {
        const b = place.get(c)!;
        const px = p.x + p.w / 2, cx = b.x + b.w / 2, midY = p.y + p.h + 18;
        lines.push({ pts: [[px, p.y + p.h + 2], [px, midY], [cx, midY], [cx, b.y - 6]], arrow: true, ...(c.no ? { tone: 2 } : {}) });
        boxes.push({ ...tag(yes ? 'Ja' : 'Nein', cx, (midY + b.y - 6) / 2 + 2, 60), ...(c.no ? { tone: 2 } : {}) });
      }
    }
  } else if (d.type === 'forces') {
    const cx = W / 2;
    const artW = 152, artH = 98;
    const st = stateIndex !== undefined ? d.states?.[stateIndex] : undefined;
    const tilt = st?.tilt ?? 0;
    const dy = tilt ? Math.max(-7, Math.min(7, Math.round(tilt * 0.75))) : 0;
    const hasTop = d.vectors.some((v) => v.dir === 'up' || v.dir === 'up-left' || v.dir === 'up-right');
    const hasBot = d.vectors.some((v) => v.dir === 'down' || v.dir === 'down-left' || v.dir === 'down-right');
    const cy = y + (hasTop ? 156 : 74);
    art.push({ icon: d.icon, subject: d.subject, x: cx - artW / 2, y: cy - artH / 2 + dy, w: artW, h: artH, tilt, tone: 1 });
    // Show subtle subject caption only when no downward vector claims the space right beneath the object
    if (!d.vectors.some((v) => v.dir === 'down')) {
      const sl = wrap(d.subject, 170, 13);
      boxes.push({ x: cx - 85, y: cy + artH / 2 + 6, w: 170, h: sl.length * 17, lines: sl, kind: 'label', fs: 13 });
    }
    const dirTone: Record<ForceDir, number> = { up: 1, down: 2, right: 3, left: 4, 'up-right': 3, 'up-left': 4, 'down-right': 5, 'down-left': 2 };
    const lenOf = (sz?: 's' | 'm' | 'l') => (sz === 's' ? 42 : sz === 'l' ? 74 : 58);
    let maxY = cy + artH / 2 + (hasBot ? 148 : 34);
    for (const v of d.vectors) {
      const tone = dirTone[v.dir];
      const len = lenOf(st?.sizes?.[v.dir] ?? v.size);
      const isLR = v.dir === 'left' || v.dir === 'right';
      const maxBW = isLR ? 132 : 164;
      const linesV = wrap(v.label, maxBW - 18, 14);
      const bw = Math.min(maxBW, Math.max(96, Math.max(...linesV.map((l) => l.length)) * charW(14) + 26));
      const bh = linesV.length * 18 + 14;
      let sx = cx, sy = cy, ex = cx, ey = cy, bx = cx - bw / 2, by = cy - bh / 2;
      if (v.dir === 'up') {
        sy = cy - artH / 2 - 4;
        ey = sy - len;
        bx = cx - bw / 2;
        by = Math.max(y, ey - bh - 10);
      } else if (v.dir === 'down') {
        sy = cy + artH / 2 + 4;
        ey = sy + len;
        bx = cx - bw / 2;
        by = ey + 10;
      } else if (v.dir === 'right') {
        sx = cx + artW / 2 + 4;
        ex = sx + len;
        bx = Math.min(W - PAD - bw, ex + 10);
        by = cy - bh / 2;
      } else if (v.dir === 'left') {
        sx = cx - artW / 2 - 4;
        ex = sx - len;
        bx = Math.max(PAD, ex - 10 - bw);
        by = cy - bh / 2;
      } else {
        const dx = v.dir.endsWith('right') ? 1 : -1;
        const vy = v.dir.startsWith('up') ? -1 : 1;
        const dLen = Math.round(len * 0.82);
        sx = cx + dx * 60;
        sy = cy + vy * 38;
        ex = sx + dx * dLen;
        ey = sy + vy * dLen;
        bx = dx > 0 ? Math.min(W - PAD - bw, ex + 8) : Math.max(PAD, ex - 8 - bw);
        by = vy < 0 ? Math.max(y, ey - bh - 4) : ey + 4;
      }
      lines.push({ pts: [[sx, sy], [ex, ey]], arrow: true, tone, width: 4 });
      boxes.push({ x: bx, y: by, w: bw, h: bh, lines: linesV, kind: 'node', fs: 14, tone });
      let bottom = by + bh;
      if (v.note) {
        const nl = wrap(v.note, Math.max(bw, 130), 12);
        const nw = Math.max(bw, 130);
        const nx = Math.max(PAD, Math.min(W - PAD - nw, bx + bw / 2 - nw / 2));
        const ny = by + bh + 4;
        boxes.push({ x: nx, y: ny, w: nw, h: nl.length * 15, lines: nl, kind: 'label', fs: 12 });
        bottom = ny + nl.length * 15;
      }
      maxY = Math.max(maxY, bottom);
    }
    y = maxY + 4;
  } else if (d.type === 'scene') {
    const n = d.actors.length;
    const cardW = n === 2 ? 164 : n === 3 ? 148 : 172;
    const artW = n === 3 ? 82 : 94;
    const artH = n === 3 ? 54 : 62;
    const placed = new Map<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }>();
    const hasSub = d.actors.some((a) => !!a.sub);
    const cardH = artH + (hasSub ? 66 : 48);
    // Reserve space above row 1 if two actors exchange opposing arrows (top curve)
    const hasPairOpp = d.arrows.some((a) => d.arrows.some((b) => b.from === a.to && b.to === a.from));
    const topY = y + (n <= 3 && hasPairOpp ? 24 : 8);
    const coords: [number, number][] =
      n === 2
        ? [[24, topY], [W - 24 - cardW, topY]]
        : n === 3
          ? [[16, topY], [Math.round((W - cardW) / 2), topY], [W - 16 - cardW, topY]]
          : [[24, topY], [W - 24 - cardW, topY], [24, topY + cardH + 68], [W - 24 - cardW, topY + cardH + 68]];
    let maxY = topY + cardH;
    d.actors.forEach((a, idx) => {
      const [x0, y0] = coords[idx];
      const tone = hueOf(idx);
      // Soft Studyflix stage card behind motif + label
      boxes.push({ x: x0, y: y0, w: cardW, h: cardH, lines: [], kind: 'soft', tone });
      art.push({ icon: a.icon, subject: a.label, x: x0 + (cardW - artW) / 2, y: y0 + 8, w: artW, h: artH, tone });
      const ll = wrap(a.label, cardW - 16, 14);
      const lh = ll.length * 18 + 8;
      boxes.push({ x: x0 + 6, y: y0 + artH + 10, w: cardW - 12, h: lh, lines: ll, kind: 'node', fs: 14, tone });
      if (a.sub) {
        const sl = wrap(a.sub, cardW - 14, 12);
        boxes.push({ x: x0 + 7, y: y0 + artH + 12 + lh, w: cardW - 14, h: sl.length * 15, lines: sl, kind: 'label', fs: 12 });
      }
      placed.set(a.id, { x: x0, y: y0, w: cardW, h: cardH, cx: x0 + cardW / 2, cy: y0 + cardH / 2 });
      maxY = Math.max(maxY, y0 + cardH);
    });
    const usedPair = new Set<string>();
    d.arrows.forEach((ar, idx) => {
      const A = placed.get(ar.from), B = placed.get(ar.to);
      if (!A || !B) return;
      const opp = d.arrows.some((o) => o.from === ar.to && o.to === ar.from);
      const pairKey = [ar.from, ar.to].sort().join('|');
      const secondOfPair = opp && usedPair.has(pairKey);
      usedPair.add(pairKey);
      const tone = hueOf(idx);
      const dx = B.cx - A.cx, dy = B.cy - A.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist, ny = dx / dist;
      const longJump = n === 3 && Math.abs(dx) > 300;
      const bow = longJump ? 68 : opp ? (secondOfPair ? 34 : -34) : 0;
      const sPt: [number, number] = Math.abs(dx) >= Math.abs(dy)
        ? [A.cx + Math.sign(dx) * (A.w / 2 + 4), A.cy + (opp ? (secondOfPair ? 14 : -14) : longJump ? A.h / 2 + 4 : 0)]
        : [A.cx + (opp ? (secondOfPair ? 16 : -16) : 0), A.cy + Math.sign(dy) * (A.h / 2 + 4)];
      const ePt: [number, number] = Math.abs(dx) >= Math.abs(dy)
        ? [B.cx - Math.sign(dx) * (B.w / 2 + 6), B.cy + (opp ? (secondOfPair ? 14 : -14) : longJump ? B.h / 2 + 4 : 0)]
        : [B.cx + (opp ? (secondOfPair ? 16 : -16) : 0), B.cy - Math.sign(dy) * (B.h / 2 + 6)];
      const mx = (sPt[0] + ePt[0]) / 2 + (longJump ? 0 : nx * bow);
      const my = (sPt[1] + ePt[1]) / 2 + (longJump ? bow : ny * bow);
      if (bow) lines.push({ pts: [sPt, ePt], quad: [mx, my], arrow: true, both: ar.both, dashed: ar.dashed, tone, width: 3 });
      else lines.push({ pts: [sPt, ePt], arrow: true, both: ar.both, dashed: ar.dashed, tone, width: 3 });
      if (ar.label) {
        // Point on quadratic Bezier at t=0.5 is 0.25*P0 + 0.5*Q + 0.25*P1
        const tx = bow ? 0.25 * sPt[0] + 0.5 * mx + 0.25 * ePt[0] : (sPt[0] + ePt[0]) / 2;
        const ty = (bow ? 0.25 * sPt[1] + 0.5 * my + 0.25 * ePt[1] : (sPt[1] + ePt[1]) / 2) + (longJump ? 14 : opp ? (secondOfPair ? 14 : -14) : -14);
        const tb = tag(ar.label, tx, ty, n === 2 ? 190 : 124);
        boxes.push({ ...tb, tone });
        maxY = Math.max(maxY, tb.y + tb.h);
      }
      if (longJump) maxY = Math.max(maxY, my);
    });
    y = maxY + 6;
  } else if (d.type === 'callout') {
    const lefts = d.parts.filter((p) => p.side === 'left');
    const rights = d.parts.filter((p) => p.side === 'right');
    // Balance automatically if all parts ended up on one side
    if (!lefts.length || !rights.length) {
      const allP = [...d.parts];
      lefts.length = 0;
      rights.length = 0;
      allP.forEach((p, idx) => (idx % 2 === 0 ? lefts : rights).push(p));
    }
    const bw = 166;
    const rows = Math.max(lefts.length, rights.length, 2);
    const stepH = 66;
    const blockH = Math.max(138, rows * stepH);
    const artW = 164, artH = 112;
    const cx = W / 2, cy = y + blockH / 2;
    art.push({ icon: d.icon, subject: d.subject, x: cx - artW / 2, y: cy - artH / 2 - 6, w: artW, h: artH, tone: 1 });
    const sl = wrap(d.subject, 170, 13);
    boxes.push({ x: cx - 85, y: cy + artH / 2 - 2, w: 170, h: sl.length * 17, lines: sl, kind: 'bold', fs: 13 });
    let maxY = cy + artH / 2 + sl.length * 17 + 8;
    const placeCol = (col: CalloutPart[], isLeft: boolean, toneStart: number) => {
      const colStep = blockH / Math.max(1, col.length);
      col.forEach((part, idx) => {
        const tone = hueOf(toneStart + idx);
        const py = y + idx * colStep + colStep / 2;
        const pl = wrap(part.label, bw - 18, 14);
        const bh = pl.length * 18 + 14;
        const bx = isLeft ? PAD : W - PAD - bw;
        const by = Math.max(y, py - bh / 2);
        boxes.push({ x: bx, y: by, w: bw, h: bh, lines: pl, kind: 'node', fs: 14, tone });
        let bottom = by + bh;
        if (part.note) {
          const nl = wrap(part.note, bw, 12);
          boxes.push({ x: bx, y: by + bh + 3, w: bw, h: nl.length * 15, lines: nl, kind: 'label', fs: 12 });
          bottom = by + bh + 3 + nl.length * 15;
        }
        maxY = Math.max(maxY, bottom);
        const midY = by + bh / 2;
        const anchorY = cy - artH * 0.34 + (col.length > 1 ? (idx / (col.length - 1)) * (artH * 0.68) : artH * 0.34);
        const anchorX = isLeft ? cx - artW * 0.42 : cx + artW * 0.42;
        const elbowX = isLeft ? bx + bw + 18 : bx - 18;
        const boxEdgeX = isLeft ? bx + bw + 2 : bx - 2;
        lines.push({ pts: [[anchorX, anchorY], [elbowX, midY], [boxEdgeX, midY]], tone, width: 2.2, dotStart: true });
      });
    };
    placeCol(lefts, true, 0);
    placeCol(rights, false, lefts.length);
    y = maxY + 4;
  } else if (d.type === 'illustration') {
    const scaledH = Math.round(((W - 2 * PAD) * d.height) / d.width);
    rawSvg = { svg: d.svg, width: d.width, height: d.height, y };
    y += scaledH;
  }
  // symbols: on the boxes whose label has one (the text was wrapped narrower for it above)
  if (ICON_OF.size)
    for (const b of boxes) {
      if (!b.lines.length || !ICON_KINDS.has(b.kind)) continue;
      const ic = ICON_OF.get(nk(b.lines.join(' ')));
      if (ic) b.icon = ic;
    }
  return { width: W, height: Math.ceil(y + PAD), boxes, lines, areas, ...(art.length ? { art } : {}), ...(rawSvg ? { rawSvg } : {}), fs: NF };
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
/** One colour: accent = filled with white text, node = box fill, stroke = border, line = lines/arrows, soft = very light fill. */
export type Tone = { accent: string; node: string; stroke: string; line: string; soft: string };
/** tones: 1 teal, 2 berry, 3 amber, 4 blue, 5 violet. The single fields are colour 1 (kept for convenience). */
export type Palette = {
  bg?: string; text: string; onAccent: string; muted: string; shadow: string; tones: Tone[];
  node: string; nodeStroke: string; accent: string; soft: string; line: string;
};
const tone = (accent: string, node: string, stroke: string, soft: string): Tone => ({ accent, node, stroke, line: stroke, soft });
const LIGHT: Tone[] = [
  tone('#09817e', '#dff3f2', '#09817e', '#f4fcfc'),
  tone('#a63d73', '#fbe9f2', '#a63d73', '#fdf3f8'),
  tone('#965700', '#fdf0db', '#b06a00', '#fff8ec'),
  tone('#2f5fc4', '#e4ecfb', '#2f5fc4', '#f3f6fd'),
  tone('#6646bd', '#ece6fa', '#6646bd', '#f6f3fd'),
];
const DARK: Tone[] = [
  tone('#1f7a75', '#163634', '#3fc6bf', '#112725'),
  tone('#9c3f76', '#3a1d2e', '#e486bb', '#241520'),
  tone('#94590a', '#3a2a10', '#f0b45a', '#241a0b'),
  tone('#2f55a8', '#18243d', '#7fa5f0', '#111a2c'),
  tone('#5a3fa6', '#251c3d', '#a993f0', '#18132a'),
];
const pal = (tones: Tone[], text: string, muted: string, shadow: string): Palette => ({
  text, muted, shadow, onAccent: '#ffffff', tones,
  node: tones[0].node, nodeStroke: tones[0].stroke, accent: tones[0].accent, soft: tones[0].soft, line: tones[0].line,
});
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: pal(LIGHT, '#002a29', '#4f6f6d', 'rgba(0,42,41,0.16)'),
  dark: pal(DARK, '#e2f4f3', '#9fbfbd', 'rgba(0,0,0,0.55)'),
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n: number) => Math.round(n * 10) / 10;

/** How a graphic is shown while learning: one label covered ("?") or shown as the answer, or built up step by step. */
export type DiagramView = { hide?: number; reveal?: number; steps?: boolean; /** built up step by step: only the first `upto` text boxes are shown */ upto?: number; /** several labels covered, numbered 1, 2, 3 … (labelling tasks) */ hideMany?: number[];
  /** labelling by drag & drop: the term placed on covered box k (shown instead of the number) */ filled?: (string | undefined)[];
  /** after checking: covered box k right (green) or wrong (red) */ marks?: (boolean | undefined)[];
  /** active state index for interactive `forces` diagrams (e.g. Reiseflug / Steigflug / Landung) */ state?: number };

/** A term inside a covered box: as many words per line as fit, at most two lines (the rest shortened). */
function fitLines(text: string, width: number, fs: number): string[] {
  const max = Math.max(4, Math.floor((width - 14) / (fs * 0.55)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(' '));
  return lines.map((l) => (l.length > max ? l.slice(0, max - 1) + '…' : l));
}

/** Kinds of boxes that hold a label one can be asked about (not titles, axis labels or small notes). */
const QUIZ_KINDS = new Set<Box['kind']>(['node', 'node2', 'accent', 'accent2', 'soft']);
/** Text of a box as one string (words broken by wrap() are joined again). */
const boxText = (b: Box) => b.lines.reduce((t, l, i) => (i === 0 ? l : /\p{L}-$/u.test(b.lines[i - 1]) ? t.slice(0, -1) + l : t + ' ' + l), '');
function quizBoxes(L: Layout): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  L.boxes.forEach((b, i) => {
    const t = boxText(b).trim();
    if (!b.lines.length || !QUIZ_KINDS.has(b.kind) || t.length < 2 || /^[\d\s.,%+-]+$/.test(t) || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(i);
  });
  return out;
}

/** The labels of a graphic one can be asked about, in drawing order. */
export function diagramLabels(d: Diagram): string[] {
  const L = layoutDiagram(d);
  return quizBoxes(L).map((i) => boxText(L.boxes[i]));
}

/** Covers label i: the view for the question side, the one for the answer side and the hidden text. */
export function hideLabel(d: Diagram, i: number): { label: string; front: DiagramView; back: DiagramView } | null {
  const labels = diagramLabels(d);
  if (i < 0 || i >= labels.length) return null;
  return { label: labels[i], front: { hide: i }, back: { reveal: i } };
}

/** How many text boxes a graphic has (the steps when it is built up). */
export function diagramBoxCount(d: Diagram): number {
  return layoutDiagram(d).boxes.filter((b) => b.lines.length).length;
}

/** Graphics that read best when they appear box by box. */
export const STEP_TYPES: Diagram['type'][] = ['flow', 'cycle', 'timeline', 'pyramid'];

export function renderDiagram(d: Diagram, p: Palette = PALETTES.light, view?: DiagramView): string {
  const L = layoutDiagram(d, view?.state);
  const quiz = view && (view.hide !== undefined || view.reveal !== undefined || view.hideMany?.length) ? quizBoxes(L) : [];
  const steps = !!view?.steps && STEP_TYPES.includes(d.type);
  let step = 0;
  // ids per colour scheme, so several diagrams on one page never borrow each other's arrow colours
  const id = 'dg' + (p.tones[0].line + p.tones[1].line + (p.bg ?? '')).replace(/[^0-9a-z]/gi, '');
  const tn = (h?: number) => p.tones[(Math.max(1, h ?? 1) - 1) % p.tones.length];
  const out: string[] = [];
  const marker = (name: string, color: string, sz = 8, refX = 9) =>
    `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="${refX}" refY="5" markerWidth="${sz}" markerHeight="${sz}" orient="auto-start-reverse"><path d="M0 1.2 L10 5 L0 8.8 z" fill="${color}"/></marker>`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" font-family="Manrope, Arial, sans-serif" role="img">`,
    `<defs>${p.tones.map((t, i) => marker('a' + (i + 1), t.line) + marker('b' + (i + 1), t.line, 5.5, 7.5)).join('')}${marker('m', p.muted)}<filter id="${id}-s" x="-10%" y="-10%" width="120%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="${p.shadow}"/></filter></defs>`,
  );
  if (p.bg) out.push(`<rect width="100%" height="100%" fill="${p.bg}"/>`);
  for (const a of L.areas) {
    const t = tn(a.hue);
    if (a.circle) {
      const [cx, cy, r] = a.circle;
      out.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${t.line}" fill-opacity="0.16" stroke="${t.line}" stroke-width="2"/>`);
    } else if (a.poly) {
      const fill = a.fill === 'accent' ? t.accent : a.fill === 'soft' ? t.soft : t.node;
      out.push(`<polygon points="${a.poly.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ')}" fill="${fill}" stroke="${a.fill === 'accent' ? fill : t.stroke}" stroke-width="1.4" stroke-linejoin="round" filter="url(#${id}-s)"/>`);
    }
  }
  // Empty soft backdrop cards (used in `scene` behind illustrations) render before art and lines
  const backdrop = (b: Box) => !b.lines.length && b.kind === 'soft';
  for (const b of L.boxes) {
    if (!backdrop(b)) continue;
    const t = tn(b.tone);
    out.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="14" fill="${t.soft}" stroke="${t.stroke}" stroke-width="1.2" stroke-opacity="0.5"/>`);
  }
  if (L.art?.length) {
    for (const item of L.art) {
      const t = tn(item.tone);
      const artPal: IllustrationPalette = {
        accent: t.accent,
        node: t.node,
        stroke: t.stroke,
        text: p.text,
        onAccent: p.onAccent,
        berry: p.tones[1].line,
        amber: p.tones[2].line,
        blue: p.tones[3].line,
        violet: p.tones[4].line,
      };
      const inner = renderIllustration(item.icon, item.subject, item.x, item.y, item.w, item.h, artPal);
      const cx = r1(item.x + item.w / 2), cy = r1(item.y + item.h / 2);
      out.push(item.tilt ? `<g class="dg-art" transform="rotate(${item.tilt} ${cx} ${cy})">${inner}</g>` : `<g class="dg-art">${inner}</g>`);
    }
  }
  if (L.rawSvg) {
    const scale = (L.width - 2 * PAD) / L.rawSvg.width;
    const themed = L.rawSvg.svg
      .replace(/\{\{teal\}\}/g, p.tones[0].line)
      .replace(/\{\{berry\}\}/g, p.tones[1].line)
      .replace(/\{\{amber\}\}/g, p.tones[2].line)
      .replace(/\{\{blue\}\}/g, p.tones[3].line)
      .replace(/\{\{violet\}\}/g, p.tones[4].line)
      .replace(/\{\{text\}\}/g, p.text)
      .replace(/\{\{muted\}\}/g, p.muted)
      .replace(/\{\{soft\}\}/g, p.tones[0].soft)
      .replace(/\{\{node\}\}/g, p.tones[0].node)
      .replace(/\{\{bg\}\}/g, p.bg ?? p.tones[0].soft)
      .replace(/\bid="([\w-]+)"/g, `id="${id}-i-$1"`)
      .replace(/url\(#([\w-]+)\)/g, `url(#${id}-i-$1)`);
    out.push(`<g transform="translate(${PAD} ${r1(L.rawSvg.y)}) scale(${scale.toFixed(4)})">${themed}</g>`);
  }
  for (const l of L.lines) {
    const color = l.muted ? p.muted : tn(l.tone).line;
    const sw = l.width ?? (l.muted && !l.arrow ? 1.5 : l.pts.length > 10 ? 2.6 : 2);
    const toneIdx = ((Math.max(1, l.tone ?? 1) - 1) % p.tones.length) + 1;
    const m = `url(#${id}-${l.muted ? 'm' : (sw >= 3.5 ? 'b' : 'a') + toneIdx})`;
    if (l.quad && l.pts.length === 2) {
      const [[x1, y1], [x2, y2]] = l.pts;
      const [qx, qy] = l.quad;
      out.push(
        `<path class="dg-vec" d="M ${r1(x1)} ${r1(y1)} Q ${r1(qx)} ${r1(qy)} ${r1(x2)} ${r1(y2)}" fill="none" stroke="${color}" stroke-width="${sw}"${l.dashed ? ' stroke-dasharray="6 5"' : ''} stroke-linecap="round"${l.arrow ? ` marker-end="${m}"` : ''}${l.both ? ` marker-start="${m}"` : ''}/>`,
      );
    } else {
      const pts = l.pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
      out.push(
        `<polyline${sw >= 3 ? ' class="dg-vec"' : ''} points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}"${l.dashed ? ' stroke-dasharray="6 5"' : ''} stroke-linejoin="round" stroke-linecap="round"${l.arrow ? ` marker-end="${m}"` : ''}${l.both ? ` marker-start="${m}"` : ''}/>`,
      );
    }
    if (l.dotStart && l.pts.length) {
      out.push(`<circle cx="${r1(l.pts[0][0])}" cy="${r1(l.pts[0][1])}" r="3.6" fill="${color}"/>`);
    }
  }
  const isMatrixY = (b: Box) => d.type === 'matrix' && b.kind === 'label' && b.w < 40;
  const drawBox = (b: Box, bi: number) => {
    if (backdrop(b)) return;
    const qi = quiz.indexOf(bi);
    const many = qi >= 0 && view?.hideMany ? view.hideMany.indexOf(qi) : -1;
    if (qi >= 0 && (qi === view?.hide || many >= 0)) {
      // the covered label: dashed frame with a number (or the term placed on it); a drop target for labelling
      const t1 = tn(1);
      const term = many >= 0 ? view?.filled?.[many] : undefined;
      const mark = many >= 0 ? view?.marks?.[many] : undefined;
      const line = mark === true ? '#1f9d6b' : mark === false ? '#d93f3f' : t1.line;
      const cx = r1(b.x + b.w / 2), cy = r1(b.y + b.h / 2);
      out.push(
        `${many >= 0 ? `<g class="dg-slot" data-slot="${many}">` : ''}<rect class="dg-hidden" x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="${r1(Math.min(12, b.h / 2))}" fill="${t1.soft}" stroke="${line}" stroke-width="2.5"${term ? '' : ' stroke-dasharray="7 5"'}/>`,
      );
      if (term) {
        const fs = 13;
        const lines = fitLines(term, b.w, fs);
        const top = cy - ((lines.length - 1) * (fs + 3)) / 2;
        out.push(
          `<text x="${cx}" font-size="${fs}" font-weight="700" fill="${p.text}" text-anchor="middle" dominant-baseline="middle">${lines.map((l, k) => `<tspan x="${cx}" y="${r1(top + k * (fs + 3))}">${esc(l)}</tspan>`).join('')}</text>`,
        );
      } else {
        out.push(`<text x="${cx}" y="${cy}" font-size="22" font-weight="800" fill="${t1.line}" text-anchor="middle" dominant-baseline="middle">${many >= 0 ? many + 1 : '?'}</text>`);
      }
      if (many >= 0) out.push('</g>');
      return;
    }
    const t = tn(b.tone ?? (b.kind === 'node2' || b.kind === 'accent2' ? 2 : 1));
    const fill = b.kind === 'accent' || b.kind === 'accent2' ? t.accent : b.kind === 'node' || b.kind === 'node2' ? t.node : b.kind === 'soft' || b.kind === 'tag' ? t.soft : null;
    if (fill) {
      const stroke = b.kind === 'node' || b.kind === 'node2' || b.kind === 'soft' || b.kind === 'tag' ? t.stroke : null;
      const raised = b.lines.length && (b.kind === 'node' || b.kind === 'accent' || b.kind === 'node2' || b.kind === 'accent2');
      const rx = !b.lines.length ? 4 : b.kind === 'tag' ? b.h / 2 : 12;
      out.push(
        `<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="${r1(Math.min(rx, b.h / 2))}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${b.kind === 'soft' || b.kind === 'tag' ? 1 : 1.5}"` : ''}${raised ? ` filter="url(#${id}-s)"` : ''}/>`,
      );
    }
    if (!b.lines.length) return;
    const color = b.kind === 'accent' || b.kind === 'accent2' || b.kind === 'textOn' ? p.onAccent : b.kind === 'label' ? p.muted : p.text;
    const fs = b.fs ?? (b.kind === 'bold' ? (d.title && b.y === PAD ? 17 : 14) : b.kind === 'soft' ? (d.type === 'compare' ? 14 : 13) : b.kind === 'label' ? 13 : L.fs);
    const lh = b.kind === 'tag' ? fs + 3 : b.fs ? Math.round(b.fs * 1.3) : b.kind === 'soft' ? (d.type === 'compare' ? 19 : 17) : b.kind === 'label' ? 17 : b.kind === 'bold' ? 22 : Math.round(L.fs * 1.3);
    const weight = b.kind === 'accent' || b.kind === 'accent2' || b.kind === 'bold' || b.kind === 'textOn' ? 700 : b.kind === 'tag' ? 600 : 500;
    if (isMatrixY(b)) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      out.push(`<text x="${r1(cx)}" y="${r1(cy)}" font-size="13" fill="${p.muted}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${r1(cx)} ${r1(cy)})">${esc(b.lines[0])}</text>`);
      return;
    }
    const start = b.align === 'start';
    let x = start ? b.x + (b.kind === 'label' ? 0 : 10) : b.align === 'end' ? b.x + b.w - 4 : b.x + b.w / 2;
    const glyph = b.icon ? ICONS[b.icon] : undefined;
    if (glyph) {
      // symbol right before the text (left in the box for left-aligned text)
      const textW = Math.max(...b.lines.map((l) => l.length)) * charW(fs);
      const ix = start ? b.x + 8 : Math.max(b.x + 6, b.x + b.w / 2 - (18 + 6 + textW) / 2);
      x = start ? x + IW : ix + IW + textW / 2;
      const ink = b.kind === 'accent' || b.kind === 'accent2' || b.kind === 'textOn' ? p.onAccent : t.stroke;
      out.push(`<g transform="translate(${r1(ix)} ${r1(b.y + b.h / 2 - 9)}) scale(0.75)" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`);
    }
    const top = b.y + b.h / 2 - ((b.lines.length - 1) * lh) / 2;
    const spans = b.lines.map((t, i) => `<tspan x="${r1(x)}" y="${r1(top + i * lh)}">${esc(t)}</tspan>`).join('');
    out.push(`<text font-size="${fs}" font-weight="${weight}" fill="${color}" text-anchor="${start ? 'start' : b.align === 'end' ? 'end' : 'middle'}" dominant-baseline="middle">${spans}</text>`);
    if (qi >= 0 && qi === view?.reveal)
      out.push(`<rect class="dg-reveal" x="${r1(b.x - 3)}" y="${r1(b.y - 3)}" width="${r1(b.w + 6)}" height="${r1(b.h + 6)}" rx="${r1(Math.min(14, b.h / 2 + 3))}" fill="none" stroke="${tn(1).line}" stroke-width="3"/>`);
  };
  let shown = 0;
  L.boxes.forEach((b, bi) => {
    const mark = out.length;
    drawBox(b, bi);
    if (view?.upto !== undefined && out.length > mark && b.lines.length) {
      // built up step by step: boxes from number `upto` on are hidden (they fade in when it is their turn)
      const on = shown++ < view.upto;
      out.splice(mark, 0, `<g class="dg-build${on ? ' on' : ''}"${on ? '' : ' opacity="0.06"'}>`);
      out.push('</g>');
    } else if (steps && out.length > mark && b.lines.length) {
      out.splice(mark, 0, `<g class="dg-step" style="animation-delay:${(step++ * 0.15).toFixed(2)}s">`);
      out.push('</g>');
    }
  });
  out.push('</svg>');
  return out.join('');
}

// ---------- storing in card HTML ----------
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Placeholder stored on the card; Merkora draws it when the card is shown (in the current colour scheme). */
export const diagramHtml = (d: Diagram) => `<div class="diagram" data-diagram="${escAttr(JSON.stringify(d))}"></div>`;

/** The graphics of card HTML shown with a view (covered label, step by step) – only for showing, never saved. */
export function withDiagramView(html: string, view: DiagramView, onlyFirst = false): string {
  let n = 0;
  return html.replace(/<div class="diagram" data-diagram="/g, (m) => (onlyFirst && n++ ? m : `<div class="diagram" data-view="${escAttr(JSON.stringify(view))}" data-diagram="`));
}

/**
 * "Grafik beschriften" while learning: covers one label of the first graphic of the answer.
 * Returns that graphic for the question side (with "?"), the answer with the label marked, and the label;
 * null when the answer has no graphic with at least 3 labels. `seed` picks the label (stable per card and round).
 */
export function graphicQuiz(answerHtml: string, seed: number): { graphic: string; answer: string; label: string } | null {
  const m = DIAGRAM_RE.exec(answerHtml);
  if (!m) return null;
  let d: Diagram | null = null;
  try {
    d = parseDiagram(JSON.parse(unescAttr(m[1])));
  } catch {
    return null;
  }
  if (!d) return null;
  const labels = diagramLabels(d);
  if (labels.length < 3) return null;
  const h = hideLabel(d, Math.abs(Math.floor(seed)) % labels.length)!;
  return {
    graphic: withDiagramView(m[0], h.front),
    answer: withDiagramView(answerHtml, h.back, true),
    label: h.label,
  };
}

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
/** Symbols named to the AI (a short list keeps the instruction small; all ICON_NAMES are still accepted). */
export const RULE_ICONS = ['person', 'gruppe', 'gehirn', 'idee', 'frage', 'warnung', 'haken', 'kreuz', 'uhr', 'kalender', 'geld', 'trend', 'ziel', 'suche', 'chat', 'megafon', 'fernseher', 'smartphone', 'internet', 'zeitung', 'buch', 'schule', 'herz', 'gesundheit', 'firma', 'gesetz', 'politik', 'natur', 'wasser', 'zahnrad', 'daten', 'dokument', 'liste', 'waage', 'forschung', 'experiment', 'rechnen', 'wachstum', 'austausch', 'beziehung', 'erfolg', 'schutz', 'gesellschaft', 'familie', 'technik', 'loesung', 'medizin', 'stufen'];

/** What the AI is told when cards may get a graphic: describe it, never draw it. Kept short – it goes with every card request. */
export const DIAGRAM_RULE = `Grafiken: Gib etwa jeder dritten Karte ein Feld "diagram" – wo das Material Abläufe, Kräfte, Akteure, Aufbau, Modelle, Gliederungen, Vergleiche, Zahlen, Formeln oder Zusammenhänge enthält; keine bei reinen Begriffen/Fakten. Beschriftungen: Stichworte, höchstens 6 Wörter. Formen:
forces {"subject":"Flugzeug","icon":"flugzeug","vectors":[{"dir":"up","label":"Auftrieb"},{"dir":"down","label":"Gewicht"}]} Kräfte/Richtungen (dir: up|down|left|right; nie concept!)
scene {"actors":[{"id":"a","label":"Käufer","icon":"person"},{"id":"b","label":"Verkäufer","icon":"fabrik"}],"arrows":[{"from":"a","to":"b","label":"Geld"}]} 2–4 Akteure · callout {"subject":"Zelle","icon":"zelle","parts":[{"side":"left","label":"Kern"},{"side":"right","label":"Membran"}]} 2–6 Teile
flow {"steps":["…","…"]} Ablauf 2–8 · cycle {"steps":[…]} Kreislauf 3–8
hierarchy {"root":"…","children":[{"label":"…","children":["…"]}]} Gliederung, bis 5 Äste à 4
compare {"columns":[{"title":"…","items":["…"]}]} Vergleich, 2–3 Spalten · venn {"sets":[{"label":"…","items":[…]},{…}],"shared":[…]}
timeline {"events":[{"when":"1990","label":"…"}]} · concept {"center":"…","branches":[…]} 3–8 Merkmale
matrix {"x":"…","y":"…","cells":["o.l.","o.r.","u.l.","u.r."]} Vierfelder/SWOT · pyramid {"levels":["Spitze",…,"Basis"]} 3–6
model {"nodes":["A","B","M"],"links":[{"from":"A","to":"B","label":"+"},{"from":"M","to":"A -> B","label":"moderiert"}]} Pfeile zwischen Begriffen/Variablen, 2–8; optional "both":true, "dashed":true
network {"nodes":[…],"links":[{"from":"A","to":"B","label":"…"}]} Begriffsnetz 3–8 · decision {"question":"…?","yes":"…","no":{"question":"…?","yes":"…","no":"…"}}
bars {"unit":"%","bars":[{"label":"…","value":42}]} · pie {"slices":[{"label":"…","value":40},…]} – nur Zahlen aus dem Material
plot {"x":{"label":"…","min":0,"max":10},"y":{…},"functions":[{"label":"…","expr":"10 - x"}],"points":[{"x":5,"label":"…"}]} exakte Kurve aus Formel in x (+-*/^ sqrt exp ln log sin cos pi e), bis 3
axes {"x":"…","y":"…","shape":"steigend|fallend|u|umgekehrtes-u|s-kurve|linear"} Verlauf ohne Formel
fishbone {"effect":"…","causes":[{"label":"…","items":["…"]}]} Ursache-Wirkung · numberline {"min":0,"max":14,"marks":[{"value":7,"label":"…"}],"ranges":[{"from":0,"to":7,"label":"…"}]}
Immer mit "type" und "title". Optional "highlight":"Kasten" und "icons":{"Beschriftung":"symbol"}; Symbole: ${RULE_ICONS.join(',')}.`;

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
  { id: 'forces', label: 'Kräfte & Richtungen am Objekt' },
  { id: 'scene', label: 'Bildhafte Szene (Akteure & Pfeile)' },
  { id: 'callout', label: 'Objekt-Aufbau (Beschriftung)' },
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
  { id: 'plot', label: 'Exakte Kurve (Formel)' },
  { id: 'pie', label: 'Kreisdiagramm' },
  { id: 'fishbone', label: 'Ursache-Wirkung (Ishikawa)' },
  { id: 'numberline', label: 'Zahlenstrahl / Skala' },
  { id: 'network', label: 'Begriffsnetz mit Beziehungen' },
];
