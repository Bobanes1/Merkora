import { useLayoutEffect, useRef } from 'react';
import { highlightCode } from '../lib/javaHighlight';
import { usePhone } from '../lib/phone';

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

/**
 * Syntax-highlighted code editor with line numbers, Tab/Shift+Tab indent, smart Enter,
 * bracket/quote auto-closing, Ctrl+Enter run shortcut, and phone quick-keys.
 */
export function CodeEditor({
  value,
  onChange,
  onRun,
  label = 'Code',
  lang = 'java',
}: {
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
  label?: string;
  lang?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLPreElement>(null);
  const phone = usePhone();
  const lines = value.split('\n').length;

  // The text field always has exactly the size of the code (height and width), so it never scrolls by itself –
  // otherwise the cursor and the coloured text behind it drift apart. The whole editor scrolls sideways instead.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const area = el.parentElement;
    el.style.height = '0px';
    el.style.width = '0px';
    el.style.height = `${el.scrollHeight}px`;
    el.style.width = `${Math.max(area?.clientWidth ?? 0, el.scrollWidth)}px`;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [value]);

  /** Replaces the selection with `text` (keeps undo working where the browser allows it). */
  const insert = (text: string, cursorBack = 0) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const { selectionStart: a, selectionEnd: b } = el;
    const endPos = a + text.length - cursorBack;
    if (!document.execCommand?.('insertText', false, text)) {
      const next = value.slice(0, a) + text + value.slice(b);
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(endPos, endPos));
    } else if (cursorBack > 0) {
      requestAnimationFrame(() => el.setSelectionRange(endPos, endPos));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onRun) {
      e.preventDefault();
      onRun();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert('    ');
    } else if (e.key === 'Tab' && e.shiftKey) {
      // Shift+Tab: unindent current line by up to 4 spaces
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
      const spaces = /^ {1,4}/.exec(value.slice(lineStart))?.[0].length ?? 0;
      if (spaces > 0) {
        const next = value.slice(0, lineStart) + value.slice(lineStart + spaces);
        const pos = Math.max(lineStart, el.selectionStart - spaces);
        onChange(next);
        requestAnimationFrame(() => el.setSelectionRange(pos, pos));
      }
    } else if (e.key === 'Enter') {
      const before = value.slice(0, el.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const indent = /^\s*/.exec(line)![0] + ((lang === 'python' ? /:\s*$/ : /\{\s*$/).test(line) ? '    ' : '');
      e.preventDefault();
      insert('\n' + indent);
    } else if (e.key === '}') {
      // closing brace on an otherwise empty line: one level back
      const before = value.slice(0, el.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      if (/^\s{4,}$/.test(line)) {
        e.preventDefault();
        el.setSelectionRange(el.selectionStart - 4, el.selectionStart);
        insert('}');
      }
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && PAIRS[e.key]) {
      const close = PAIRS[e.key];
      const { selectionStart: a, selectionEnd: b } = el;
      const nextCh = value[b] ?? '';
      // Skip over existing closing quote/bracket if user types it
      if (a === b && (e.key === '"' || e.key === "'") && nextCh === e.key) {
        e.preventDefault();
        el.setSelectionRange(a + 1, a + 1);
      } else if (a !== b) {
        e.preventDefault();
        insert(e.key + value.slice(a, b) + close, 1);
      } else if (!nextCh || /[\s)\]}:,;]/.test(nextCh)) {
        e.preventDefault();
        insert(e.key + close, 1);
      }
    }
  };

  return (
    <div className="code-editor">
      <div className="code-gutter" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="code-area">
        {/* the highlighted copy behind the transparent text field */}
        <pre ref={hl} className="code-hl" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightCode(value, lang) + '\n' }} />
        <textarea
          ref={ref}
          className="code-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            // never scroll inside the field (it is as big as the code) – if a browser tries, back to the start
            const el = e.currentTarget;
            if (el.scrollTop || el.scrollLeft) {
              el.scrollTop = 0;
              el.scrollLeft = 0;
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-label={label}
          rows={Math.max(8, lines + 1)}
        />
      </div>
      {phone && (
        <div className="code-keys">
          {['    ', '{', '}', '(', ')', ';', '=', '<', '>', '[', ']', '"', '.', '+', '-'].map((k) => (
            <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)}>
              {k === '    ' ? '⇥' : k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
