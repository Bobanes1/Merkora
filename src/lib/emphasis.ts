/**
 * Key words in AI cards: the AI marks them with **…**, Merkora stores them in bold.
 * Pure – tested in scripts/test-srs.mts.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Has the text at least one complete **…** mark? */
export const hasEmphasis = (s: string) => /\*\*[^*\n]+?\*\*/.test(s);

/** Text without the ** marks (when bold words are switched off). */
export const stripEmphasis = (s: string) => s.replace(/\*\*([^*\n]+?)\*\*/g, '$1');

/**
 * LaTeX in AI answers: in JSON "\frac" or "\theta" arrive as control characters (form feed + "rac", tab + "heta").
 * Inside formulas \( … \), \[ … \] and $$ … $$ they get their backslash back.
 */
export function repairMath(s: string): string {
  const fix = (m: string) =>
    m
      .replace(/\t(?=[a-z])/gi, '\\t')
      .replace(/\r(?=[a-z])/gi, '\\r')
      .replace(/\n(?=[a-z])/gi, '\\n');
  return s
    .replace(/\x0c/g, '\\f')
    .replace(/\x08/g, '\\b')
    .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, fix);
}

/** A piece of explanation text: plain text, or a formula with its delimiters (shown with KaTeX). */
export type MathPiece = { math: false; text: string } | { math: true; text: string; display: boolean };

/**
 * Splits text into plain parts and formulas \( … \), \[ … \] and $$ … $$ – so Markdown formatting
 * (_italics_, **bold**) never touches a formula like x_i. Pure – tested.
 */
export function splitMath(s: string): MathPiece[] {
  const out: MathPiece[] = [];
  const re = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ math: false, text: s.slice(last, m.index) });
    out.push({ math: true, text: m[0], display: !m[0].startsWith('\\(') });
    last = m.index + m[0].length;
  }
  if (last < s.length || !out.length) out.push({ math: false, text: s.slice(last) });
  return out;
}

/**
 * Plain AI text → card HTML: escaped, line breaks kept, **word** in bold (a lone ** stays as it is).
 * Code blocks (```java … ```) become <pre class="code"> (highlighted when shown), `inline code` <code>.
 */
export function emphasisHtml(s: string): string {
  const text = (t: string) =>
    esc(t)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  return repairMath(s)
    .split(/```[\w+#-]*[ \t]*\n?([\s\S]*?)```/)
    .map((part, i) => (i % 2 ? `<pre class="code"><code>${esc(part.replace(/\n$/, ''))}</code></pre>` : text(part.replace(/^\n|\n$/g, ''))))
    .join('');
}

/** The instruction for the AI (only when bold words are on). */
export const EMPHASIS_RULE =
  'Markiere in jeder Antwort die 1–3 wichtigsten Begriffe mit **…** (nur Schlüsselwörter, keine ganzen Sätze); in der Frage höchstens den zentralen Fachbegriff.';
