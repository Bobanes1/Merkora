/**
 * Many Anki back templates repeat the question ({{FrontSide}}, or the same fields written again) before
 * the answer. Wherever the front is already shown (card list, learning after flipping), only the answer
 * part is shown – the outer wrappers (e.g. <div class="wrap"> with the deck's colours) are kept.
 * Pure – tested in scripts/test-srs.mts.
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Opening tags that are still open at the end of `html` (in order), e.g. '<div class="wrap">'. */
function stillOpen(html: string): string {
  const stack: { name: string; tag: string }[] = [];
  for (const m of html.matchAll(/<\/?([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const name = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const i = stack.map((x) => x.name).lastIndexOf(name);
      if (i >= 0) stack.length = i;
    } else if (!m[2] && !VOID.has(name)) stack.push({ name, tag: m[0] });
  }
  return stack.map((x) => x.tag).join('');
}

/** Everything after `end` in the back, kept inside the wrappers that were open before it. */
const after = (back: string, cut: number, end: number) => {
  const rest = back.slice(end).replace(/^\s*(<br\s*\/?>\s*)*/i, '');
  return hasContent(rest) ? stillOpen(back.slice(0, cut)) + rest : '';
};
const hasContent = (s: string) => !!s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<(img|audio|video|svg)\b/i.test(s);

export function answerOnly(front: string, back: string): string {
  // 1) Anki's marker between question and answer: <hr id=answer>
  const marker = /<hr\b[^>]*\bid\s*=\s*["']?answer["']?[^>]*>/i.exec(back);
  if (marker) {
    const out = after(back, marker.index, marker.index + marker[0].length);
    if (out) return out;
  }
  // 2) the whole front repeated at the start, maybe followed by a separator line
  const f = front.trim();
  if (f.length >= 12) {
    const i = back.indexOf(f);
    if (i >= 0) {
      let end = i + f.length;
      const sep = /^\s*(<br\s*\/?>\s*)*<hr\b[^>]*>/i.exec(back.slice(end));
      if (sep) end += sep[0].length;
      const rest = back.slice(end).replace(/^\s*(<br\s*\/?>\s*)*/i, '');
      if (hasContent(rest)) return back.slice(0, i) + rest;
    }
  }
  return back;
}
