import { Fragment, type ReactNode } from 'react';

/** Tiny, safe Markdown renderer (headings, lists, bold, italics, code) – no HTML injection. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  const st: { list: { ordered: boolean; items: string[] } | null } = { list: null };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (st.list) {
      const k = `l${blocks.length}`;
      const items = st.list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(st.list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      st.list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const k = `h${blocks.length}`;
      const lvl = Math.min(4, h[1].length + 1);
      const content = inline(h[2], k);
      blocks.push(lvl <= 2 ? <h2 key={k}>{content}</h2> : lvl === 3 ? <h3 key={k}>{content}</h3> : <h4 key={k}>{content}</h4>);
    } else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (st.list && st.list.ordered !== ordered) flushList();
      if (!st.list) st.list = { ordered, items: [] };
      st.list.items.push((ul || ol)![1]);
    } else if (/^---+$/.test(line)) {
      flushPara();
      flushList();
      blocks.push(<hr key={`r${blocks.length}`} />);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

