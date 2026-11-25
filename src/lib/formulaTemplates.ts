/**
 * Categorized visual math, physics, statistics & chemistry LaTeX templates
 * for Merkora's visual Formula Editor. Pure – tested in scripts/test-srs.mts.
 */
export type FormulaCatId = 'basic' | 'calc' | 'linalg' | 'greek' | 'logic' | 'chem';

export type FormulaTemplate = {
  label: string;
  tex: string;
  /** Preview TeX shown on the visual palette button (defaults to `tex`). */
  preview?: string;
};

export type FormulaCategory = {
  id: FormulaCatId;
  label: string;
  items: FormulaTemplate[];
};

export const FORMULA_CATEGORIES: FormulaCategory[] = [
  {
    id: 'basic',
    label: 'Grundlagen',
    items: [
      { label: 'Bruch', tex: '\\frac{a}{b}' },
      { label: 'Wurzel', tex: '\\sqrt{x}' },
      { label: 'n-te Wurzel', tex: '\\sqrt[n]{x}' },
      { label: 'Potenz', tex: 'x^{n}' },
      { label: 'Index', tex: 'x_{i}' },
      { label: 'Plus/Minus', tex: '\\pm' },
      { label: 'Malpunkt', tex: '\\cdot' },
      { label: 'Ungleich', tex: '\\neq' },
      { label: 'Ungefähr', tex: '\\approx' },
      { label: 'Kleiner/gleich', tex: '\\le' },
      { label: 'Größer/gleich', tex: '\\ge' },
      { label: 'Proportional', tex: '\\propto' },
      { label: 'Betrag', tex: '|x|' },
      { label: 'Binomialkoeff.', tex: '\\binom{n}{k}' },
    ],
  },
  {
    id: 'calc',
    label: 'Analysis & Statistik',
    items: [
      { label: 'Summe', tex: '\\sum_{i=1}^{n} x_i' },
      { label: 'Produkt', tex: '\\prod_{i=1}^{n} x_i' },
      { label: 'Integral', tex: '\\int_{a}^{b} f(x)\\,dx' },
      { label: 'Grenzwert', tex: '\\lim_{x \\to \\infty} f(x)' },
      { label: 'Ableitung', tex: '\\frac{df}{dx}' },
      { label: 'Partielle Abl.', tex: '\\frac{\\partial f}{\\partial x}' },
      { label: 'Unendlich', tex: '\\infty' },
      { label: 'Mittelwert', tex: '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i', preview: '\\bar{x}' },
      { label: 'Standardabw.', tex: '\\sigma = \\sqrt{\\frac{1}{n}\\sum (x_i - \\mu)^2}', preview: '\\sigma' },
      { label: 'Wahrscheinlichkeit', tex: 'P(A \\mid B)' },
    ],
  },
  {
    id: 'linalg',
    label: 'Matrizen & Vektoren',
    items: [
      { label: 'Vektor', tex: '\\vec{v}' },
      { label: 'Spaltenvektor', tex: '\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}' },
      { label: '2×2-Matrix', tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
      { label: 'Determinante', tex: '\\det(A)' },
      { label: 'Skalarprodukt', tex: '\\vec{a} \\cdot \\vec{b}' },
      { label: 'Kreuzprodukt', tex: '\\vec{a} \\times \\vec{b}' },
      { label: 'Norm / Länge', tex: '\\|\\vec{v}\\|' },
      { label: 'Transponiert', tex: 'A^{T}' },
    ],
  },
  {
    id: 'greek',
    label: 'Griechisch',
    items: [
      { label: 'Alpha', tex: '\\alpha' },
      { label: 'Beta', tex: '\\beta' },
      { label: 'Gamma', tex: '\\gamma' },
      { label: 'Delta (groß)', tex: '\\Delta' },
      { label: 'Epsilon', tex: '\\varepsilon' },
      { label: 'Theta', tex: '\\theta' },
      { label: 'Lambda', tex: '\\lambda' },
      { label: 'My', tex: '\\mu' },
      { label: 'Pi', tex: '\\pi' },
      { label: 'Rho', tex: '\\rho' },
      { label: 'Sigma', tex: '\\sigma' },
      { label: 'Phi', tex: '\\varphi' },
      { label: 'Omega', tex: '\\omega' },
      { label: 'Ohm', tex: '\\Omega' },
    ],
  },
  {
    id: 'logic',
    label: 'Mengen & Logik',
    items: [
      { label: 'Element von', tex: '\\in' },
      { label: 'Kein Element', tex: '\\notin' },
      { label: 'Teilmenge', tex: '\\subseteq' },
      { label: 'Vereinigung', tex: '\\cup' },
      { label: 'Schnittmenge', tex: '\\cap' },
      { label: 'Reelle Zahlen', tex: '\\mathbb{R}' },
      { label: 'Natürliche Z.', tex: '\\mathbb{N}' },
      { label: 'Folgt daraus', tex: '\\Rightarrow' },
      { label: 'Äquivalent', tex: '\\Leftrightarrow' },
      { label: 'Für alle', tex: '\\forall' },
      { label: 'Es existiert', tex: '\\exists' },
      { label: 'Und / Oder', tex: '\\land \\; \\lor' },
    ],
  },
  {
    id: 'chem',
    label: 'Chemie & Physik',
    items: [
      { label: 'Reaktionspfeil', tex: '\\longrightarrow' },
      { label: 'Gleichgewicht', tex: '\\rightleftharpoons' },
      { label: 'Wasser', tex: '\\text{H}_2\\text{O}' },
      { label: 'CO₂', tex: '\\text{CO}_2' },
      { label: 'Ion (+)', tex: '\\text{Na}^{+}' },
      { label: 'Ion (−)', tex: '\\text{Cl}^{-}' },
      { label: 'Energie', tex: 'E = m \\cdot c^2' },
      { label: 'Ohmsches Gesetz', tex: 'U = R \\cdot I' },
      { label: 'Kraft', tex: 'F = m \\cdot a' },
      { label: 'Grad Celsius', tex: '^\\circ\\text{C}' },
    ],
  },
];

/** Wraps raw LaTeX into inline `$...$` or display `$$...$$` syntax for Merkora cards. */
export function wrapFormula(tex: string, display = false): string {
  const clean = tex.trim().replace(/^\$+|\$+$/g, '').trim();
  if (!clean) return '';
  return display ? `$$${clean}$$` : `$${clean}$`;
}
