/**
 * A small Java highlighter (keywords, types, strings, characters, comments, numbers, annotations) for the
 * code editor and code on cards. Produces escaped HTML with <span class="tk-…">. Pure – tested.
 */
const KEYWORDS = new Set(
  'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try var void volatile while yield record sealed permits true false null'.split(' '),
);
const TYPES = new Set('boolean byte char double float int long short String Object Integer Long Double Boolean Character List ArrayList Map HashMap Set HashSet Arrays Math System Scanner StringBuilder'.split(' '));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)*'?)|(@\w+)|(\b\d[\d_]*(?:\.\d+)?[lLfFdD]?\b|\b0x[\da-fA-F]+\b)|([A-Za-z_$][\w$]*)/g;

export function highlightJava(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    out += esc(code.slice(last, m.index));
    const [t, comment, str, chr, ann, number, word] = m;
    const cls = comment ? 'com' : str || chr ? 'str' : ann ? 'ann' : number ? 'num' : word && KEYWORDS.has(word) ? 'kw' : word && TYPES.has(word) ? 'type' : '';
    out += cls ? `<span class="tk-${cls}">${esc(t)}</span>` : esc(t);
    last = m.index! + t.length;
  }
  return out + esc(code.slice(last));
}

/** Is a code block probably Java (or a close relative)? Used for code on cards without a language. */
export const looksLikeJava = (code: string) => /\b(public|static|void|class|int|String|System\.out)\b/.test(code);
