import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  faceNormal,
  MODELS_3D,
  project3D,
  rotate3D,
  type Model3DCat,
  type Vec3,
} from '../../lib/models3d';
import { IconPause, IconPlay, IconRefresh } from '../Icons';

const CATS: ('Alle' | Model3DCat)[] = ['Alle', 'Biologie', 'Chemie', 'Physik', 'Astronomie', 'Mathematik'];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shadeHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r * factor)}, ${clamp(g * factor)}, ${clamp(b * factor)})`;
}

function mixWhite(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r + (255 - r) * ratio)}, ${clamp(g + (255 - g) * ratio)}, ${clamp(b + (255 - b) * ratio)})`;
}

/** Interactive 60-FPS 3D Models Studio with mouse/touch orbit rotation, zoom, variants & clickable German hotspots. */
export function Models3DTool() {
  const [cat, setCat] = useState<'Alle' | Model3DCat>('Alle');
  const [modelId, setModelId] = useState(MODELS_3D[0].id);
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [autoSpin, setAutoSpin] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [activeSpot, setActiveSpot] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef<[number, number]>([MODELS_3D[0].defaultRot[0], MODELS_3D[0].defaultRot[1]]);
  const velRef = useRef<[number, number]>([0, 0]);
  const dragRef = useRef<{ down: boolean; x: number; y: number; moved: boolean }>({ down: false, x: 0, y: 0, moved: false });
  const spotsScreenRef = useRef<{ id: string; x: number; y: number }[]>([]);

  const model = useMemo(() => MODELS_3D.find((m) => m.id === modelId) ?? MODELS_3D[0], [modelId]);
  const currentVariant = variantId && model.variants?.some((v) => v.id === variantId) ? variantId : model.variants?.[0]?.id;
  const filteredModels = useMemo(() => MODELS_3D.filter((m) => cat === 'Alle' || m.category === cat), [cat]);

  const selectModel = (id: string) => {
    const next = MODELS_3D.find((m) => m.id === id);
    if (!next) return;
    setModelId(next.id);
    setVariantId(next.variants?.[0]?.id);
    setActiveSpot(null);
    setZoom(1);
    rotRef.current = [next.defaultRot[0], next.defaultRot[1]];
    velRef.current = [0, 0];
  };

  // Keep current hotspots metadata accessible for detail panel
  const staticScene = useMemo(() => model.build(0, currentVariant), [model, currentVariant]);
  const selectedHotspot = staticScene.hotspots.find((h) => h.id === activeSpot) ?? staticScene.hotspots[0] ?? null;

  useEffect(() => {
    let raf = 0;
    const startMs = performance.now();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const frame = (nowMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(280, Math.round(rect.width));
      const h = Math.max(260, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const t = reduced ? 0 : (nowMs - startMs) / 1000;
      if (!dragRef.current.down) {
        if (autoSpin && !reduced) rotRef.current[1] += 0.0055;
        rotRef.current[0] = Math.max(-1.45, Math.min(1.45, rotRef.current[0] + velRef.current[0]));
        rotRef.current[1] += velRef.current[1];
        velRef.current[0] *= 0.91;
        velRef.current[1] *= 0.91;
      }

      const [rx, ry] = rotRef.current;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Clean subtle radial studio backdrop
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      bg.addColorStop(0, isDark ? '#142423' : '#f4faf9');
      bg.addColorStop(1, isDark ? '#0a1212' : '#e6f0ef');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const fov = Math.min(w, h) * 0.96;
      const scene = model.build(t, currentVariant);

      type DrawItem = { z: number; draw: () => void };
      const drawList: DrawItem[] = [];

      const rotP = (p: Vec3) => rotate3D(p, rx, ry);
      const proj = (p: Vec3) => project3D(p, cx, cy, fov, 5.4, zoom);

      for (const prim of scene.primitives) {
        const dimmed = activeSpot && prim.partId && prim.partId !== activeSpot;
        const baseAlpha = (prim.alpha ?? 1) * (dimmed ? 0.25 : 1);

        if (prim.kind === 'sphere') {
          const rp = rotP(prim.pos);
          const pp = proj(rp);
          const sr = Math.max(1.5, prim.r * pp.scale);
          drawList.push({
            z: pp.z,
            draw: () => {
              ctx.save();
              ctx.globalAlpha = baseAlpha;
              // Optional planetary ring (Saturn)
              if (prim.ring) {
                ctx.save();
                ctx.translate(pp.x, pp.y);
                ctx.rotate(prim.ring.tilt);
                ctx.beginPath();
                ctx.ellipse(0, 0, prim.ring.rOuter * pp.scale, prim.ring.rOuter * pp.scale * 0.34, 0, 0, Math.PI * 2);
                ctx.strokeStyle = prim.ring.color;
                ctx.lineWidth = Math.max(2, (prim.ring.rOuter - prim.ring.rInner) * pp.scale * 0.55);
                ctx.globalAlpha = baseAlpha * 0.72;
                ctx.stroke();
                ctx.restore();
              }
              if (prim.glow) {
                const gl = ctx.createRadialGradient(pp.x, pp.y, sr * 0.2, pp.x, pp.y, sr * 2.0);
                gl.addColorStop(0, prim.color);
                gl.addColorStop(1, 'transparent');
                ctx.fillStyle = gl;
                ctx.globalAlpha = baseAlpha * 0.32;
                ctx.beginPath();
                ctx.arc(pp.x, pp.y, sr * 2.0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = baseAlpha;
              }
              // Phong-style 3D sphere shading (specular top-left highlight + deep shadow)
              const grad = ctx.createRadialGradient(pp.x - sr * 0.32, pp.y - sr * 0.34, sr * 0.08, pp.x, pp.y, sr);
              grad.addColorStop(0, mixWhite(prim.color, 0.72));
              grad.addColorStop(0.45, prim.color);
              grad.addColorStop(1, shadeHex(prim.color, 0.38));
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(pp.x, pp.y, sr, 0, Math.PI * 2);
              ctx.fill();

              if (prim.label && showLabels && sr >= 8) {
                ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
                ctx.font = `700 ${Math.min(13, Math.max(10, Math.round(sr * 0.58)))}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(prim.label, pp.x, pp.y);
              }
              ctx.restore();
            },
          });
        } else if (prim.kind === 'bond') {
          const ra = rotP(prim.a);
          const rb = rotP(prim.b);
          const pa = proj(ra);
          const pb = proj(rb);
          const midZ = (pa.z + pb.z) / 2;
          const lw = Math.max(1.5, prim.radius * 2 * ((pa.scale + pb.scale) / 2));
          drawList.push({
            z: midZ,
            draw: () => {
              ctx.save();
              ctx.globalAlpha = baseAlpha;
              ctx.strokeStyle = prim.color;
              ctx.lineCap = 'round';
              if (prim.double) {
                const dx = pb.x - pa.x;
                const dy = pb.y - pa.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = (-dy / len) * (lw * 0.45);
                const ny = (dx / len) * (lw * 0.45);
                ctx.lineWidth = lw * 0.55;
                ctx.beginPath();
                ctx.moveTo(pa.x + nx, pa.y + ny);
                ctx.lineTo(pb.x + nx, pb.y + ny);
                ctx.moveTo(pa.x - nx, pa.y - ny);
                ctx.lineTo(pb.x - nx, pb.y - ny);
                ctx.stroke();
              } else {
                ctx.lineWidth = lw;
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
              }
              ctx.restore();
            },
          });
        } else if (prim.kind === 'curve' && prim.pts.length > 1) {
          const rPts = prim.pts.map(rotP);
          const pPts = rPts.map(proj);
          const avgZ = pPts.reduce((s, p) => s + p.z, 0) / pPts.length;
          drawList.push({
            z: avgZ,
            draw: () => {
              ctx.save();
              ctx.globalAlpha = baseAlpha;
              ctx.strokeStyle = prim.color;
              ctx.lineWidth = prim.width * Math.max(0.75, zoom * 0.95);
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              if (prim.dashed) ctx.setLineDash([6, 6]);
              ctx.beginPath();
              ctx.moveTo(pPts[0].x, pPts[0].y);
              for (let i = 1; i < pPts.length; i++) ctx.lineTo(pPts[i].x, pPts[i].y);
              ctx.stroke();
              ctx.restore();
            },
          });
        } else if (prim.kind === 'face' && prim.pts.length >= 3) {
          const rPts = prim.pts.map(rotP);
          const pPts = rPts.map(proj);
          const avgZ = pPts.reduce((s, p) => s + p.z, 0) / pPts.length;
          const n = faceNormal(rPts);
          // Lambert lighting from top-left-front light vector
          const light = Math.abs(n[0] * -0.4 + n[1] * 0.65 + n[2] * 0.65);
          const shade = 0.55 + light * 0.65;
          drawList.push({
            z: avgZ,
            draw: () => {
              ctx.save();
              ctx.globalAlpha = baseAlpha;
              ctx.fillStyle = shadeHex(prim.fill, shade);
              ctx.beginPath();
              ctx.moveTo(pPts[0].x, pPts[0].y);
              for (let i = 1; i < pPts.length; i++) ctx.lineTo(pPts[i].x, pPts[i].y);
              ctx.closePath();
              ctx.fill();
              if (prim.stroke) {
                ctx.strokeStyle = prim.stroke;
                ctx.lineWidth = 1.6;
                ctx.stroke();
              }
              ctx.restore();
            },
          });
        }
      }

      // Painter's algorithm: farthest first (smallest z -> largest z)
      drawList.sort((a, b) => a.z - b.z);
      for (const item of drawList) item.draw();

      // Render interactive hotspot pins on top
      const screenSpots: { id: string; x: number; y: number }[] = [];
      if (showLabels) {
        for (const hs of scene.hotspots) {
          const pp = proj(rotP(hs.pos));
          screenSpots.push({ id: hs.id, x: pp.x, y: pp.y });
          const isSel = activeSpot === hs.id;
          ctx.save();
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, isSel ? 8.5 : 6.5, 0, Math.PI * 2);
          ctx.fillStyle = isSel ? hs.color : isDark ? 'rgba(15, 25, 25, 0.85)' : 'rgba(255,255,255,0.92)';
          ctx.fill();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = hs.color;
          ctx.stroke();

          ctx.font = '600 11.5px system-ui, sans-serif';
          const tw = ctx.measureText(hs.label).width;
          const bx = pp.x + 11;
          const by = pp.y - 11;
          ctx.fillStyle = isDark ? 'rgba(12, 22, 22, 0.84)' : 'rgba(255, 255, 255, 0.9)';
          ctx.strokeStyle = isSel ? hs.color : isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)';
          ctx.lineWidth = isSel ? 1.5 : 1;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw + 12, 21, 6);
          else ctx.rect(bx, by, tw + 12, 21);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isDark ? '#e6f4f3' : '#0f172a';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(hs.label, bx + 6, by + 10.5);
          ctx.restore();
        }
      }
      spotsScreenRef.current = screenSpots;

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [model, currentVariant, autoSpin, showLabels, zoom, activeSpot]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { down: true, x: e.clientX, y: e.clientY, moved: false };
    velRef.current = [0, 0];
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.down) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    rotRef.current[1] += dx * 0.0085;
    rotRef.current[0] = Math.max(-1.45, Math.min(1.45, rotRef.current[0] + dy * 0.0085));
    velRef.current = [dy * 0.003, dx * 0.003];
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const wasClick = !dragRef.current.moved;
    dragRef.current.down = false;
    if (!wasClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = spotsScreenRef.current.find((s) => Math.hypot(s.x - mx, s.y - my) < 28);
    if (hit) setActiveSpot((cur) => (cur === hit.id ? null : hit.id));
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Interaktive 3D-Modelle</h2>
          <p className="muted small">Mit Maus oder Finger frei drehen, zoomen und Punkte anklicken – alle 8 Modelle laufen 100 % offline.</p>
        </div>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost sm" onClick={() => setAutoSpin((v) => !v)}>
            {autoSpin ? <IconPause size={13} /> : <IconPlay size={13} />} {autoSpin ? 'Drehung stoppen' : 'Auto-Drehung'}
          </button>
          <button type="button" className={'chip' + (showLabels ? ' on' : '')} onClick={() => setShowLabels((v) => !v)}>
            Labels
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))} aria-label="Verkleinern">
            −
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setZoom((z) => Math.min(1.7, Number((z + 0.15).toFixed(2))))} aria-label="Vergrößern">
            +
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              rotRef.current = [model.defaultRot[0], model.defaultRot[1]];
              velRef.current = [0, 0];
              setZoom(1);
              setActiveSpot(null);
            }}
            title="Ansicht zurücksetzen"
          >
            <IconRefresh size={13} /> Reset
          </button>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 10 }}>
        {CATS.map((c) => (
          <button key={c} type="button" className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="m3d-layout">
        <div className="m3d-list">
          {filteredModels.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`m3d-card${m.id === model.id ? ' on' : ''}`}
              onClick={() => selectModel(m.id)}
            >
              <small className="muted">{m.category}</small>
              <b>{m.title}</b>
            </button>
          ))}
        </div>

        <div className="m3d-stage-col">
          {model.variants && (
            <div className="chips" style={{ marginTop: 0 }}>
              {model.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={'chip' + (currentVariant === v.id ? ' on' : '')}
                  onClick={() => {
                    setVariantId(v.id);
                    setActiveSpot(null);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div className="m3d-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="m3d-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                dragRef.current.down = false;
              }}
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.max(0.65, Math.min(1.7, Number((z - Math.sign(e.deltaY) * 0.08).toFixed(2)))));
              }}
            />
            <span className="m3d-hint">Ziehen zum Drehen · Scrollen zum Zoomen · Punkte anklicken</span>
          </div>

          <div className="m3d-info">
            <div className="chips" style={{ marginTop: 0 }}>
              {staticScene.hotspots.map((hs) => (
                <button
                  key={hs.id}
                  type="button"
                  className={'chip' + (selectedHotspot?.id === hs.id ? ' on' : '')}
                  onClick={() => setActiveSpot((cur) => (cur === hs.id ? null : hs.id))}
                >
                  {hs.label}
                </button>
              ))}
            </div>
            {selectedHotspot ? (
              <p className="m3d-note">
                <b>{selectedHotspot.label}:</b> {selectedHotspot.note}
              </p>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                {model.summary}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
