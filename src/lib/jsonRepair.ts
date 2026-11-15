/**
 * Reads AI answers that should be JSON but are slightly broken: text or code fences around them,
 * line breaks or tabs inside strings, trailing commas, and – most important – answers cut off because
 * the length limit was reached (then everything complete up to that point is kept).
 * Pure – tested in scripts/test-srs.mts.
 */

/** Returns the parsed value, or null if nothing usable is in the text. */
export function repairJson(text: string): unknown {
  let s = text.replace(/^﻿/, '').replace(/```(?:json|JSON)?/g, '');
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  s = s.slice(start);

  // 1) walk once: escape raw control characters inside strings, drop trailing commas,
  //    remember the last place where the structure was complete, and what is still open
  let out = '';
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = -1; // length of `out` after the last complete element
  let stackAtSafe: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        // "\(" or "\s" are no JSON escapes (LaTeX, regex …): the backslash stays a backslash
        if (!'"\\/bfnrtu'.includes(c)) out += '\\';
        out += c;
        esc = false;
      } else if (c === '\\') {
        out += c;
        esc = true;
      } else if (c === '"') {
        out += c;
        inStr = false;
      } else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (c < ' ') out += ' ';
      else out += c;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '{' || c === '[') {
      stack.push(c === '{' ? '}' : ']');
      out += c;
    } else if (c === '}' || c === ']') {
      out = out.replace(/,\s*$/, ''); // trailing comma
      if (stack.length && stack[stack.length - 1] === c) stack.pop();
      out += c;
      if (!stack.length) {
        // the whole value is complete: ignore whatever text follows
        lastSafe = out.length;
        stackAtSafe = [];
        break;
      }
      lastSafe = out.length;
      stackAtSafe = [...stack];
    } else if (c === ',') {
      out += c;
      // a comma ends a complete element (value inside an array or object)
      lastSafe = out.length - 1;
      stackAtSafe = [...stack];
    } else out += c;
  }

  const attempt = (t: string) => {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return undefined;
    }
  };
  // 2) complete as it is
  if (!stack.length && !inStr) {
    const v = attempt(out);
    if (v !== undefined) return v;
  }
  // 3) cut off: keep everything up to the last complete element and close what is still open
  if (lastSafe > 0) {
    let cut = out.slice(0, lastSafe).replace(/,\s*$/, '');
    // a key without its value ("…, "front":") cannot be kept
    cut = cut.replace(/,?\s*"[^"]*"\s*:\s*$/, '');
    const closed = cut + [...stackAtSafe].reverse().join('');
    const v = attempt(closed);
    if (v !== undefined) return v;
  }
  return null;
}
