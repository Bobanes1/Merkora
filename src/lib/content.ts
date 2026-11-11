import DOMPurify from 'dompurify';
import type { Card } from './store';
import { answerOnly } from './backSide';

/**
 * Cleans card HTML: keeps formatting (also inline colours, sizes and layout like in Anki), images, audio, tables
 * and SVG drawings; removes scripts, event handlers and embedded pages.
 */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['rb'],
    ADD_ATTR: ['data-media', 'controls', 'vector-effect', 'preserveAspectRatio', 'data-px'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'canvas'],
    FORBID_ATTR: ['srcset'],
  });
}

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => escapeMap[c]);

/** Plain text → HTML (keeps line breaks). */
export const textToHtml = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

/** HTML → readable plain text (for search, AI prompts and lists). */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, '\n')
    .replace(/<img[^>]*>/gi, ' [Bild] ')
    .replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, ' [Audio] ');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export const sideText = (card: Pick<Card, 'html'>, side: string) => (card.html ? htmlToText(side) : side);
export const cardFrontText = (c: Card) => sideText(c, c.front);
/** Answer only (without a repeated front from Anki templates) – shorter material for the AI. */
export const cardBackText = (c: Card) => sideText(c, c.html ? answerOnly(c.front, c.back) : c.back);
export const cardHasMedia = (c: Card) => !!c.html && /data-media=/.test(c.front + c.back);
