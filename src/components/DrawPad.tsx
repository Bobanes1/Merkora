import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Modal } from './Modal';

type Tool = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser';
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pen', label: 'Stift', icon: '✎' },
  { id: 'line', label: 'Linie', icon: '╱' },
  { id: 'arrow', label: 'Pfeil', icon: '➜' },
  { id: 'rect', label: 'Rechteck', icon: '▭' },
  { id: 'ellipse', label: 'Kreis', icon: '◯' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'eraser', label: 'Radierer', icon: '⌫' },
];
const COLORS = ['#002a29', '#09817e', '#e5484d', '#f07d1a', '#f2b84b', '#02b6b2', '#4aa8ff', '#ffffff'];
const W = 960;
const H = 600;

/** A small drawing board for sketches, diagrams and labelled figures on cards. */
export function DrawPad({ onClose, onSave }: { onClose: () => void; onSave: (png: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[1]);
  const [width, setWidth] = useState(4);
  const [fill, setFill] = useState(false);
  const [grid, setGrid] = useState(false);
  const [text, setText] = useState('Beschriftung');
  const [canUndo, setCanUndo] = useState(false);
  const history = useRef<ImageData[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const snap = useRef<ImageData | null>(null);

  const ctx = () => canvasRef.current!.getContext('2d')!;

  useEffect(() => {
    const c = ctx();
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, H);
  }, []);

  const pos = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const pushHistory = () => {
    history.current.push(ctx().getImageData(0, 0, W, H));
    if (history.current.length > 30) history.current.shift();
    setCanUndo(true);
  };

  const style = (c: CanvasRenderingContext2D) => {
    c.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    c.fillStyle = color;
    c.lineWidth = tool === 'eraser' ? width * 5 : width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
  };

  const shape = (c: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) => {
    style(c);
    c.beginPath();
    if (tool === 'line' || tool === 'arrow') {
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      if (tool === 'arrow') {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = 12 + width * 3;
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.x - len * Math.cos(ang - 0.45), b.y - len * Math.sin(ang - 0.45));
        c.lineTo(b.x - len * Math.cos(ang + 0.45), b.y - len * Math.sin(ang + 0.45));
        c.closePath();
        c.fill();
      }
    } else if (tool === 'rect') {
      c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      if (fill) {
        c.globalAlpha = 0.25;
        c.fill();
        c.globalAlpha = 1;
      }
      c.stroke();
    } else if (tool === 'ellipse') {
      c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      if (fill) {
        c.globalAlpha = 0.25;
        c.fill();
        c.globalAlpha = 1;
      }
      c.stroke();
    }
  };

  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    pushHistory();
    const c = ctx();
    if (tool === 'text') {
      if (!text.trim()) return;
      c.fillStyle = color;
      c.font = `600 ${14 + width * 4}px Manrope, Arial, sans-serif`;
      c.textBaseline = 'middle';
      c.fillText(text, p.x, p.y);
      return;
    }
    start.current = p;
    if (tool === 'pen' || tool === 'eraser') {
      style(c);
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + 0.01, p.y);
      c.stroke();
    } else snap.current = c.getImageData(0, 0, W, H);
  };

  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!start.current) return;
    const p = pos(e);
    const c = ctx();
    if (tool === 'pen' || tool === 'eraser') {
      c.lineTo(p.x, p.y);
      c.stroke();
    } else if (snap.current) {
      c.putImageData(snap.current, 0, 0);
      shape(c, start.current, p);
    }
  };

  const up = () => {
    start.current = null;
    snap.current = null;
  };

  const undo = () => {
    const last = history.current.pop();
    if (last) ctx().putImageData(last, 0, 0);
    setCanUndo(history.current.length > 0);
  };

  const clear = () => {
    pushHistory();
    const c = ctx();
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, H);
  };

  const save = () => {
    canvasRef.current!.toBlob((b) => b && onSave(b), 'image/png');
  };

  return (
    <Modal
      wide
      title="Grafik zeichnen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Auf die Karte setzen
          </button>
        </>
      }
    >
      <div className="draw-tools" role="toolbar" aria-label="Zeichenwerkzeuge">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={`tool-btn ${tool === t.id ? 'on' : ''}`} title={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
            <span aria-hidden="true">{t.icon}</span> <span className="tool-name">{t.label}</span>
          </button>
        ))}
        <span className="draw-sep" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${color === c ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={`Farbe ${c}`}
            onClick={() => setColor(c)}
          />
        ))}
        <span className="draw-sep" />
        <label className="draw-range">
          Stärke
          <input type="range" min={1} max={12} value={width} onChange={(e) => setWidth(+e.target.value)} />
        </label>
        <label className="draw-check">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Füllen
        </label>
        <label className="draw-check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Raster
        </label>
        <span className="grow" />
        <button type="button" className="tool-btn" onClick={undo} disabled={!canUndo}>
          ↶ Rückgängig
        </button>
        <button type="button" className="tool-btn" onClick={clear}>
          Leeren
        </button>
      </div>
      {tool === 'text' && (
        <input className="input draw-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text, dann auf die Fläche klicken" aria-label="Text zum Platzieren" />
      )}
      <div className={`draw-stage ${grid ? 'grid' : ''}`}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={`draw-canvas tool-${tool}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>
      <p className="muted small">Tipp: Formen mit gedrückter Maustaste aufziehen. Mit „Text“ klickst du Beschriftungen an die richtige Stelle.</p>
    </Modal>
  );
}
