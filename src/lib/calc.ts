/**
 * Safe scientific calculator evaluator & unit converter for Merkora Tools (100% offline, no eval).
 * Pure – tested in scripts/test-srs.mts.
 */

export type AngleMode = 'deg' | 'rad';

const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'ln', 'log', 'exp', 'floor', 'ceil', 'round']);

type Tok = { kind: 'num'; val: number } | { kind: 'id'; val: string } | { kind: 'op'; val: string };

function tokenize(raw: string): Tok[] | null {
  const s = raw
    .trim()
    .replace(/,/g, '.')
    .replace(/×|·/g, '*')
    .replace(/÷|:/g, '/')
    .replace(/−|–/g, '-')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[\d.]/.test(ch)) {
      const m = /^\d*(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m || !m[0] || m[0] === '.') return null;
      const n = Number(m[0]);
      if (!Number.isFinite(n)) return null;
      out.push({ kind: 'num', val: n });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      const m = /^[a-z]+/i.exec(s.slice(i))!;
      out.push({ kind: 'id', val: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ('+-*/^%()!'.includes(ch)) {
      out.push({ kind: 'op', val: ch });
      i++;
      continue;
    }
    return null;
  }
  // Insert implicit multiplication: 2pi, 2(3+4), (2)(3), 3sin(30), pi(2)
  const expanded: Tok[] = [];
  for (let k = 0; k < out.length; k++) {
    const cur = out[k];
    const prev = expanded[expanded.length - 1];
    if (prev) {
      const prevVal = prev.kind === 'num' || (prev.kind === 'id' && !FUNCS.has(prev.val)) || (prev.kind === 'op' && (prev.val === ')' || prev.val === '!'));
      const curStart = cur.kind === 'num' || cur.kind === 'id' || (cur.kind === 'op' && cur.val === '(');
      if (prevVal && curStart) expanded.push({ kind: 'op', val: '*' });
    }
    expanded.push(cur);
  }
  return expanded;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Evaluates a scientific math expression safely (returns NaN on invalid input). */
export function evalCalcExpr(raw: string, angle: AngleMode = 'deg'): number {
  const toks = tokenize(raw);
  if (!toks || !toks.length) return NaN;
  let pos = 0;
  const peek = () => toks[pos];
  const take = () => toks[pos++];
  const toRad = (v: number) => (angle === 'deg' ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (angle === 'deg' ? (v * 180) / Math.PI : v);

  function parseAdd(): number {
    let v = parseMul();
    while (peek()?.kind === 'op' && (peek()!.val === '+' || peek()!.val === '-')) {
      const op = take().val;
      const r = parseMul();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseMul(): number {
    let v = parsePow();
    while (peek()?.kind === 'op' && (peek()!.val === '*' || peek()!.val === '/' || peek()!.val === '%')) {
      const op = take().val;
      const r = parsePow();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function parsePow(): number {
    const base = parseUnary();
    if (peek()?.kind === 'op' && peek()!.val === '^') {
      take();
      return Math.pow(base, parsePow());
    }
    return base;
  }
  function parseUnary(): number {
    if (peek()?.kind === 'op' && (peek()!.val === '+' || peek()!.val === '-')) {
      const op = take().val;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parsePostfix();
  }
  function parsePostfix(): number {
    let v = parsePrimary();
    while (peek()?.kind === 'op') {
      if (peek()!.val === '!') {
        take();
        v = factorial(v);
        continue;
      }
      if (peek()!.val === '%') {
        const after = toks![pos + 1];
        const isBinaryMod =
          after &&
          (after.kind === 'num' || after.kind === 'id' || (after.kind === 'op' && after.val === '('));
        if (!isBinaryMod) {
          take();
          v = v / 100;
          continue;
        }
      }
      break;
    }
    return v;
  }
  function parsePrimary(): number {
    const t = peek();
    if (!t) return NaN;
    if (t.kind === 'num') {
      take();
      return t.val;
    }
    if (t.kind === 'id') {
      take();
      if (t.val === 'pi') return Math.PI;
      if (t.val === 'e') return Math.E;
      if (FUNCS.has(t.val)) {
        let arg: number;
        if (peek()?.kind === 'op' && peek()!.val === '(') {
          take();
          arg = parseAdd();
          if (peek()?.kind !== 'op' || peek()!.val !== ')') return NaN;
          take();
        } else {
          arg = parseUnary();
        }
        switch (t.val) {
          case 'sin': return Math.sin(toRad(arg));
          case 'cos': return Math.cos(toRad(arg));
          case 'tan': return Math.tan(toRad(arg));
          case 'asin': return fromRad(Math.asin(arg));
          case 'acos': return fromRad(Math.acos(arg));
          case 'atan': return fromRad(Math.atan(arg));
          case 'sqrt': return Math.sqrt(arg);
          case 'abs': return Math.abs(arg);
          case 'ln': return Math.log(arg);
          case 'log': return Math.log10(arg);
          case 'exp': return Math.exp(arg);
          case 'floor': return Math.floor(arg);
          case 'ceil': return Math.ceil(arg);
          case 'round': return Math.round(arg);
        }
      }
      return NaN;
    }
    if (t.kind === 'op' && t.val === '(') {
      take();
      const v = parseAdd();
      if (peek()?.kind !== 'op' || peek()!.val !== ')') return NaN;
      take();
      return v;
    }
    return NaN;
  }

  const res = parseAdd();
  if (pos !== toks.length || !Number.isFinite(res)) return NaN;
  return Math.abs(res) < 1e-12 ? 0 : res;
}

/** Formats a number cleanly in German style (trimmed trailing zeros). */
export function fmtCalc(n: number): string {
  if (!Number.isFinite(n)) return 'Fehler';
  if (Math.abs(n) >= 1e12 || (n !== 0 && Math.abs(n) < 1e-7)) return n.toExponential(6).replace('.', ',');
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded).replace('.', ',');
}

/** Approximates a decimal as a clean reduced fraction (denominator <= 100) if exact enough. */
export function toFraction(n: number): string | null {
  if (!Number.isFinite(n) || Number.isInteger(n) || Math.abs(n) > 1e5) return null;
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  let bestNum = 0, bestDen = 1, bestErr = Infinity;
  for (let d = 2; d <= 100; d++) {
    const num = Math.round(abs * d);
    const err = Math.abs(abs - num / d);
    if (err < bestErr) {
      bestErr = err;
      bestNum = num;
      bestDen = d;
    }
  }
  if (bestErr > 1e-6 || bestNum === 0) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(bestNum, bestDen);
  return `${sign}${bestNum / g}/${bestDen / g}`;
}

// ---------- Unit Converter ----------
export type UnitDef = { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number };
export type UnitCategory = { id: string; label: string; units: UnitDef[] };

const lin = (id: string, label: string, factor: number): UnitDef => ({
  id,
  label,
  toBase: (v) => v * factor,
  fromBase: (v) => v / factor,
});

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'Länge',
    units: [
      lin('mm', 'Millimeter (mm)', 0.001),
      lin('cm', 'Zentimeter (cm)', 0.01),
      lin('m', 'Meter (m)', 1),
      lin('km', 'Kilometer (km)', 1000),
      lin('in', 'Zoll (in)', 0.0254),
      lin('ft', 'Fuß (ft)', 0.3048),
      lin('mi', 'Meile (mi)', 1609.344),
    ],
  },
  {
    id: 'mass',
    label: 'Masse',
    units: [
      lin('mg', 'Milligramm (mg)', 1e-6),
      lin('g', 'Gramm (g)', 0.001),
      lin('kg', 'Kilogramm (kg)', 1),
      lin('t', 'Tonne (t)', 1000),
      lin('lb', 'Pfund (lb)', 0.45359237),
    ],
  },
  {
    id: 'time',
    label: 'Zeit',
    units: [
      lin('ms', 'Millisekunde (ms)', 0.001),
      lin('s', 'Sekunde (s)', 1),
      lin('min', 'Minute (min)', 60),
      lin('h', 'Stunde (h)', 3600),
      lin('d', 'Tag (d)', 86400),
    ],
  },
  {
    id: 'speed',
    label: 'Geschwindigkeit',
    units: [
      lin('ms', 'm/s', 1),
      lin('kmh', 'km/h', 1 / 3.6),
      lin('mph', 'mph', 0.44704),
      lin('kn', 'Knoten (kn)', 0.514444),
    ],
  },
  {
    id: 'temp',
    label: 'Temperatur',
    units: [
      { id: 'c', label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'k', label: 'Kelvin (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
      { id: 'f', label: 'Fahrenheit (°F)', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
    ],
  },
  {
    id: 'energy',
    label: 'Energie',
    units: [
      lin('j', 'Joule (J)', 1),
      lin('kj', 'Kilojoule (kJ)', 1000),
      lin('cal', 'Kalorie (cal)', 4.184),
      lin('kcal', 'Kilokalorie (kcal)', 4184),
      lin('wh', 'Wattstunde (Wh)', 3600),
      lin('kwh', 'Kilowattstunde (kWh)', 3_600_000),
    ],
  },
  {
    id: 'data',
    label: 'Datenmengen',
    units: [
      lin('bit', 'Bit (b)', 0.125),
      lin('b', 'Byte (B)', 1),
      lin('kb', 'Kilobyte (KB)', 1024),
      lin('mb', 'Megabyte (MB)', 1024 ** 2),
      lin('gb', 'Gigabyte (GB)', 1024 ** 3),
      lin('tb', 'Terabyte (TB)', 1024 ** 4),
    ],
  },
  {
    id: 'angle',
    label: 'Winkel',
    units: [
      lin('deg', 'Grad (°)', 1),
      lin('rad', 'Radiant (rad)', 180 / Math.PI),
      lin('gon', 'Gon (gon)', 0.9),
    ],
  },
];

export function convertUnit(value: number, categoryId: string, fromId: string, toId: string): number {
  if (!Number.isFinite(value)) return NaN;
  const cat = UNIT_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return NaN;
  const from = cat.units.find((u) => u.id === fromId);
  const to = cat.units.find((u) => u.id === toId);
  if (!from || !to) return NaN;
  return to.fromBase(from.toBase(value));
}
