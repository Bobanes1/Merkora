/** Reads text from a PDF, text or Markdown file in the browser (nothing is uploaded). */
export async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        line += item.str ?? '';
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\n'));
    }
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new Error('In diesem PDF wurde kein Text gefunden (vielleicht ist es eingescannt).');
    return text;
  }
  if (/\.(txt|md|markdown|csv|json|html?)$/.test(name) || file.type.startsWith('text/')) {
    const text = await file.text();
    return name.endsWith('.html') || name.endsWith('.htm')
      ? new DOMParser().parseFromString(text, 'text/html').body.innerText
      : text;
  }
  throw new Error('Dieses Dateiformat wird nicht unterstützt. Nutze PDF, TXT oder Markdown.');
}
