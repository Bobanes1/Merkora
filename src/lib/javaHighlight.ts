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

/** Keywords of the other languages of code tasks (JavaScript, Python, SQL). */
const LANG_WORDS: Record<string, Set<string>> = {
  javascript: new Set('async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield'.split(' ')),
  python: new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print len range list dict set str int float'.split(' ')),
  sql: new Set('select from where and or not in is null like between group by order having limit offset as join inner left right outer on distinct count sum avg min max insert into values update set delete create table primary key integer text real case when then else end asc desc union all exists'.split(' ')),
};
const TOKEN_PY = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(@\w+)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g;
const TOKEN_SQL = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^'\n]|'')*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g;
const TOKEN_JS = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

/** Highlights code of a task language (Java as before). */
export function highlightCode(code: string, lang = 'java'): string {
  if (lang === 'java' || !LANG_WORDS[lang]) return highlightJava(code);
  const words = LANG_WORDS[lang];
  const re = lang === 'python' ? TOKEN_PY : lang === 'sql' ? TOKEN_SQL : TOKEN_JS;
  let out = '';
  let last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    const t = m[0];
    const groups = m.slice(1);
    const word = groups[groups.length - 1];
    const comment = groups[0], str = groups[1];
    const number = lang === 'python' ? groups[3] : groups[2];
    const kw = word && (lang === 'sql' ? words.has(word.toLowerCase()) : words.has(word));
    const cls = comment ? 'com' : str ? 'str' : number ? 'num' : kw ? 'kw' : lang === 'python' && groups[2] ? 'ann' : '';
    out += cls ? `<span class="tk-${cls}">${esc(t)}</span>` : esc(t);
    last = m.index! + t.length;
  }
  return out + esc(code.slice(last));
}
