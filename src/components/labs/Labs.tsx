import { useMemo, useState, type ReactNode } from 'react';
import {
  apply,
  bayesTable,
  binomPmf,
  binomRange,
  derivative,
  det,
  diceSumDist,
  extrema,
  fmt,
  hypergeom,
  integral,
  normalCdf,
  normalPdf,
  pct,
  simulateCoin,
  simulateDice,
  treePaths,
  zeros,
  type Mat,
} from '../../lib/labs';
import { compileExpr } from '../../lib/plotExpr';
import { niceTicks } from '../../lib/diagram';
import { MODELS_3D } from '../../lib/models3d';
import { withParams, type LabSpec } from '../../lib/practice';
import { formulaCurve, formulaValue, type FormulaLab as FormulaSpec } from '../../lib/visuals';
import { Model3DLab } from './Model3DLab';

/**
 * Interactive labs: Merkora's own, tested building blocks (lib/labs.ts). The AI only picks a type and
 * starting values; everything is computed here and drawn as SVG in the app's colours.
 */

const W = 600, H = 260, PAD = 34;

export const LAB_TITLES: Record<LabSpec['type'], string> = {
  coin: 'Münzwurf – Gesetz der großen Zahlen',
  dice: 'Würfelsummen',
  binomial: 'Binomialverteilung',
  normal: 'Normalverteilung',
  tree: 'Baumdiagramm',
  bayes: 'Vierfeldertafel (Bayes)',
  urn: 'Urne: mit und ohne Zurücklegen',
  function: 'Funktionen: Ableitung und Fläche',
  vectors: 'Vektoren und Matrizen',
  formula: 'Formel zum Ausprobieren',
  model3d: 'Interaktives 3D-Modell',
};

/** Default starting values for every lab (for „Labore“ without an AI set). */
export const LAB_DEFAULTS: LabSpec[] = [
  { type: 'coin', p: 0.5 },
  { type: 'dice', dice: 2 },
  { type: 'binomial', n: 10, p: 0.3 },
  { type: 'normal', mu: 100, sigma: 15, a: 85, b: 115 },
  { type: 'tree', pA: 0.3, pBA: 0.8, pBnA: 0.1, a: 'A', b: 'B' },
  { type: 'bayes', prevalence: 0.01, sensitivity: 0.95, specificity: 0.9 },
  { type: 'urn', N: 10, K: 3, n: 4 },
  { type: 'function', expr: 'a*x^3+b*x', params: { a: 1, b: -3 }, min: -3, max: 3 },
  { type: 'vectors', matrix: [[1, 1], [0, 1]] },
];

function Slider({ label, value, min, max, step, onChange, show }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show?: string }) {
  return (
    <label className="lab-slider">
      <span>
        {label} = <b>{show ?? fmt(value, 3)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function NumberIn({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="lab-num">
      {label}
      <input className="input" type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Bars from values (0..max), optionally a second series as dots, and a highlighted range. */
function Bars({ values, compare, from, labels, hi }: { values: number[]; compare?: number[]; from: number; labels?: (i: number) => string; hi?: (i: number) => boolean }) {
  const max = Math.max(...values, ...(compare ?? []), 1e-9);
  const n = values.length;
  const bw = (W - 2 * PAD) / n;
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const every = Math.ceil(n / 20);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="lab-axis" />
      {values.map((v, i) => (
        <g key={i}>
          <rect x={PAD + i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={H - PAD - y(v)} className={hi?.(i) ? 'lab-bar on' : 'lab-bar'} rx={2} />
          {compare && <circle cx={PAD + i * bw + bw / 2} cy={y(compare[i])} r={3.5} className="lab-dot" />}
          {i % every === 0 && (
            <text x={PAD + i * bw + bw / 2} y={H - PAD + 16} className="lab-tick" textAnchor="middle">
              {labels ? labels(i) : from + i}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** A line chart of points (x, y) in the given box. */
function lineFor(pts: [number, number][], xMin: number, xMax: number, yMin: number, yMax: number) {
  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);
  return { sx, sy, d: pts.filter(([, y]) => Number.isFinite(y)).map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.max(yMin, Math.min(yMax, y))).toFixed(1)}`).join(' ') };
}

function Out({ children }: { children: ReactNode }) {
  return <div className="lab-out">{children}</div>;
}

function CoinLab({ spec }: { spec: Extract<LabSpec, { type: 'coin' }> }) {
  const [p, setP] = useState(spec.p);
  const [n, setN] = useState(200);
  const [seed, setSeed] = useState(1);
  const freq = useMemo(() => simulateCoin(n, p, seed), [n, p, seed]);
  const { d, sy } = lineFor(freq.map((f, i) => [i + 1, f]), 1, n, 0, 1);
  return (
    <>
      <div className="lab-controls">
        <Slider label="p (Treffer)" value={p} min={0.05} max={0.95} step={0.05} onChange={setP} />
        <Slider label="Würfe" value={n} min={10} max={1000} step={10} onChange={setN} show={String(n)} />
        <button type="button" className="btn outline sm" onClick={() => setSeed((s) => s + 1)}>
          Neu werfen
        </button>
      </div>
      <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img">
        <line x1={PAD} y1={sy(p)} x2={W - PAD} y2={sy(p)} className="lab-ref" />
        <path d={d} className="lab-line" />
        <text x={PAD} y={sy(p) - 6} className="lab-tick">
          p = {fmt(p, 2)}
        </text>
      </svg>
      <Out>
        Relative Häufigkeit nach {n} Würfen: <b>{fmt(freq[n - 1], 3)}</b> – je mehr Würfe, desto näher an p.
      </Out>
    </>
  );
}

function DiceLab({ spec }: { spec: Extract<LabSpec, { type: 'dice' }> }) {
  const [dice, setDice] = useState(spec.dice);
  const [n, setN] = useState(300);
  const [seed, setSeed] = useState(1);
  const counts = useMemo(() => simulateDice(n, dice, seed), [n, dice, seed]);
  const exact = useMemo(() => diceSumDist(dice), [dice]);
  const vals = counts.slice(dice).map((c) => c / n);
  return (
    <>
      <div className="lab-controls">
        <Slider label="Würfel" value={dice} min={1} max={4} step={1} onChange={setDice} show={String(dice)} />
        <Slider label="Würfe" value={n} min={20} max={3000} step={20} onChange={setN} show={String(n)} />
        <button type="button" className="btn outline sm" onClick={() => setSeed((s) => s + 1)}>
          Neu werfen
        </button>
      </div>
      <Bars values={vals} compare={exact.slice(dice)} from={dice} />
      <Out>Balken: gewürfelt · Punkte: exakte Wahrscheinlichkeit. Häufigste Summe: {exact.indexOf(Math.max(...exact))}.</Out>
    </>
  );
}

function BinomialLab({ spec }: { spec: Extract<LabSpec, { type: 'binomial' }> }) {
  const [n, setN] = useState(spec.n);
  const [p, setP] = useState(spec.p);
  const [a, setA] = useState(0);
  const [b, setB] = useState(Math.round(spec.n * spec.p));
  const vals = Array.from({ length: n + 1 }, (_, k) => binomPmf(n, p, k));
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return (
    <>
      <div className="lab-controls">
        <Slider label="n" value={n} min={1} max={60} step={1} onChange={setN} show={String(n)} />
        <Slider label="p" value={p} min={0.01} max={0.99} step={0.01} onChange={setP} />
        <NumberIn label="von k =" value={a} onChange={setA} />
        <NumberIn label="bis k =" value={b} onChange={setB} />
      </div>
      <Bars values={vals} from={0} hi={(k) => k >= lo && k <= hi} />
      <Out>
        P({lo} ≤ X ≤ {hi}) = <b>{fmt(binomRange(n, p, lo, hi), 4)}</b> · Erwartungswert μ = n·p = <b>{fmt(n * p, 2)}</b> · σ = √(n·p·(1−p)) = <b>{fmt(Math.sqrt(n * p * (1 - p)), 3)}</b>
      </Out>
    </>
  );
}

function NormalLab({ spec }: { spec: Extract<LabSpec, { type: 'normal' }> }) {
  const [mu, setMu] = useState(spec.mu);
  const [sigma, setSigma] = useState(spec.sigma);
  const [a, setA] = useState(spec.a);
  const [b, setB] = useState(spec.b);
  const xMin = mu - 4 * sigma, xMax = mu + 4 * sigma;
  const pts: [number, number][] = Array.from({ length: 161 }, (_, i) => {
    const x = xMin + ((xMax - xMin) * i) / 160;
    return [x, normalPdf(x, mu, sigma)];
  });
  const top = normalPdf(mu, mu, sigma) * 1.1;
  const { d, sx, sy } = lineFor(pts, xMin, xMax, 0, top);
  const lo = Math.max(xMin, Math.min(a, b)), hi = Math.min(xMax, Math.max(a, b));
  const area = pts.filter(([x]) => x >= lo && x <= hi);
  const fill = area.length ? `M${sx(lo)},${sy(0)} ` + area.map(([x, y]) => `L${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ') + ` L${sx(hi)},${sy(0)} Z` : '';
  return (
    <>
      <div className="lab-controls">
        <NumberIn label="μ =" value={mu} onChange={setMu} />
        <Slider label="σ" value={sigma} min={Math.max(0.1, spec.sigma / 5)} max={spec.sigma * 3} step={spec.sigma / 50} onChange={setSigma} />
        <NumberIn label="von a =" value={a} onChange={setA} step={sigma / 10} />
        <NumberIn label="bis b =" value={b} onChange={setB} step={sigma / 10} />
      </div>
      <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="lab-axis" />
        {fill && <path d={fill} className="lab-area" />}
        <path d={d} className="lab-line" />
        {[-2, -1, 0, 1, 2].map((k) => (
          <text key={k} x={sx(mu + k * sigma)} y={H - PAD + 16} className="lab-tick" textAnchor="middle">
            {fmt(mu + k * sigma, 2)}
          </text>
        ))}
      </svg>
      <Out>
        P({fmt(lo, 2)} ≤ X ≤ {fmt(hi, 2)}) = <b>{pct(normalCdf(hi, mu, sigma) - normalCdf(lo, mu, sigma))}</b> · zwischen μ ± σ liegen immer etwa 68 %, μ ± 2σ etwa 95 %.
      </Out>
    </>
  );
}

function TreeLab({ spec }: { spec: Extract<LabSpec, { type: 'tree' }> }) {
  const [pA, setPA] = useState(spec.pA);
  const [pBA, setPBA] = useState(spec.pBA);
  const [pBnA, setPBnA] = useState(spec.pBnA);
  const A = spec.a || 'A', B = spec.b || 'B';
  const t = treePaths(pA, pBA, pBnA);
  const node = (x: number, y: number, text: string, cls = '') => (
    <g>
      <rect x={x - 46} y={y - 14} width={92} height={28} rx={10} className={'lab-node ' + cls} />
      <text x={x} y={y + 5} textAnchor="middle" className="lab-node-t">
        {text}
      </text>
    </g>
  );
  const edge = (x1: number, y1: number, x2: number, y2: number, p: number) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="lab-edge" />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="lab-tick">
        {fmt(p, 3)}
      </text>
    </g>
  );
  return (
    <>
      <div className="lab-controls">
        <Slider label={`P(${A})`} value={pA} min={0} max={1} step={0.01} onChange={setPA} />
        <Slider label={`P(${B} | ${A})`} value={pBA} min={0} max={1} step={0.01} onChange={setPBA} />
        <Slider label={`P(${B} | nicht ${A})`} value={pBnA} min={0} max={1} step={0.01} onChange={setPBnA} />
      </div>
      <svg className="lab-svg" viewBox={`0 0 ${W} 250`} role="img">
        {edge(60, 125, 230, 65, pA)}
        {edge(60, 125, 230, 185, 1 - pA)}
        {edge(276, 65, 430, 30, pBA)}
        {edge(276, 65, 430, 100, 1 - pBA)}
        {edge(276, 185, 430, 150, pBnA)}
        {edge(276, 185, 430, 220, 1 - pBnA)}
        {node(40, 125, 'Start')}
        {node(250, 65, A)}
        {node(250, 185, `nicht ${A}`)}
        {node(476, 30, `${B}: ${fmt(t.AB, 4)}`, 'on')}
        {node(476, 100, `nicht ${B}: ${fmt(t.AnB, 4)}`)}
        {node(476, 150, `${B}: ${fmt(t.nAB, 4)}`, 'on')}
        {node(476, 220, `nicht ${B}: ${fmt(t.nAnB, 4)}`)}
      </svg>
      <Out>
        Pfadregel: entlang eines Pfades multiplizieren. Summenregel: P({B}) = {fmt(t.AB, 4)} + {fmt(t.nAB, 4)} = <b>{fmt(t.B, 4)}</b> · P({A} | {B}) = <b>{fmt(t.AgivenB, 4)}</b>
      </Out>
    </>
  );
}

function BayesLab({ spec }: { spec: Extract<LabSpec, { type: 'bayes' }> }) {
  const [prev, setPrev] = useState(spec.prevalence);
  const [sens, setSens] = useState(spec.sensitivity);
  const [spec2, setSpec2] = useState(spec.specificity);
  const t = bayesTable(prev, sens, spec2, 1000);
  const r = (v: number) => fmt(v, 1);
  return (
    <>
      <div className="lab-controls">
        <Slider label="Anteil Betroffene" value={prev} min={0.001} max={0.5} step={0.001} onChange={setPrev} show={pct(prev, 1)} />
        <Slider label="Sensitivität" value={sens} min={0.5} max={1} step={0.005} onChange={setSens} show={pct(sens, 1)} />
        <Slider label="Spezifität" value={spec2} min={0.5} max={1} step={0.005} onChange={setSpec2} show={pct(spec2, 1)} />
      </div>
      <table className="lab-table">
        <thead>
          <tr>
            <th>von 1000 Personen</th>
            <th>Test positiv</th>
            <th>Test negativ</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>betroffen</th>
            <td className="ok">{r(t.truePos)}</td>
            <td className="bad">{r(t.falseNeg)}</td>
            <td>{r(t.sick)}</td>
          </tr>
          <tr>
            <th>nicht betroffen</th>
            <td className="bad">{r(t.falsePos)}</td>
            <td className="ok">{r(t.trueNeg)}</td>
            <td>{r(t.healthy)}</td>
          </tr>
          <tr>
            <th>Summe</th>
            <td>{r(t.positive)}</td>
            <td>{r(1000 - t.positive)}</td>
            <td>1000</td>
          </tr>
        </tbody>
      </table>
      <Out>
        Von {r(t.positive)} positiv Getesteten sind nur {r(t.truePos)} wirklich betroffen: P(betroffen | positiv) = <b>{pct(t.ppv, 1)}</b>.
      </Out>
    </>
  );
}

function UrnLab({ spec }: { spec: Extract<LabSpec, { type: 'urn' }> }) {
  const [N, setN] = useState(spec.N);
  const [K, setK] = useState(spec.K);
  const [n, setn] = useState(spec.n);
  const KK = Math.min(K, N - 1), nn = Math.min(n, N);
  const without = Array.from({ length: nn + 1 }, (_, k) => hypergeom(N, KK, nn, k));
  const withBack = Array.from({ length: nn + 1 }, (_, k) => binomPmf(nn, KK / N, k));
  return (
    <>
      <div className="lab-controls">
        <Slider label="Kugeln N" value={N} min={2} max={60} step={1} onChange={setN} show={String(N)} />
        <Slider label="davon rot K" value={KK} min={1} max={N - 1} step={1} onChange={setK} show={String(KK)} />
        <Slider label="gezogen n" value={nn} min={1} max={N} step={1} onChange={setn} show={String(nn)} />
      </div>
      <Bars values={without} compare={withBack} from={0} />
      <Out>
        Balken: ohne Zurücklegen (hypergeometrisch) · Punkte: mit Zurücklegen (binomial). P(genau 1 rote) ohne Zurücklegen = <b>{fmt(without[1] ?? 0, 4)}</b>
      </Out>
    </>
  );
}

function FunctionLab({ spec }: { spec: Extract<LabSpec, { type: 'function' }> }) {
  const [expr, setExpr] = useState(spec.expr);
  const [expr2, setExpr2] = useState('');
  const [params, setParams] = useState(spec.params);
  const [x0, setX0] = useState((spec.min + spec.max) / 4);
  const [showTangent, setShowTangent] = useState(true);
  const [showArea, setShowArea] = useState(false);
  const [a, setA] = useState(spec.min / 2);
  const [b, setB] = useState(spec.max / 2);
  const f = compileExpr(withParams(expr, params));
  const g = expr2.trim() ? compileExpr(withParams(expr2, params)) : null;
  const { min, max } = spec;
  const pts: [number, number][] = f ? Array.from({ length: 241 }, (_, i) => [min + ((max - min) * i) / 240, f(min + ((max - min) * i) / 240)]) : [];
  const pts2: [number, number][] = g ? Array.from({ length: 241 }, (_, i) => [min + ((max - min) * i) / 240, g(min + ((max - min) * i) / 240)]) : [];
  const ys = [...pts, ...pts2].map(([, y]) => y).filter(Number.isFinite);
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0.1);
  const pad = (yMax - yMin) * 0.1 || 1;
  const box = lineFor(pts, min, max, yMin - pad, yMax + pad);
  const box2 = g ? lineFor(pts2, min, max, yMin - pad, yMax + pad) : null;
  const slope = f ? derivative(f, x0) : NaN;
  const tangent = f ? lineFor([[min, f(x0) + slope * (min - x0)], [max, f(x0) + slope * (max - x0)]], min, max, yMin - pad, yMax + pad) : null;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const areaPts = pts.filter(([x]) => x >= lo && x <= hi);
  const fill = f && showArea && areaPts.length ? `M${box.sx(lo)},${box.sy(0)} ` + areaPts.map(([x, y]) => `L${box.sx(x).toFixed(1)},${box.sy(y).toFixed(1)}`).join(' ') + ` L${box.sx(hi)},${box.sy(0)} Z` : '';
  const zs = f ? zeros(f, min, max) : [];
  const ex = f ? extrema(f, min, max) : [];
  return (
    <>
      <div className="lab-controls">
        <label className="lab-num wide">
          f(x) =
          <input className="input mono" value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} />
        </label>
        <label className="lab-num wide">
          g(x) =
          <input className="input mono" value={expr2} onChange={(e) => setExpr2(e.target.value)} placeholder="optional, z. B. 2*x" spellCheck={false} />
        </label>
        {Object.keys(params).map((k) => (
          <Slider key={k} label={k} value={params[k]} min={-5} max={5} step={0.1} onChange={(v) => setParams({ ...params, [k]: v })} />
        ))}
        <label className="check-row">
          <input type="checkbox" checked={showTangent} onChange={(e) => setShowTangent(e.target.checked)} /> Tangente
        </label>
        {showTangent && <Slider label="x₀" value={x0} min={min} max={max} step={(max - min) / 200} onChange={setX0} />}
        <label className="check-row">
          <input type="checkbox" checked={showArea} onChange={(e) => setShowArea(e.target.checked)} /> Fläche (Integral)
        </label>
        {showArea && (
          <>
            <NumberIn label="von" value={a} onChange={setA} step={0.1} />
            <NumberIn label="bis" value={b} onChange={setB} step={0.1} />
          </>
        )}
      </div>
      {!f && <p className="form-error">Diese Formel kann Merkora nicht lesen (erlaubt: x, a, b, c, + − * / ^, sqrt, exp, ln, sin, cos …).</p>}
      {expr2.trim() && !g && <p className="form-error">Vergleichsfunktion g(x) konnte nicht gelesen werden.</p>}
      {f && (
        <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img">
          <line x1={PAD} y1={box.sy(0)} x2={W - PAD} y2={box.sy(0)} className="lab-axis" />
          {min < 0 && max > 0 && <line x1={box.sx(0)} y1={PAD} x2={box.sx(0)} y2={H - PAD} className="lab-axis" />}
          {fill && <path d={fill} className="lab-area" />}
          <path d={box.d} className="lab-line" />
          {box2 && <path d={box2.d} className="lab-line-2" />}
          {showTangent && tangent && <path d={tangent.d} className="lab-ref" />}
          {showTangent && Number.isFinite(f(x0)) && <circle cx={box.sx(x0)} cy={box.sy(f(x0))} r={5} className="lab-dot" />}
          {zs.map((z) => (
            <circle key={'z' + z} cx={box.sx(z)} cy={box.sy(0)} r={4} className="lab-zero" />
          ))}
          {ex.map((e) => (
            <circle key={'e' + e.x} cx={box.sx(e.x)} cy={box.sy(e.y)} r={4} className="lab-extreme" />
          ))}
          <text x={PAD} y={H - 8} className="lab-tick">
            {fmt(min, 2)}
          </text>
          <text x={W - PAD} y={H - 8} className="lab-tick" textAnchor="end">
            {fmt(max, 2)}
          </text>
        </svg>
      )}
      {f && (
        <Out>
          {showTangent && (
            <>
              Steigung bei x₀ = {fmt(x0, 2)}: f′(x₀) ≈ <b>{fmt(slope, 3)}</b>
              {g && Number.isFinite(g(x0)) && <> · g(x₀) = <b>{fmt(g(x0), 3)}</b></>}.{' '}
            </>
          )}
          {showArea && (
            <>
              ∫ von {fmt(lo, 2)} bis {fmt(hi, 2)} = <b>{fmt(integral(f, lo, hi), 4)}</b>.{' '}
            </>
          )}
          {zs.length > 0 && <>Nullstellen: {zs.map((z) => fmt(z, 3)).join('; ')}. </>}
          {ex.length > 0 && <>{ex.map((e) => `${e.kind === 'max' ? 'Hochpunkt' : 'Tiefpunkt'} (${fmt(e.x, 3)} | ${fmt(e.y, 3)})`).join(', ')}.</>}
        </Out>
      )}
    </>
  );
}

function VectorsLab({ spec }: { spec: Extract<LabSpec, { type: 'vectors' }> }) {
  const [m, setM] = useState<Mat>(spec.matrix);
  const set = (i: number, j: number, v: number) => setM((x) => (x.map((r, a) => r.map((c, b) => (a === i && b === j ? v : c))) as Mat));
  const S = 34, cx = W / 2, cy = H / 2;
  const p = (v: [number, number]) => [cx + v[0] * S, cy - v[1] * S] as const;
  const grid: [number, number][][] = [];
  for (let k = -4; k <= 4; k++) {
    grid.push([[k, -4], [k, 4]]);
    grid.push([[-4, k], [4, k]]);
  }
  const e1 = apply(m, [1, 0]), e2 = apply(m, [0, 1]), e12 = apply(m, [1, 1]);
  const presets: [string, Mat][] = [
    ['Drehung 90°', [[0, -1], [1, 0]]],
    ['Streckung', [[2, 0], [0, 0.5]]],
    ['Scherung', [[1, 1], [0, 1]]],
    ['Spiegelung', [[1, 0], [0, -1]]],
  ];
  return (
    <>
      <div className="lab-controls">
        <div className="lab-matrix">
          {[0, 1].map((i) => (
            <div key={i}>
              {[0, 1].map((j) => (
                <input key={j} className="input" type="number" step={0.5} value={m[i][j]} onChange={(e) => set(i, j, Number(e.target.value))} aria-label={`Matrix ${i + 1},${j + 1}`} />
              ))}
            </div>
          ))}
        </div>
        {presets.map(([n, pm]) => (
          <button key={n} type="button" className="btn ghost sm" onClick={() => setM(pm)}>
            {n}
          </button>
        ))}
      </div>
      <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img">
        {grid.map(([a, b], i) => {
          const [x1, y1] = p(a), [x2, y2] = p(b);
          return <line key={'g' + i} x1={x1} y1={y1} x2={x2} y2={y2} className="lab-grid" />;
        })}
        {grid.map(([a, b], i) => {
          const [x1, y1] = p(apply(m, a)), [x2, y2] = p(apply(m, b));
          return <line key={'t' + i} x1={x1} y1={y1} x2={x2} y2={y2} className="lab-grid on" />;
        })}
        <polygon points={[[0, 0] as [number, number], e1, e12, e2].map((v) => p(v).join(',')).join(' ')} className="lab-area" />
        <line x1={cx} y1={cy} x2={p(e1)[0]} y2={p(e1)[1]} className="lab-vec" />
        <line x1={cx} y1={cy} x2={p(e2)[0]} y2={p(e2)[1]} className="lab-vec two" />
      </svg>
      <Out>
        e₁ → ({fmt(e1[0], 2)} | {fmt(e1[1], 2)}), e₂ → ({fmt(e2[0], 2)} | {fmt(e2[1], 2)}) · Determinante = Fläche des Parallelogramms: <b>{fmt(det(m), 3)}</b>
        {det(m) < 0 ? ' (negativ: die Orientierung kippt)' : det(m) === 0 ? ' (null: die Ebene wird auf eine Linie gedrückt)' : ''}
      </Out>
    </>
  );
}

/** A formula with sliders for its quantities: the result changes live, optionally as a curve over one of them. */
function FormulaLab({ spec }: { spec: FormulaSpec }) {
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(spec.vars.map((v) => [v.name, v.value])));
  const value = formulaValue(spec, vals);
  const curve = useMemo(() => formulaCurve(spec, vals), [spec, vals]);
  const pv = spec.vars.find((v) => v.name === spec.plot);
  const pts = (curve ?? []).filter((q): q is { x: number; y: number } => !!q);
  const ys = pts.map((q) => q.y);
  // the y-axis gets ticks with values and the result's name – a nice range from 0 (or below) to the top
  const yTicks = niceTicks(Math.min(0, ...ys), Math.max(1e-9, ...ys), 4);
  const lo = Math.min(0, ...ys, yTicks[0]), hi = Math.max(1e-9, ...ys, yTicks[yTicks.length - 1]);
  const LEFT = PAD + 46;
  const sx = (x: number) => LEFT + ((x - (pv?.min ?? 0)) / ((pv?.max ?? 1) - (pv?.min ?? 0))) * (W - LEFT - PAD);
  const sy = (y: number) => H - PAD - ((y - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  const yTitle = spec.result.label + (spec.result.unit ? ` in ${spec.result.unit}` : '');
  const d = pts.map((q, k) => `${k ? 'L' : 'M'}${sx(q.x).toFixed(1)} ${sy(q.y).toFixed(1)}`).join(' ');
  return (
    <>
      <p className="lab-formula">
        <code>{spec.expr}</code>
      </p>
      <div className="lab-controls">
        {spec.vars.map((v) => (
          <Slider
            key={v.name}
            label={`${v.label} (${v.name})`}
            value={vals[v.name]}
            min={v.min}
            max={v.max}
            step={v.step}
            onChange={(x) => setVals((o) => ({ ...o, [v.name]: x }))}
            show={`${fmt(vals[v.name], 3)}${v.unit ? ' ' + v.unit : ''}`}
          />
        ))}
      </div>
      <div className="lab-result">
        {spec.result.label}: <b>{value === null ? '–' : fmt(value, Math.abs(value) >= 100 ? 2 : 4)}</b>
        {spec.result.unit && <span> {spec.result.unit}</span>}
      </div>
      {pv && d && (
        <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${spec.result.label} abhängig von ${pv.label}`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={LEFT - 4} y1={sy(t)} x2={W - PAD} y2={sy(t)} className="lab-grid" />
              <text x={LEFT - 8} y={sy(t) + 4} className="lab-tick" textAnchor="end">
                {fmt(t, 4)}
              </text>
            </g>
          ))}
          <line x1={LEFT} y1={sy(0)} x2={W - PAD} y2={sy(0)} className="lab-axis" />
          <line x1={LEFT} y1={PAD - 6} x2={LEFT} y2={H - PAD} className="lab-axis" />
          <text x={LEFT + 8} y={PAD - 12} className="lab-tick lab-axis-title">
            ↑ {yTitle}
          </text>
          <path d={d} className="lab-line" />
          {value !== null && <circle cx={sx(vals[pv.name])} cy={sy(value)} r={6} className="lab-dot" />}
          <text x={LEFT} y={H - 8} className="lab-tick">
            {fmt(pv.min, 2)}
          </text>
          <text x={W - PAD} y={H - 8} className="lab-tick" textAnchor="end">
            {fmt(pv.max, 2)} {pv.unit}
          </text>
          <text x={(LEFT + W - PAD) / 2} y={H - 8} className="lab-tick lab-axis-title" textAnchor="middle">
            {pv.label} →
          </text>
        </svg>
      )}
    </>
  );
}

/** One lab with its title and the question to try out. */
export function Lab({ spec }: { spec: LabSpec }) {
  const body = (() => {
    switch (spec.type) {
      case 'coin':
        return <CoinLab spec={spec} />;
      case 'dice':
        return <DiceLab spec={spec} />;
      case 'binomial':
        return <BinomialLab spec={spec} />;
      case 'normal':
        return <NormalLab spec={spec} />;
      case 'tree':
        return <TreeLab spec={spec} />;
      case 'bayes':
        return <BayesLab spec={spec} />;
      case 'urn':
        return <UrnLab spec={spec} />;
      case 'function':
        return <FunctionLab spec={spec} />;
      case 'vectors':
        return <VectorsLab spec={spec} />;
      case 'formula':
        return <FormulaLab spec={spec} />;
      case 'model3d':
        return <Model3DLab spec={spec} />;
    }
  })();
  const heading =
    spec.type === 'formula'
      ? spec.title
      : spec.type === 'model3d'
        ? spec.title ?? `3D-Modell: ${MODELS_3D.find((m) => m.id === spec.modelId)?.title ?? LAB_TITLES.model3d}`
        : LAB_TITLES[spec.type];
  return (
    <section className="panel lab">
      <h3>{heading}</h3>
      {spec.ask && <p className="lab-ask">{spec.ask}</p>}
      {body}
    </section>
  );
}
