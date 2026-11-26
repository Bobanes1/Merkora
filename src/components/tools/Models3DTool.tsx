import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  MODELS_3D,
  type Model3DCat,
  type Model3DDef,
  type Model3DScene,
} from '../../lib/models3d';
import { parseCustom3DFile } from '../../lib/modelImport';
import { applyExplode, projectWebGL3D, WebGL3DRenderer } from '../../lib/webgl3d';
import { IconPause, IconPlay, IconRefresh, IconUpload } from '../Icons';

const CATS: ('Alle' | Model3DCat)[] = ['Alle', 'Biologie', 'Chemie', 'Physik', 'Astronomie', 'Mathematik'];

/**
 * Interactive 60-FPS GPU WebGL2 3D Models Studio:
 * - Hardware PBR-style 3-point lighting, Fresnel rim glow, Z-buffer & translucent X-Ray glass pass
 * - 12 built-in scientific models + custom .obj / .pdb / .xyz 3D file import
 * - Removable anatomical/structural layers, 0–100 % Exploded View slider, and interactive 3D Quiz mode
 */
export function Models3DTool() {
  const [cat, setCat] = useState<'Alle' | Model3DCat>('Alle');
  const [modelId, setModelId] = useState(MODELS_3D[0].id);
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [customModel, setCustomModel] = useState<{ name: string; scene: Model3DScene } | null>(null);
  const [customError, setCustomError] = useState('');
  const [autoSpin, setAutoSpin] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [xray, setXray] = useState(false);
  const [explode, setExplode] = useState(0);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [activeSpot, setActiveSpot] = useState<string | null>(null);
  const [quizOn, setQuizOn] = useState(false);
  const [quizTargetId, setQuizTargetId] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quizScore, setQuizScore] = useState({ right: 0, total: 0 });
  const [webglReady, setWebglReady] = useState(true);

  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rotRef = useRef<[number, number]>([MODELS_3D[0].defaultRot[0], MODELS_3D[0].defaultRot[1]]);
  const velRef = useRef<[number, number]>([0, 0]);
  const dragRef = useRef<{ down: boolean; x: number; y: number; moved: boolean }>({ down: false, x: 0, y: 0, moved: false });
  const spotsScreenRef = useRef<{ id: string; x: number; y: number }[]>([]);

  const builtInModel = useMemo(() => MODELS_3D.find((m) => m.id === modelId) ?? MODELS_3D[0], [modelId]);
  const model: Model3DDef = useMemo(() => {
    if (customModel) {
      return {
        id: '__custom__',
        title: customModel.name,
        category: 'Chemie',
        summary: 'Eigenes 3D-Modell / Molekül – lokal per WebGL2 gerendert.',
        defaultRot: [0.32, 0.55],
        build: () => customModel.scene,
      };
    }
    return builtInModel;
  }, [builtInModel, customModel]);

  const currentVariant = variantId && model.variants?.some((v) => v.id === variantId) ? variantId : model.variants?.[0]?.id;
  const filteredModels = useMemo(() => MODELS_3D.filter((m) => cat === 'Alle' || m.category === cat), [cat]);
  const hiddenSet = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);

  const staticScene = useMemo(() => model.build(0, currentVariant), [model, currentVariant]);
  const visibleHotspots = useMemo(
    () => staticScene.hotspots.filter((h) => !h.layer || !hiddenSet.has(h.layer)),
    [staticScene, hiddenSet],
  );
  const selectedHotspot = visibleHotspots.find((h) => h.id === activeSpot) ?? visibleHotspots[0] ?? null;

  const pickNextQuiz = (spots: typeof visibleHotspots, excludeId?: string | null) => {
    const pool = spots.filter((s) => s.id !== excludeId);
    const list = pool.length ? pool : spots;
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)].id;
  };

  const resetViewFor = (next: Model3DDef) => {
    setActiveSpot(null);
    setHiddenLayers([]);
    setExplode(0);
    setXray(false);
    setZoom(1);
    setQuizOn(false);
    setQuizTargetId(null);
    setQuizFeedback(null);
    rotRef.current = [next.defaultRot[0], next.defaultRot[1]];
    velRef.current = [0, 0];
  };

  const selectModel = (id: string) => {
    const next = MODELS_3D.find((m) => m.id === id);
    if (!next) return;
    setCustomModel(null);
    setCustomError('');
    setModelId(next.id);
    setVariantId(next.variants?.[0]?.id);
    resetViewFor(next);
  };

  const toggleLayer = (id: string) => {
    setHiddenLayers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const startOrStopQuiz = () => {
    if (quizOn) {
      setQuizOn(false);
      setQuizTargetId(null);
      setQuizFeedback(null);
      return;
    }
    if (visibleHotspots.length < 2) return;
    setQuizOn(true);
    setQuizScore({ right: 0, total: 0 });
    setQuizFeedback(null);
    setActiveSpot(null);
    setQuizTargetId(pickNextQuiz(visibleHotspots, null));
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setCustomError('');
    try {
      const text = await file.text();
      const scene = parseCustom3DFile(file.name, text);
      setCustomModel({ name: file.name, scene });
      resetViewFor({
        id: '__custom__',
        title: file.name,
        category: 'Chemie',
        summary: '',
        defaultRot: [0.32, 0.55],
        build: () => scene,
      });
    } catch (e) {
      setCustomError((e as Error).message || 'Datei konnte nicht als 3D-Modell gelesen werden.');
    }
  };

  // Persistent WebGL2 renderer lifecycle
  const rendererRef = useRef<WebGL3DRenderer | null>(null);
  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    if (!glCanvas) return;
    const r = WebGL3DRenderer.create(glCanvas);
    rendererRef.current = r;
    setWebglReady(Boolean(r));
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
      const w = Math.max(280, Math.round(rect.width));
      const h = Math.max(260, Math.round(rect.height));
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
        if (autoSpin && !reduced) rotRef.current[1] += 0.0052;
        rotRef.current[0] = Math.max(-1.45, Math.min(1.45, rotRef.current[0] + velRef.current[0]));
        rotRef.current[1] += velRef.current[1];
        velRef.current[0] *= 0.91;
        velRef.current[1] *= 0.91;
      }

      const [rx, ry] = rotRef.current;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const scene = model.build(t, currentVariant);

      // 1. Hardware-accelerated WebGL2 PBR-shaded 3D geometry pass
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.render(scene, pw, ph, {
          rx,
          ry,
          zoom,
          isDark,
          activeSpot: quizOn ? null : activeSpot,
          hiddenLayers: hiddenSet,
          explode,
          xray,
        });
      }

      // 2. Crisp Retina 2D HUD overlay pass (atom labels, hotspot pins & quiz markers)
      const ctx = hudCanvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const expMap = scene.layerExplode ?? {};

        // Atom / planet short labels projected onto spheres
        if (showLabels && !quizOn) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const prim of scene.primitives) {
            if (prim.kind !== 'sphere' || !prim.label) continue;
            const lk = prim.layer ?? prim.partId;
            if (lk && hiddenSet.has(lk)) continue;
            const pos = applyExplode(prim.pos, prim.explode ?? (lk ? expMap[lk] : undefined), explode);
            const pp = projectWebGL3D(pos, rx, ry, w, h, zoom);
            const sr = prim.r * pp.scale;
            if (sr < 11) continue;
            ctx.font = `700 ${Math.min(13, Math.max(10, Math.round(sr * 0.52)))}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillText(prim.label, pp.x + 1, pp.y + 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(prim.label, pp.x, pp.y);
          }
        }

        // Interactive hotspot pins (always shown in Quiz mode without text labels!)
        const screenSpots: { id: string; x: number; y: number }[] = [];
        if (showLabels || quizOn) {
          for (const hs of scene.hotspots) {
            const lk = hs.layer ?? hs.id;
            if (lk && hiddenSet.has(lk)) continue;
            const pos = applyExplode(hs.pos, expMap[lk], explode);
            const pp = projectWebGL3D(pos, rx, ry, w, h, zoom);
            screenSpots.push({ id: hs.id, x: pp.x, y: pp.y });
            const isSel = !quizOn && activeSpot === hs.id;

            ctx.save();
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, isSel || quizOn ? 9 : 6.5, 0, Math.PI * 2);
            ctx.fillStyle = isSel ? hs.color : isDark ? 'rgba(12, 22, 22, 0.88)' : 'rgba(255, 255, 255, 0.94)';
            ctx.fill();
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = quizOn ? '#f59e0b' : hs.color;
            ctx.stroke();

            if (quizOn) {
              ctx.fillStyle = isDark ? '#fef3c7' : '#92400e';
              ctx.font = '700 11px system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('?', pp.x, pp.y + 0.5);
            } else {
              ctx.font = '600 11.5px system-ui, sans-serif';
              const tw = ctx.measureText(hs.label).width;
              const bx = Math.min(w - tw - 18, pp.x + 11);
              const by = Math.max(8, Math.min(h - 28, pp.y - 11));
              ctx.fillStyle = isDark ? 'rgba(12, 22, 22, 0.86)' : 'rgba(255, 255, 255, 0.92)';
              ctx.strokeStyle = isSel ? hs.color : isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.16)';
              ctx.lineWidth = isSel ? 1.6 : 1;
              ctx.beginPath();
              if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw + 12, 21, 6);
              else ctx.rect(bx, by, tw + 12, 21);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = isDark ? '#e6f4f3' : '#0f172a';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'left';
              ctx.fillText(hs.label, bx + 6, by + 10.5);
            }
            ctx.restore();
          }
        }
        spotsScreenRef.current = screenSpots;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [model, currentVariant, autoSpin, showLabels, zoom, activeSpot, hiddenSet, explode, xray, quizOn]);

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
    if (!hit) return;
    if (quizOn && quizTargetId) {
      const target = visibleHotspots.find((h) => h.id === quizTargetId);
      const clicked = visibleHotspots.find((h) => h.id === hit.id);
      if (hit.id === quizTargetId) {
        setQuizScore((s) => ({ right: s.right + 1, total: s.total + 1 }));
        setQuizFeedback({ ok: true, msg: `Richtig! ${target?.label ?? ''}` });
        setQuizTargetId(pickNextQuiz(visibleHotspots, quizTargetId));
      } else {
        setQuizScore((s) => ({ right: s.right, total: s.total + 1 }));
        setQuizFeedback({ ok: false, msg: `Das war „${clicked?.label ?? ''}“ – gesucht ist „${target?.label ?? ''}“.` });
      }
      return;
    }
    setActiveSpot((cur) => (cur === hit.id ? null : hit.id));
  };

  const quizTarget = quizOn && quizTargetId ? visibleHotspots.find((h) => h.id === quizTargetId) : null;
  const hasLayers = Boolean(model.layers?.length);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Interaktive 3D-Modelle {webglReady && <span className="badge">WebGL2</span>}</h2>
          <p className="muted small">
            {MODELS_3D.length} zerlegbare 3D-Modelle mit Echtzeit-Beleuchtung, Röntgen-Modus, 3D-Quiz &amp; eigenem .obj/.pdb/.xyz-Import – 100 % offline.
          </p>
        </div>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".obj,.pdb,.xyz"
            style={{ display: 'none' }}
            onChange={(e) => {
              void handleImportFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn outline sm" onClick={() => fileRef.current?.click()} title="Eigenes 3D-Modell (.obj) oder Molekül (.pdb, .xyz) laden">
            <IconUpload size={13} /> .obj / .pdb laden
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setAutoSpin((v) => !v)}>
            {autoSpin ? <IconPause size={13} /> : <IconPlay size={13} />} {autoSpin ? 'Stopp' : 'Drehen'}
          </button>
          <button type="button" className={'chip' + (showLabels ? ' on' : '')} onClick={() => setShowLabels((v) => !v)}>
            Labels
          </button>
          <button type="button" className={'chip' + (xray ? ' on' : '')} onClick={() => setXray((v) => !v)} title="Röntgen- / Glas-Ansicht">
            Röntgen
          </button>
          {visibleHotspots.length >= 2 && (
            <button type="button" className={'chip' + (quizOn ? ' on' : '')} onClick={startOrStopQuiz}>
              3D-Quiz
            </button>
          )}
          <button type="button" className="btn ghost sm" onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))} aria-label="Verkleinern">
            −
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))} aria-label="Vergrößern">
            +
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => resetViewFor(model)}
            title="Ansicht zurücksetzen"
          >
            <IconRefresh size={13} /> Reset
          </button>
        </div>
      </div>

      {customError && <p className="form-error" style={{ marginBottom: 10 }}>{customError}</p>}

      <div className="chips" style={{ marginBottom: 10 }}>
        {CATS.map((c) => (
          <button key={c} type="button" className={'chip' + (cat === c && !customModel ? ' on' : '')} onClick={() => (setCustomModel(null), setCat(c))}>
            {c}
          </button>
        ))}
        {customModel && (
          <span className="chip on">Eigene Datei: {customModel.name}</span>
        )}
      </div>

      <div className="m3d-layout">
        <div className="m3d-list">
          {filteredModels.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`m3d-card${!customModel && m.id === builtInModel.id ? ' on' : ''}`}
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

          {hasLayers && (
            <div className="m3d-pro-bar">
              <div className="m3d-layers">
                <small className="muted">Schichten:</small>
                {model.layers!.map((l) => {
                  const visible = !hiddenSet.has(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`chip sm${visible ? ' on' : ''}`}
                      onClick={() => toggleLayer(l.id)}
                      title={visible ? `${l.label} ausblenden` : `${l.label} einblenden`}
                    >
                      <i className="m3d-layer-dot" style={{ background: l.color }} aria-hidden="true" />
                      {l.label}
                    </button>
                  );
                })}
              </div>
              <label className="m3d-explode">
                <small className="muted">Explosion</small>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={explode}
                  onChange={(e) => setExplode(Number(e.target.value))}
                  aria-label="Explosionsansicht"
                />
                <small className="muted">{Math.round(explode * 100)}%</small>
              </label>
            </div>
          )}

          {quizOn && quizTarget && (
            <div className="m3d-quiz-banner">
              <div>
                <small className="muted">3D-Quiz ({quizScore.right}/{quizScore.total} richtig)</small>
                <b>Finde im 3D-Modell: {quizTarget.label}</b>
                {quizFeedback && (
                  <small className={quizFeedback.ok ? 'm3d-q-ok' : 'm3d-q-err'}>{quizFeedback.msg}</small>
                )}
              </div>
              <button type="button" className="btn ghost sm" onClick={startOrStopQuiz}>
                Quiz beenden
              </button>
            </div>
          )}

          <div className="m3d-canvas-wrap m3d-studio-bg">
            <canvas ref={glCanvasRef} className="m3d-canvas m3d-gl-canvas" />
            <canvas
              ref={hudCanvasRef}
              className="m3d-canvas m3d-hud-canvas"
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
            <span className="m3d-hint">
              {quizOn
                ? 'Drehe das Modell und klicke den gesuchten ?-Punkt an'
                : 'Ziehen zum Drehen · Scrollen zum Zoomen · Punkte anklicken'}
            </span>
          </div>

          {!quizOn && (
            <div className="m3d-info">
              <div className="chips" style={{ marginTop: 0 }}>
                {visibleHotspots.map((hs) => (
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
          )}
        </div>
      </div>
    </section>
  );
}
