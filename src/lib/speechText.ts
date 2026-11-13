/** Text to read aloud, cleaned of HTML and Markdown. Pure – tested in scripts/test-srs.mts. */

const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Card HTML → plain sentences (pictures and graphics are left out, line breaks become pauses). */
export function htmlSpeech(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<div class="diagram"[\s\S]*?<\/div>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENT[e.toLowerCase()] ?? ' ')
    .replace(/\s*([.!?])(\s*\.)+/g, '$1')
    .replace(/\s+([.!?,;:])/g, '$1')
    .replace(/^[\s.]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown (summary) → paragraphs to read one after another. */
export function markdownSpeech(md: string): string[] {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, '').trim())
        .filter((l) => l && !/^[-|:\s]+$/.test(l))
        .map((l) => (/[.!?:;]$/.test(l) ? l : l + '.'))
        .join(' ')
        .replace(/[*_`~]+/g, '')
        .replace(/\|/g, ', ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}
