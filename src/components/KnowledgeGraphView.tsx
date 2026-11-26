/**
 * Interactive 0-token Knowledge Graph & Forgetting-Radar ("Vergessens-Radar") for a course/module.
 * Renders decks, concept clusters, and skills on a crisp HiDPI canvas colored by FSRS recall probability R(t),
 * with a live time slider projecting retention forward up to the next exam date.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { examAt, upcomingExams } from '../lib/exams';
import { atRiskCardIds, buildCourseGraph, type GraphNode } from '../lib/knowledgeGraph';
import { deckUrl, useData } from '../lib/store';
import { DAY } from '../lib/util';
import { IconPlay, IconTarget } from './Icons';
import { StudySession, type SessionItem } from './StudySession';

function colorForRetention(pct: number): string {
  if (pct >= 85) return '#2f9e69';
  if (pct >= 65) return '#d69e2e';
  if (pct >= 45) return '#e07a3d';
  return '#d9485f';
}

export function KnowledgeGraphView({ courseId }: { courseId?: string }) {
  const data = useData();
  const [daysAhead, setDaysAhead] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<{ title: string; items: SessionItem[] } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const now = Date.now();
  const nextExam = useMemo(() => {
    const all = upcomingExams(data, now);
    if (!courseId) return all[0];
    return all.find((e) => e.courseIds?.includes(courseId) || e.deckIds.some((id) => data.decks.find((d) => d.id === id)?.courseId === courseId)) ?? all[0];
  }, [data, courseId, now]);

  const examDays = useMemo(() => {
    if (!nextExam) return null;
    const diff = Math.max(1, Math.round((examAt(nextExam) - now) / DAY));
    return Math.min(60, diff);
  }, [nextExam, now]);

  const targetAt = now + daysAhead * DAY;
  const graph = useMemo(() => buildCourseGraph(data, courseId, targetAt), [data, courseId, targetAt]);
  const selected = useMemo(() => graph.nodes.find((n) => n.id === selectedId) ?? null, [graph.nodes, selectedId]);
  const riskItems = useMemo(() => atRiskCardIds(graph, 65), [graph]);

  // Draw crisp HiDPI canvas graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(280, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue('--ink').trim() || '#002a29';
    const muted = style.getPropertyValue('--muted').trim() || '#757575';
    const surface = style.getPropertyValue('--white').trim() || '#ffffff';
    const border = style.getPropertyValue('--line').trim() || 'rgba(128,128,128,0.22)';

    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const rx = (w - 110) / 2;
    const ry = (h - 90) / 2;

    const pos = new Map<string, { x: number; y: number; r: number }>();
    for (const n of graph.nodes) {
      const r = n.kind === 'deck' ? 21 : n.kind === 'skill' ? 18 : 13;
      pos.set(n.id, {
        x: cx + n.x * rx,
        y: cy + n.y * ry,
        r,
      });
    }

    // Draw edges
    ctx.lineCap = 'round';
    for (const e of graph.edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const highlight = selectedId && (e.from === selectedId || e.to === selectedId);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = highlight ? ink : border;
      ctx.globalAlpha = highlight ? 0.55 : 0.7;
      ctx.lineWidth = highlight ? 2 : Math.min(2, 0.8 + e.strength * 0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw nodes
    for (const n of graph.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const col = colorForRetention(n.retention);
      const isSel = n.id === selectedId;

      if (isSel) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.lineWidth = isSel ? 3.2 : n.kind === 'deck' ? 2.6 : 2;
      ctx.strokeStyle = col;
      ctx.stroke();

      // Subtle inner fill tint
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r - 2, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Retention % inside larger nodes
      if (p.r >= 17) {
        ctx.fillStyle = ink;
        ctx.font = '600 10px Manrope, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${n.retention}%`, p.x, p.y);
      }

      // Label below node
      const label = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label;
      ctx.fillStyle = isSel ? ink : muted;
      ctx.font = `${isSel || n.kind === 'deck' ? '600' : '500'} 11px Manrope, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, p.x, p.y + p.r + 5);
    }
  }, [graph, selectedId]);

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = (rect.width - 110) / 2;
    const ry = (rect.height - 90) / 2;

    let hit: GraphNode | null = null;
    let bestD = 32;
    for (const n of graph.nodes) {
      const nx = cx + n.x * rx;
      const ny = cy + n.y * ry;
      const d = Math.hypot(x - nx, y - ny);
      if (d < bestD) {
        bestD = d;
        hit = n;
      }
    }
    setSelectedId(hit ? hit.id : null);
  };

  if (session) {
    return <StudySession title={session.title} items={session.items} onExit={() => setSession(null)} />;
  }

  if (!graph.nodes.length) {
    return (
      <div className="empty">
        <b>Noch kein Wissens-Graph</b>
        <p className="muted">Erstelle zuerst Decks oder Skills in diesem Modul – Merkora vernetzt sie automatisch lokal.</p>
      </div>
    );
  }

  const selDeck = selected?.deckId ? data.decks.find((d) => d.id === selected.deckId) : undefined;

  return (
    <div className="kg-wrap">
      <div className="kg-head">
        <div>
          <b>Wissens-Graph &amp; Vergessens-Radar</b>
          <p className="muted small">
            Ø Abrufwahrscheinlichkeit {daysAhead === 0 ? 'heute' : `in ${daysAhead} Tagen`}: <b>{graph.avgRetention} %</b>
            {graph.atRiskNodes > 0 ? ` · ${graph.atRiskNodes} Knoten gefährdet` : ' · alles stabil'}
          </p>
        </div>
        <span className="grow" />
        {riskItems.length > 0 && (
          <button
            type="button"
            className="btn primary sm"
            onClick={() =>
              setSession({
                title: daysAhead === 0 ? 'Wissens-Graph · Rettungs-Sprint' : `Rettungs-Sprint (+${daysAhead} Tage)`,
                items: riskItems.slice(0, 30),
              })
            }
          >
            <IconPlay size={13} /> Gefährdete retten ({Math.min(30, riskItems.length)})
          </button>
        )}
      </div>

      {/* Forgetting-Radar Time Slider */}
      <div className="kg-radar">
        <label className="small" htmlFor="kg-days-slider">
          <IconTarget size={13} /> Vergessens-Radar: <b>{daysAhead === 0 ? 'Heute' : `In ${daysAhead} ${daysAhead === 1 ? 'Tag' : 'Tagen'}`}</b>
        </label>
        <input
          id="kg-days-slider"
          type="range"
          min={0}
          max={Math.max(30, examDays ?? 30)}
          value={daysAhead}
          onChange={(e) => setDaysAhead(Number(e.target.value))}
          className="kg-slider"
        />
        <div className="row-gap">
          <button type="button" className={`chip sm${daysAhead === 0 ? ' on' : ''}`} onClick={() => setDaysAhead(0)}>
            Heute
          </button>
          <button type="button" className={`chip sm${daysAhead === 7 ? ' on' : ''}`} onClick={() => setDaysAhead(7)}>
            +7 T.
          </button>
          <button type="button" className={`chip sm${daysAhead === 14 ? ' on' : ''}`} onClick={() => setDaysAhead(14)}>
            +14 T.
          </button>
          {examDays && (
            <button
              type="button"
              className={`chip sm${daysAhead === examDays ? ' on' : ''}`}
              onClick={() => setDaysAhead(examDays)}
              title={nextExam?.title}
            >
              Prüfungstag (+{examDays} T.)
            </button>
          )}
        </div>
      </div>

      <div className="kg-stage-grid">
        <div className="kg-canvas-box">
          <canvas ref={canvasRef} className="kg-canvas" onClick={onCanvasClick} />
          <div className="kg-legend small muted">
            <span><i style={{ background: '#2f9e69' }} /> ≥ 85 % sicher</span>
            <span><i style={{ background: '#d69e2e' }} /> 65–84 % stabil</span>
            <span><i style={{ background: '#d9485f' }} /> &lt; 65 % gefährdet</span>
          </div>
        </div>

        <aside className="kg-inspector">
          {selected ? (
            <>
              <span className="badge">{selected.kind === 'deck' ? 'Deck' : selected.kind === 'skill' ? 'Skill' : 'Konzept'}</span>
              <h3 className="kg-insp-title">{selected.label}</h3>
              <p className="muted small">
                Prognose {daysAhead === 0 ? 'heute' : `in ${daysAhead} Tagen`}: <b style={{ color: colorForRetention(selected.retention) }}>{selected.retention} %</b>
                {selected.cardRefs.length > 0 ? ` · ${selected.cardRefs.length} Karten` : ''}
              </p>
              <div className="kg-insp-actions">
                {selected.cardRefs.length > 0 && (
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={() => setSession({ title: selected.label, items: selected.cardRefs.slice(0, 25) })}
                  >
                    <IconPlay size={13} /> Diesen Knoten üben
                  </button>
                )}
                {selDeck && (
                  <Link className="btn outline sm" to={deckUrl(data, selDeck)}>
                    Deck öffnen
                  </Link>
                )}
                {selected.skillId && (
                  <Link className="btn outline sm" to={`/skills/${selected.skillId}`}>
                    Skill öffnen
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="muted small">
              <b>Knoten anklicken</b>
              <p style={{ marginTop: 6 }}>
                Wähle einen Punkt im Graphen, um seine FSRS-Prognose zu prüfen oder gezielt diesen Bereich zu trainieren.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
