/**
 * A small, safe formula calculator for curves the AI describes ("10 - x", "exp(-x^2/2)/sqrt(2*pi)").
 * Own parser – no eval: numbers, x, pi, e, + − * / ^, brackets and a few functions.
 * Pure – tested in scripts/test-srs.mts.
 */
type Fn = (x: number) => number;
const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
};

/** Compiles a formula in x; null if it is not valid (unknown names, wrong brackets …). */
export function compileExpr(src: string): Fn | null {
  // "0,5" is a decimal comma, "max(1, x)" separates arguments
  const s = src.replace(/(\d),(?=\d)/g, '$1.').replace(/\s+/g, '').replace(/·|×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!s || s.length > 200) return null;
  let i = 0;
  const peek = () => s[i];
  const fail = (): never => {
    throw new Error('bad');
  };
  // expr := term (('+'|'-') term)*
  function expr(): Fn {
    let f = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const a = f, b = term();
      f = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return f;
  }
  // term := power (('*'|'/'|implicit) power)*
  function term(): Fn {
    let f = unary();
    for (;;) {
      const c = peek();
      if (c === '*' || c === '/') {
        i++;
        const a = f, b = unary();
        f = c === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (c !== undefined && /[a-z0-9.(]/i.test(c)) {
        // implicit multiplication: 2x, 3(x+1), 2pi
        const a = f, b = unary();
        f = (x) => a(x) * b(x);
      } else return f;
    }
  }
  function unary(): Fn {
    if (peek() === '-') {
      i++;
      const a = unary();
      return (x) => -a(x);
    }
    if (peek() === '+') {
      i++;
      return unary();
    }
    return power();
  }
  // power := atom ('^' unary)?   (right-assoc)
  function power(): Fn {
    const base = atom();
    if (peek() === '^') {
      i++;
      const e = unary();
      return (x) => Math.pow(base(x), e(x));
    }
    return base;
  }
  function atom(): Fn {
    const c = peek();
    if (c === '(') {
      i++;
      const f = expr();
      if (s[i++] !== ')') fail();
      return f;
    }
    const num = s.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (num) {
      i += num[0].length;
      const v = Number(num[0]);
      return () => v;
    }
    const name = s.slice(i).match(/^[a-z]+/i)?.[0]?.toLowerCase();
    if (!name) fail();
    // longest known name first ("exp" before "e", "pi")
    const known = Object.keys(FUNCS).find((k) => name!.startsWith(k) && s[i + k.length] === '(');
    if (known) {
      i += known.length + 1;
      const args = [expr()];
      while (peek() === ',' || peek() === ';') {
        i++;
        args.push(expr());
      }
      if (s[i++] !== ')') fail();
      const fn = FUNCS[known];
      return (x) => fn(...args.map((a) => a(x)));
    }
    if (name!.startsWith('pi')) {
      i += 2;
      return () => Math.PI;
    }
    if (name!.startsWith('x')) {
      i += 1;
      return (x) => x;
    }
    if (name!.startsWith('e')) {
      i += 1;
      return () => Math.E;
    }
    return fail();
  }
  try {
    const f = expr();
    if (i !== s.length) return null;
    return f;
  } catch {
    return null;
  }
}

/** Points of a curve between min and max (gaps where the formula has no value, e.g. ln of negatives). */
export function sampleCurve(f: Fn, min: number, max: number, n = 120): ({ x: number; y: number } | null)[] {
  const out: ({ x: number; y: number } | null)[] = [];
  for (let k = 0; k <= n; k++) {
    const x = min + ((max - min) * k) / n;
    const y = f(x);
    out.push(Number.isFinite(y) ? { x, y } : null);
  }
  return out;
}
