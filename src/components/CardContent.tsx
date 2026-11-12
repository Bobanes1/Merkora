import { useEffect, useMemo, useRef } from 'react';
import { sanitize } from '../lib/content';
import { mediaUrl } from '../lib/db';
import type { Card, Deck } from '../lib/store';
import { useResolvedTheme } from '../lib/theme';
import { parseDiagram, PALETTES, renderDiagram } from '../lib/diagram';

/** How an imported Anki card looks: its note type CSS and the wrapping class (`card card1`). */
export type CardLook = { css?: string; cls?: string };

export function lookOf(deck: Pick<Deck, 'styles'> | undefined, card: Pick<Card, 'styleId' | 'cardClass'> | undefined): CardLook | undefined {
  if (!card || (!card.styleId && !card.cardClass)) return undefined;
  return { css: card.styleId ? deck?.styles?.[card.styleId] : undefined, cls: card.cardClass };
}

const MEDIA_REF = /merkora-media:([A-Za-z0-9_-]+)/g;

/** Replaces media references in CSS / style attributes (`url("merkora-media:<id>")`) with loadable addresses. */
async function resolveMediaRefs(text: string): Promise<string> {
  const ids = [...new Set([...text.matchAll(MEDIA_REF)].map((m) => m[1]))];
  if (!ids.length) return text;
  const urls = await Promise.all(ids.map((id) => mediaUrl(id)));
  let out = text;
  ids.forEach((id, i) => (out = out.split(`merkora-media:${id}`).join(urls[i] ?? '')));
  return out;
}

/** Big view of a slide picture; a click or Escape closes it. */
export function openLightbox(src: string, alt: string) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', alt || 'Bild');
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  box.append(img);
  const close = () => {
    box.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  window.addEventListener('keydown', onKey, true);
  document.body.append(box);
}

/** Slide pictures open big on click – without flipping the flashcard underneath. */
function zoomableSlides(root: ParentNode) {
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img.slide-img'))) {
    img.title = 'Zum Vergrößern klicken';
    img.onclick = (e) => {
      e.stopPropagation();
      if (img.src) openLightbox(img.src, img.alt);
    };
  }
}

/** Draws AI diagrams (stored as description) in the current colour scheme (also inside a card's shadow root). */
export function hydrateDiagrams(root: ParentNode, dark: boolean) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-diagram]'))) {
    try {
      const d = parseDiagram(JSON.parse(el.getAttribute('data-diagram') ?? ''));
      // our own SVG with escaped labels – safe to insert
      if (d) el.innerHTML = renderDiagram(d, PALETTES[dark ? 'dark' : 'light']);
    } catch {
      /* broken description: leave the card without a graphic */
    }
  }
}

/** Loads stored images/audio into elements that carry a data-media id (also inside a card's shadow root). */
export async function hydrateMedia(root: ParentNode) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-media]'));
  const styled = Array.from(root.querySelectorAll<HTMLElement>('[style*="merkora-media:"]'));
  await Promise.all([
    ...els.map(async (el) => {
      const id = el.getAttribute('data-media');
      if (!id) return;
      const url = await mediaUrl(id);
      if (!url) {
        if (el.tagName === 'IMG') el.classList.add('media-missing');
        return;
      }
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement;
        img.addEventListener('error', () => img.classList.add('media-missing'), { once: true });
        img.addEventListener('load', () => fitOcclusion(img), { once: true });
        img.src = url;
      } else if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO' || el.tagName === 'SOURCE') {
        (el as HTMLMediaElement).src = url;
        if (el.tagName === 'SOURCE') (el.parentElement as HTMLMediaElement | null)?.load?.();
      }
    }),
    ...styled.map(async (el) => el.setAttribute('style', await resolveMediaRefs(el.getAttribute('style') ?? ''))),
  ]);
}

/** Image occlusion masks stored in pixels: match the overlay to the picture's real size. */
function fitOcclusion(img: HTMLImageElement) {
  const svg = img.parentElement?.querySelector<SVGSVGElement>('svg.io-overlay[data-px]');
  if (svg && img.naturalWidth) svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
}

// @font-face rules are ignored inside shadow roots, so fonts of Anki note types are declared on the page.
const fontFaces = new Set<string>();
function hoistFontFaces(css: string) {
  const faces = css.match(/@font-face\s*\{[^}]*\}/gi);
  if (!faces) return css;
  for (const f of faces) {
    if (fontFaces.has(f)) continue;
    fontFaces.add(f);
    const st = document.createElement('style');
    st.textContent = f;
    document.head.appendChild(st);
  }
  return css.replace(/@font-face\s*\{[^}]*\}/gi, '');
}

/** Base look inside an Anki card (before the note type's own CSS). */
const BASE_CSS = `
:host { display: block; }
.card { font-family: arial, sans-serif; font-size: 20px; line-height: 1.45; text-align: center; color: #1f2933; overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
audio, video { max-width: 100%; }
table { border-collapse: collapse; margin: 0 auto; }
td, th { border: 1px solid #d5d9e0; padding: 4px 8px; }
.cloze { font-weight: 700; color: #2563eb; }
details.hint summary { cursor: pointer; color: #09817e; }
.media-missing { min-width: 60px; min-height: 40px; outline: 2px dashed #d5d9e0; }
.io-header { margin-bottom: 8px; }
.io-wrap { position: relative; display: inline-block; max-width: 100%; }
.io-wrap img { display: block; max-width: 100%; height: auto; margin: 0; }
.io-overlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.io-active { fill: #ff8e8e; stroke: #212121; stroke-width: 1.5px; }
.io-inactive { fill: #ffeba2; stroke: #212121; stroke-width: 1.5px; }
.io-revealed { fill: rgba(255, 142, 142, 0.12); stroke: #e5484d; stroke-width: 2.5px; }
.io-text { position: absolute; font-weight: 700; color: #000; font-size: 0.9em; }
.io-extra { margin-top: 10px; }
.card.nightMode { color: #d6e8e7; }
.nightMode .cloze { color: #8ab4ff; }
.nightMode td, .nightMode th { border-color: #2a3d3c; }
`;

const hasMath = (s: string) => /\\\(|\\\[|\$\$/.test(s);

let katexInline: Promise<string> | null = null;

async function renderMath(el: HTMLElement, shadow?: ShadowRoot) {
  const [{ default: renderMathInElement }] = await Promise.all([
    import('katex/contrib/auto-render'),
    import('katex/dist/katex.min.css'),
  ]);
  if (shadow && !shadow.querySelector('style[data-katex]')) {
    katexInline ??= import('katex/dist/katex.min.css?inline').then((m) => m.default as string);
    const st = document.createElement('style');
    st.setAttribute('data-katex', '');
    st.textContent = await katexInline;
    shadow.prepend(st);
  }
  renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
  });
}

/**
 * Shows one side of a card: plain text, or Anki-style HTML with images, audio and formulas.
 * Imported Anki cards keep their own look: they are drawn in a shadow root with their note type's CSS.
 */
export function CardContent({ text, html, className = '', look }: { text: string; html?: boolean; className?: string; look?: CardLook }) {
  const ref = useRef<HTMLDivElement>(null);
  const clean = useMemo(() => (html ? sanitize(text) : ''), [text, html]);
  const styled = !!(html && look && (look.css || look.cls));
  const css = look?.css ?? '';
  const cls = look?.cls ?? 'card';
  const dark = useResolvedTheme() === 'dark';
  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;
    let cancelled = false;
    if (styled) {
      const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
      root.replaceChildren();
      const base = document.createElement('style');
      base.textContent = BASE_CSS;
      const own = document.createElement('style');
      const wrap = document.createElement('div');
      wrap.className = dark ? `${cls} nightMode night_mode` : cls;
      wrap.innerHTML = clean;
      root.append(base, own, wrap);
      if (css)
        void resolveMediaRefs(css).then((c) => {
          if (!cancelled) own.textContent = hoistFontFaces(c);
        });
      void hydrateMedia(root);
      hydrateDiagrams(root, dark);
      zoomableSlides(root);
      if (hasMath(clean)) void renderMath(wrap, root).catch(() => undefined);
    } else {
      el.innerHTML = clean;
      void hydrateMedia(el);
      hydrateDiagrams(el, dark);
      zoomableSlides(el);
      if (hasMath(clean)) void renderMath(el).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [clean, html, styled, css, cls, dark]);
  if (!html) {
    if (hasMath(text)) return <MathText text={text} className={className} />;
    return <div className={`card-content plain ${className}`}>{text}</div>;
  }
  return <div ref={ref} className={`card-content rich ${styled ? 'anki-look' : ''} ${className}`} />;
}

function MathText({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = text;
    void renderMath(ref.current).catch(() => undefined);
  }, [text]);
  return <div ref={ref} className={`card-content plain ${className}`} />;
}
