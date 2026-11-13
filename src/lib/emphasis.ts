/**
 * Key words in AI cards: the AI marks them with **…**, Merkora stores them in bold.
 * Pure – tested in scripts/test-srs.mts.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Has the text at least one complete **…** mark? */
export const hasEmphasis = (s: string) => /\*\*[^*\n]+?\*\*/.test(s);

/** Text without the ** marks (when bold words are switched off). */
export const stripEmphasis = (s: string) => s.replace(/\*\*([^*\n]+?)\*\*/g, '$1');

/** Plain AI text → card HTML: escaped, line breaks kept, **word** in bold (a lone ** stays as it is). */
export function emphasisHtml(s: string): string {
  return esc(s)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

/** The instruction for the AI (only when bold words are on). */
export const EMPHASIS_RULE =
  'Markiere in jeder Antwort die 1–3 wichtigsten Begriffe mit **…** (nur Schlüsselwörter, keine ganzen Sätze); in der Frage höchstens den zentralen Fachbegriff.';
