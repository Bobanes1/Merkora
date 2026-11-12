// Writes a page with every diagram kind in light and dark (for looking at them): npx tsx scripts/gallery.mts <out.html>
import { writeFileSync } from 'node:fs';
import { parseDiagram, PALETTES, renderDiagram } from '../src/lib/diagram';

const samples: unknown[] = [
  { type: 'model', title: 'Beispiel: Moderator', nodes: ['Freizeit', 'Nutzung von Streamingdiensten', 'Alter'], links: [{ from: 'Freizeit', to: 'Nutzung von Streamingdiensten', label: '+' }, { from: 'Alter', to: 'Freizeit -> Nutzung von Streamingdiensten', label: 'moderiert' }] },
  { type: 'model', title: 'Mediation', nodes: ['Bildung', 'Einkommen', 'Gesundheit'], links: [{ from: 'Bildung', to: 'Einkommen', label: 'a' }, { from: 'Einkommen', to: 'Gesundheit', label: 'b' }, { from: 'Bildung', to: 'Gesundheit', label: 'c (direkt)' }], highlight: 'Einkommen' },
  { type: 'model', title: 'Kommunikationsmodell', nodes: ['Sender', 'Botschaft', 'Kanal', 'Empfänger', 'Störung'], links: [{ from: 'Sender', to: 'Botschaft', label: 'codiert' }, { from: 'Botschaft', to: 'Kanal' }, { from: 'Kanal', to: 'Empfänger', label: 'decodiert' }, { from: 'Empfänger', to: 'Sender', label: 'Feedback', dashed: true }, { from: 'Störung', to: 'Kanal -> Empfänger' }] },
  { type: 'model', title: 'Theorie des geplanten Verhaltens', nodes: ['Einstellung', 'Subjektive Norm', 'Wahrgenommene Kontrolle', 'Intention', 'Verhalten'], links: [{ from: 'Einstellung', to: 'Intention' }, { from: 'Subjektive Norm', to: 'Intention' }, { from: 'Wahrgenommene Kontrolle', to: 'Intention' }, { from: 'Intention', to: 'Verhalten' }, { from: 'Wahrgenommene Kontrolle', to: 'Verhalten', dashed: true }] },
  { type: 'venn', title: 'Qualitativ und quantitativ', sets: [{ label: 'Qualitativ', items: ['offen', 'kleine Fallzahlen', 'verstehen'] }, { label: 'Quantitativ', items: ['standardisiert', 'große Stichproben', 'messen'] }], shared: ['systematisch', 'theoriegeleitet'] },
  { type: 'pyramid', title: 'Bedürfnispyramide (Maslow)', levels: ['Selbstverwirklichung', 'Individualbedürfnisse', 'Soziale Bedürfnisse', 'Sicherheit', 'Physiologische Bedürfnisse'] },
  { type: 'bars', title: 'Mediennutzung pro Tag', unit: 'Min.', bars: [{ label: 'Streaming', value: 140 }, { label: 'Fernsehen (linear)', value: 95.5 }, { label: 'Radio', value: 60 }, { label: 'Zeitung', value: 12 }] },
  { type: 'decision', title: 'Welcher Test?', question: 'Sind die Daten normalverteilt?', yes: { question: 'Zwei Gruppen?', yes: 't-Test', no: 'ANOVA' }, no: 'Mann-Whitney-U-Test' },
  { type: 'axes', title: 'Lernkurve', x: 'Übung', y: 'Leistung', shape: 's-kurve', label: 'mit Feedback', second: { shape: 'linear', label: 'ohne Feedback' } },
  { type: 'flow', title: 'Forschungsprozess', steps: ['Forschungsfrage', 'Hypothesen', 'Operationalisierung', 'Datenerhebung', 'Auswertung'], highlight: 'Operationalisierung' },
  { type: 'compare', title: 'Quantitativ vs. qualitativ', columns: [{ title: 'Quantitativ', items: ['standardisiert', 'große Stichproben'] }, { title: 'Qualitativ', items: ['offen', 'kleine Fallzahlen'] }] },
  { type: 'concept', title: 'Wissen', center: 'Wissen', branches: ['Daten', 'Informationen', 'Fähigkeiten', 'Erfahrung', 'Regeln'], highlight: 'Informationen' },
  { type: 'cycle', title: 'PDCA', steps: ['Plan', 'Do', 'Check', 'Act'] },
];

const cell = (svg: string, bg: string) => `<div style="background:${bg};padding:12px;border-radius:12px">${svg}</div>`;
const rows = samples.map((s) => {
  const d = parseDiagram(s);
  if (!d) return `<p>kaputt: ${JSON.stringify(s)}</p>`;
  return `<section style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">${cell(renderDiagram(d, PALETTES.light), '#ffffff')}${cell(renderDiagram(d, PALETTES.dark), '#1a2423')}</section>`;
});
writeFileSync(process.argv[2] ?? 'gallery.html', `<!doctype html><meta charset="utf-8"><title>Diagramme</title><style>body{margin:16px;background:#e9eeee;font-family:Arial}svg{width:100%;height:auto;display:block}</style>${rows.join('')}`);
console.log('ok');
