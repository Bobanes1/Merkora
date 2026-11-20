/**
 * The math behind the interactive labs (probability, analysis, linear algebra).
 * Pure – tested in scripts/test-srs.mts.
 */

// ---------- probability ----------
/** n choose k (exact for the sizes used here). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(X = k) for X ~ Bin(n, p). */
export const binomPmf = (n: number, p: number, k: number) => choose(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);

/** P(a ≤ X ≤ b) for X ~ Bin(n, p). */
export function binomRange(n: number, p: number, a: number, b: number): number {
  let s = 0;
  for (let k = Math.max(0, Math.ceil(a)); k <= Math.min(n, Math.floor(b)); k++) s += binomPmf(n, p, k);
  return s;
}

/** Error function (Abramowitz–Stegun 7.1.26, error < 1.5e-7). */
export function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Φ((x − μ)/σ) – distribution function of the normal distribution. */
export const normalCdf = (x: number, mu = 0, sigma = 1) => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
/** Density of the normal distribution. */
export const normalPdf = (x: number, mu = 0, sigma = 1) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));

/** P(X = k) when drawing n from N items of which K are hits, without putting back. */
export const hypergeom = (N: number, K: number, n: number, k: number) => (choose(K, k) * choose(N - K, n - k)) / choose(N, n);

/** Small reproducible random numbers (mulberry32) – the same seed gives the same simulation. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Throws a coin (`p` = probability of a hit) n times: the relative frequency after every throw. */
export function simulateCoin(n: number, p: number, seed: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let hits = 0;
  for (let i = 1; i <= n; i++) {
    if (r() < p) hits++;
    out.push(hits / i);
  }
  return out;
}

/** Throws `dice` dice n times: how often each sum came up (index = sum). */
export function simulateDice(n: number, dice: number, seed: number): number[] {
  const r = rng(seed);
  const counts = new Array(dice * 6 + 1).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0; d < dice; d++) s += 1 + Math.floor(r() * 6);
    counts[s]++;
  }
  return counts;
}

/** Exact probabilities of the sums of `dice` fair dice (index = sum). */
export function diceSumDist(dice: number): number[] {
  let dist = [1];
  for (let d = 0; d < dice; d++) {
    const next = new Array(dist.length + 6).fill(0);
    dist.forEach((p, s) => {
      for (let f = 1; f <= 6; f++) next[s + f] += p / 6;
    });
    dist = next;
  }
  return dist;
}

/** Two-stage tree: P(A), P(B|A), P(B|not A) → the four paths and P(B). */
export function treePaths(pA: number, pBgivenA: number, pBgivenNotA: number) {
  const AB = pA * pBgivenA, AnB = pA * (1 - pBgivenA), nAB = (1 - pA) * pBgivenNotA, nAnB = (1 - pA) * (1 - pBgivenNotA);
  return { AB, AnB, nAB, nAnB, B: AB + nAB, AgivenB: AB + nAB > 0 ? AB / (AB + nAB) : 0 };
}

/** Bayes / four-field table from prevalence, sensitivity and specificity – also as natural frequencies of `of` people. */
export function bayesTable(prevalence: number, sensitivity: number, specificity: number, of = 1000) {
  const sick = prevalence * of, healthy = of - sick;
  const truePos = sick * sensitivity, falseNeg = sick - truePos;
  const trueNeg = healthy * specificity, falsePos = healthy - trueNeg;
  const positive = truePos + falsePos;
  return { sick, healthy, truePos, falseNeg, falsePos, trueNeg, positive, ppv: positive > 0 ? truePos / positive : 0, npv: trueNeg + falseNeg > 0 ? trueNeg / (trueNeg + falseNeg) : 0 };
}

// ---------- analysis ----------
type F = (x: number) => number;
/** Slope at x (central difference). */
export const derivative = (f: F, x: number, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h);
/** Area between a and b (Simpson's rule, n even). */
export function integral(f: F, a: number, b: number, n = 400): number {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}
/** Zeros between min and max (sign changes, refined by bisection). */
export function zeros(f: F, min: number, max: number, steps = 400): number[] {
  const out: number[] = [];
  let x0 = min, y0 = f(min);
  for (let i = 1; i <= steps; i++) {
    const x1 = min + ((max - min) * i) / steps, y1 = f(x1);
    if (Number.isFinite(y0) && Number.isFinite(y1)) {
      if (y0 === 0) out.push(x0);
      else if (y0 * y1 < 0) {
        let a = x0, b = x1;
        for (let k = 0; k < 50; k++) {
          const m = (a + b) / 2;
          if (f(a) * f(m) <= 0) b = m;
          else a = m;
        }
        out.push((a + b) / 2);
      }
    }
    x0 = x1;
    y0 = y1;
  }
  return out.filter((z, i, a) => i === 0 || Math.abs(z - a[i - 1]) > (max - min) / steps);
}
/** Highest and lowest points (where the slope changes sign). */
export function extrema(f: F, min: number, max: number): { x: number; y: number; kind: 'max' | 'min' }[] {
  const d = (x: number) => derivative(f, x);
  return zeros(d, min, max).map((x) => ({ x, y: f(x), kind: derivative(d, x) < 0 ? 'max' : 'min' }));
}

// ---------- linear algebra ----------
export type Vec = [number, number];
export type Mat = [[number, number], [number, number]];
export const apply = (m: Mat, v: Vec): Vec => [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]];
export const det = (m: Mat) => m[0][0] * m[1][1] - m[0][1] * m[1][0];
export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const scale = (k: number, v: Vec): Vec => [k * v[0], k * v[1]];

/** Rounds for display: 0,2668 / 26,68 % */
export const fmt = (v: number, digits = 4) => (Number.isFinite(v) ? Number(v.toFixed(digits)).toString().replace('.', ',') : '–');
export const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)} %`;
