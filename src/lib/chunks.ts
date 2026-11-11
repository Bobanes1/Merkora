/**
 * Long material (several documents, a whole script) is processed in parts: the AI reads one part per
 * step and gets the questions of the cards already made, so nothing is missed and nothing repeats.
 * Pure – tested in scripts/test-srs.mts.
 */
export const PART_SIZE = 40000;

export type Part = { label: string; text: string };

/** Cuts a long text at paragraph (or sentence) boundaries into pieces of at most `max` characters. */
function cut(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let at = window.lastIndexOf('\n\n');
    if (at < max * 0.5) at = window.lastIndexOf('\n');
    if (at < max * 0.5) at = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! ')) + 1;
    if (at < max * 0.5) at = window.lastIndexOf(' ');
    if (at <= 0) at = max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Splits material (documents and notes, in order) into as few, evenly sized parts as possible
 * (each at most `max` characters). All documents are treated as one stream cut at paragraph boundaries,
 * so small documents share a part and big ones continue in the next. Labels name the documents.
 */
export function splitMaterial(docs: { name: string; text: string }[], max = PART_SIZE): Part[] {
  const ds = docs.map((d) => ({ name: d.name, text: d.text.trim() })).filter((d) => d.text);
  if (!ds.length) return [];
  const total = ds.reduce((n, d) => n + d.text.length + 2, 0);
  if (total <= max) return [{ label: ds.map((d) => d.name).join(', '), text: ds.map((d) => d.text).join('\n\n') }];
  const target = Math.ceil(total / Math.ceil(total / max));
  // paragraphs (very long ones cut at sentences), remembering their document
  const blocks = ds.flatMap((d) =>
    d.text
      .split(/\n{2,}/)
      .flatMap((p) => (p.length > target ? cut(p, target) : [p.trim()]))
      .filter(Boolean)
      .map((text) => ({ doc: d.name, text })),
  );
  const groups: { doc: string; text: string }[][] = [];
  let cur: { doc: string; text: string }[] = [];
  let len = 0;
  for (const b of blocks) {
    if (cur.length && (len >= target || len + b.text.length + 2 > max)) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(b);
    len += b.text.length + 2;
  }
  if (cur.length) groups.push(cur);
  // label: the documents of a part; a document spread over several parts is marked as start/continuation
  const partsOf = new Map<string, number[]>();
  groups.forEach((g, i) => new Set(g.map((b) => b.doc)).forEach((d) => partsOf.set(d, [...(partsOf.get(d) ?? []), i])));
  return groups.map((g, i) => {
    const names = [...new Set(g.map((b) => b.doc))].map((d) => {
      const at = partsOf.get(d)!;
      return at.length === 1 ? d : at[0] === i ? `${d} (Anfang)` : at[at.length - 1] === i ? `${d} (Schluss)` : `${d} (Fortsetzung)`;
    });
    return { label: names.join(', '), text: g.map((b) => b.text).join('\n\n') };
  });
}

/** A fixed number of cards shared by the parts in proportion to their length (at least 3 each). 0 = automatic. */
export function shareCount(total: number, parts: { text: string }[]): number[] {
  if (total <= 0) return parts.map(() => 0);
  const all = parts.reduce((n, p) => n + p.text.length, 0) || 1;
  return parts.map((p) => Math.max(3, Math.round((total * p.text.length) / all)));
}

/** The questions of the cards made so far, short enough for the prompt (newest last). */
export function avoidList(fronts: string[], maxChars = 6000): string[] {
  const out: string[] = [];
  let len = 0;
  for (const f of [...fronts].reverse()) {
    const t = f.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!t) continue;
    if (len + t.length > maxChars) break;
    out.unshift(t);
    len += t.length + 3;
  }
  return out;
}
