import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTES } from '../lib/diagram';
import { CHAR, ICON_W, mindmapLayout, type Map, type Node, type Pt } from '../lib/mindmapLayout';
import { ICONS } from '../lib/diagramIcons';
import { useStore, type Deck } from '../lib/store';
import { MindmapInfo } from './MindmapInfo';
import { useResolvedTheme } from '../lib/theme';

type View = { x: number; y: number; k: number };

/**
 * The mind map to explore, read from left to right: branches fold out with a click and everything glides
 * to its new place; drag to move (never so far that the map is lost), wheel or buttons to zoom.
 * A click on a point offers the matching cards.
 */
export function MindmapView({ map, deck, onCards }: { map: Map; deck: Deck; onCards: (term: string) => void }) {
  const theme = useResolvedTheme();
  const pal = PALETTES[theme];
  const animOn = useStore((s) => s.data.settings.animations !== false);
  const still = !animOn || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const nodes = useMemo(() => mindmapLayout(map, open), [map, open]);
  const [sel, setSel] = useState<Node | null>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const wrapRef = useRef<HTMLDivElement>(null);
  // what is drawn: current place and visibility of every box, and the camera – all glide towards their goal
  const cur = useRef(new globalThis.Map<string, { x: number; y: number; o: number }>());
  const view = useRef<View>({ x: 0, y: 0, k: 0.8 });
  const goal = useRef<View>({ x: 0, y: 0, k: 0.8 });
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Camera goal that shows everything that is open. */
  const fit = () => {
    const shown = nodes.filter((n) => n.shown);
    const xs = shown.flatMap((n) => [n.home.x - n.w / 2, n.home.x + n.w / 2]);
    const ys = shown.flatMap((n) => [n.home.y - n.h / 2, n.home.y + n.h / 2]);
    const bw = Math.max(...xs) - Math.min(...xs) + 60, bh = Math.max(...ys) - Math.min(...ys) + 60;
    const k = Math.min(1.15, Math.max(0.3, Math.min(size.w / bw, size.h / bh)));
    goal.current = { k, x: -((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: -((Math.max(...ys) + Math.min(...ys)) / 2) * k };
  };
  // the camera follows when branches open or close (and on resize)
  useEffect(fit, [nodes, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // one loop while something moves: gliding to new places and fading in/out
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const near = (a: number, b: number) => Math.abs(a - b) < 0.3;
    const step = (now: number) => {
      const a = still ? 1 : Math.min(1, ((now - last) / 1000) * 7);
      last = now;
      let moving = false;
      for (const n of nodes) {
        const target = { x: n.home.x, y: n.home.y, o: n.shown ? 1 : 0 };
        const c = cur.current.get(n.id) ?? (n.kind === 'leaf' ? { ...target, o: 0 } : target);
        const next = { x: c.x + (target.x - c.x) * a, y: c.y + (target.y - c.y) * a, o: c.o + (target.o - c.o) * a };
        if (!near(next.x, target.x) || !near(next.y, target.y) || Math.abs(next.o - target.o) > 0.01) moving = true;
        else Object.assign(next, target);
        cur.current.set(n.id, next);
      }
      const v = view.current, g = goal.current;
      view.current = { x: v.x + (g.x - v.x) * a, y: v.y + (g.y - v.y) * a, k: v.k + (g.k - v.k) * a };
      if (!near(view.current.x, g.x) || !near(view.current.y, g.y) || Math.abs(view.current.k - g.k) > 0.002) moving = true;
      else view.current = g;
      setT(now);
      if (moving && !still) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, still, size.w, size.h]);

  void t; // redraw trigger of the loop
  const place = (n: Node) => cur.current.get(n.id) ?? { x: n.home.x, y: n.home.y, o: n.shown ? 1 : 0 };
  const tone = (n: Node) => pal.tones[(n.hue - 1) % pal.tones.length];

  const toggle = (i: number) =>
    setOpen((s) => {
      const nx = new Set(s);
      if (nx.has(i)) nx.delete(i);
      else nx.add(i);
      return nx;
    });
  const all = (on: boolean) => {
    setOpen(on ? new Set(map.branches.map((_, i) => i)) : new Set());
    setSel(null);
  };

  // dragging and zooming (they set the camera directly) – the map always stays at least partly in view
  /** Is at least one box well inside the visible area with this camera? */
  const seen = (v: View) => {
    const m = 60;
    return nodes.some((n) => {
      if (!n.shown) return false;
      const l = size.w / 2 + v.x + (n.home.x - n.w / 2) * v.k, r = size.w / 2 + v.x + (n.home.x + n.w / 2) * v.k;
      const t2 = size.h / 2 + v.y + (n.home.y - n.h / 2) * v.k, b = size.h / 2 + v.y + (n.home.y + n.h / 2) * v.k;
      return r > m && l < size.w - m && b > m && t2 < size.h - m;
    });
  };
  /** The camera as close to `v` as possible while some of the map stays in view (the map stops at the edge). */
  const keepInView = (v: View): View => {
    if (seen(v)) return v;
    const from = view.current;
    if (!seen(from)) return goal.current;
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (seen({ x: from.x + (v.x - from.x) * mid, y: from.y + (v.y - from.y) * mid, k: from.k + (v.k - from.k) * mid })) lo = mid;
      else hi = mid;
    }
    return { x: from.x + (v.x - from.x) * lo, y: from.y + (v.y - from.y) * lo, k: from.k + (v.k - from.k) * lo };
  };
  const setCam = (v: View) => {
    const c = keepInView(v);
    view.current = c;
    goal.current = c;
    setT((x) => x + 0.0001);
  };
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    // clicks on boxes or in the panel of a term are not drags
    if ((e.target as Element).closest('.mm-node, .mm-info')) return;
    drag.current = { x: e.clientX, y: e.clientY, v: view.current, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setCam({ ...d.v, x: d.v.x + dx, y: d.v.y + dy });
  };
  const onUp = () => {
    if (drag.current && !drag.current.moved) setSel(null);
    drag.current = null;
  };
  const zoom = (f: number, cx = 0, cy = 0) => {
    const v = view.current;
    const k = Math.min(2.2, Math.max(0.3, v.k * f));
    const r = k / v.k;
    setCam({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
  };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      // scrolling inside the panel of a term scrolls the panel, not the map
      if ((e.target as Element).closest?.('.mm-info')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const drawn = nodes.map((n) => ({ n, p: place(n) })).filter(({ p }) => p.o > 0.01);
  const at = new globalThis.Map(drawn.map((d) => [d.n.id, d.p]));
  const center = nodes[0];
  const link = (a: Pt, b: Pt) => {
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  };
  const vw = view.current;

  return (
    <div className="mm">
      <div className="mm-tools">
        <span className="muted small">Klicke auf einen Ast zum Aufklappen · ziehen zum Verschieben · Mausrad zum Zoomen</span>
        <span className="grow" />
        <button type="button" className="btn ghost sm" onClick={() => all(true)}>
          Alle aufklappen
        </button>
        <button type="button" className="btn ghost sm" onClick={() => all(false)}>
          Alle zuklappen
        </button>
        <button type="button" className="icon-btn" aria-label="Verkleinern" onClick={() => zoom(1 / 1.2)}>
          −
        </button>
        <button type="button" className="icon-btn" aria-label="Vergrößern" onClick={() => zoom(1.2)}>
          +
        </button>
        <button type="button" className="btn ghost sm" onClick={fit}>
          Einpassen
        </button>
      </div>
      <div ref={wrapRef} className="mm-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <svg width={size.w} height={size.h} role="group" aria-label={`Mindmap: ${map.center}`}>
          <g transform={`translate(${size.w / 2 + vw.x} ${size.h / 2 + vw.y}) scale(${vw.k})`}>
            {/* links behind the boxes */}
            {drawn
              .filter(({ n }) => n.kind !== 'center')
              .map(({ n, p }) => {
                const parent = n.kind === 'branch' ? center : nodes.find((x) => x.id === `b${n.branch}`)!;
                const pp = at.get(parent.id) ?? p;
                // from the right edge of the parent to the left edge of the box (read left to right)
                const from = { x: pp.x + parent.w / 2, y: pp.y };
                const to = { x: Math.max(from.x, p.x - n.w / 2), y: p.y };
                const o = p.o;
                return <path key={'l' + n.id} d={link(from, to)} fill="none" stroke={tone(n).line} strokeWidth={n.kind === 'branch' ? 3.5 : 2} strokeLinecap="round" opacity={o * (n.kind === 'branch' ? 0.85 : 0.7)} />;
              })}
            {drawn.map(({ n, p }) => {
              const tn = tone(n);
              const filled = n.kind !== 'leaf';
              const fill = n.kind === 'center' ? pal.tones[0].accent : filled ? tn.accent : tn.node;
              const ink = filled ? pal.onAccent : pal.text;
              const lh = Math.round(n.fs * 1.3);
              const textW = Math.max(...n.lines.map((l) => l.length)) * n.fs * CHAR;
              const start = -(textW + (n.icon ? ICON_W : 0)) / 2;
              const tx = start + (n.icon ? ICON_W : 0) + textW / 2;
              const o = p.o;
              const isOpen = n.kind === 'branch' && open.has(n.branch);
              const glyph = n.icon ? ICONS[n.icon] : undefined;
              return (
                <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={o}>
                  <g
                    className={'mm-node mm-' + n.kind + (sel?.id === n.id ? ' sel' : '')}
                    role="button"
                    tabIndex={0}
                    aria-label={n.label}
                    aria-expanded={n.kind === 'branch' ? isOpen : undefined}
                    onClick={() => {
                      if (n.kind === 'branch') toggle(n.branch);
                      if (n.kind === 'center') all(open.size < map.branches.length);
                      else setSel(n);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
                      }
                    }}
                  >
                    <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={n.kind === 'leaf' ? 10 : 14} fill={fill} stroke={filled ? 'none' : tn.stroke} strokeWidth="1.5" className="mm-box" />
                    {glyph && (
                      <g
                        transform={`translate(${start - 1} ${-9}) scale(0.75)`}
                        fill="none"
                        stroke={filled ? pal.onAccent : tn.stroke}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dangerouslySetInnerHTML={{ __html: glyph }}
                      />
                    )}
                    <text fontSize={n.fs} fontWeight={filled ? 700 : 500} fill={ink} textAnchor="middle" dominantBaseline="middle">
                      {n.lines.map((l, i) => (
                        <tspan key={i} x={tx} y={(i - (n.lines.length - 1) / 2) * lh}>
                          {l}
                        </tspan>
                      ))}
                    </text>
                    {n.kind === 'branch' && map.branches[n.branch].children.length > 0 && (
                      <g transform={`translate(${(n.home.x < 0 ? -1 : 1) * (n.w / 2 - 2)} ${-n.h / 2 + 2})`}>
                        <circle r="10" fill={pal.tones[0].soft} stroke={tn.stroke} strokeWidth="1.5" />
                        <text fontSize="13" fontWeight="700" fill={tn.stroke} textAnchor="middle" dominantBaseline="central">
                          {isOpen ? '−' : map.branches[n.branch].children.length}
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        {sel && sel.kind !== 'center' && (
          <MindmapInfo
            key={sel.id}
            deck={deck}
            term={sel.label}
            branch={sel.kind === 'leaf' ? map.branches[sel.branch]?.label ?? '' : sel.label}
            subPoints={sel.kind === 'leaf' ? undefined : map.branches[sel.branch]?.children}
            map={map}
            onCards={onCards}
          />
        )}
      </div>
    </div>
  );
}
