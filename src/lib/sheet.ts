/**
 * A tiny spreadsheet for practice tasks: numbers, cell references (A1), + − * / ^, brackets and the functions
 * SUMME/SUM, MITTELWERT/AVERAGE, MIN, MAX, ANZAHL/COUNT with ranges (A1:A5). German decimal comma works.
 * Pure – tested in scripts/test-srs.mts.
 */

export type CellValue = number | string | { error: string };
export const isErr = (v: CellValue): v is { error: string } => typeof v === 'object' && v !== null && 'error' in v;

/** "A1" → [column 0, row 0]; null if it is no cell name. */
export function cellPos(ref: string): [number, number] | null {
  const m = /^([A-Z])(\d{1,2})$/.exec(ref.trim().toUpperCase());
  return m ? [m[1].charCodeAt(0) - 65, Number(m[2]) - 1] : null;
}
export const cellName = (c: number, r: number) => String.fromCharCode(65 + c) + (r + 1);

/** A number typed the German or English way ("1,5", "1.5", "-3", "12 %"); null if it is none. */
export function sheetNumber(t: string): number | null {
  let s = t.trim().replace(/\s+/g, '').replace(/−/g, '-');
  if (!s) return null;
  const pct = s.endsWith('%');
  if (pct) s = s.slice(0, -1);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return pct ? n / 100 : n;
}

type Tok = { t: 'num'; v: number } | { t: 'ref'; v: string } | { t: 'range'; a: string; b: string } | { t: 'fn'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  const s = src.toUpperCase();
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') {
      i++;
      continue;
    }
    const range = /^([A-Z]\d{1,2}):([A-Z]\d{1,2})/.exec(s.slice(i));
    if (range) {
      out.push({ t: 'range', a: range[1], b: range[2] });
      i += range[0].length;
      continue;
    }
    const fn = /^(SUMME|SUM|MITTELWERT|AVERAGE|MIN|MAX|ANZAHL|COUNT)\s*\(/.exec(s.slice(i));
    if (fn) {
      out.push({ t: 'fn', v: fn[1] });
      i += fn[1].length;
      continue;
    }
    const ref = /^[A-Z]\d{1,2}/.exec(s.slice(i));
    if (ref) {
      out.push({ t: 'ref', v: ref[0] });
      i += ref[0].length;
      continue;
    }
    const num = /^\d+([.,]\d+)?/.exec(s.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0].replace(',', '.')) });
      i += num[0].length;
      continue;
    }
    if ('+-*/^();'.includes(c)) {
      out.push({ t: 'op', v: c === ';' ? ',' : c });
      i++;
      continue;
    }
    // "," separates function arguments (German Excel uses ";")
    if (c === ',') {
      out.push({ t: 'op', v: ',' });
      i++;
      continue;
    }
    return null;
  }
  return out;
}

/** Evaluates all cells. `cells[r][c]` holds what was typed: a number, text, or a formula starting with "=". */
export function evalSheet(cells: string[][]): CellValue[][] {
  const memo = new Map<string, CellValue>();
  const busy = new Set<string>();
  const raw = (r: number, c: number) => cells[r]?.[c] ?? '';

  const valueOf = (ref: string): CellValue => {
    const pos = cellPos(ref);
    if (!pos) return { error: '#BEZUG' };
    const [c, r] = pos;
    const key = cellName(c, r);
    if (memo.has(key)) return memo.get(key)!;
    if (busy.has(key)) return { error: '#ZIRKEL' };
    busy.add(key);
    const v = evalCell(raw(r, c));
    busy.delete(key);
    memo.set(key, v);
    return v;
  };

  const rangeVals = (a: string, b: string): CellValue[] => {
    const pa = cellPos(a), pb = cellPos(b);
    if (!pa || !pb) return [{ error: '#BEZUG' }];
    const out: CellValue[] = [];
    for (let r = Math.min(pa[1], pb[1]); r <= Math.max(pa[1], pb[1]); r++)
      for (let c = Math.min(pa[0], pb[0]); c <= Math.max(pa[0], pb[0]); c++) out.push(valueOf(cellName(c, r)));
    return out;
  };

  function evalFormula(src: string): CellValue {
    const toks = tokenize(src);
    if (!toks) return { error: '#NAME' };
    let p = 0;
    const fail = (e: string): never => {
      throw new Error(e);
    };
    const num = (v: CellValue): number => {
      if (isErr(v)) fail(v.error);
      if (typeof v === 'number') return v;
      if (v === '') return 0;
      const n = sheetNumber(v as string);
      return n === null ? fail('#WERT') : n;
    };
    const peek = () => toks[p];
    const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
    const expr = (): number => {
      let v = term();
      while (isOp('+') || isOp('-')) {
        const op = (toks[p++] as { v: string }).v;
        const w = term();
        v = op === '+' ? v + w : v - w;
      }
      return v;
    };
    const term = (): number => {
      let v = power();
      while (isOp('*') || isOp('/')) {
        const op = (toks[p++] as { v: string }).v;
        const w = power();
        if (op === '/' && w === 0) fail('#DIV/0');
        v = op === '*' ? v * w : v / w;
      }
      return v;
    };
    const power = (): number => {
      const base = unary();
      if (isOp('^')) {
        p++;
        return Math.pow(base, power());
      }
      return base;
    };
    const unary = (): number => {
      if (isOp('-')) {
        p++;
        return -unary();
      }
      if (isOp('+')) {
        p++;
        return unary();
      }
      return atom();
    };
    const atom = (): number => {
      const t = toks[p++];
      if (!t) return fail('#WERT');
      if (t.t === 'num') return t.v;
      if (t.t === 'ref') return num(valueOf(t.v));
      if (t.t === 'op' && t.v === '(') {
        const v = expr();
        if (!isOp(')')) fail('#WERT');
        p++;
        return v;
      }
      if (t.t === 'fn') {
        if (!isOp('(')) fail('#WERT');
        p++;
        const vals: number[] = [];
        let count = 0;
        while (!isOp(')')) {
          const a = peek();
          if (a?.t === 'range') {
            p++;
            for (const v of rangeVals(a.a, a.b)) {
              if (isErr(v)) fail(v.error);
              const n = typeof v === 'number' ? v : sheetNumber(String(v));
              if (n !== null && v !== '') {
                vals.push(n);
                count++;
              }
            }
          } else {
            vals.push(expr());
            count++;
          }
          if (isOp(',')) p++;
          else if (!isOp(')')) fail('#WERT');
        }
        p++;
        switch (t.v) {
          case 'SUMME':
          case 'SUM':
            return vals.reduce((a, b) => a + b, 0);
          case 'MITTELWERT':
          case 'AVERAGE':
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fail('#DIV/0');
          case 'MIN':
            return vals.length ? Math.min(...vals) : 0;
          case 'MAX':
            return vals.length ? Math.max(...vals) : 0;
          default:
            return count;
        }
      }
      return fail('#WERT');
    };
    try {
      const v = expr();
      if (p < toks.length) return { error: '#WERT' };
      return Number.isFinite(v) ? v : { error: '#WERT' };
    } catch (e) {
      return { error: (e as Error).message || '#WERT' };
    }
  }

  function evalCell(t: string): CellValue {
    const s = t.trim();
    if (s.startsWith('=')) return evalFormula(s.slice(1));
    const n = sheetNumber(s);
    return n === null ? s : n;
  }

  return cells.map((row, r) => row.map((_, c) => valueOf(cellName(c, r))));
}

/** A value for showing: numbers with a German comma, at most 4 decimals. */
export function showValue(v: CellValue): string {
  if (isErr(v)) return v.error;
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000).replace('.', ',');
  return v;
}
