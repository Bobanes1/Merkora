import { useMemo, useState } from 'react';
import { convertUnit, evalCalcExpr, fmtCalc, toFraction, UNIT_CATEGORIES, type AngleMode } from '../../lib/calc';
import { toolWindows } from '../../lib/toolWindows';
import { IconPopout, IconRefresh } from '../Icons';

const KEYS = [
  ['sin(', 'cos(', 'tan(', 'sqrt(', '(', ')'],
  ['7', '8', '9', '/', 'ln(', '^'],
  ['4', '5', '6', '*', 'log(', 'pi'],
  ['1', '2', '3', '-', 'abs(', '!'],
  ['0', ',', '%', '+', 'C', '='],
];

/** Scientific calculator + 8-category unit converter (works full-width and as a floating popup). */
export function CalculatorTool({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'calc' | 'unit'>('calc');
  const [expr, setExpr] = useState('');
  const [angle, setAngle] = useState<AngleMode>('deg');
  const [history, setHistory] = useState<{ expr: string; res: string }[]>([]);

  const [catId, setCatId] = useState(UNIT_CATEGORIES[0].id);
  const cat = UNIT_CATEGORIES.find((c) => c.id === catId) ?? UNIT_CATEGORIES[0];
  const [fromU, setFromU] = useState(cat.units[2]?.id ?? cat.units[0].id);
  const [toU, setToU] = useState(cat.units[3]?.id ?? cat.units[1].id);
  const [unitIn, setUnitIn] = useState('1');

  const liveVal = useMemo(() => (expr.trim() ? evalCalcExpr(expr, angle) : NaN), [expr, angle]);
  const frac = Number.isFinite(liveVal) ? toFraction(liveVal) : null;

  const commit = () => {
    if (!expr.trim() || !Number.isFinite(liveVal)) return;
    const formatted = fmtCalc(liveVal);
    setHistory((h) => [{ expr: expr.trim(), res: formatted }, ...h.slice(0, 9)]);
    setExpr(formatted);
  };

  const press = (k: string) => {
    if (k === 'C') return setExpr('');
    if (k === '=') return commit();
    setExpr((e) => e + k);
  };

  const selectCat = (id: string) => {
    setCatId(id);
    const next = UNIT_CATEGORIES.find((c) => c.id === id) ?? UNIT_CATEGORIES[0];
    setFromU(next.units[0].id);
    setToU(next.units[1]?.id ?? next.units[0].id);
  };

  const numIn = Number(unitIn.replace(',', '.'));
  const unitOut = Number.isFinite(numIn) ? convertUnit(numIn, cat.id, fromU, toU) : NaN;

  return (
    <div className={`calc-tool ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="panel-head">
          <div>
            <h2>Rechner &amp; Einheiten</h2>
            <p className="muted small">Wissenschaftlicher Taschenrechner (mit Brüchen &amp; DEG/RAD) und Einheiten-Umrechner – 100 % offline.</p>
          </div>
          <button type="button" className="btn outline sm" onClick={() => toolWindows.open('calc')}>
            <IconPopout size={14} /> Als Popup öffnen
          </button>
        </div>
      )}

      <div className="calc-top">
        <div className="seg">
          <button type="button" className={mode === 'calc' ? 'on' : ''} onClick={() => setMode('calc')}>
            Rechner
          </button>
          <button type="button" className={mode === 'unit' ? 'on' : ''} onClick={() => setMode('unit')}>
            Einheiten
          </button>
        </div>
        {mode === 'calc' && (
          <button
            type="button"
            className="chip"
            onClick={() => setAngle((a) => (a === 'deg' ? 'rad' : 'deg'))}
            title="Winkelmaß für sin/cos/tan umschalten"
          >
            {angle === 'deg' ? 'DEG (°)' : 'RAD'}
          </button>
        )}
      </div>

      {mode === 'calc' ? (
        <>
          <div className="calc-display">
            <input
              className="input mono calc-input"
              placeholder="z. B. sqrt(2) * 5 oder sin(30) + 1/4"
              aria-label="Rechenausdruck"
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
            />
            <div className="calc-result" aria-live="polite">
              <b>{expr.trim() ? (Number.isFinite(liveVal) ? `= ${fmtCalc(liveVal)}` : '…') : '= 0'}</b>
              {frac && <span className="badge ok">Bruch: {frac}</span>}
            </div>
          </div>

          <div className="calc-pad">
            {KEYS.flat().map((k) => (
              <button
                key={k}
                type="button"
                className={'calc-key' + (k === '=' ? ' primary' : k === 'C' ? ' danger' : /^[0-9,]$/.test(k) ? ' num' : '')}
                onClick={() => press(k)}
              >
                {k}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="calc-history">
              <small className="muted">Verlauf (klicken zum Übernehmen)</small>
              <ul>
                {history.slice(0, compact ? 3 : 6).map((h, i) => (
                  <li key={i}>
                    <button type="button" className="link-btn small" onClick={() => setExpr(h.expr)}>
                      <code>{h.expr}</code> = <b>{h.res}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="unit-conv">
          <div className="chips">
            {UNIT_CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={'chip' + (c.id === cat.id ? ' on' : '')} onClick={() => selectCat(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="unit-row">
            <input className="input mono" value={unitIn} onChange={(e) => setUnitIn(e.target.value)} aria-label="Wert" />
            <select className="input" value={fromU} onChange={(e) => setFromU(e.target.value)} aria-label="Ausgangseinheit">
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="unit-swap-row">
            <button type="button" className="btn ghost sm" onClick={() => (setFromU(toU), setToU(fromU))}>
              <IconRefresh size={13} /> Tauschen
            </button>
          </div>
          <div className="unit-row">
            <div className="unit-out mono">{Number.isFinite(unitOut) ? fmtCalc(unitOut) : '–'}</div>
            <select className="input" value={toU} onChange={(e) => setToU(e.target.value)} aria-label="Zieleinheit">
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
