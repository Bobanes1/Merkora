import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MODELS_3D } from '../../lib/models3d';
import type { LabSpec } from '../../lib/practice';
import { applyExplode, projectWebGL3D, WebGL3DRenderer } from '../../lib/webgl3d';
import { IconPause, IconPlay, IconRefresh } from '../Icons';

type Model3DLabSpec = Extract<LabSpec, { type: 'model3d' }>;

/**
 * Compact embedded WebGL2 3D Model viewer for Skill lessons & Practice sets.
 * Starts preconfigured on the lesson's model, variant, and optional focus hotspot,
 * with interactive orbit rotation, zoom, removable layers, exploded view, and X-Ray mode.
 */
export function Model3DLab({ spec }: { spec: Model3DLabSpec }) {
  const model = useMemo(() => MODELS_3D.find((m) => m.id === spec.modelId) ?? MODELS_3D[0], [spec.modelId]);
  const [variantId, setVariantId] = useState<string | undefined>(() =>
    spec.variantId && model.variants?.some((v) => v.id === spec.variantId) ? spec.variantId : model.variants?.[0]?.id,
  );
  const [autoSpin, setAutoSpin] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [xray, setXray] = useState(false);
  const [explode, setExplode] = useState(0);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [activeSpot, setActiveSpot] = useState<string | null>(spec.focusPart ?? null);

  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGL3DRenderer | null>(null);
  const rotRef = useRef<[number, number]>([model.defaultRot[0], model.defaultRot[1]]);
  const velRef = useRef<[number, number]>([0, 0]);
  const dragRef = useRef<{ down: boolean; x: number; y: number; moved: boolean }>({ down: false, x: 0, y: 0, moved: false });
  const spotsScreenRef = useRef<{ id: string; x: number; y: number }[]>([]);

  const currentVariant = variantId && model.variants?.some((v) => v.id === variantId) ? variantId : model.variants?.[0]?.id;
  const hiddenSet = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const staticScene = useMemo(() => model.build(0, currentVariant), [model, currentVariant]);
  const visibleHotspots = useMemo(
    () => staticScene.hotspots.filter((h) => !h.layer || !hiddenSet.has(h.layer)),
    [staticScene, hiddenSet],
  );
  const selectedHotspot = visibleHotspots.find((h) => h.id === activeSpot) ?? visibleHotspots[0] ?? null;

  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    if (!glCanvas) return;
    const r = WebGL3DRenderer.create(glCanvas);
    rendererRef.current = r;
    return () => {
      r?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const startMs = performance.now();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const frame = (nowMs: number) => {
      const glCanvas = glCanvasRef.current;
      const hudCanvas = hudCanvasRef.current;
      if (!glCanvas || !hudCanvas) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = hudCanvas.getBoundingClientRect();
      const w = Math.max(240, Math.round(rect.width));
      const h = Math.max(220, Math.round(rect.height));
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (glCanvas.width !== pw || glCanvas.height !== ph) {
        glCanvas.width = pw;
        glCanvas.height = ph;
      }
      if (hudCanvas.width !== pw || hudCanvas.height !== ph) {
        hudCanvas.width = pw;
        hudCanvas.height = ph;
      }

      const t = reduced ? 0 : (nowMs - startMs) / 1000;
      if (!dragRef.current.down) {
        if (autoSpin && !reduced) rotRef.current[1] += 0.005;
        rotRef.current[0] = Math.max(-1.45, Math.min(1.45, rotRef.current[0] + velRef.current[0]));
        rotRef.current[1] += velRef.current[1];
        velRef.current[0] *= 0.91;
        velRef.current[1] *= 0.91;
      }

      const [rx, ry] = rotRef.current;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const scene = model.build(t, currentVariant);

      rendererRef.current?.render(scene, pw, ph, {
        rx,
        ry,
        zoom,
        isDark,
        activeSpot,
        hiddenLayers: hiddenSet,
        explode,
        xray,
      });

      const ctx = hudCanvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const expMap = scene.layerExplode ?? {};
        const screenSpots: { id: string; x: number; y: number }[] = [];
        if (showLabels) {
          for (const hs of scene.hotspots) {
            const lk = hs.layer ?? hs.id;
            if (lk && hiddenSet.has(lk)) continue;
            const pos = applyExplode(hs.pos, expMap[lk], explode);
            const pp = projectWebGL3D(pos, rx, ry, w, h, zoom);
            screenSpots.push({ id: hs.id, x: pp.x, y: pp.y });
            const isSel = activeSpot === hs.id;

            ctx.save();
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, isSel ? 8 : 6, 0, Math.PI * 2);
            ctx.fillStyle = isSel ? hs.color : isDark ? 'rgba(12, 22, 22, 0.88)' : 'rgba(255, 255, 255, 0.94)';
            ctx.fill();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = hs.color;
            ctx.stroke();

            ctx.font = '600 11px system-ui, sans-serif';
            const tw = ctx.measureText(hs.label).width;
            const bx = Math.min(w - tw - 16, pp.x + 10);
            const by = Math.max(8, Math.min(h - 26, pp.y - 10));
            ctx.fillStyle = isDark ? 'rgba(12, 22, 22, 0.86)' : 'rgba(255, 255, 255, 0.92)';
            ctx.strokeStyle = isSel ? hs.color : isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.16)';
            ctx.lineWidth = isSel ? 1.5 : 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw + 10, 20, 6);
            else ctx.rect(bx, by, tw + 10, 20);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = isDark ? '#e6f4f3' : '#0f172a';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(hs.label, bx + 5, by + 10);
            ctx.restore();
          }
        }
        spotsScreenRef.current = screenSpots;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [model, currentVariant, autoSpin, showLabels, zoom, activeSpot, hiddenSet, explode, xray]);

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
    const hit = spotsScreenRef.current.find((s) => Math.hypot(s.x - mx, s.y - my) < 26);
    if (hit) setActiveSpot((cur) => (cur === hit.id ? null : hit.id));
  };

  const toggleLayer = (id: string) => {
    setHiddenLayers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  return (
    <div className="m3d-lab">
      <div className="row-gap" style={{ flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="chips" style={{ margin: 0 }}>
          {model.variants?.map((v) => (
            <button
              key={v.id}
              type="button"
              className={'chip sm' + (currentVariant === v.id ? ' on' : '')}
              onClick={() => (setVariantId(v.id), setActiveSpot(null))}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost sm" onClick={() => setAutoSpin((v) => !v)}>
            {autoSpin ? <IconPause size={12} /> : <IconPlay size={12} />} {autoSpin ? 'Stopp' : 'Drehen'}
          </button>
          <button type="button" className={'chip sm' + (showLabels ? ' on' : '')} onClick={() => setShowLabels((v) => !v)}>
            Labels
          </button>
          <button type="button" className={'chip sm' + (xray ? ' on' : '')} onClick={() => setXray((v) => !v)}>
            Röntgen
          </button>
          <button
            type="button"
            className="btn ghost sm"
            title="Ansicht zurücksetzen"
            onClick={() => {
              rotRef.current = [model.defaultRot[0], model.defaultRot[1]];
              velRef.current = [0, 0];
              setZoom(1);
              setExplode(0);
              setXray(false);
              setHiddenLayers([]);
              setActiveSpot(spec.focusPart ?? null);
            }}
          >
            <IconRefresh size={12} />
          </button>
        </div>
      </div>

      {model.layers && model.layers.length > 0 && (
        <div className="m3d-pro-bar" style={{ marginBottom: 8 }}>
          <div className="m3d-layers">
            <small className="muted">Schichten:</small>
            {model.layers.map((l) => {
              const visible = !hiddenSet.has(l.id);
              return (
                <button key={l.id} type="button" className={`chip sm${visible ? ' on' : ''}`} onClick={() => toggleLayer(l.id)}>
                  <i className="m3d-layer-dot" style={{ background: l.color }} aria-hidden="true" />
                  {l.label}
                </button>
              );
            })}
          </div>
          <label className="m3d-explode">
            <small className="muted">Explosion</small>
            <input type="range" min={0} max={1} step={0.02} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="Explosionsansicht" />
            <small className="muted">{Math.round(explode * 100)}%</small>
          </label>
        </div>
      )}

      <div className="m3d-canvas-wrap m3d-studio-bg">
        <canvas ref={glCanvasRef} className="m3d-canvas m3d-canvas-embed m3d-gl-canvas" />
        <canvas
          ref={hudCanvasRef}
          className="m3d-canvas m3d-canvas-embed m3d-hud-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragRef.current.down = false;
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(0.65, Math.min(1.8, Number((z - Math.sign(e.deltaY) * 0.08).toFixed(2)))));
          }}
        />
        <span className="m3d-hint">Ziehen zum Drehen · Scrollen zum Zoomen · Punkte anklicken</span>
      </div>

      <div className="m3d-info" style={{ marginTop: 8 }}>
        <div className="chips" style={{ marginTop: 0 }}>
          {visibleHotspots.map((hs) => (
            <button
              key={hs.id}
              type="button"
              className={'chip sm' + (selectedHotspot?.id === hs.id ? ' on' : '')}
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
  );
}
