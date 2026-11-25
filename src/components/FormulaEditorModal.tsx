import { useEffect, useRef, useState } from 'react';
import { FORMULA_CATEGORIES, wrapFormula, type FormulaCatId } from '../lib/formulaTemplates';
import { Modal } from './Modal';

type KatexLike = { renderToString: (tex: string, opts?: { displayMode?: boolean; throwOnError?: boolean }) => string };

/** Visual LaTeX / Math Formula Editor with live KaTeX preview and categorized click-to-insert templates. */
export function FormulaEditorModal({
  onInsert,
  onClose,
}: {
  onInsert: (wrappedLatex: string) => void;
  onClose: () => void;
}) {
  const [tex, setTex] = useState('');
  const [cat, setCat] = useState<FormulaCatId>('basic');
  const [display, setDisplay] = useState(false);
  const [katex, setKatex] = useState<KatexLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => {
      if (alive) setKatex((mod.default ?? mod) as unknown as KatexLike);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const renderTex = (raw: string, disp = false): string => {
    if (!katex || !raw.trim()) return '';
    try {
      return katex.renderToString(raw, { displayMode: disp, throwOnError: false });
    } catch {
      return raw;
    }
  };

  const insertSnippet = (snippet: string) => {
    const el = inputRef.current;
    if (!el) {
      setTex((prev) => (prev ? `${prev} ${snippet}` : snippet));
      return;
    }
    const a = el.selectionStart ?? tex.length;
    const b = el.selectionEnd ?? tex.length;
    const sep = a > 0 && /[A-Za-z\\]$/.test(tex.slice(0, a)) && /^[A-Za-z]/.test(snippet) ? ' ' : '';
    const next = tex.slice(0, a) + sep + snippet + tex.slice(b);
    setTex(next);
    const pos = a + sep.length + snippet.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const activeCategory = FORMULA_CATEGORIES.find((c) => c.id === cat) ?? FORMULA_CATEGORIES[0];
  const previewHtml = tex.trim() ? renderTex(tex.trim(), display) : '';

  const submit = () => {
    const wrapped = wrapFormula(tex, display);
    if (!wrapped) return;
    onInsert(wrapped);
    onClose();
  };

  return (
    <Modal
      title="Visueller Formeleditor"
      onClose={onClose}
      wide
      className="formula-modal"
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" disabled={!tex.trim()} onClick={submit}>
            Formel einfügen
          </button>
        </>
      }
    >
      <div className="formula-preview-box">
        {previewHtml ? (
          <div className={display ? 'formula-preview display' : 'formula-preview'} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : (
          <span className="muted small">Klicke unten auf Bausteine oder tippe LaTeX – hier erscheint sofort die Vorschau.</span>
        )}
      </div>

      <div className="row-gap between" style={{ marginBottom: 6 }}>
        <label className="field-label" htmlFor="formula-tex" style={{ margin: 0 }}>
          Formel (LaTeX)
        </label>
        <div className="seg compact" role="radiogroup" aria-label="Darstellung">
          <button type="button" role="radio" aria-checked={!display} className={!display ? 'on' : ''} onClick={() => setDisplay(false)}>
            Im Text ($…$)
          </button>
          <button type="button" role="radio" aria-checked={display} className={display ? 'on' : ''} onClick={() => setDisplay(true)}>
            Zentriert ($$…$$)
          </button>
        </div>
      </div>

      <textarea
        id="formula-tex"
        ref={inputRef}
        className="input mono"
        rows={2}
        value={tex}
        placeholder="z. B. \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
        onChange={(e) => setTex(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />

      <div className="chips" style={{ marginTop: 10 }}>
        {FORMULA_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={'chip' + (c.id === cat ? ' on' : '')} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="formula-grid">
        {activeCategory.items.map((item) => {
          const rendered = renderTex(item.preview ?? item.tex, false);
          return (
            <button
              key={item.label}
              type="button"
              className="formula-tile"
              title={`${item.label}: ${item.tex}`}
              onClick={() => insertSnippet(item.tex)}
            >
              {rendered ? (
                <span className="formula-tile-math" dangerouslySetInnerHTML={{ __html: rendered }} />
              ) : (
                <code className="formula-tile-math">{item.tex}</code>
              )}
              <small>{item.label}</small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
