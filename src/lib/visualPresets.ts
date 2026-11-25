/**
 * Handcrafted full-canvas Studyflix-style animated visual presets (600×340) for rich topics like
 * the solar system, human anatomy, blood circulation, circuits, airfoil lift, DNA, photosynthesis, etc.
 * Pure (no DOM) – tested in scripts/test-srs.mts.
 */

export type PresetPalette = {
  teal: string;
  tealSoft: string;
  tealNode: string;
  berry: string;
  berrySoft: string;
  berryNode: string;
  amber: string;
  amberSoft: string;
  amberNode: string;
  blue: string;
  blueSoft: string;
  blueNode: string;
  violet: string;
  violetSoft: string;
  violetNode: string;
  text: string;
  muted: string;
  onAccent: string;
  bg: string;
};

export type PresetPart = { id: string; label: string; note: string };
export type PresetState = { id: string; name: string; note: string };

export type PresetRenderOpts = {
  highlight?: string;
  state?: number;
  notes?: Record<string, string>;
  animated?: boolean;
  uid: string;
};

export type VisualPreset = {
  id: string;
  title: string;
  summary: string;
  aliases: string[];
  tags: string[];
  domains: ('math' | 'java' | 'law' | 'music' | 'language' | 'general')[];
  width: number;
  height: number;
  parts: PresetPart[];
  states?: PresetState[];
  render: (p: PresetPalette, o: PresetRenderOpts) => string;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s?: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

/** Helper: marks an interactive SVG group for a preset part (highlights active part, dims others slightly). */
function partAttrs(id: string, highlight?: string, extraClass = ''): string {
  const active = !!highlight && norm(highlight) === norm(id);
  const dim = !!highlight && !active;
  const cls = ['ps-part', extraClass, active ? 'ps-focus' : '', dim ? 'ps-dim' : ''].filter(Boolean).join(' ');
  return `class="${cls}" data-part="${esc(id)}"`;
}

/** Helper: crisp rounded label pill with optional leader line. */
function pill(x: number, y: number, w: number, text: string, stroke: string, fill: string, ink: string, fs = 11.5): string {
  const h = 22;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/><text x="${x + w / 2}" y="${y + h / 2}" font-size="${fs}" font-weight="700" fill="${ink}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
}

export const VISUAL_PRESETS: VisualPreset[] = [
  // ==================== 1. SONNENSYSTEM ====================
  {
    id: 'sonnensystem',
    title: 'Unser Sonnensystem',
    summary: 'Sonne & 8 kreisende Planeten',
    aliases: ['solarsystem', 'planeten', 'planetensystem', 'weltraum', 'orbitplaneten'],
    tags: ['sonnensystem', 'planet', 'planeten', 'astronomie', 'weltall', 'sonne', 'erde', 'mars', 'jupiter', 'saturn', 'umlaufbahn', 'gravitation'],
    domains: ['general', 'math'],
    width: 600,
    height: 340,
    parts: [
      { id: 'sonne', label: 'Sonne', note: 'Zentralstern mit 99,8 % der gesamten Masse – ihre Schwerkraft hält alle Planeten auf der Bahn.' },
      { id: 'merkur', label: 'Merkur', note: 'Kleinster und sonnennächster Planet – ein Jahr dauert dort nur 88 Erdtage.' },
      { id: 'venus', label: 'Venus', note: 'Heißester Planet (über 460 °C) wegen extremem Treibhauseffekt.' },
      { id: 'erde', label: 'Erde', note: 'Unser Heimatplanet in der habitablen Zone – mit flüssigem Wasser und schützender Atmosphäre.' },
      { id: 'mars', label: 'Mars', note: 'Der „Rote Planet“ wegen Eisenoxid-Staub; besitzt den größten Vulkan (Olympus Mons).' },
      { id: 'jupiter', label: 'Jupiter', note: 'Größter Planet (Gasriese) – mehr als doppelt so massereich wie alle anderen Planeten zusammen.' },
      { id: 'saturn', label: 'Saturn', note: 'Berühmt für sein spektakuläres Ringsystem aus Eis- und Gesteinsbrocken.' },
      { id: 'eisriesen', label: 'Uranus & Neptun', note: 'Die äußeren blauen Eisriesen mit Methan in der Atmosphäre und extrem langen Umlaufzeiten.' },
    ],
    render: (p, o) => {
      const cx = 300, cy = 172;
      const planets = [
        { id: 'merkur', r: 34, sz: 4.5, col: p.muted, dur: 5.5, deg: 25 },
        { id: 'venus', r: 48, sz: 6, col: p.amber, dur: 8.5, deg: 145 },
        { id: 'erde', r: 64, sz: 6.8, col: p.blue, dur: 12, deg: 260 },
        { id: 'mars', r: 80, sz: 5.5, col: p.berry, dur: 16, deg: 35 },
        { id: 'jupiter', r: 103, sz: 11.5, col: p.amber, dur: 24, deg: 195 },
        { id: 'saturn', r: 126, sz: 9.5, col: p.violet, dur: 32, deg: 325, ring: true },
        { id: 'eisriesen', r: 145, sz: 7.2, col: p.teal, dur: 42, deg: 110 },
        { id: 'eisriesen', r: 160, sz: 6.8, col: p.blue, dur: 54, deg: 235 },
      ];
      const stars = [[36, 36], [92, 64], [520, 40], [560, 96], [48, 290], [548, 286], [130, 305], [472, 312], [116, 28], [456, 34]]
        .map(([x, y], idx) => `<circle class="ps-twinkle" style="animation-delay:${(idx * 0.35).toFixed(2)}s" cx="${x}" cy="${y}" r="${idx % 2 ? 1.8 : 1.2}" fill="${p.muted}" opacity="0.55"/>`)
        .join('');
      const rings = planets
        .map((pl) => `<circle cx="${cx}" cy="${cy}" r="${pl.r}" fill="none" stroke="${p.muted}" stroke-width="1" stroke-opacity="${o.highlight && norm(o.highlight) === pl.id ? '0.85' : '0.26'}"${pl.r === 103 ? ' stroke-dasharray="3 4"' : ''}/>`)
        .join('');
      const bodies = planets
        .map((pl) => {
          const anim = o.animated ? ` style="transform-origin:${cx}px ${cy}px;animation-duration:${pl.dur}s;animation-delay:-${((pl.deg / 360) * pl.dur).toFixed(1)}s"` : '';
          const rot = o.animated ? '' : ` transform="rotate(${pl.deg} ${cx} ${cy})"`;
          const px = cx + pl.r;
          const extra = pl.ring
            ? `<ellipse cx="${px}" cy="${cy}" rx="${pl.sz * 1.9}" ry="${pl.sz * 0.55}" fill="none" stroke="${p.amber}" stroke-width="2" transform="rotate(-20 ${px} ${cy})"/>`
            : pl.id === 'erde'
              ? `<circle cx="${px - 1.5}" cy="${cy - 1}" r="2.2" fill="${p.teal}"/>`
              : '';
          return `<g ${partAttrs(pl.id, o.highlight)}><g class="${o.animated ? 'ps-orbit' : ''}"${anim}${rot}>${extra}<circle cx="${px}" cy="${cy}" r="${pl.sz}" fill="${pl.col}" stroke="${p.onAccent}" stroke-width="1.2"/></g></g>`;
        })
        .join('');
      const leftLabels = [
        { id: 'sonne', y: 42, txt: 'Sonne', col: p.amber },
        { id: 'merkur', y: 98, txt: '1. Merkur', col: p.muted },
        { id: 'venus', y: 154, txt: '2. Venus', col: p.amber },
        { id: 'erde', y: 210, txt: '3. Erde', col: p.blue },
        { id: 'mars', y: 266, txt: '4. Mars', col: p.berry },
      ].map((l) => `<g ${partAttrs(l.id, o.highlight)}>${pill(14, l.y, 108, l.txt, l.col, p.bg, p.text)}</g>`).join('');
      const rightLabels = [
        { id: 'jupiter', y: 78, txt: '5. Jupiter', col: p.amber },
        { id: 'saturn', y: 158, txt: '6. Saturn', col: p.violet },
        { id: 'eisriesen', y: 238, txt: '7–8. Eisriesen', col: p.teal },
      ].map((l) => `<g ${partAttrs(l.id, o.highlight)}>${pill(474, l.y, 114, l.txt, l.col, p.bg, p.text)}</g>`).join('');
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.25"/>
        ${stars}
        ${rings}
        <g ${partAttrs('sonne', o.highlight)}>
          <circle class="ps-glow" cx="${cx}" cy="${cy}" r="25" fill="${p.amber}" opacity="0.22"/>
          <circle class="ps-pulse" cx="${cx}" cy="${cy}" r="18" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="1.5"/>
          <circle cx="${cx - 5}" cy="${cy - 5}" r="4.5" fill="${p.onAccent}" opacity="0.35"/>
        </g>
        ${bodies}
        ${leftLabels}
        ${rightLabels}
      `;
    },
  },

  // ==================== 2. MONDPHASEN ====================
  {
    id: 'mondphasen',
    title: 'Mondphasen',
    summary: 'Sonnenlicht, Erde & 4 Phasen des Mondes',
    aliases: ['mond', 'vollmond', 'neumond', 'gezeiten', 'mondzyklus'],
    tags: ['mond', 'mondphasen', 'astronomie', 'vollmond', 'neumond', 'erde', 'sonne', 'schatten'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'sonnenlicht', label: 'Sonnenlicht', note: 'Das Licht der Sonne trifft immer genau eine Hälfte des Mondes.' },
      { id: 'erde', label: 'Erde', note: 'Von der Erde aus sehen wir je nach Position des Mondes unterschiedlich viel der beleuchteten Seite.' },
      { id: 'mond', label: 'Mond', note: 'Umrundet die Erde in rund 29,5 Tagen von Neumond zu Neumond.' },
      { id: 'ansicht', label: 'Blick von der Erde', note: 'Zeigt die aktuelle Mondphase, wie sie am Nachthimmel erscheint.' },
    ],
    states: [
      { id: 'neumond', name: 'Neumond', note: 'Der Mond steht zwischen Sonne und Erde – seine beleuchtete Seite zeigt von uns weg.' },
      { id: 'zunehmend', name: 'Zunehmend', note: 'Erstes Viertel: Wir sehen genau die rechte Hälfte beleuchtet (wie ein „D“).' },
      { id: 'vollmond', name: 'Vollmond', note: 'Die Erde steht zwischen Sonne und Mond – wir sehen die volle beleuchtete Scheibe.' },
      { id: 'abnehmend', name: 'Abnehmend', note: 'Letztes Viertel: Wir sehen die linke Hälfte beleuchtet (wie ein „C“).' },
    ],
    render: (p, o) => {
      const st = Math.min(3, Math.max(0, o.state ?? 2));
      const cx = 290, cy = 172, R = 96;
      const angles = [180, 90, 0, 270];
      const a = (angles[st] * Math.PI) / 180;
      const mx = cx + R * Math.cos(a), my = cy + R * Math.sin(a);
      const rays = [92, 132, 172, 212, 252]
        .map((y) => `<line class="ps-flow" x1="22" y1="${y}" x2="112" y2="${y}" stroke="${p.amber}" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"/>`)
        .join('');
      const viewX = 515, viewY = 166, vr = 36;
      const phaseClip =
        st === 0
          ? ''
          : st === 1
            ? `<path d="M ${viewX} ${viewY - vr} A ${vr} ${vr} 0 0 1 ${viewX} ${viewY + vr} Z" fill="${p.amber}"/>`
            : st === 2
              ? `<circle cx="${viewX}" cy="${viewY}" r="${vr}" fill="${p.amber}"/>`
              : `<path d="M ${viewX} ${viewY - vr} A ${vr} ${vr} 0 0 0 ${viewX} ${viewY + vr} Z" fill="${p.amber}"/>`;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.25"/>
        <g ${partAttrs('sonnenlicht', o.highlight)}>
          <path d="M 6 62 A 95 110 0 0 1 6 282 Z" fill="${p.amber}" opacity="0.25"/>
          ${rays}
          ${pill(14, 20, 110, 'Sonnenlicht →', p.amber, p.bg, p.text)}
        </g>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${p.muted}" stroke-width="1.6" stroke-dasharray="5 5"/>
        <g ${partAttrs('erde', o.highlight)}>
          <circle cx="${cx}" cy="${cy}" r="30" fill="${p.blue}" stroke="${p.onAccent}" stroke-width="2"/>
          <path d="M ${cx - 12} ${cy - 14} C ${cx - 2} ${cy - 12} ${cx} ${cy - 2} ${cx - 8} ${cy + 10} C ${cx - 18} ${cy + 6} ${cx - 20} ${cy - 6} ${cx - 12} ${cy - 14} Z" fill="${p.teal}"/>
          <path d="M ${cx + 6} ${cy - 16} C ${cx + 18} ${cy - 10} ${cx + 20} ${cy + 8} ${cx + 8} ${cy + 14} C ${cx + 4} ${cy + 4} ${cx + 6} ${cy - 6} ${cx + 6} ${cy - 16} Z" fill="${p.teal}"/>
          <path d="M ${cx} ${cy - 30} A 30 30 0 0 1 ${cx} ${cy + 30} Z" fill="${p.text}" opacity="0.28"/>
          <text x="${cx}" y="${cy + 46}" font-size="12" font-weight="700" fill="${p.text}" text-anchor="middle">Erde</text>
        </g>
        ${angles
          .map((deg, idx) => {
            const rad = (deg * Math.PI) / 180;
            const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${p.bg}" stroke="${p.muted}" stroke-width="1.2" opacity="${idx === st ? 0 : 0.45}"/>`;
          })
          .join('')}
        <g ${partAttrs('mond', o.highlight)}>
          <circle class="ps-glow" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="22" fill="${p.amber}" opacity="0.28"/>
          <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="15" fill="${p.text}" opacity="0.75" stroke="${p.amber}" stroke-width="2"/>
          <path d="M ${mx.toFixed(1)} ${(my - 15).toFixed(1)} A 15 15 0 0 0 ${mx.toFixed(1)} ${(my + 15).toFixed(1)} Z" fill="${p.amber}"/>
        </g>
        <g ${partAttrs('ansicht', o.highlight)}>
          <rect x="448" y="88" width="134" height="162" rx="14" fill="${p.bg}" stroke="${p.violet}" stroke-width="1.6"/>
          <text x="${viewX}" y="112" font-size="12" font-weight="700" fill="${p.muted}" text-anchor="middle">Blick von der Erde</text>
          <circle cx="${viewX}" cy="${viewY}" r="${vr}" fill="${p.text}" opacity="0.22" stroke="${p.muted}" stroke-width="1.5"/>
          ${phaseClip}
          <text x="${viewX}" y="228" font-size="13" font-weight="800" fill="${p.text}" text-anchor="middle">${esc(['Neumond', 'Zunehmend', 'Vollmond', 'Abnehmend'][st])}</text>
        </g>
      `;
    },
  },

  // ==================== 3. ERDSCHICHTEN ====================
  {
    id: 'erdschichten',
    title: 'Aufbau der Erde',
    summary: 'Erdkruste, Mantel mit Konvektion & Kern',
    aliases: ['erde', 'plattentektonik', 'tektonik', 'erdkruste', 'erdmantel', 'erdkern', 'geologie'],
    tags: ['erde', 'erdschichten', 'geografie', 'geologie', 'tektonik', 'vulkan', 'erdbeben', 'kern', 'mantel', 'kruste'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'kruste', label: 'Erdkruste', note: 'Dünne feste Gesteinsschicht (5–70 km) – in bewegliche tektonische Platten zerbrochen.' },
      { id: 'mantel', label: 'Erdmantel', note: 'Bis 2.900 km tief; zähflüssiges Gestein bewegt sich langsam in Konvektionsströmen.' },
      { id: 'aussenkern', label: 'Äußerer Kern', note: 'Flüssiges Eisen und Nickel (ca. 4.000 °C) – erzeugt durch Bewegung das Erdmagnetfeld.' },
      { id: 'innenkern', label: 'Innerer Kern', note: 'Feste Eisen-Nickel-Kugel (~5.500 °C): bleibt trotz Hitze wegen des enormen Drucks fest.' },
    ],
    render: (p, o) => {
      const cx = 215, cy = 175;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.2"/>
        <g ${partAttrs('kruste', o.highlight)}>
          <circle cx="${cx}" cy="${cy}" r="144" fill="${p.blue}" stroke="${p.teal}" stroke-width="5"/>
          <path d="M ${cx - 110} ${cy - 60} Q ${cx - 50} ${cy - 110} ${cx - 10} ${cy - 50} Q ${cx - 45} ${cy + 5} ${cx - 95} ${cy - 10} Z" fill="${p.teal}"/>
          <path d="M ${cx - 90} ${cy + 40} Q ${cx - 40} ${cy + 20} ${cx - 20} ${cy + 80} Q ${cx - 70} ${cy + 105} ${cx - 105} ${cy + 75} Z" fill="${p.teal}"/>
          <line x1="${cx + 104}" y1="${cy - 98}" x2="404" y2="62" stroke="${p.teal}" stroke-width="2"/>
          ${pill(404, 51, 174, 'Erdkruste (5–70 km)', p.teal, p.bg, p.text)}
        </g>
        <g ${partAttrs('mantel', o.highlight)}>
          <path d="M ${cx} ${cy} L ${cx} ${cy - 138} A 138 138 0 0 1 ${cx + 138} ${cy} Z" fill="${p.berry}" stroke="${p.onAccent}" stroke-width="1.5"/>
          <path class="ps-flow" d="M ${cx + 38} ${cy - 112} A 118 118 0 0 1 ${cx + 112} ${cy - 38}" fill="none" stroke="${p.amber}" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>
          <path class="ps-flow-rev" d="M ${cx + 28} ${cy - 86} A 92 92 0 0 1 ${cx + 86} ${cy - 28}" fill="none" stroke="${p.onAccent}" stroke-width="2" stroke-dasharray="5 7" opacity="0.7" stroke-linecap="round"/>
          <line x1="${cx + 104}" y1="${cy - 44}" x2="404" y2="132" stroke="${p.berry}" stroke-width="2"/>
          ${pill(404, 121, 174, 'Erdmantel (Konvektion)', p.berry, p.bg, p.text)}
        </g>
        <g ${partAttrs('aussenkern', o.highlight)}>
          <path d="M ${cx} ${cy} L ${cx} ${cy - 76} A 76 76 0 0 1 ${cx + 76} ${cy} Z" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="1.5"/>
          <line x1="${cx + 58}" y1="${cy - 18}" x2="404" y2="202" stroke="${p.amber}" stroke-width="2"/>
          ${pill(404, 191, 174, 'Äußerer Kern (flüssig)', p.amber, p.bg, p.text)}
        </g>
        <g ${partAttrs('innenkern', o.highlight)}>
          <circle class="ps-pulse" cx="${cx}" cy="${cy}" r="36" fill="${p.onAccent}" stroke="${p.amber}" stroke-width="4"/>
          <circle cx="${cx}" cy="${cy}" r="24" fill="${p.amber}" opacity="0.55"/>
          <line x1="${cx + 22}" y1="${cy + 14}" x2="404" y2="272" stroke="${p.violet}" stroke-width="2"/>
          ${pill(404, 261, 174, 'Innerer Kern (~5.500 °C)', p.violet, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 4. WASSERKREISLAUF ====================
  {
    id: 'wasserkreislauf',
    title: 'Der Wasserkreislauf',
    summary: 'Verdunstung, Wolkenbildung, Regen & Rückfluss',
    aliases: ['wasserzyklus', 'niederschlag', 'verdunstung', 'kondensation', 'regen'],
    tags: ['wasser', 'wasserkreislauf', 'klima', 'wetter', 'regen', 'wolke', 'verdunstung', 'geografie', 'natur'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'verdunstung', label: 'Verdunstung', note: 'Sonnenwärme lässt Wasser aus Meer, Flüssen und Pflanzen als unsichtbaren Dampf aufsteigen.' },
      { id: 'kondensation', label: 'Kondensation', note: 'In kühler Höhe kühlt der Wasserdampf ab und bildet winzige Tröpfchen – Wolken entstehen.' },
      { id: 'niederschlag', label: 'Niederschlag', note: 'Werden die Tröpfchen zu schwer, fallen sie als Regen, Schnee oder Hagel zu Boden.' },
      { id: 'abfluss', label: 'Abfluss & Grundwasser', note: 'Wasser fließt über Bäche, Flüsse und Grundwasser zurück ins Meer – der Kreislauf schließt sich.' },
    ],
    render: (p, o) => {
      const steam = [92, 130, 168]
        .map((x, idx) => `<path class="ps-flow-rev" style="animation-delay:${(idx * 0.25).toFixed(2)}s" d="M ${x} 248 Q ${x - 8} 214 ${x} 182 Q ${x + 8} 150 ${x} 118" fill="none" stroke="${p.blue}" stroke-width="2.6" stroke-dasharray="6 6" stroke-linecap="round"/>`)
        .join('');
      const drops = [380, 405, 430, 455, 480]
        .map((x, idx) => `<line class="ps-rain" style="animation-delay:${(idx * 0.22).toFixed(2)}s" x1="${x}" y1="128" x2="${x - 6}" y2="152" stroke="${p.blue}" stroke-width="2.6" stroke-linecap="round"/>`)
        .join('');
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
        <circle class="ps-pulse" cx="72" cy="64" r="26" fill="${p.amber}"/>
        <circle class="ps-glow" cx="72" cy="64" r="36" fill="${p.amber}" opacity="0.22"/>
        <!-- Mountain + Land -->
        <path d="M 270 280 L 420 146 L 492 208 L 538 172 L 594 246 L 594 334 L 245 334 Z" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2"/>
        <polygon points="420,146 392,174 410,178 424,166 446,174" fill="${p.onAccent}" opacity="0.85"/>
        <!-- Sea -->
        <path d="M 6 266 Q 68 256 130 266 T 256 266 L 278 334 L 6 334 Z" fill="${p.blue}" opacity="0.8"/>
        <g ${partAttrs('verdunstung', o.highlight)}>
          ${steam}
          ${pill(54, 286, 134, '1. Verdunstung ↑', p.amber, p.bg, p.text)}
        </g>
        <g ${partAttrs('kondensation', o.highlight)}>
          <g class="ps-drift">
            <path d="M 225 94 C 212 94 204 84 206 72 C 208 60 220 54 232 58 C 238 42 264 38 278 52 C 292 48 308 58 308 72 C 308 86 296 94 282 94 Z" fill="${p.onAccent}" stroke="${p.blue}" stroke-width="2"/>
          </g>
          <path class="ps-flow" d="M 316 74 L 368 74" fill="none" stroke="${p.muted}" stroke-width="2.4" stroke-dasharray="6 6" stroke-linecap="round"/>
          ${pill(188, 16, 150, '2. Kondensation', p.violet, p.bg, p.text)}
        </g>
        <g ${partAttrs('niederschlag', o.highlight)}>
          <path d="M 382 114 C 368 114 360 102 364 90 C 368 78 380 72 392 76 C 402 58 432 56 446 72 C 464 68 486 78 486 94 C 486 108 474 114 458 114 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2"/>
          ${drops}
          ${pill(402, 20, 152, '3. Niederschlag ↓', p.blue, p.bg, p.text)}
        </g>
        <g ${partAttrs('abfluss', o.highlight)}>
          <path class="ps-flow" d="M 438 194 C 404 226 362 246 314 256 C 282 262 262 270 236 274" fill="none" stroke="${p.blue}" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round"/>
          <path class="ps-flow" d="M 480 288 Q 370 306 250 296" fill="none" stroke="${p.teal}" stroke-width="2.6" stroke-dasharray="6 6" stroke-linecap="round"/>
          ${pill(334, 294, 210, '4. Abfluss & Grundwasser ←', p.teal, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 5. MENSCHLICHE ANATOMIE ====================
  {
    id: 'anatomie',
    title: 'Anatomie des Menschen',
    summary: 'Wichtigste Organe im Überblick (anklickbar)',
    aliases: ['koerper', 'mensch', 'organe', 'menschlicherkoerper', 'humanbody', 'organ'],
    tags: ['anatomie', 'organ', 'organe', 'koerper', 'mensch', 'medizin', 'biologie', 'herz', 'lunge', 'gehirn', 'magen', 'leber', 'darm', 'niere'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'gehirn', label: 'Gehirn', note: 'Steuerzentrale des Nervensystems: verarbeitet Sinneseindrücke, Denken, Gedächtnis und Bewegung.' },
      { id: 'lunge', label: 'Lunge', note: 'Nimmt Sauerstoff (O₂) aus der Atemluft ins Blut auf und gibt Kohlendioxid (CO₂) ab.' },
      { id: 'herz', label: 'Herz', note: 'Faustgroßer Hohlmuskel – pumpt rund 5 Liter Blut pro Minute durch den gesamten Körper.' },
      { id: 'leber', label: 'Leber', note: 'Zentrales Stoffwechsel- und Entgiftungsorgan; produziert Galle zur Fettverdauung.' },
      { id: 'magen', label: 'Magen', note: 'Zerkleinert Nahrung mit Magensäure und Enzymen zu Speisebrei.' },
      { id: 'nieren', label: 'Nieren', note: 'Zwei bohnenförmige Filterorgane: reinigen das Blut und regulieren den Wasserhaushalt.' },
      { id: 'darm', label: 'Darm', note: 'Nimmt Nährstoffe (Dünndarm) und Wasser (Dickdarm) ins Blut auf.' },
    ],
    render: (p, o) => {
      const cx = 300;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.2"/>
        <!-- Clean stylized human silhouette -->
        <g fill="${p.bg}" stroke="${p.muted}" stroke-width="2" stroke-linejoin="round">
          <ellipse cx="${cx}" cy="52" rx="28" ry="33"/>
          <path d="M ${cx - 14} 84 L ${cx - 14} 98 C ${cx - 56} 102 ${cx - 72} 118 ${cx - 74} 152 L ${cx - 78} 236 C ${cx - 78} 246 ${cx - 60} 246 ${cx - 58} 236 L ${cx - 52} 162 L ${cx - 48} 324 L ${cx + 48} 324 L ${cx + 52} 162 L ${cx + 58} 236 C ${cx + 60} 246 ${cx + 78} 246 ${cx + 78} 236 L ${cx + 74} 152 C ${cx + 72} 118 ${cx + 56} 102 ${cx + 14} 98 L ${cx + 14} 84 Z"/>
        </g>
        <!-- Brain -->
        <g ${partAttrs('gehirn', o.highlight)}>
          <path class="ps-pulse" d="M ${cx - 18} 48 C ${cx - 20} 32 ${cx - 4} 26 ${cx} 32 C ${cx + 4} 26 ${cx + 20} 32 ${cx + 18} 48 C ${cx + 19} 56 ${cx + 10} 62 ${cx} 58 C ${cx - 10} 62 ${cx - 19} 56 ${cx - 18} 48 Z" fill="${p.violet}" opacity="0.88"/>
          <line x1="${cx - 20}" y1="45" x2="176" y2="45" stroke="${p.violet}" stroke-width="1.8"/>
          ${pill(22, 34, 154, 'Gehirn (Steuerung)', p.violet, p.bg, p.text)}
        </g>
        <!-- Lungs -->
        <g ${partAttrs('lunge', o.highlight)}>
          <g class="ps-breathe">
            <path d="M ${cx - 6} 114 C ${cx - 34} 118 ${cx - 42} 152 ${cx - 34} 174 C ${cx - 24} 180 ${cx - 8} 174 ${cx - 6} 160 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2"/>
            <path d="M ${cx + 6} 114 C ${cx + 34} 118 ${cx + 42} 152 ${cx + 34} 174 C ${cx + 24} 180 ${cx + 8} 174 ${cx + 6} 160 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2"/>
          </g>
          <line x1="${cx + 34}" y1="138" x2="424" y2="86" stroke="${p.blue}" stroke-width="1.8"/>
          ${pill(424, 75, 156, 'Lunge (Atmung)', p.blue, p.bg, p.text)}
        </g>
        <!-- Heart -->
        <g ${partAttrs('herz', o.highlight)}>
          <path class="ps-heartbeat" d="M ${cx + 4} 166 C ${cx - 12} 154 ${cx - 14} 138 ${cx - 4} 134 C ${cx + 1} 132 ${cx + 4} 137 ${cx + 4} 141 C ${cx + 4} 137 ${cx + 8} 132 ${cx + 13} 134 C ${cx + 22} 138 ${cx + 19} 154 ${cx + 4} 166 Z" fill="${p.berry}" stroke="${p.onAccent}" stroke-width="1.4"/>
          <line x1="${cx - 10}" y1="148" x2="176" y2="122" stroke="${p.berry}" stroke-width="1.8"/>
          ${pill(22, 111, 154, 'Herz (Blutpumpe)', p.berry, p.bg, p.text)}
        </g>
        <!-- Liver -->
        <g ${partAttrs('leber', o.highlight)}>
          <path d="M ${cx - 34} 188 C ${cx - 32} 176 ${cx - 4} 176 ${cx + 6} 186 C ${cx - 2} 202 ${cx - 30} 206 ${cx - 34} 188 Z" fill="${p.amber}" opacity="0.88"/>
          <line x1="${cx - 32}" y1="192" x2="176" y2="196" stroke="${p.amber}" stroke-width="1.8"/>
          ${pill(22, 185, 154, 'Leber (Stoffwechsel)', p.amber, p.bg, p.text)}
        </g>
        <!-- Stomach -->
        <g ${partAttrs('magen', o.highlight)}>
          <path d="M ${cx + 8} 186 C ${cx + 28} 184 ${cx + 36} 206 ${cx + 20} 216 C ${cx + 6} 222 ${cx - 4} 210 ${cx + 4} 200 Z" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="2"/>
          <line x1="${cx + 28}" y1="202" x2="424" y2="164" stroke="${p.berry}" stroke-width="1.8"/>
          ${pill(424, 153, 156, 'Magen (Verdauung)', p.berry, p.bg, p.text)}
        </g>
        <!-- Kidneys -->
        <g ${partAttrs('nieren', o.highlight)}>
          <ellipse cx="${cx - 24}" cy="226" rx="8" ry="12" fill="${p.violet}" opacity="0.85"/>
          <ellipse cx="${cx + 24}" cy="226" rx="8" ry="12" fill="${p.violet}" opacity="0.85"/>
          <line x1="${cx + 30}" y1="226" x2="424" y2="238" stroke="${p.violet}" stroke-width="1.8"/>
          ${pill(424, 227, 156, 'Nieren (Blutfilter)', p.violet, p.bg, p.text)}
        </g>
        <!-- Intestines -->
        <g ${partAttrs('darm', o.highlight)}>
          <path d="M ${cx - 24} 248 C ${cx - 28} 262 ${cx + 28} 256 ${cx + 24} 270 C ${cx + 22} 284 ${cx - 26} 278 ${cx - 20} 292 C ${cx - 14} 302 ${cx + 18} 300 ${cx + 18} 292" fill="none" stroke="${p.teal}" stroke-width="9" stroke-linecap="round"/>
          <line x1="${cx - 24}" y1="274" x2="176" y2="274" stroke="${p.teal}" stroke-width="1.8"/>
          ${pill(22, 263, 154, 'Darm (Nährstoffe)', p.teal, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 6. BLUTKREISLAUF ====================
  {
    id: 'blutkreislauf',
    title: 'Der Blutkreislauf',
    summary: 'Lungen- & Körperkreislauf mit O₂-reichem/armem Blut',
    aliases: ['herz', 'herzkreislauf', 'arterie', 'vene', 'blut', 'kreislaufsystem'],
    tags: ['blut', 'blutkreislauf', 'herz', 'arterie', 'vene', 'lunge', 'sauerstoff', 'medizin', 'biologie'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'lunge', label: 'Lungenkreislauf', note: 'Blut nimmt in der Lunge frischen Sauerstoff (O₂) auf und gibt CO₂ ab.' },
      { id: 'herz', label: 'Herz', note: 'Doppelpumpe: rechte Hälfte pumpt zur Lunge, linke Hälfte in den gesamten Körper.' },
      { id: 'arterien', label: 'Sauerstoffreiches Blut', note: 'Fließt über Arterien (rot) vom Herzen zu allen Organen und Muskeln.' },
      { id: 'venen', label: 'Sauerstoffarmes Blut', note: 'Kehrt über Venen (blau) aus dem Körper zurück zum Herzen.' },
      { id: 'koerper', label: 'Körperkapillaren', note: 'Feinste Gefäße: hier geben rote Blutkörperchen O₂ und Nährstoffe an die Zellen ab.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.berrySoft}" stroke="${p.berry}" stroke-opacity="0.2"/>
      <!-- Oxygen-poor blue paths (right half of loop on viewer left) -->
      <g ${partAttrs('venen', o.highlight)}>
        <path d="M 272 150 C 200 130 185 68 250 56" fill="none" stroke="${p.blue}" stroke-width="7" stroke-linecap="round"/>
        <path class="ps-flow" d="M 272 150 C 200 130 185 68 250 56" fill="none" stroke="${p.onAccent}" stroke-width="3" stroke-dasharray="8 16" stroke-linecap="round"/>
        <path d="M 250 286 C 175 280 185 204 272 188" fill="none" stroke="${p.blue}" stroke-width="7" stroke-linecap="round"/>
        <path class="ps-flow" d="M 250 286 C 175 280 185 204 272 188" fill="none" stroke="${p.onAccent}" stroke-width="3" stroke-dasharray="8 16" stroke-linecap="round"/>
        ${pill(18, 158, 152, 'O₂-arm (Venen)', p.blue, p.bg, p.text)}
      </g>
      <!-- Oxygen-rich red/berry paths (left heart → body on viewer right) -->
      <g ${partAttrs('arterien', o.highlight)}>
        <path d="M 350 56 C 415 68 400 130 328 150" fill="none" stroke="${p.berry}" stroke-width="7" stroke-linecap="round"/>
        <path class="ps-flow" d="M 350 56 C 415 68 400 130 328 150" fill="none" stroke="${p.onAccent}" stroke-width="3" stroke-dasharray="8 16" stroke-linecap="round"/>
        <path d="M 328 188 C 415 204 425 280 350 286" fill="none" stroke="${p.berry}" stroke-width="7" stroke-linecap="round"/>
        <path class="ps-flow" d="M 328 188 C 415 204 425 280 350 286" fill="none" stroke="${p.onAccent}" stroke-width="3" stroke-dasharray="8 16" stroke-linecap="round"/>
        ${pill(430, 158, 152, 'O₂-reich (Arterien)', p.berry, p.bg, p.text)}
      </g>
      <!-- Lungs top -->
      <g ${partAttrs('lunge', o.highlight)}>
        <rect x="236" y="24" width="128" height="58" rx="22" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2"/>
        <text x="300" y="48" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Lunge</text>
        <text x="300" y="66" font-size="11" font-weight="600" fill="${p.muted}" text-anchor="middle">+ O₂ aufnehmen · − CO₂</text>
      </g>
      <!-- Heart center -->
      <g ${partAttrs('herz', o.highlight)}>
        <g class="ps-heartbeat">
          <rect x="256" y="138" width="44" height="62" rx="14" fill="${p.blue}" stroke="${p.onAccent}" stroke-width="2"/>
          <rect x="300" y="138" width="44" height="62" rx="14" fill="${p.berry}" stroke="${p.onAccent}" stroke-width="2"/>
          <text x="278" y="172" font-size="11" font-weight="800" fill="${p.onAccent}" text-anchor="middle">R</text>
          <text x="322" y="172" font-size="11" font-weight="800" fill="${p.onAccent}" text-anchor="middle">L</text>
        </g>
        <text x="300" y="216" font-size="12" font-weight="800" fill="${p.text}" text-anchor="middle">Herz (Doppelpumpe)</text>
      </g>
      <!-- Body organs bottom -->
      <g ${partAttrs('koerper', o.highlight)}>
        <rect x="224" y="258" width="152" height="58" rx="20" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2"/>
        <text x="300" y="282" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Körper & Organe</text>
        <text x="300" y="300" font-size="11" font-weight="600" fill="${p.muted}" text-anchor="middle">O₂ an Zellen abgeben</text>
      </g>
    `,
  },

  // ==================== 7. ATMUNG & LUNGE ====================
  {
    id: 'atmung',
    title: 'Atmung & Lunge',
    summary: 'Luftröhre, Lungenflügel & Zwerchfell (Ein-/Ausatmen)',
    aliases: ['lunge', 'zwerchfell', 'gasaustausch', 'alveolen', 'bronchien'],
    tags: ['atmung', 'lunge', 'zwerchfell', 'sauerstoff', 'co2', 'alveolen', 'bronchien', 'medizin', 'biologie'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'luftroehre', label: 'Luftröhre', note: 'Leitet eingeatmete Luft über Knorpelspangen stabil in beide Bronchien.' },
      { id: 'lungenfluegel', label: 'Lungenflügel', note: 'Dehnen sich beim Einatmen durch den Unterdruck im Brustkorb passiv aus.' },
      { id: 'alveolen', label: 'Lungenbläschen (Alveolen)', note: 'Rund 300 Mio. Bläschen bieten ~100 m² Fläche für den Gasaustausch (O₂ ↔ CO₂).' },
      { id: 'zwerchfell', label: 'Zwerchfell', note: 'Wichtigster Atemmuskel: zieht sich beim Einatmen flach nach unten.' },
    ],
    states: [
      { id: 'einatmen', name: 'Einatmen (O₂)', note: 'Das Zwerchfell senkt sich, der Brustkorb weitet sich – frische Luft (O₂) strömt ein.' },
      { id: 'ausatmen', name: 'Ausatmen (CO₂)', note: 'Das Zwerchfell entspannt und wölbt sich nach oben – verbrauchte Luft (CO₂) strömt aus.' },
    ],
    render: (p, o) => {
      const exhale = (o.state ?? 0) === 1;
      const lungScale = exhale ? 'scale(0.91 0.94)' : 'scale(1.03 1.03)';
      const diaY = exhale ? 256 : 284;
      const diaCtrl = exhale ? 216 : 272;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
        <g ${partAttrs('luftroehre', o.highlight)}>
          <rect x="284" y="34" width="32" height="84" rx="10" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2"/>
          <path class="${exhale ? 'ps-flow-rev' : 'ps-flow'}" d="M 300 22 L 300 120" fill="none" stroke="${exhale ? p.berry : p.blue}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
          <line x1="284" y1="68" x2="180" y2="68" stroke="${p.teal}" stroke-width="1.8"/>
          ${pill(22, 57, 158, exhale ? 'Ausatmen (CO₂ ↑)' : 'Einatmen (O₂ ↓)', exhale ? p.berry : p.blue, p.bg, p.text)}
        </g>
        <g ${partAttrs('lungenfluegel', o.highlight)}>
          <g class="ps-lung-morph" style="transform-origin:300px 180px;transform:${lungScale}">
            <path d="M 284 110 C 216 114 190 184 204 238 C 224 252 268 240 284 220 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.4"/>
            <path d="M 316 110 C 384 114 410 184 396 238 C 376 252 332 240 316 220 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.4"/>
            <path d="M 294 114 L 254 154 M 254 154 L 230 184 M 254 154 L 266 196 M 306 114 L 346 154 M 346 154 L 370 184 M 346 154 L 334 196" fill="none" stroke="${p.teal}" stroke-width="3" stroke-linecap="round"/>
          </g>
          <line x1="202" y1="168" x2="180" y2="168" stroke="${p.blue}" stroke-width="1.8"/>
          ${pill(22, 157, 158, 'Lungenflügel', p.blue, p.bg, p.text)}
        </g>
        <g ${partAttrs('alveolen', o.highlight)}>
          <circle cx="496" cy="146" r="46" fill="${p.bg}" stroke="${p.violet}" stroke-width="2"/>
          <circle class="ps-pulse" cx="484" cy="136" r="14" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="1.8"/>
          <circle class="ps-pulse" cx="508" cy="138" r="14" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="1.8"/>
          <circle class="ps-pulse" cx="496" cy="158" r="15" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="1.8"/>
          <text x="496" y="210" font-size="11.5" font-weight="700" fill="${p.text}" text-anchor="middle">Alveolen (O₂ ↔ CO₂)</text>
          <line x1="376" y1="172" x2="450" y2="152" stroke="${p.violet}" stroke-width="1.6" stroke-dasharray="4 4"/>
        </g>
        <g ${partAttrs('zwerchfell', o.highlight)}>
          <path d="M 192 ${diaY} Q 300 ${diaCtrl} 408 ${diaY}" fill="none" stroke="${p.amber}" stroke-width="8" stroke-linecap="round"/>
          <text x="300" y="314" font-size="12.5" font-weight="800" fill="${p.text}" text-anchor="middle">Zwerchfell (${exhale ? 'wölbt sich hoch ↑' : 'zieht nach unten ↓'})</text>
        </g>
      `;
    },
  },

  // ==================== 8. ZELLE ====================
  {
    id: 'zelle',
    title: 'Aufbau einer Zelle',
    summary: 'Zellkern, Mitochondrien, Membran & Organellen',
    aliases: ['tierzelle', 'pflanzenzelle', 'organellen', 'mitochondrien', 'zellkern', 'eukaryot'],
    tags: ['zelle', 'biologie', 'zellkern', 'mitochondrien', 'membran', 'organellen', 'ribosomen', 'zytoplasma'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'membran', label: 'Zellmembran', note: 'Schützende Doppelschicht – regelt gezielt, welche Stoffe hinein- und hinausgelangen.' },
      { id: 'kern', label: 'Zellkern', note: 'Steuerzentrale der Zelle: enthält die DNA mit allen Bauplänen.' },
      { id: 'mitochondrien', label: 'Mitochondrien', note: '„Kraftwerke der Zelle“ – erzeugen durch Zellatmung die Energie (ATP).' },
      { id: 'er', label: 'ER & Ribosomen', note: 'Stellen Proteine her und transportieren sie durch die Zelle.' },
      { id: 'golgi', label: 'Golgi-Apparat', note: '„Poststelle“: verpackt Proteine in Bläschen (Vesikel) und verschickt sie.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.2"/>
      <!-- Outer Cell Membrane -->
      <g ${partAttrs('membran', o.highlight)}>
        <ellipse cx="300" cy="172" rx="138" ry="118" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="6"/>
        <ellipse cx="300" cy="172" rx="131" ry="111" fill="none" stroke="${p.onAccent}" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.6"/>
        <line x1="432" y1="118" x2="454" y2="66" stroke="${p.teal}" stroke-width="1.8"/>
        ${pill(448, 44, 134, 'Zellmembran', p.teal, p.bg, p.text)}
      </g>
      <!-- Nucleus -->
      <g ${partAttrs('kern', o.highlight)}>
        <circle class="ps-pulse" cx="290" cy="166" r="44" fill="${p.violetNode}" stroke="${p.violet}" stroke-width="3"/>
        <circle cx="296" cy="162" r="16" fill="${p.violet}"/>
        <line x1="246" y1="154" x2="156" y2="80" stroke="${p.violet}" stroke-width="1.8"/>
        ${pill(16, 68, 142, 'Zellkern (DNA)', p.violet, p.bg, p.text)}
      </g>
      <!-- ER + Ribosomes -->
      <g ${partAttrs('er', o.highlight)}>
        <path d="M 244 134 C 228 148 228 188 248 206 C 236 218 214 196 218 164 C 220 138 234 124 244 134 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2"/>
        <circle cx="222" cy="154" r="3" fill="${p.blue}"/><circle cx="220" cy="174" r="3" fill="${p.blue}"/><circle cx="232" cy="194" r="3" fill="${p.blue}"/>
        <line x1="216" y1="176" x2="158" y2="176" stroke="${p.blue}" stroke-width="1.8"/>
        ${pill(16, 165, 142, 'ER & Ribosomen', p.blue, p.bg, p.text)}
      </g>
      <!-- Mitochondria -->
      <g ${partAttrs('mitochondrien', o.highlight)}>
        <g transform="rotate(-24 368 128)"><g class="ps-pulse">
          <ellipse cx="368" cy="128" rx="28" ry="14" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="1.5"/>
          <path d="M 348 128 Q 354 120 360 128 T 372 128 T 386 128" fill="none" stroke="${p.onAccent}" stroke-width="2"/>
        </g></g>
        <g transform="rotate(18 274 246)"><g class="ps-pulse">
          <ellipse cx="274" cy="246" rx="26" ry="13" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="1.5"/>
          <path d="M 256 246 Q 262 238 268 246 T 280 246 T 292 246" fill="none" stroke="${p.onAccent}" stroke-width="2"/>
        </g></g>
        <line x1="392" y1="138" x2="448" y2="164" stroke="${p.amber}" stroke-width="1.8"/>
        ${pill(448, 153, 134, 'Mitochondrien', p.amber, p.bg, p.text)}
      </g>
      <!-- Golgi -->
      <g ${partAttrs('golgi', o.highlight)}>
        <path d="M 332 214 Q 364 202 390 218 M 336 226 Q 364 216 388 230 M 342 238 Q 364 230 384 242" fill="none" stroke="${p.berry}" stroke-width="5" stroke-linecap="round"/>
        <circle class="ps-float" cx="404" cy="222" r="5" fill="${p.berry}"/>
        <line x1="388" y1="234" x2="448" y2="262" stroke="${p.berry}" stroke-width="1.8"/>
        ${pill(448, 251, 134, 'Golgi-Apparat', p.berry, p.bg, p.text)}
      </g>
    `,
  },

  // ==================== 9. DNA-DOPPELHELIX ====================
  {
    id: 'dna',
    title: 'DNA-Doppelhelix',
    summary: 'Zucker-Phosphat-Stränge & komplementäre Basenpaare',
    aliases: ['dns', 'doppelhelix', 'genetik', 'basenpaare', 'chromosom', 'erbgut'],
    tags: ['dna', 'dns', 'genetik', 'biologie', 'basen', 'adenin', 'thymin', 'cytosin', 'guanin', 'vererbung', 'helix'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'rueckgrat', label: 'Zucker-Phosphat-Rückgrat', note: 'Zwei gegenläufige Außenstränge geben der Doppelhelix Stabilität.' },
      { id: 'at', label: 'Basenpaar A – T', note: 'Adenin (A) paart sich immer mit Thymin (T) über 2 Wasserstoffbrücken.' },
      { id: 'cg', label: 'Basenpaar C – G', note: 'Cytosin (C) paart sich immer mit Guanin (G) über 3 Wasserstoffbrücken.' },
      { id: 'codierung', label: 'Genetischer Code', note: 'Die Reihenfolge der Basen speichert die Bauanleitung für Proteine.' },
    ],
    render: (p, o) => {
      const pairs = ['AT', 'CG', 'TA', 'GC', 'AT', 'CG', 'GC', 'TA', 'AT', 'CG'];
      const rungs = pairs
        .map((pair, idx) => {
          const x = 90 + idx * 46;
          const phase = (idx / 4.5) * Math.PI;
          const y1 = 166 + Math.sin(phase) * 66;
          const y2 = 166 - Math.sin(phase) * 66;
          const isAT = pair === 'AT' || pair === 'TA';
          const midY = (y1 + y2) / 2;
          const c1 = isAT ? p.amber : p.teal;
          const c2 = isAT ? p.berry : p.violet;
          return `<g ${partAttrs(isAT ? 'at' : 'cg', o.highlight)}>
            <line x1="${x}" y1="${y1.toFixed(1)}" x2="${x}" y2="${midY.toFixed(1)}" stroke="${c1}" stroke-width="6" stroke-linecap="round"/>
            <line x1="${x}" y1="${midY.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="${c2}" stroke-width="6" stroke-linecap="round"/>
            <circle cx="${x}" cy="${midY.toFixed(1)}" r="3.5" fill="${p.bg}"/>
            ${Math.abs(y1 - y2) > 54 ? `<text x="${x}" y="${(y1 + (y1 < midY ? 18 : -10)).toFixed(1)}" font-size="10" font-weight="800" fill="${p.text}" text-anchor="middle">${pair[0]}</text><text x="${x}" y="${(y2 + (y2 < midY ? 18 : -10)).toFixed(1)}" font-size="10" font-weight="800" fill="${p.text}" text-anchor="middle">${pair[1]}</text>` : ''}
          </g>`;
        })
        .join('');
      const s1: string[] = [];
      const s2: string[] = [];
      for (let k = 0; k <= 40; k++) {
        const x = 66 + (k / 40) * 468;
        const ph = ((x - 90) / (46 * 4.5)) * Math.PI;
        s1.push(`${x.toFixed(1)},${(166 + Math.sin(ph) * 66).toFixed(1)}`);
        s2.push(`${x.toFixed(1)},${(166 - Math.sin(ph) * 66).toFixed(1)}`);
      }
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.violetSoft}" stroke="${p.violet}" stroke-opacity="0.22"/>
        <g class="ps-float">
          ${rungs}
          <g ${partAttrs('rueckgrat', o.highlight)}>
            <polyline points="${s1.join(' ')}" fill="none" stroke="${p.blue}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="${s2.join(' ')}" fill="none" stroke="${p.teal}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline class="ps-flow" points="${s1.join(' ')}" fill="none" stroke="${p.onAccent}" stroke-width="2.2" stroke-dasharray="6 18" stroke-linecap="round"/>
          </g>
        </g>
        <g ${partAttrs('rueckgrat', o.highlight)}>${pill(24, 24, 184, 'Zucker-Phosphat-Strang', p.blue, p.bg, p.text)}</g>
        <g ${partAttrs('at', o.highlight)}>${pill(224, 294, 152, 'A – T (2 Brücken)', p.amber, p.bg, p.text)}</g>
        <g ${partAttrs('cg', o.highlight)}>${pill(394, 294, 152, 'C – G (3 Brücken)', p.teal, p.bg, p.text)}</g>
        <g ${partAttrs('codierung', o.highlight)}>${pill(36, 294, 170, 'Basenfolge = Bauplan', p.violet, p.bg, p.text)}</g>
      `;
    },
  },

  // ==================== 10. SYNAPSE ====================
  {
    id: 'synapse',
    title: 'Synapse & Reizweiterleitung',
    summary: 'Aktionspotenzial, Neurotransmitter & Rezeptoren',
    aliases: ['nervenzelle', 'neuron', 'neurotransmitter', 'reizweiterleitung', 'aktionspotenzial'],
    tags: ['synapse', 'nerv', 'neuron', 'gehirn', 'neurotransmitter', 'reiz', 'biologie', 'psychologie', 'medizin'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'signal', label: 'Elektrisches Signal', note: 'Ein Aktionspotenzial läuft am Axon entlang bis ins Endknöpfchen.' },
      { id: 'vesikel', label: 'Vesikel', note: 'Kleine Bläschen gefüllt mit Botenstoffen (Neurotransmittern) verschmelzen mit der Membran.' },
      { id: 'spalt', label: 'Synaptischer Spalt', note: 'Winziger Zwischenraum – hier wandern die Botenstoffe per Diffusion zur nächsten Zelle.' },
      { id: 'rezeptor', label: 'Rezeptoren', note: 'Schlüssel-Schloss-Prinzip: Botenstoffe öffnen Ionenkanäle und starten ein neues Signal.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.violetSoft}" stroke="${p.violet}" stroke-opacity="0.22"/>
      <!-- Presynaptic terminal (left) -->
      <g ${partAttrs('signal', o.highlight)}>
        <path d="M 16 142 L 154 142 C 188 142 224 96 254 102 C 276 106 276 238 254 242 C 224 248 188 202 154 202 L 16 202 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.4"/>
        <path class="ps-flow" d="M 28 172 L 194 172" fill="none" stroke="${p.amber}" stroke-width="5" stroke-dasharray="10 14" stroke-linecap="round"/>
        ${pill(22, 34, 178, '1. Aktionspotenzial →', p.amber, p.bg, p.text)}
      </g>
      <!-- Vesicles -->
      <g ${partAttrs('vesikel', o.highlight)}>
        <circle class="ps-float" cx="222" cy="144" r="14" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="2"/>
        <circle class="ps-float" style="animation-delay:0.5s" cx="234" cy="198" r="14" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="2"/>
        <circle cx="222" cy="144" r="3" fill="${p.berry}"/><circle cx="227" cy="148" r="3" fill="${p.berry}"/>
        <circle cx="234" cy="198" r="3" fill="${p.berry}"/><circle cx="239" cy="194" r="3" fill="${p.berry}"/>
        ${pill(22, 286, 174, '2. Vesikel mit Botenstoff', p.amber, p.bg, p.text)}
      </g>
      <!-- Synaptic cleft + diffusing transmitters -->
      <g ${partAttrs('spalt', o.highlight)}>
        <rect x="276" y="88" width="60" height="168" rx="8" fill="${p.bg}" opacity="0.5"/>
        ${[126, 152, 174, 198, 218]
          .map((y, idx) => `<circle class="ps-drift-x" style="animation-delay:${(idx * 0.25).toFixed(2)}s" cx="${288 + (idx % 2) * 14}" cy="${y}" r="4.5" fill="${p.berry}"/>`)
          .join('')}
        ${pill(226, 34, 160, '3. Synaptischer Spalt', p.berry, p.bg, p.text)}
      </g>
      <!-- Postsynaptic membrane + receptors -->
      <g ${partAttrs('rezeptor', o.highlight)}>
        <path d="M 584 142 L 434 142 C 394 142 368 96 344 102 C 330 106 330 238 344 242 C 368 248 394 202 434 202 L 584 202 Z" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.4"/>
        ${[132, 172, 212]
          .map((y) => `<rect class="ps-pulse" x="330" y="${y - 9}" width="16" height="18" rx="5" fill="${p.violet}" stroke="${p.onAccent}" stroke-width="1.3"/>`)
          .join('')}
        <path class="ps-flow" d="M 382 172 L 568 172" fill="none" stroke="${p.teal}" stroke-width="5" stroke-dasharray="10 14" stroke-linecap="round"/>
        ${pill(396, 286, 184, '4. Rezeptor → neues Signal', p.teal, p.bg, p.text)}
      </g>
    `,
  },

  // ==================== 11. FOTOSYNTHESE ====================
  {
    id: 'fotosynthese',
    title: 'Fotosynthese',
    summary: 'Sonnenlicht + CO₂ + H₂O → Glukose + O₂',
    aliases: ['photosynthese', 'pflanze', 'chloroplast', 'blatt', 'chlorophyll'],
    tags: ['fotosynthese', 'photosynthese', 'pflanze', 'blatt', 'sauerstoff', 'glukose', 'co2', 'biologie', 'natur'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'licht', label: 'Sonnenlicht', note: 'Liefert die Energie, die das grüne Chlorophyll in den Blättern einfängt.' },
      { id: 'co2', label: 'CO₂ aus der Luft', note: 'Gelangt über winzige Spaltöffnungen (Stomata) ins Blatt.' },
      { id: 'wasser', label: 'Wasser (H₂O)', note: 'Wird über die Wurzeln aufgenommen und durch den Stängel ins Blatt geleitet.' },
      { id: 'chloroplast', label: 'Chloroplast', note: 'Hier wandelt die Pflanze Licht, Wasser und CO₂ in energiereiche Glukose (Zucker) um.' },
      { id: 'sauerstoff', label: 'Sauerstoff (O₂)', note: 'Entsteht als „Nebenprodukt“ und wird an die Luft abgegeben – lebenswichtig für uns.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.22"/>
      <!-- Sun & rays -->
      <g ${partAttrs('licht', o.highlight)}>
        <circle class="ps-pulse" cx="76" cy="68" r="28" fill="${p.amber}"/>
        <circle class="ps-glow" cx="76" cy="68" r="38" fill="${p.amber}" opacity="0.22"/>
        <path class="ps-flow" d="M 106 86 L 236 144" fill="none" stroke="${p.amber}" stroke-width="3.2" stroke-dasharray="7 5" stroke-linecap="round"/>
        <path class="ps-flow" d="M 96 100 L 222 162" fill="none" stroke="${p.amber}" stroke-width="2.4" stroke-dasharray="5 7" stroke-linecap="round"/>
        ${pill(114, 24, 128, 'Sonnenlicht', p.amber, p.bg, p.text)}
      </g>
      <!-- Soil & Water -->
      <g ${partAttrs('wasser', o.highlight)}>
        <path d="M 180 286 Q 300 274 420 286 L 420 334 L 180 334 Z" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="1.6"/>
        <path d="M 300 232 L 300 296 M 300 292 L 268 318 M 300 292 L 334 316 M 300 296 L 296 322" fill="none" stroke="${p.amber}" stroke-width="4" stroke-linecap="round"/>
        <path class="ps-flow-rev" d="M 300 298 L 300 218" fill="none" stroke="${p.blue}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
        ${pill(22, 286, 146, 'Wasser (H₂O) ↑', p.blue, p.bg, p.text)}
      </g>
      <!-- Leaf & Chloroplast -->
      <g ${partAttrs('chloroplast', o.highlight)}>
        <path d="M 296 226 C 216 206 204 128 296 96 C 388 128 376 206 296 226 Z" fill="${p.teal}" stroke="${p.onAccent}" stroke-width="2"/>
        <line x1="296" y1="226" x2="296" y2="112" stroke="${p.onAccent}" stroke-width="2" opacity="0.65"/>
        <circle class="ps-pulse" cx="296" cy="162" r="24" fill="${p.tealSoft}" stroke="${p.onAccent}" stroke-width="2"/>
        <text x="296" y="160" font-size="10.5" font-weight="800" fill="${p.text}" text-anchor="middle">Glukose</text>
        <text x="296" y="173" font-size="9.5" font-weight="700" fill="${p.teal}" text-anchor="middle">C₆H₁₂O₆</text>
      </g>
      <!-- CO2 in -->
      <g ${partAttrs('co2', o.highlight)}>
        <path class="ps-flow" d="M 136 184 L 218 184" fill="none" stroke="${p.violet}" stroke-width="3.4" stroke-dasharray="6 6" stroke-linecap="round"/>
        ${pill(18, 173, 114, 'CO₂ hinein →', p.violet, p.bg, p.text)}
      </g>
      <!-- O2 out -->
      <g ${partAttrs('sauerstoff', o.highlight)}>
        <path class="ps-flow" d="M 374 148 L 468 110" fill="none" stroke="${p.blue}" stroke-width="3.6" stroke-dasharray="6 6" stroke-linecap="round"/>
        <path class="ps-flow" d="M 374 186 L 468 206" fill="none" stroke="${p.amber}" stroke-width="3.2" stroke-dasharray="6 6" stroke-linecap="round"/>
        ${pill(450, 74, 134, 'O₂ hinaus →', p.blue, p.bg, p.text)}
        ${pill(442, 198, 142, 'Zucker (Energie)', p.amber, p.bg, p.text)}
      </g>
    `,
  },

  // ==================== 12. STROMKREIS ====================
  {
    id: 'stromkreis',
    title: 'Elektrischer Stromkreis',
    summary: 'Batterie, Schalter, Widerstand & Glühlampe (umschaltbar)',
    aliases: ['schaltung', 'elektrizitaet', 'ohm', 'strom', 'elektronen', 'spannung'],
    tags: ['stromkreis', 'strom', 'spannung', 'widerstand', 'physik', 'elektro', 'elektronen', 'ohm', 'batterie', 'lampe'],
    domains: ['general', 'math'],
    width: 600,
    height: 340,
    parts: [
      { id: 'batterie', label: 'Spannungsquelle', note: 'Treibt Elektronen durch den Stromkreis – die Spannung (Volt) ist der „Antrieb“.' },
      { id: 'schalter', label: 'Schalter', note: 'Unterbricht oder schließt die Leitung: Strom fließt nur im geschlossenen Kreis.' },
      { id: 'lampe', label: 'Verbraucher (Lampe)', note: 'Wandelt elektrische Energie in Licht und Wärme um.' },
      { id: 'elektronen', label: 'Elektronenfluss', note: 'Elektronen wandern vom Minus- zum Pluspol (technische Stromrichtung: + nach −).' },
    ],
    states: [
      { id: 'zu', name: 'Schalter zu (AN)', note: 'Der Stromkreis ist geschlossen – Elektronen fließen gleichmäßig und die Lampe leuchtet!' },
      { id: 'auf', name: 'Schalter auf (AUS)', note: 'Die Leitung ist unterbrochen – es fließt kein Strom und die Lampe bleibt aus.' },
    ],
    render: (p, o) => {
      const open = (o.state ?? 0) === 1;
      const wirePath = open
        ? 'M 140 248 L 140 94 L 252 94 M 332 94 L 460 94 L 460 248 L 140 248'
        : 'M 140 248 L 140 94 L 460 94 L 460 248 Z';
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.amberSoft}" stroke="${p.amber}" stroke-opacity="0.22"/>
        <!-- Wires + animated electrons -->
        <g ${partAttrs('elektronen', o.highlight)}>
          <path d="${wirePath}" fill="none" stroke="${p.text}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>
          ${open ? '' : `<path class="ps-flow" d="M 140 248 L 140 94 L 460 94 L 460 248 Z" fill="none" stroke="${p.blue}" stroke-width="4" stroke-dasharray="6 18" stroke-linecap="round"/>`}
          ${pill(194, 276, 212, open ? 'Kein Stromfluss (offen)' : 'Elektronen fließen (I > 0)', open ? p.muted : p.blue, p.bg, p.text)}
        </g>
        <!-- Battery (left) -->
        <g ${partAttrs('batterie', o.highlight)}>
          <rect x="108" y="136" width="64" height="72" rx="12" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.2"/>
          <line x1="124" y1="162" x2="156" y2="162" stroke="${p.teal}" stroke-width="4"/>
          <line x1="132" y1="180" x2="148" y2="180" stroke="${p.berry}" stroke-width="4"/>
          <text x="160" y="154" font-size="13" font-weight="800" fill="${p.teal}">+</text>
          <text x="160" y="192" font-size="14" font-weight="800" fill="${p.berry}">−</text>
          ${pill(14, 162, 86, 'Batterie', p.teal, p.bg, p.text)}
        </g>
        <!-- Switch (top) -->
        <g ${partAttrs('schalter', o.highlight)}>
          <circle cx="256" cy="94" r="5" fill="${p.text}"/>
          <circle cx="332" cy="94" r="5" fill="${p.text}"/>
          <line x1="256" y1="94" x2="${open ? 324 : 332}" y2="${open ? 64 : 94}" stroke="${p.berry}" stroke-width="4.5" stroke-linecap="round"/>
          ${pill(226, 20, 148, open ? 'Schalter: OFFEN' : 'Schalter: ZU', p.berry, p.bg, p.text)}
        </g>
        <!-- Bulb (right) -->
        <g ${partAttrs('lampe', o.highlight)}>
          ${open ? '' : `<circle class="ps-glow" cx="460" cy="172" r="46" fill="${p.amber}" opacity="0.32"/>`}
          <circle cx="460" cy="172" r="28" fill="${open ? p.bg : p.amber}" stroke="${open ? p.muted : p.amber}" stroke-width="2.4"/>
          <path d="M 450 182 L 456 164 L 460 174 L 464 164 L 470 182" fill="none" stroke="${open ? p.muted : p.onAccent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          ${pill(502, 162, 84, open ? 'Aus' : 'Leuchtet!', open ? p.muted : p.amber, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 13. TRAGFLÄCHE & AUFTRIEB ====================
  {
    id: 'tragflaeche',
    title: 'Tragfläche & Auftrieb',
    summary: 'Schnelle Luft oben (Unterdruck) & Auftriebskraft',
    aliases: ['fluegel', 'auftrieb', 'bernoulli', 'aerodynamik', 'airfoil', 'flugzeugfluegel'],
    tags: ['tragflaeche', 'fluegel', 'auftrieb', 'flugzeug', 'physik', 'bernoulli', 'luft', 'stroemung', 'fliegen'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'oberseite', label: 'Schnelle Strömung (Unterdruck)', note: 'Über die gewölbte Oberseite strömt die Luft schneller → geringerer Druck (Bernoulli).' },
      { id: 'unterseite', label: 'Langsamere Strömung (Überdruck)', note: 'Unter der Tragfläche ist der Druck höher und drückt den Flügel nach oben.' },
      { id: 'profil', label: 'Flügelprofil', note: 'Asymmetrische Form und Anstellwinkel lenken die Luft nach hinten-unten ab.' },
      { id: 'auftrieb', label: 'Auftriebskraft', note: 'Resultierende Kraft nach oben – trägt das Flugzeug gegen die Schwerkraft.' },
    ],
    states: [
      { id: 'normal', name: 'Reiseflug', note: 'Gleichmäßige, laminare Strömung – stabiler Auftrieb hält die Flughöhe.' },
      { id: 'steil', name: 'Starker Auftrieb', note: 'Größerer Anstellwinkel lenkt mehr Luft nach unten → spürbar stärkerer Auftrieb!' },
    ],
    render: (p, o) => {
      const steep = (o.state ?? 0) === 1;
      const tilt = steep ? -10 : -2;
      const liftH = steep ? 92 : 64;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
        <!-- Upper fast streamlines -->
        <g ${partAttrs('oberseite', o.highlight)}>
          <path class="ps-flow-fast" d="M 32 136 Q 230 ${steep ? 68 : 82} 564 134" fill="none" stroke="${p.blue}" stroke-width="3" stroke-dasharray="14 10" stroke-linecap="round"/>
          <path class="ps-flow-fast" d="M 32 162 Q 236 ${steep ? 94 : 108} 564 166" fill="none" stroke="${p.blue}" stroke-width="2.4" stroke-dasharray="14 10" stroke-linecap="round"/>
          ${pill(34, 34, 212, 'Oben: schnell → Unterdruck', p.blue, p.bg, p.text)}
        </g>
        <!-- Lower slower streamlines -->
        <g ${partAttrs('unterseite', o.highlight)}>
          <path class="ps-flow" d="M 32 214 Q 260 226 564 ${steep ? 242 : 220}" fill="none" stroke="${p.amber}" stroke-width="2.6" stroke-dasharray="10 14" stroke-linecap="round"/>
          <path class="ps-flow" d="M 32 246 Q 260 254 564 ${steep ? 268 : 250}" fill="none" stroke="${p.amber}" stroke-width="2" stroke-dasharray="10 14" stroke-linecap="round"/>
          ${pill(34, 286, 216, 'Unten: langsamer → Überdruck', p.amber, p.bg, p.text)}
        </g>
        <!-- Airfoil cross-section -->
        <g ${partAttrs('profil', o.highlight)}>
          <g style="transform-origin:280px 180px;transform:rotate(${tilt}deg);transition:transform 0.45s ease">
            <path d="M 150 182 C 154 140 248 126 334 150 C 388 164 422 178 442 188 C 388 194 282 198 202 196 C 166 196 148 190 150 182 Z" fill="${p.teal}" stroke="${p.onAccent}" stroke-width="2"/>
            <circle cx="192" cy="172" r="5" fill="${p.onAccent}" opacity="0.65"/>
          </g>
        </g>
        <!-- Lift vector -->
        <g ${partAttrs('auftrieb', o.highlight)}>
          <line x1="274" y1="140" x2="274" y2="${140 - liftH}" stroke="${p.berry}" stroke-width="6" stroke-linecap="round"/>
          <polygon points="274,${130 - liftH} 262,${148 - liftH} 286,${148 - liftH}" fill="${p.berry}"/>
          ${pill(302, 34, 152, steep ? 'Auftrieb ↑↑ (stark)' : 'Auftrieb ↑', p.berry, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 14. OPTIK & LINSE ====================
  {
    id: 'optik',
    title: 'Optik: Lichtbrechung an Linsen',
    summary: 'Sammellinse vs. Zerstreuungslinse mit Brennpunkt',
    aliases: ['linse', 'sammellinse', 'lichtbrechung', 'brennpunkt', 'prisma', 'licht'],
    tags: ['optik', 'linse', 'licht', 'brechung', 'brennpunkt', 'physik', 'auge', 'brille', 'strahl'],
    domains: ['general', 'math'],
    width: 600,
    height: 340,
    parts: [
      { id: 'einfall', label: 'Parallele Lichtstrahlen', note: 'Licht breitet sich im gleichen Medium geradlinig aus.' },
      { id: 'linse', label: 'Optische Linse', note: 'Bricht Lichtstrahlen an ihren gewölbten Glasflächen – stärker am Rand als in der Mitte.' },
      { id: 'brennpunkt', label: 'Brennpunkt (F)', note: 'Hier bündelt eine Sammellinse alle parallelen Strahlen (bei Zerstreuungslinse virtuell).' },
    ],
    states: [
      { id: 'sammel', name: 'Sammellinse (konvex)', note: 'Nach außen gewölbt: bündelt parallele Strahlen genau im Brennpunkt F.' },
      { id: 'zerstreu', name: 'Zerstreuungslinse (konkav)', note: 'Nach innen gewölbt: fächert Strahlen auf, als kämen sie vom virtuellen Brennpunkt F.' },
    ],
    render: (p, o) => {
      const concave = (o.state ?? 0) === 1;
      const ys = [104, 138, 206, 240];
      const outRays = concave
        ? ys.map((y) => {
            const dy = y - 172;
            return `<line class="ps-flow" x1="290" y1="${y}" x2="556" y2="${(172 + dy * 2.0).toFixed(1)}" stroke="${p.amber}" stroke-width="2.8" stroke-dasharray="14 10" stroke-linecap="round"/><line x1="170" y1="172" x2="290" y2="${y}" stroke="${p.violet}" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.65"/>`;
          }).join('')
        : ys.map((y) => `<line class="ps-flow" x1="290" y1="${y}" x2="556" y2="${(172 + (172 - y) * 0.78).toFixed(1)}" stroke="${p.amber}" stroke-width="2.8" stroke-dasharray="14 10" stroke-linecap="round"/>`).join('');
      const fx = concave ? 170 : 440;
      const lensPath = concave
        ? 'M 272 72 L 308 72 Q 294 172 308 272 L 272 272 Q 286 172 272 72 Z'
        : 'M 290 70 Q 326 172 290 274 Q 254 172 290 70 Z';
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.amberSoft}" stroke="${p.amber}" stroke-opacity="0.22"/>
        <!-- Optical axis -->
        <line x1="26" y1="172" x2="574" y2="172" stroke="${p.muted}" stroke-width="1.5" stroke-dasharray="6 5"/>
        <g ${partAttrs('einfall', o.highlight)}>
          ${ys.map((y) => `<line class="ps-flow" x1="34" y1="${y}" x2="288" y2="${y}" stroke="${p.amber}" stroke-width="2.8" stroke-dasharray="14 10" stroke-linecap="round"/>`).join('')}
          ${pill(24, 24, 168, 'Parallele Lichtstrahlen →', p.amber, p.bg, p.text)}
        </g>
        ${outRays}
        <g ${partAttrs('linse', o.highlight)}>
          <path d="${lensPath}" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.4" fill-opacity="0.78"/>
          ${pill(216, 294, 152, concave ? 'Zerstreuungslinse' : 'Sammellinse', p.blue, p.bg, p.text)}
        </g>
        <g ${partAttrs('brennpunkt', o.highlight)}>
          <circle class="ps-glow" cx="${fx}" cy="172" r="14" fill="${p.berry}" opacity="0.32"/>
          <circle class="ps-pulse" cx="${fx}" cy="172" r="6" fill="${p.berry}"/>
          <text x="${fx}" y="152" font-size="13" font-weight="800" fill="${p.berry}" text-anchor="middle">F</text>
          ${pill(404, 24, 174, concave ? 'Virtueller Brennpunkt F' : 'Brennpunkt F', p.berry, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 15. ATOMMODELL ====================
  {
    id: 'atom',
    title: 'Bohr’sches Atommodell',
    summary: 'Atomkern (Protonen/Neutronen) & kreisende Elektronen',
    aliases: ['atommodell', 'bohr', 'elektronen', 'protonen', 'schalenmodell', 'kern'],
    tags: ['atom', 'chemie', 'physik', 'elektron', 'proton', 'neutron', 'schale', 'kern', 'periodensystem'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'kern', label: 'Atomkern (+)', note: 'Winzig klein, enthält aber fast die gesamte Masse: positive Protonen und neutrale Neutronen.' },
      { id: 'k_schale', label: 'K-Schale (innen)', note: 'Innerste Elektronenschale – fasst höchstens 2 Elektronen.' },
      { id: 'l_schale', label: 'L-Schale (außen)', note: 'Zweite Schale (Valenzelektronen) – bestimmt die chemischen Bindungen des Atoms.' },
      { id: 'elektron', label: 'Elektronen (−)', note: 'Negativ geladene Teilchen in der Hülle – bewegen sich auf festen Energieniveaus.' },
    ],
    render: (p, o) => {
      const cx = 290, cy = 172;
      const orb = (r: number, degs: number[], dur: number, pid: string, col: string) =>
        `<g ${partAttrs(pid, o.highlight)}><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="1.8" stroke-opacity="0.55"/>${degs
          .map((deg) => {
            const anim = o.animated ? ` style="transform-origin:${cx}px ${cy}px;animation-duration:${dur}s;animation-delay:-${((deg / 360) * dur).toFixed(2)}s"` : '';
            const rot = o.animated ? '' : ` transform="rotate(${deg} ${cx} ${cy})"`;
            return `<g class="${o.animated ? 'ps-orbit' : ''}"${anim}${rot}><circle cx="${cx + r}" cy="${cy}" r="7.5" fill="${col}" stroke="${p.onAccent}" stroke-width="1.5"/><text x="${cx + r}" y="${cy}" font-size="10" font-weight="800" fill="${p.onAccent}" text-anchor="middle" dominant-baseline="central">−</text></g>`;
          })
          .join('')}</g>`;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.violetSoft}" stroke="${p.violet}" stroke-opacity="0.22"/>
        ${orb(66, [0, 180], 7, 'k_schale', p.blue)}
        ${orb(118, [30, 120, 210, 300], 13, 'l_schale', p.teal)}
        <g ${partAttrs('kern', o.highlight)}>
          <circle class="ps-glow" cx="${cx}" cy="${cy}" r="30" fill="${p.berry}" opacity="0.22"/>
          <circle cx="${cx - 7}" cy="${cy - 6}" r="8" fill="${p.berry}" stroke="${p.onAccent}" stroke-width="1.2"/>
          <circle cx="${cx + 7}" cy="${cy - 5}" r="8" fill="${p.muted}" stroke="${p.onAccent}" stroke-width="1.2"/>
          <circle cx="${cx - 6}" cy="${cy + 7}" r="8" fill="${p.muted}" stroke="${p.onAccent}" stroke-width="1.2"/>
          <circle cx="${cx + 6}" cy="${cy + 7}" r="8" fill="${p.berry}" stroke="${p.onAccent}" stroke-width="1.2"/>
          <circle cx="${cx}" cy="${cy}" r="8" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="1.2"/>
        </g>
        <g ${partAttrs('kern', o.highlight)}>${pill(18, 44, 152, 'Kern: p⁺ & n⁰', p.berry, p.bg, p.text)}</g>
        <g ${partAttrs('k_schale', o.highlight)}>${pill(430, 62, 152, 'K-Schale (max. 2 e⁻)', p.blue, p.bg, p.text)}</g>
        <g ${partAttrs('l_schale', o.highlight)}>${pill(430, 162, 152, 'L-Schale (Valenz-e⁻)', p.teal, p.bg, p.text)}</g>
        <g ${partAttrs('elektron', o.highlight)}>${pill(430, 262, 152, 'Elektronen (e⁻)', p.violet, p.bg, p.text)}</g>
      `;
    },
  },

  // ==================== 16. COMPUTER-ARCHITEKTUR ====================
  {
    id: 'computer',
    title: 'Aufbau eines Computers',
    summary: 'CPU, Arbeitsspeicher (RAM), Speicher & Datenbus',
    aliases: ['vonneumann', 'cpu', 'ram', 'rechner', 'hardware', 'prozessor'],
    tags: ['computer', 'informatik', 'cpu', 'ram', 'speicher', 'hardware', 'programmieren', 'daten', 'bus', 'prozessor'],
    domains: ['java', 'general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'eingabe', label: 'Eingabe', note: 'Tastatur, Maus, Sensoren oder Mikrofon liefern Daten an das System.' },
      { id: 'cpu', label: 'CPU (Prozessor)', note: 'Steuerwerk & Rechenwerk (ALU) führen Befehle im Milliarden-Takt pro Sekunde aus.' },
      { id: 'ram', label: 'RAM (Arbeitsspeicher)', note: 'Ultraschneller Kurzzeitspeicher für laufende Programme – verliert Daten beim Ausschalten.' },
      { id: 'speicher', label: 'SSD / Festplatte', note: 'Dauerhafter Langzeitspeicher für Dateien, Apps und Betriebssystem.' },
      { id: 'ausgabe', label: 'Ausgabe', note: 'Bildschirm, Lautsprecher oder Drucker machen Ergebnisse sichtbar und hörbar.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.2"/>
      <!-- Animated data buses -->
      <path class="ps-flow" d="M 134 156 L 214 156" fill="none" stroke="${p.teal}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
      <path class="ps-flow" d="M 386 156 L 466 156" fill="none" stroke="${p.teal}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
      <path class="ps-flow" d="M 278 214 L 278 250" fill="none" stroke="${p.blue}" stroke-width="3.6" stroke-dasharray="6 6" stroke-linecap="round"/>
      <path class="ps-flow-rev" d="M 322 214 L 322 250" fill="none" stroke="${p.amber}" stroke-width="3.6" stroke-dasharray="6 6" stroke-linecap="round"/>
      <!-- Input -->
      <g ${partAttrs('eingabe', o.highlight)}>
        <rect x="22" y="118" width="112" height="76" rx="14" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2"/>
        <text x="78" y="150" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Eingabe</text>
        <text x="78" y="170" font-size="11" fill="${p.muted}" text-anchor="middle">Tastatur · Maus</text>
      </g>
      <!-- CPU -->
      <g ${partAttrs('cpu', o.highlight)}>
        <rect x="214" y="76" width="172" height="138" rx="16" fill="${p.violetNode}" stroke="${p.violet}" stroke-width="2.4"/>
        <text x="300" y="102" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">CPU (Prozessor)</text>
        <rect class="ps-pulse" x="232" y="116" width="136" height="36" rx="10" fill="${p.violet}"/>
        <text x="300" y="138" font-size="12" font-weight="700" fill="${p.onAccent}" text-anchor="middle">Steuerwerk (Takt)</text>
        <rect x="232" y="162" width="136" height="36" rx="10" fill="${p.bg}" stroke="${p.violet}" stroke-width="1.6"/>
        <text x="300" y="184" font-size="12" font-weight="700" fill="${p.text}" text-anchor="middle">Rechenwerk (ALU)</text>
      </g>
      <!-- Output -->
      <g ${partAttrs('ausgabe', o.highlight)}>
        <rect x="466" y="118" width="112" height="76" rx="14" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="2"/>
        <text x="522" y="150" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Ausgabe</text>
        <text x="522" y="170" font-size="11" fill="${p.muted}" text-anchor="middle">Display · Ton</text>
      </g>
      <!-- RAM -->
      <g ${partAttrs('ram', o.highlight)}>
        <rect x="136" y="250" width="160" height="62" rx="14" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2"/>
        <text x="216" y="276" font-size="13" font-weight="800" fill="${p.text}" text-anchor="middle">RAM (schnell)</text>
        <text x="216" y="296" font-size="11" fill="${p.muted}" text-anchor="middle">laufende Programme</text>
      </g>
      <!-- Storage -->
      <g ${partAttrs('speicher', o.highlight)}>
        <rect x="316" y="250" width="160" height="62" rx="14" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="2"/>
        <text x="396" y="276" font-size="13" font-weight="800" fill="${p.text}" text-anchor="middle">SSD (dauerhaft)</text>
        <text x="396" y="296" font-size="11" fill="${p.muted}" text-anchor="middle">Dateien & Fotos</text>
      </g>
      <text x="300" y="42" font-size="12" font-weight="700" fill="${p.muted}" text-anchor="middle">EVA- & Von-Neumann-Prinzip (Daten- & Befehlsbus)</text>
    `,
  },

  // ==================== 17. INTERNET & PAKET-ROUTING ====================
  {
    id: 'internet',
    title: 'Internet & Paket-Routing',
    summary: 'Datenpakete finden verschiedene Wege durch Router',
    aliases: ['paketvermittlung', 'routing', 'tcpip', 'netzwerk', 'router'],
    tags: ['internet', 'netzwerk', 'paket', 'router', 'tcp', 'ip', 'informatik', 'server', 'daten'],
    domains: ['java', 'general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'sender', label: 'Sender', note: 'Zerlegt Nachrichten oder Videos in kleine nummerierte Datenpakete mit Ziel-IP.' },
      { id: 'router', label: 'Router-Netz', note: 'Jeder Router liest die Zieladresse und schickt jedes Paket über die gerade freieste Leitung.' },
      { id: 'pakete', label: 'Datenpakete', note: 'Pakete 1, 2 und 3 können völlig unterschiedliche Routen nehmen – fällt ein Knoten aus, weichen sie aus.' },
      { id: 'empfaenger', label: 'Empfänger', note: 'Sortiert die eintreffenden Pakete wieder in die richtige Reihenfolge (TCP) und prüft Vollständigkeit.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
      <!-- Routes -->
      <g ${partAttrs('pakete', o.highlight)}>
        <path d="M 124 166 Q 214 68 300 78 Q 390 88 476 166" fill="none" stroke="${p.teal}" stroke-width="3.6"/>
        <path class="ps-flow" d="M 124 166 Q 214 68 300 78 Q 390 88 476 166" fill="none" stroke="${p.onAccent}" stroke-width="2.4" stroke-dasharray="8 16"/>
        <path d="M 124 172 L 476 172" fill="none" stroke="${p.amber}" stroke-width="3.6"/>
        <path class="ps-flow" d="M 124 172 L 476 172" fill="none" stroke="${p.onAccent}" stroke-width="2.4" stroke-dasharray="8 16"/>
        <path d="M 124 178 Q 214 276 300 266 Q 390 256 476 178" fill="none" stroke="${p.berry}" stroke-width="3.6"/>
        <path class="ps-flow" d="M 124 178 Q 214 276 300 266 Q 390 256 476 178" fill="none" stroke="${p.onAccent}" stroke-width="2.4" stroke-dasharray="8 16"/>
        <!-- Packet badges -->
        <g class="ps-float"><rect x="192" y="96" width="32" height="22" rx="6" fill="${p.teal}"/><text x="208" y="111" font-size="11" font-weight="800" fill="${p.onAccent}" text-anchor="middle">#1</text></g>
        <g class="ps-float" style="animation-delay:0.4s"><rect x="342" y="160" width="32" height="22" rx="6" fill="${p.amber}"/><text x="358" y="175" font-size="11" font-weight="800" fill="${p.onAccent}" text-anchor="middle">#2</text></g>
        <g class="ps-float" style="animation-delay:0.8s"><rect x="206" y="226" width="32" height="22" rx="6" fill="${p.berry}"/><text x="222" y="241" font-size="11" font-weight="800" fill="${p.onAccent}" text-anchor="middle">#3</text></g>
      </g>
      <!-- Routers -->
      <g ${partAttrs('router', o.highlight)}>
        ${[[300, 78, 'R1'], [254, 172, 'R2'], [300, 266, 'R3'], [396, 118, 'R4']]
          .map(([x, y, lbl]) => `<circle class="ps-pulse" cx="${x}" cy="${y}" r="22" fill="${p.bg}" stroke="${p.blue}" stroke-width="2.4"/><text x="${x}" y="${y}" font-size="12" font-weight="800" fill="${p.blue}" text-anchor="middle" dominant-baseline="central">${lbl}</text>`)
          .join('')}
      </g>
      <!-- Sender -->
      <g ${partAttrs('sender', o.highlight)}>
        <rect x="18" y="128" width="106" height="88" rx="16" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.2"/>
        <text x="71" y="164" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Sender</text>
        <text x="71" y="184" font-size="11" fill="${p.muted}" text-anchor="middle">zerlegt Daten</text>
      </g>
      <!-- Receiver -->
      <g ${partAttrs('empfaenger', o.highlight)}>
        <rect x="476" y="128" width="106" height="88" rx="16" fill="${p.violetNode}" stroke="${p.violet}" stroke-width="2.2"/>
        <text x="529" y="164" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Empfänger</text>
        <text x="529" y="184" font-size="11" fill="${p.muted}" text-anchor="middle">setzt #1–#3</text>
      </g>
    `,
  },

  // ==================== 18. WIRTSCHAFTSKREISLAUF ====================
  {
    id: 'wirtschaftskreislauf',
    title: 'Wirtschaftskreislauf',
    summary: 'Geld- & Güterströme zwischen Haushalten, Unternehmen & Staat',
    aliases: ['wirtschaft', 'vwl', 'geldstrom', 'gueterstrom', 'konjunktur'],
    tags: ['wirtschaft', 'vwl', 'bwl', 'geld', 'haushalt', 'unternehmen', 'staat', 'steuern', 'konsum', 'lohn'],
    domains: ['general', 'math'],
    width: 600,
    height: 340,
    parts: [
      { id: 'haushalte', label: 'Haushalte', note: 'Stellen Arbeitskraft bereit, erhalten Lohn und geben Geld für Konsumgüter aus.' },
      { id: 'unternehmen', label: 'Unternehmen', note: 'Produzieren Waren und Dienstleistungen, zahlen Löhne und Steuern.' },
      { id: 'staat', label: 'Staat', note: 'Erhebt Steuern und finanziert Infrastruktur, Schulen, Sicherheit und Sozialleistungen.' },
      { id: 'geldstrom', label: 'Geldstrom', note: 'Fließt im Uhrzeigersinn (Löhne, Konsumausgaben, Steuern) entgegengesetzt zum Güterstrom.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.amberSoft}" stroke="${p.amber}" stroke-opacity="0.22"/>
      <!-- Money & Goods loops -->
      <g ${partAttrs('geldstrom', o.highlight)}>
        <!-- Top: Haushalte -> Unternehmen (Konsumausgaben) -->
        <path d="M 164 134 Q 300 72 436 134" fill="none" stroke="${p.amber}" stroke-width="4.5"/>
        <path class="ps-flow" d="M 164 134 Q 300 72 436 134" fill="none" stroke="${p.onAccent}" stroke-width="2.2" stroke-dasharray="8 16"/>
        <!-- Bottom: Unternehmen -> Haushalte (Löhne) -->
        <path d="M 436 208 Q 300 270 164 208" fill="none" stroke="${p.teal}" stroke-width="4.5"/>
        <path class="ps-flow" d="M 436 208 Q 300 270 164 208" fill="none" stroke="${p.onAccent}" stroke-width="2.2" stroke-dasharray="8 16"/>
        ${pill(216, 78, 168, 'Konsumausgaben € →', p.amber, p.bg, p.text)}
        ${pill(224, 244, 152, '← Löhne & Gehälter €', p.teal, p.bg, p.text)}
      </g>
      <!-- State links -->
      <path class="ps-flow" d="M 142 214 L 246 286" fill="none" stroke="${p.violet}" stroke-width="2.4" stroke-dasharray="6 6"/>
      <path class="ps-flow" d="M 458 214 L 354 286" fill="none" stroke="${p.violet}" stroke-width="2.4" stroke-dasharray="6 6"/>
      <!-- Haushalte -->
      <g ${partAttrs('haushalte', o.highlight)}>
        <rect x="24" y="132" width="144" height="82" rx="16" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.2"/>
        <text x="96" y="166" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">Haushalte</text>
        <text x="96" y="186" font-size="11" fill="${p.muted}" text-anchor="middle">Arbeit & Konsum</text>
      </g>
      <!-- Unternehmen -->
      <g ${partAttrs('unternehmen', o.highlight)}>
        <rect x="432" y="132" width="144" height="82" rx="16" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.2"/>
        <text x="504" y="166" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">Unternehmen</text>
        <text x="504" y="186" font-size="11" fill="${p.muted}" text-anchor="middle">Güter & Löhne</text>
      </g>
      <!-- Staat -->
      <g ${partAttrs('staat', o.highlight)}>
        <rect x="224" y="274" width="152" height="48" rx="14" fill="${p.violetNode}" stroke="${p.violet}" stroke-width="2"/>
        <text x="300" y="295" font-size="13" font-weight="800" fill="${p.text}" text-anchor="middle">Staat</text>
        <text x="300" y="311" font-size="10.5" fill="${p.muted}" text-anchor="middle">Steuern ↔ Infrastruktur</text>
      </g>
      <text x="300" y="176" font-size="11.5" font-weight="700" fill="${p.muted}" text-anchor="middle">Güter & Arbeit fließen gegenläufig</text>
    `,
  },

  // ==================== 19. ANGEBOT & NACHFRAGE ====================
  {
    id: 'angebot_nachfrage',
    title: 'Angebot & Nachfrage',
    summary: 'Marktgleichgewicht & Verschiebung des Preises',
    aliases: ['marktgleichgewicht', 'markt', 'preisbildung', 'nachfrage', 'angebot'],
    tags: ['angebot', 'nachfrage', 'markt', 'preis', 'gleichgewicht', 'vwl', 'wirtschaft', 'oekonomie'],
    domains: ['general', 'math'],
    width: 600,
    height: 340,
    parts: [
      { id: 'angebot', label: 'Angebotskurve (A)', note: 'Steigt mit dem Preis: je höher der Preis, desto mehr wollen Unternehmen verkaufen.' },
      { id: 'nachfrage', label: 'Nachfragekurve (N)', note: 'Fällt mit dem Preis: je günstiger ein Gut, desto mehr Menschen kaufen es.' },
      { id: 'gleichgewicht', label: 'Marktgleichgewicht (G)', note: 'Schnittpunkt von Angebot und Nachfrage – hier wird der Markt geräumt (kein Überschuss, kein Mangel).' },
    ],
    states: [
      { id: 'eq', name: 'Gleichgewicht', note: 'Angebot und Nachfrage treffen sich beim Gleichgewichtspreis P*.' },
      { id: 'mehr_n', name: 'Mehr Nachfrage', note: 'Die Nachfragekurve verschiebt sich nach rechts → Preis P* und Menge M* steigen!' },
      { id: 'mehr_a', name: 'Mehr Angebot', note: 'Die Angebotskurve verschiebt sich nach rechts → Preis P* sinkt, Menge M* steigt!' },
    ],
    render: (p, o) => {
      const st = o.state ?? 0;
      const dxN = st === 1 ? 64 : 0;
      const dxA = st === 2 ? 64 : 0;
      // Intersection of A: y = 264 - 0.65*(x - (110 + dxA)) and N: y = 74 + 0.65*(x - (110 + dxN))
      const gx = 256 + (dxN + dxA) / 2;
      const gy = 169 + (dxA - dxN) * 0.325;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.2"/>
        <!-- Axes -->
        <line x1="92" y1="286" x2="92" y2="38" stroke="${p.text}" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="92" y1="286" x2="538" y2="286" stroke="${p.text}" stroke-width="2.4" stroke-linecap="round"/>
        <text x="80" y="48" font-size="13" font-weight="800" fill="${p.text}" text-anchor="end">Preis (P)</text>
        <text x="536" y="310" font-size="13" font-weight="800" fill="${p.text}" text-anchor="end">Menge (M)</text>
        <!-- Old dashed curve when shifted -->
        ${st === 1 ? `<line x1="122" y1="82" x2="390" y2="256" stroke="${p.berry}" stroke-width="2" stroke-dasharray="5 5" opacity="0.4"/>` : ''}
        ${st === 2 ? `<line x1="122" y1="256" x2="390" y2="82" stroke="${p.teal}" stroke-width="2" stroke-dasharray="5 5" opacity="0.4"/>` : ''}
        <!-- Supply curve -->
        <g ${partAttrs('angebot', o.highlight)}>
          <line x1="${122 + dxA}" y1="256" x2="${390 + dxA}" y2="82" stroke="${p.teal}" stroke-width="4" stroke-linecap="round"/>
          ${pill(402 + Math.min(40, dxA), 66, 118, 'Angebot (A)', p.teal, p.bg, p.text)}
        </g>
        <!-- Demand curve -->
        <g ${partAttrs('nachfrage', o.highlight)}>
          <line x1="${122 + dxN}" y1="82" x2="${390 + dxN}" y2="256" stroke="${p.berry}" stroke-width="4" stroke-linecap="round"/>
          ${pill(402 + Math.min(40, dxN), 240, 130, 'Nachfrage (N)', p.berry, p.bg, p.text)}
        </g>
        <!-- Equilibrium -->
        <g ${partAttrs('gleichgewicht', o.highlight)}>
          <line x1="92" y1="${gy.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${p.amber}" stroke-width="2" stroke-dasharray="5 5"/>
          <line x1="${gx.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${gx.toFixed(1)}" y2="286" stroke="${p.amber}" stroke-width="2" stroke-dasharray="5 5"/>
          <circle class="ps-glow" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="15" fill="${p.amber}" opacity="0.32"/>
          <circle class="ps-pulse" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="7.5" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="2"/>
          <text x="82" y="${(gy + 4).toFixed(1)}" font-size="12" font-weight="800" fill="${p.amber}" text-anchor="end">P*</text>
          <text x="${gx.toFixed(1)}" y="305" font-size="12" font-weight="800" fill="${p.amber}" text-anchor="middle">M*</text>
        </g>
      `;
    },
  },

  // ==================== 20. VULKAN ====================
  {
    id: 'vulkan',
    title: 'Aufbau eines Vulkans',
    summary: 'Magmakammer, Schlot, Krater & Lavastrom',
    aliases: ['vulcan', 'vulkanausbruch', 'magma', 'lava', 'vulkanismus'],
    tags: ['vulkan', 'magma', 'lava', 'krater', 'schlot', 'erdkruste', 'geographie', 'geologie', 'plattentektonik'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'magmakammer', label: 'Magmakammer', note: 'Unterirdisches Reservoir aus flüssigem, über 1000 °C heißem Gestein (Magma) unter hohem Druck.' },
      { id: 'schlot', label: 'Schlot', note: 'Der senkrechte Kamin im Vulkan, durch den das Magma nach oben gepresst wird.' },
      { id: 'krater', label: 'Krater & Asche', note: 'Die Öffnung an der Spitze – beim Ausbruch steigen Gase, Dampf und Asche kilometerhoch auf.' },
      { id: 'lava', label: 'Lavastrom', note: 'Sobald Magma an die Erdoberfläche tritt, heißt es Lava und fließt den Hang hinab.' },
    ],
    states: [
      { id: 'ruhig', name: 'Ruhend', note: 'Druck baut sich langsam in der Magmakammer auf – aus dem Krater steigt nur leichter Dampf.' },
      { id: 'ausbruch', name: 'Ausbruch!', note: 'Hoher Gasdruck presst Magma durch den Schlot: Aschewolke und glühende Lava treten aus!' },
    ],
    render: (p, o) => {
      const erupt = (o.state ?? 0) === 1;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
        <!-- Ground layers -->
        <rect x="6" y="256" width="588" height="78" rx="12" fill="${p.amberSoft}"/>
        <line x1="6" y1="256" x2="594" y2="256" stroke="${p.amber}" stroke-width="2" stroke-opacity="0.45"/>
        <!-- Mountain cone -->
        <polygon points="104,256 266,102 334,102 496,256" fill="${p.muted}" fill-opacity="0.28" stroke="${p.text}" stroke-width="2.2" stroke-linejoin="round"/>
        <!-- Ash cloud / steam -->
        <g ${partAttrs('krater', o.highlight)}>
          <g class="ps-drift">
            <circle cx="300" cy="${erupt ? 56 : 74}" r="${erupt ? 34 : 18}" fill="${p.muted}" fill-opacity="${erupt ? 0.5 : 0.25}"/>
            <circle cx="272" cy="${erupt ? 64 : 78}" r="${erupt ? 24 : 13}" fill="${p.muted}" fill-opacity="${erupt ? 0.45 : 0.22}"/>
            <circle cx="330" cy="${erupt ? 62 : 78}" r="${erupt ? 26 : 13}" fill="${p.muted}" fill-opacity="${erupt ? 0.45 : 0.22}"/>
          </g>
          ${erupt ? `<path class="ps-pulse" d="M282 102 Q300 44 318 102" fill="${p.berry}" fill-opacity="0.72"/>` : ''}
          <ellipse cx="300" cy="102" rx="34" ry="8" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="2"/>
          ${pill(408, 42, 146, 'Krater & Asche', p.muted, p.bg, p.text)}
        </g>
        <!-- Lava stream -->
        <g ${partAttrs('lava', o.highlight)}>
          <path d="M326 105 C354 134 388 186 436 254" fill="none" stroke="${p.berry}" stroke-width="${erupt ? 10 : 4}" stroke-linecap="round" opacity="${erupt ? 0.92 : 0.32}"/>
          <path class="${erupt ? 'ps-flow-fast' : 'ps-flow'}" d="M326 105 C354 134 388 186 436 254" fill="none" stroke="${p.amber}" stroke-width="${erupt ? 4 : 2}" stroke-dasharray="10 14" stroke-linecap="round" opacity="${erupt ? 1 : 0.4}"/>
          ${pill(436, 168, 124, 'Lavastrom', p.berry, p.bg, p.text)}
        </g>
        <!-- Chimney (Schlot) -->
        <g ${partAttrs('schlot', o.highlight)}>
          <path d="M286 266 L292 104 L308 104 L314 266 Z" fill="${p.berry}" fill-opacity="0.78"/>
          <path class="${erupt ? 'ps-flow-fast' : 'ps-flow'}" d="M300 264 L300 108" fill="none" stroke="${p.amber}" stroke-width="4" stroke-dasharray="10 14" stroke-linecap="round"/>
          ${pill(32, 152, 118, 'Schlot', p.berry, p.bg, p.text)}
          <line x1="150" y1="163" x2="290" y2="163" stroke="${p.berry}" stroke-width="1.5" stroke-dasharray="4 3"/>
        </g>
        <!-- Magma chamber -->
        <g ${partAttrs('magmakammer', o.highlight)}>
          <ellipse class="ps-pulse" cx="300" cy="292" rx="${erupt ? 96 : 82}" ry="28" fill="${p.berry}" stroke="${p.amber}" stroke-width="2.6"/>
          <text x="300" y="295" font-size="13" font-weight="800" fill="${p.onAccent}" text-anchor="middle">Magmakammer (> 1000 °C)</text>
        </g>
      `;
    },
  },

  // ==================== 21. TREIBHAUSEFFEKT ====================
  {
    id: 'treibhauseffekt',
    title: 'Treibhauseffekt',
    summary: 'Sonnenstrahlung, Atmosphäre & Wärmerückstrahlung',
    aliases: ['klima', 'klimawandel', 'co2effekt', 'atmosphaere', 'greenhouse'],
    tags: ['treibhauseffekt', 'klima', 'klimawandel', 'co2', 'atmosphaere', 'strahlung', 'waerme', 'erwaermung'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'sonne', label: 'Sonnenstrahlung', note: 'Kurzwelliges Sonnenlicht durchdringt die Atmosphäre fast ungehindert und erwärmt die Erdoberfläche.' },
      { id: 'erde', label: 'Erdoberfläche', note: 'Die erwärmte Erde gibt Energie als langwellige Wärmestrahlung (Infrarot) wieder ab.' },
      { id: 'atmosphaere', label: 'Treibhausgase', note: 'CO₂, Methan und Wasserdampf absorbieren einen Teil der Wärmestrahlung und strahlen sie zurück.' },
      { id: 'rueckstrahlung', label: 'Wärmerückstrahlung', note: 'Ohne natürlichen Treibhauseffekt wäre die Erde −18 °C kalt – zu viele Gase heizen sie jedoch stark auf.' },
    ],
    states: [
      { id: 'natuerlich', name: 'Natürlich (+15 °C)', note: 'Gleichgewicht: Genug Wärme entweicht ins All, die Erde bleibt angenehm warm (+15 °C).' },
      { id: 'verstaerkt', name: 'Verstärkt (CO₂ ↑)', note: 'Mehr Treibhausgase halten mehr Wärmestrahlung zurück → die globale Temperatur steigt.' },
    ],
    render: (p, o) => {
      const strong = (o.state ?? 0) === 1;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
        <!-- Earth curve at bottom -->
        <g ${partAttrs('erde', o.highlight)}>
          <path d="M6 276 Q300 226 594 276 L594 334 L6 334 Z" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.4"/>
          <text x="300" y="302" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">Erdoberfläche (${strong ? 'wärmt sich stärker auf ↑' : 'Ø ca. +15 °C'})</text>
        </g>
        <!-- Greenhouse gas layer -->
        <g ${partAttrs('atmosphaere', o.highlight)}>
          <path d="M10 144 Q300 94 590 144 Q590 176 590 182 Q300 132 10 182 Z" fill="${strong ? p.berry : p.violet}" fill-opacity="${strong ? 0.28 : 0.16}" stroke="${strong ? p.berry : p.violet}" stroke-width="${strong ? 2.6 : 1.6}" stroke-dasharray="6 4"/>
          ${[126, 224, 344, 456, ...(strong ? [174, 286, 404, 512] : [])].map((x, idx) => `<circle class="ps-float" style="animation-delay:${(idx * 0.25).toFixed(2)}s" cx="${x}" cy="${148 - Math.sin(((x - 10) / 580) * Math.PI) * 32}" r="${strong ? 7 : 5.5}" fill="${strong ? p.berry : p.violet}" opacity="0.72"/>`).join('')}
          ${pill(396, 86, 178, strong ? 'Dichte CO₂-Schicht' : 'Treibhausgase (CO₂)', strong ? p.berry : p.violet, p.bg, p.text)}
        </g>
        <!-- Sun + incoming rays -->
        <g ${partAttrs('sonne', o.highlight)}>
          <circle class="ps-glow" cx="78" cy="64" r="40" fill="${p.amber}" opacity="0.26"/>
          <circle cx="78" cy="64" r="24" fill="${p.amber}" stroke="${p.onAccent}" stroke-width="2"/>
          <path class="ps-flow-fast" d="M100 84 L214 252" fill="none" stroke="${p.amber}" stroke-width="4" stroke-dasharray="12 12" stroke-linecap="round"/>
          <path class="ps-flow-fast" d="M112 72 L248 248" fill="none" stroke="${p.amber}" stroke-width="3" stroke-dasharray="10 14" stroke-linecap="round"/>
          ${pill(18, 108, 134, 'Sonnenlicht', p.amber, p.bg, p.text)}
        </g>
        <!-- Outgoing & trapped heat radiation -->
        <g ${partAttrs('rueckstrahlung', o.highlight)}>
          <!-- Escaping part -->
          <path class="ps-flow" d="M312 248 L352 40" fill="none" stroke="${p.berry}" stroke-width="${strong ? 2 : 3.4}" stroke-dasharray="5 7" stroke-linecap="round" opacity="${strong ? 0.55 : 0.9}"/>
          <text x="364" y="54" font-size="11.5" font-weight="700" fill="${p.muted}">ins All${strong ? ' (weniger)' : ''}</text>
          <!-- Reflected back down -->
          <path class="ps-flow" d="M294 250 L310 144 L392 254" fill="none" stroke="${p.berry}" stroke-width="${strong ? 4.5 : 3}" stroke-dasharray="12 12" stroke-linecap="round"/>
          ${strong ? `<path class="ps-flow-fast" d="M342 252 L378 148 L458 258" fill="none" stroke="${p.berry}" stroke-width="4" stroke-dasharray="12 12" stroke-linecap="round"/>` : ''}
          ${pill(410, 206, 168, 'Wärmerückstrahlung', p.berry, p.bg, p.text)}
        </g>
      `;
    },
  },

  // ==================== 22. 4-TAKT-MOTOR ====================
  {
    id: 'motor',
    title: '4-Takt-Ottomotor',
    summary: 'Kolben, Ventile & Zündung in 4 Takten',
    aliases: ['ottomotor', 'viertaktmotor', 'verbrennungsmotor', 'kolbenmotor', 'zylinder'],
    tags: ['motor', 'ottomotor', 'viertakt', 'kolben', 'zylinder', 'zuendung', 'technik', 'physik', 'verbrennung'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'ventile', label: 'Ein- & Auslassventil', note: 'Steuern genau im richtigen Moment, wann frisches Gemisch einströmt und Abgas entweicht.' },
      { id: 'zuendkerze', label: 'Zündkerze', note: 'Erzeugt im 3. Takt den Funken, der das verdichtete Luft-Kraftstoff-Gemisch entzündet.' },
      { id: 'kolben', label: 'Kolben & Zylinder', note: 'Der Kolben bewegt sich auf und ab und überträgt den Explosionsdruck mechanisch nach unten.' },
      { id: 'kurbelwelle', label: 'Pleuel & Kurbelwelle', note: 'Wandelt die Auf-und-Ab-Bewegung des Kolbens in eine Drehbewegung für die Räder um.' },
    ],
    states: [
      { id: 't1', name: '1. Ansaugen', note: 'Einlassventil offen, Kolben geht nach unten → frisches Luft-Kraftstoff-Gemisch strömt ein.' },
      { id: 't2', name: '2. Verdichten', note: 'Beide Ventile zu, Kolben fährt nach oben → das Gemisch wird stark zusammengepresst.' },
      { id: 't3', name: '3. Arbeiten', note: 'Zündkerze funkt! Explosion drückt den Kolben kraftvoll nach unten → hier entsteht Antrieb!' },
      { id: 't4', name: '4. Ausstoßen', note: 'Auslassventil offen, Kolben fährt nach oben → Abgase werden herausgedrückt.' },
    ],
    render: (p, o) => {
      const st = o.state ?? 0;
      const pistonY = st === 0 ? 188 : st === 1 ? 118 : st === 2 ? 182 : 122;
      const inOpen = st === 0;
      const outOpen = st === 3;
      const spark = st === 2;
      const gasColor = st === 0 ? p.blue : st === 1 ? p.violet : st === 2 ? p.amber : p.muted;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.22"/>
        <!-- Cylinder walls -->
        <rect x="234" y="70" width="132" height="162" rx="8" fill="${p.bg}" stroke="${p.text}" stroke-width="3.2"/>
        <!-- Chamber gas -->
        <rect x="237" y="73" width="126" height="${Math.max(18, pistonY - 73)}" fill="${gasColor}" fill-opacity="${spark ? 0.45 : 0.25}"/>
        <!-- Valves -->
        <g ${partAttrs('ventile', o.highlight)}>
          <!-- Intake pipe + valve -->
          <path d="M168 78 L254 78 L254 ${inOpen ? 92 : 74}" fill="none" stroke="${p.blue}" stroke-width="7" stroke-linecap="round"/>
          ${inOpen ? `<path class="ps-flow-fast" d="M174 78 L252 78 L252 124" fill="none" stroke="${p.onAccent}" stroke-width="2.5" stroke-dasharray="6 6"/>` : ''}
          <!-- Exhaust pipe + valve -->
          <path d="M432 78 L346 78 L346 ${outOpen ? 92 : 74}" fill="none" stroke="${p.berry}" stroke-width="7" stroke-linecap="round"/>
          ${outOpen ? `<path class="ps-flow-fast" d="M346 118 L346 78 L428 78" fill="none" stroke="${p.onAccent}" stroke-width="2.5" stroke-dasharray="6 6"/>` : ''}
          ${pill(24, 58, 134, 'Einlassventil', p.blue, p.bg, p.text)}
          ${pill(442, 58, 134, 'Auslassventil', p.berry, p.bg, p.text)}
        </g>
        <!-- Spark plug -->
        <g ${partAttrs('zuendkerze', o.highlight)}>
          <rect x="292" y="34" width="16" height="40" rx="4" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="2"/>
          ${spark ? `<polygon class="ps-pulse" points="300,76 286,96 298,94 288,116 314,92 302,94 312,76" fill="${p.amber}" stroke="${p.berry}" stroke-width="1.4"/>` : ''}
          ${pill(24, 118, 124, 'Zündkerze', p.amber, p.bg, p.text)}
          <line x1="148" y1="129" x2="292" y2="58" stroke="${p.amber}" stroke-width="1.4" stroke-dasharray="4 3"/>
        </g>
        <!-- Piston -->
        <g ${partAttrs('kolben', o.highlight)}>
          <rect x="240" y="${pistonY}" width="120" height="42" rx="6" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.4"/>
          <line x1="244" y1="${pistonY + 11}" x2="356" y2="${pistonY + 11}" stroke="${p.teal}" stroke-width="2"/>
          <circle cx="300" cy="${pistonY + 25}" r="6" fill="${p.teal}"/>
          ${pill(434, 152, 136, 'Kolben', p.teal, p.bg, p.text)}
          <line x1="362" y1="${pistonY + 21}" x2="434" y2="163" stroke="${p.teal}" stroke-width="1.4" stroke-dasharray="4 3"/>
        </g>
        <!-- Crankshaft & rod -->
        <g ${partAttrs('kurbelwelle', o.highlight)}>
          <line x1="300" y1="${pistonY + 25}" x2="${300 + (st === 0 ? 22 : st === 1 ? -22 : st === 2 ? 22 : -22)}" y2="278" stroke="${p.text}" stroke-width="7" stroke-linecap="round"/>
          <circle cx="300" cy="284" r="32" fill="${p.violetSoft}" stroke="${p.violet}" stroke-width="2.4"/>
          <circle cx="300" cy="284" r="8" fill="${p.violet}"/>
          ${pill(416, 272, 156, 'Kurbelwelle (Drehung)', p.violet, p.bg, p.text)}
        </g>
        <!-- Step badge -->
        ${pill(24, 272, 168, ['1. Ansaugen ↓', '2. Verdichten ↑', '3. Arbeiten ⚡↓', '4. Ausstoßen ↑'][st], p.teal, p.tealNode, p.text)}
      `;
    },
  },

  // ==================== 23. HEBELGESETZ ====================
  {
    id: 'hebel',
    title: 'Hebelgesetz (Kraft × Kraftarm)',
    summary: 'Drehpunkt, Kraftarm & Lastarm im Gleichgewicht',
    aliases: ['hebelgesetz', 'wippe', 'drehmoment', 'kraftarm', 'lastarm'],
    tags: ['hebel', 'hebelgesetz', 'drehmoment', 'kraft', 'last', 'mechanik', 'physik', 'wippe'],
    domains: ['general', 'math'],
    width: 600,
    height: 340,
    parts: [
      { id: 'drehpunkt', label: 'Drehpunkt', note: 'Feste Achse, um die sich der Hebel dreht – der Abstand bis hier bestimmt den Hebelarm.' },
      { id: 'lastarm', label: 'Last & Lastarm', note: 'Schwere Last auf kurzem Arm: großes Gewicht × kurzer Abstand = gleiches Drehmoment.' },
      { id: 'kraftarm', label: 'Kraft & Kraftarm', note: 'Je länger der Kraftarm, desto weniger Muskelkraft brauchst du („Kraft gespart, Weg verloren“).' },
    ],
    states: [
      { id: 'eq', name: 'Gleichgewicht', note: 'F₁ · l₁ = F₂ · l₂ → 100 N × 2 m = 200 N × 1 m: Der Hebel schwebt im Gleichgewicht!' },
      { id: 'lang', name: 'Langer Kraftarm', note: 'Kraft greift noch weiter außen an → das Drehmoment links überwiegt und hebt die schwere Last!' },
      { id: 'kurz', name: 'Kurzer Kraftarm', note: 'Kraft greift zu nah am Drehpunkt an → die Last rechts ist zu schwer und sinkt nach unten.' },
    ],
    render: (p, o) => {
      const st = o.state ?? 0;
      const pivotX = 356, pivotY = 196;
      const tilt = st === 0 ? 0 : st === 1 ? -9 : 10;
      const forceX = st === 0 ? 156 : st === 1 ? 104 : 236;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.amberSoft}" stroke="${p.amber}" stroke-opacity="0.22"/>
        <!-- Ground -->
        <line x1="46" y1="276" x2="554" y2="276" stroke="${p.muted}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- Fulcrum -->
        <g ${partAttrs('drehpunkt', o.highlight)}>
          <polygon points="${pivotX},${pivotY} ${pivotX - 30},276 ${pivotX + 30},276" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="2.5" stroke-linejoin="round"/>
          ${pill(pivotX - 58, 290, 116, 'Drehpunkt', p.amber, p.bg, p.text)}
        </g>
        <!-- Tilting lever bar -->
        <g class="dg-bal-beam" style="transform-origin:${pivotX}px ${pivotY}px;transform:rotate(${tilt}deg)">
          <rect x="86" y="${pivotY - 7}" width="424" height="14" rx="7" fill="${p.teal}" stroke="${p.onAccent}" stroke-width="1.6"/>
          <!-- Force side (left) -->
          <g ${partAttrs('kraftarm', o.highlight)}>
            <line x1="${forceX}" y1="${pivotY - 78}" x2="${forceX}" y2="${pivotY - 12}" stroke="${p.blue}" stroke-width="5" stroke-linecap="round"/>
            <polygon points="${forceX},${pivotY - 8} ${forceX - 9},${pivotY - 22} ${forceX + 9},${pivotY - 22}" fill="${p.blue}"/>
            <rect x="${forceX - 42}" y="${pivotY - 106}" width="84" height="26" rx="13" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="1.8"/>
            <text x="${forceX}" y="${pivotY - 89}" font-size="12" font-weight="800" fill="${p.text}" text-anchor="middle">Kraft F₁</text>
            <line x1="${forceX}" y1="${pivotY + 22}" x2="${pivotX - 4}" y2="${pivotY + 22}" stroke="${p.blue}" stroke-width="2" stroke-dasharray="4 3"/>
            <text x="${(forceX + pivotX) / 2}" y="${pivotY + 38}" font-size="12" font-weight="700" fill="${p.blue}" text-anchor="middle">Kraftarm l₁</text>
          </g>
          <!-- Load side (right) -->
          <g ${partAttrs('lastarm', o.highlight)}>
            <rect x="424" y="${pivotY - 62}" width="64" height="54" rx="8" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="2.4"/>
            <text x="456" y="${pivotY - 38}" font-size="12.5" font-weight="800" fill="${p.text}" text-anchor="middle">Last F₂</text>
            <text x="456" y="${pivotY - 21}" font-size="11" font-weight="700" fill="${p.berry}" text-anchor="middle">200 N</text>
            <line x1="${pivotX + 4}" y1="${pivotY + 22}" x2="456" y2="${pivotY + 22}" stroke="${p.berry}" stroke-width="2" stroke-dasharray="4 3"/>
            <text x="${(pivotX + 456) / 2}" y="${pivotY + 38}" font-size="12" font-weight="700" fill="${p.berry}" text-anchor="middle">Lastarm l₂</text>
          </g>
          <circle cx="${pivotX}" cy="${pivotY}" r="8" fill="${p.onAccent}" stroke="${p.amber}" stroke-width="3"/>
        </g>
        ${pill(200, 26, 200, 'F₁ · l₁  =  F₂ · l₂', p.teal, p.bg, p.text, 13)}
      `;
    },
  },

  // ==================== 24. AGGREGATZUSTÄNDE ====================
  {
    id: 'aggregatzustaende',
    title: 'Aggregatzustände & Teilchenmodell',
    summary: 'Fest, flüssig, gasförmig – Bewegung der Teilchen',
    aliases: ['teilchenmodell', 'festfluessiggasfoermig', 'phasenuebergang', 'schmelzen', 'verdampfen'],
    tags: ['aggregatzustand', 'aggregatzustaende', 'fest', 'fluessig', 'gasfoermig', 'teilchen', 'chemie', 'physik', 'waerme'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'fest', label: 'Fest (Eis)', note: 'Teilchen sitzen fest im Kristallgitter und schwingen nur an ihrem Platz → feste Form & festes Volumen.' },
      { id: 'fluessig', label: 'Flüssig (Wasser)', note: 'Teilchen gleiten frei aneinander vorbei → festes Volumen, passt sich aber jedem Gefäß an.' },
      { id: 'gas', label: 'Gasförmig (Dampf)', note: 'Teilchen fliegen mit viel Energie schnell durch den Raum → füllt den gesamten Raum aus.' },
      { id: 'energie', label: 'Wärmeenergie', note: 'Je mehr Wärme zugeführt wird, desto schneller bewegen sich die Teilchen (Schmelzen → Verdampfen).' },
    ],
    render: (p, o) => {
      const solidDots: string[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          solidDots.push(`<circle class="ps-pulse" style="animation-delay:${((r + c) * 0.15).toFixed(2)}s" cx="${62 + c * 28}" cy="${126 + r * 28}" r="10" fill="${p.blue}" stroke="${p.onAccent}" stroke-width="1.6"/>`);
        }
      }
      const liqPos = [[242, 178], [272, 184], [302, 176], [332, 182], [254, 152], [286, 156], [318, 150], [268, 128], [300, 126], [330, 134]];
      const gasPos = [[444, 96], [526, 104], [478, 138], [546, 152], [446, 176], [504, 186]];
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.22"/>
        <!-- Solid -->
        <g ${partAttrs('fest', o.highlight)}>
          <rect x="30" y="66" width="150" height="154" rx="14" fill="${p.blueSoft}" stroke="${p.blue}" stroke-width="2.2"/>
          ${solidDots.join('')}
          ${pill(44, 28, 122, 'Fest (kalt)', p.blue, p.bg, p.text)}
          <text x="105" y="210" font-size="11" font-weight="700" fill="${p.muted}" text-anchor="middle">Festes Gitter</text>
        </g>
        <!-- Liquid -->
        <g ${partAttrs('fluessig', o.highlight)}>
          <rect x="224" y="66" width="150" height="154" rx="14" fill="${p.tealSoft}" stroke="${p.teal}" stroke-width="2.2"/>
          ${liqPos.map(([x, y], idx) => `<circle class="ps-drift-x" style="animation-delay:${(idx * 0.22).toFixed(2)}s" cx="${x}" cy="${y}" r="10" fill="${p.teal}" stroke="${p.onAccent}" stroke-width="1.6"/>`).join('')}
          ${pill(238, 28, 122, 'Flüssig', p.teal, p.bg, p.text)}
          <text x="299" y="210" font-size="11" font-weight="700" fill="${p.muted}" text-anchor="middle">Gleitende Teilchen</text>
        </g>
        <!-- Gas -->
        <g ${partAttrs('gas', o.highlight)}>
          <rect x="418" y="66" width="150" height="154" rx="14" fill="${p.berrySoft}" stroke="${p.berry}" stroke-width="2.2"/>
          ${gasPos.map(([x, y], idx) => `<circle class="ps-drift" style="animation-delay:${(idx * 0.3).toFixed(2)}s" cx="${x}" cy="${y}" r="9.5" fill="${p.berry}" stroke="${p.onAccent}" stroke-width="1.6"/>`).join('')}
          ${pill(432, 28, 122, 'Gasförmig', p.berry, p.bg, p.text)}
          <text x="493" y="210" font-size="11" font-weight="700" fill="${p.muted}" text-anchor="middle">Freie schnelle Bewegung</text>
        </g>
        <!-- Transition arrows & energy bar -->
        <g ${partAttrs('energie', o.highlight)}>
          <path class="ps-flow-fast" d="M184 128 L220 128" fill="none" stroke="${p.amber}" stroke-width="3.2" stroke-dasharray="6 6" stroke-linecap="round"/>
          <path class="ps-flow-fast" d="M378 128 L414 128" fill="none" stroke="${p.amber}" stroke-width="3.2" stroke-dasharray="6 6" stroke-linecap="round"/>
          <rect x="40" y="254" width="520" height="24" rx="12" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="1.8"/>
          <path class="ps-flow" d="M62 266 L538 266" fill="none" stroke="${p.amber}" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round"/>
          <text x="300" y="302" font-size="12.5" font-weight="800" fill="${p.text}" text-anchor="middle">Wärmeenergie zuführen → Schmelzen · Verdampfen (rückwärts: Kondensieren · Erstarren)</text>
        </g>
      `;
    },
  },

  // ==================== 25. SÄURE-BASE / PH-SKALA ====================
  {
    id: 'saeure_base',
    title: 'pH-Skala: Säuren & Basen',
    summary: 'pH 0–14, H⁺/OH⁻-Ionen & Neutralisation',
    aliases: ['phskala', 'phwert', 'saeuren', 'basen', 'laugen', 'neutralisation'],
    tags: ['ph', 'saeure', 'base', 'lauge', 'neutral', 'chemie', 'ionen', 'protonen', 'neutralisation'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'sauer', label: 'Sauer (pH 0–6)', note: 'Überschuss an H⁺-Ionen (Oxonium-Ionen) – z. B. Magensäure (pH 1), Zitrone (pH 2), Essig (pH 3).' },
      { id: 'neutral', label: 'Neutral (pH 7)', note: 'Genau gleich viele H⁺- und OH⁻-Ionen – reines Wasser hat pH 7.' },
      { id: 'basisch', label: 'Basisch / Lauge (pH 8–14)', note: 'Überschuss an OH⁻-Ionen – z. B. Seife (pH 9), Backpulver, Rohrreiniger (pH 14).' },
      { id: 'neutralisation', label: 'Neutralisation', note: 'Säure + Base reagieren zu Wasser + Salz: H⁺ + OH⁻ → H₂O.' },
    ],
    render: (p, o) => {
      const cols = [p.berry, p.berry, p.berry, p.amber, p.amber, p.amber, p.amber, p.teal, p.blue, p.blue, p.blue, p.violet, p.violet, p.violet, p.violet];
      const segW = 34;
      const x0 = 45;
      const bars = cols
        .map((c, i) => {
          const pid = i < 7 ? 'sauer' : i === 7 ? 'neutral' : 'basisch';
          return `<g ${partAttrs(pid, o.highlight)}><rect x="${x0 + i * segW}" y="114" width="${segW - 2}" height="52" rx="6" fill="${c}" fill-opacity="${i === 7 ? 0.92 : 0.72}"/><text x="${x0 + i * segW + (segW - 2) / 2}" y="144" font-size="12" font-weight="800" fill="${p.onAccent}" text-anchor="middle">${i}</text></g>`;
        })
        .join('');
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.22"/>
        ${bars}
        <!-- Acid region -->
        <g ${partAttrs('sauer', o.highlight)}>
          ${pill(44, 42, 168, 'Sauer: viele H⁺-Ionen', p.berry, p.bg, p.text)}
          <text x="112" y="196" font-size="11.5" font-weight="700" fill="${p.berry}" text-anchor="middle">🍋 Zitrone (2) · ☕ Kaffee (5)</text>
        </g>
        <!-- Neutral -->
        <g ${partAttrs('neutral', o.highlight)}>
          <circle class="ps-pulse" cx="${x0 + 7 * segW + 16}" cy="92" r="9" fill="${p.teal}" stroke="${p.onAccent}" stroke-width="2"/>
          ${pill(232, 42, 136, 'Neutral (pH 7)', p.teal, p.tealNode, p.text)}
          <text x="300" y="196" font-size="11.5" font-weight="700" fill="${p.teal}" text-anchor="middle">💧 Reines Wasser</text>
        </g>
        <!-- Base region -->
        <g ${partAttrs('basisch', o.highlight)}>
          ${pill(388, 42, 172, 'Basisch: viele OH⁻-Ionen', p.violet, p.bg, p.text)}
          <text x="478" y="196" font-size="11.5" font-weight="700" fill="${p.violet}" text-anchor="middle">🧼 Seife (9) · 🧪 Lauge (13)</text>
        </g>
        <!-- Neutralization box -->
        <g ${partAttrs('neutralisation', o.highlight)}>
          <rect x="76" y="232" width="448" height="72" rx="14" fill="${p.bg}" stroke="${p.teal}" stroke-width="2"/>
          <path class="ps-flow" d="M112 268 L244 268" fill="none" stroke="${p.berry}" stroke-width="3" stroke-dasharray="6 6"/>
          <path class="ps-flow-rev" d="M356 268 L488 268" fill="none" stroke="${p.violet}" stroke-width="3" stroke-dasharray="6 6"/>
          <text x="300" y="260" font-size="13.5" font-weight="800" fill="${p.text}" text-anchor="middle">Neutralisation:  H⁺ + OH⁻  →  H₂O</text>
          <text x="300" y="284" font-size="12" font-weight="600" fill="${p.muted}" text-anchor="middle">Säure + Base gleichen sich gegenseitig zu Wasser &amp; Salz aus</text>
        </g>
      `;
    },
  },

  // ==================== 26. HERZ-QUERSCHNITT ====================
  {
    id: 'herz',
    title: 'Aufbau & Pumpzyklus des Herzens',
    summary: 'Vorhöfe, Kammern, Klappen & Diastole/Systole',
    aliases: ['herzanatomie', 'herzklappen', 'diastole', 'systole', 'herzkammern'],
    tags: ['herz', 'vorhof', 'kammer', 'herzklappen', 'diastole', 'systole', 'blut', 'medizin', 'biologie'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'rechter_teil', label: 'Rechte Herzhälfte (O₂-arm)', note: 'Nimmt sauerstoffarmes Blut aus dem Körper auf und pumpt es zur Lunge.' },
      { id: 'linker_teil', label: 'Linke Herzhälfte (O₂-reich)', note: 'Nimmt sauerstoffreiches Blut aus der Lunge auf und pumpt es mit dickem Muskel in den ganzen Körper.' },
      { id: 'klappen', label: 'Herzklappen (Ventile)', note: 'Segel- und Taschenklappen wirken wie Rückschlagventile – das Blut fließt immer nur in eine Richtung!' },
      { id: 'scheidewand', label: 'Herzscheidewand', note: 'Trennt sauerstoffarmes und sauerstoffreiches Blut streng voneinander.' },
    ],
    states: [
      { id: 'diastole', name: 'Diastole (Füllung)', note: 'Herzmuskel entspannt sich → Segelklappen öffnen, Blut strömt aus den Vorhöfen in die Kammern.' },
      { id: 'systole', name: 'Systole (Auswurf)', note: 'Kammern ziehen sich kräftig zusammen → Segelklappen schließen, Blut schießt in Lunge & Aorta!' },
    ],
    render: (p, o) => {
      const sys = (o.state ?? 0) === 1;
      const sc = sys ? 0.94 : 1.03;
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.berrySoft}" stroke="${p.berry}" stroke-opacity="0.2"/>
        <g transform="translate(300 174) scale(${sc}) translate(-300 -174)">
          <!-- Right heart (drawn on viewer's left, O2-poor blue) -->
          <g ${partAttrs('rechter_teil', o.highlight)}>
            <path d="M296 76 C230 76 196 124 202 184 C208 242 252 282 296 296 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="3"/>
            <path class="${sys ? 'ps-flow-fast' : 'ps-flow'}" d="${sys ? 'M252 222 C248 164 256 106 274 52' : 'M234 52 C240 108 248 164 256 226'}" fill="none" stroke="${p.blue}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
            <text x="246" y="138" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Rechter</text>
            <text x="246" y="152" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Vorhof</text>
            <text x="252" y="232" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Rechte</text>
            <text x="252" y="246" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Kammer</text>
          </g>
          <!-- Left heart (drawn on viewer's right, O2-rich berry) -->
          <g ${partAttrs('linker_teil', o.highlight)}>
            <path d="M304 76 C370 76 404 124 398 184 C392 242 348 282 304 296 Z" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="4"/>
            <path class="${sys ? 'ps-flow-fast' : 'ps-flow'}" d="${sys ? 'M348 222 C352 164 344 106 326 52' : 'M366 52 C360 108 352 164 344 226'}" fill="none" stroke="${p.berry}" stroke-width="4" stroke-dasharray="6 6" stroke-linecap="round"/>
            <text x="354" y="138" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Linker</text>
            <text x="354" y="152" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Vorhof</text>
            <text x="348" y="232" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Linke</text>
            <text x="348" y="246" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Kammer</text>
          </g>
          <!-- Septum -->
          <g ${partAttrs('scheidewand', o.highlight)}>
            <rect x="295" y="76" width="10" height="220" rx="5" fill="${p.text}" fill-opacity="0.72"/>
          </g>
          <!-- Valves -->
          <g ${partAttrs('klappen', o.highlight)}>
            <line x1="216" y1="176" x2="${sys ? 286 : 244}" y2="${sys ? 176 : 194}" stroke="${p.amber}" stroke-width="4.5" stroke-linecap="round"/>
            <line x1="384" y1="176" x2="${sys ? 314 : 356}" y2="${sys ? 176 : 194}" stroke="${p.amber}" stroke-width="4.5" stroke-linecap="round"/>
          </g>
        </g>
        <g ${partAttrs('rechter_teil', o.highlight)}>${pill(18, 64, 152, 'O₂-arm → Lunge', p.blue, p.bg, p.text)}</g>
        <g ${partAttrs('linker_teil', o.highlight)}>${pill(430, 64, 152, 'O₂-reich → Körper', p.berry, p.bg, p.text)}</g>
        <g ${partAttrs('klappen', o.highlight)}>${pill(18, 170, 152, sys ? 'Klappen: ZU' : 'Klappen: OFFEN', p.amber, p.bg, p.text)}</g>
        <g ${partAttrs('scheidewand', o.highlight)}>${pill(430, 260, 152, 'Herzscheidewand', p.text, p.bg, p.text)}</g>
      `;
    },
  },

  // ==================== 27. GEHIRN-AREALE ====================
  {
    id: 'gehirn',
    title: 'Areale des menschlichen Gehirns',
    summary: 'Großhirnlappen, Kleinhirn & Hirnstamm',
    aliases: ['hirn', 'hirnareale', 'grosshirn', 'kleinhirn', 'neurologie', 'brain'],
    tags: ['gehirn', 'hirn', 'grosshirn', 'kleinhirn', 'hirnstamm', 'frontallappen', 'psychologie', 'biologie', 'nervensystem'],
    domains: ['general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'frontal', label: 'Stirnlappen (Frontal)', note: 'Planen, Denken, Entscheidungen, Persönlichkeit und bewusste Bewegungen.' },
      { id: 'parietal', label: 'Scheitellappen', note: 'Verarbeitet Tastsinn, Schmerz, Temperatur und räumliche Orientierung.' },
      { id: 'okzipital', label: 'Hinterhauptslappen', note: 'Unser Sehzentrum – wertet Farben, Formen und Bewegungen der Augen aus.' },
      { id: 'temporal', label: 'Schläfenlappen', note: 'Hören, Sprachverstehen und Speichern neuer Erinnerungen (Hippocampus).' },
      { id: 'kleinhirn', label: 'Kleinhirn', note: 'Koordiniert flüssige Bewegungen, Gleichgewicht und motorisches Lernen (z. B. Fahrradfahren).' },
      { id: 'hirnstamm', label: 'Hirnstamm', note: 'Steuert lebenswichtige Reflexe automatisch: Atmung, Herzschlag und Blutdruck.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.violetSoft}" stroke="${p.violet}" stroke-opacity="0.22"/>
      <!-- Frontal lobe -->
      <g ${partAttrs('frontal', o.highlight)}>
        <path d="M162 178 C154 114 202 68 274 68 L286 174 Z" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.4"/>
        <circle class="ps-pulse" cx="226" cy="122" r="7" fill="${p.blue}"/>
        ${pill(16, 62, 134, 'Stirnlappen', p.blue, p.bg, p.text)}
      </g>
      <!-- Parietal lobe -->
      <g ${partAttrs('parietal', o.highlight)}>
        <path d="M274 68 C338 66 388 92 406 138 L286 174 Z" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.4"/>
        <circle class="ps-pulse" style="animation-delay:0.35s" cx="336" cy="112" r="7" fill="${p.teal}"/>
        ${pill(440, 52, 140, 'Scheitellappen', p.teal, p.bg, p.text)}
      </g>
      <!-- Occipital lobe -->
      <g ${partAttrs('okzipital', o.highlight)}>
        <path d="M406 138 C430 168 424 212 384 226 L342 184 Z" fill="${p.amberNode}" stroke="${p.amber}" stroke-width="2.4"/>
        <circle class="ps-pulse" style="animation-delay:0.7s" cx="390" cy="184" r="6.5" fill="${p.amber}"/>
        ${pill(440, 152, 144, 'Hinterhaupt (Sehen)', p.amber, p.bg, p.text)}
      </g>
      <!-- Temporal lobe -->
      <g ${partAttrs('temporal', o.highlight)}>
        <path d="M168 178 L342 184 L360 226 C296 238 206 230 168 178 Z" fill="${p.violetSoft}" stroke="${p.violet}" stroke-width="2.4"/>
        <circle class="ps-pulse" style="animation-delay:1.0s" cx="268" cy="204" r="6.5" fill="${p.violet}"/>
        ${pill(16, 206, 138, 'Schläfenlappen', p.violet, p.bg, p.text)}
      </g>
      <!-- Cerebellum -->
      <g ${partAttrs('kleinhirn', o.highlight)}>
        <ellipse cx="362" cy="252" rx="44" ry="26" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="2.4"/>
        <path d="M326 248 Q362 238 398 248 M330 258 Q362 248 394 258" fill="none" stroke="${p.berry}" stroke-width="1.5"/>
        ${pill(436, 244, 142, 'Kleinhirn', p.berry, p.bg, p.text)}
      </g>
      <!-- Brainstem -->
      <g ${partAttrs('hirnstamm', o.highlight)}>
        <path d="M292 228 L322 228 L330 304 L298 304 Z" fill="${p.amberSoft}" stroke="${p.amber}" stroke-width="2.2"/>
        ${pill(16, 278, 148, 'Hirnstamm (Reflexe)', p.amber, p.bg, p.text)}
        <line x1="164" y1="289" x2="296" y2="278" stroke="${p.amber}" stroke-width="1.4" stroke-dasharray="4 3"/>
      </g>
    `,
  },

  // ==================== 28. GEWALTENTEILUNG ====================
  {
    id: 'gewaltenteilung',
    title: 'Gewaltenteilung (Checks & Balances)',
    summary: 'Legislative, Exekutive & Judikative im Kontroll-Dreieck',
    aliases: ['staatsgewalten', 'demokratie', 'rechtsstaat', 'checksandbalances', 'dreigewalten'],
    tags: ['gewaltenteilung', 'legislative', 'exekutive', 'judikative', 'politik', 'recht', 'grundgesetz', 'demokratie', 'parlament'],
    domains: ['law', 'general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'legislative', label: 'Legislative (Gesetzgebung)', note: 'Parlament (Bundestag & Bundesrat): beschließt Gesetze, kontrolliert die Regierung und den Haushalt.' },
      { id: 'exekutive', label: 'Exekutive (Ausführung)', note: 'Regierung, Verwaltung & Polizei: setzt Gesetze praktisch um und schlägt neue Gesetze vor.' },
      { id: 'judikative', label: 'Judikative (Rechtsprechung)', note: 'Unabhängige Gerichte (bis zum BVerfG): prüfen, ob Gesetze und Behörden rechtmäßig handeln.' },
      { id: 'kontrolle', label: 'Gegenseitige Kontrolle', note: 'Keine Staatsgewalt darf allein herrschen – jede kontrolliert und begrenzt die anderen beiden.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.blueSoft}" stroke="${p.blue}" stroke-opacity="0.22"/>
      <!-- Control triangle -->
      <g ${partAttrs('kontrolle', o.highlight)}>
        <path class="ps-flow" d="M242 104 L148 228" fill="none" stroke="${p.teal}" stroke-width="3.2" stroke-dasharray="6 6"/>
        <path class="ps-flow" d="M358 104 L452 228" fill="none" stroke="${p.berry}" stroke-width="3.2" stroke-dasharray="6 6"/>
        <path class="ps-flow" d="M214 268 L386 268" fill="none" stroke="${p.amber}" stroke-width="3.2" stroke-dasharray="6 6"/>
        <circle class="ps-pulse" cx="300" cy="196" r="42" fill="${p.bg}" stroke="${p.violet}" stroke-width="2.2"/>
        <text x="300" y="191" font-size="11.5" font-weight="800" fill="${p.violet}" text-anchor="middle">Kontrolle</text>
        <text x="300" y="207" font-size="11" font-weight="700" fill="${p.muted}" text-anchor="middle">&amp; Balance</text>
      </g>
      <!-- Legislative -->
      <g ${partAttrs('legislative', o.highlight)}>
        <rect x="196" y="26" width="208" height="74" rx="14" fill="${p.blueNode}" stroke="${p.blue}" stroke-width="2.6"/>
        <text x="300" y="54" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">Legislative</text>
        <text x="300" y="74" font-size="11.5" font-weight="600" fill="${p.blue}" text-anchor="middle">Parlament · Gesetze beschließen</text>
      </g>
      <!-- Exekutive -->
      <g ${partAttrs('exekutive', o.highlight)}>
        <rect x="30" y="226" width="192" height="80" rx="14" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2.6"/>
        <text x="126" y="256" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">Exekutive</text>
        <text x="126" y="276" font-size="11.5" font-weight="600" fill="${p.teal}" text-anchor="middle">Regierung &amp; Polizei</text>
        <text x="126" y="294" font-size="11" font-weight="600" fill="${p.muted}" text-anchor="middle">Gesetze ausführen</text>
      </g>
      <!-- Judikative -->
      <g ${partAttrs('judikative', o.highlight)}>
        <rect x="378" y="226" width="192" height="80" rx="14" fill="${p.berryNode}" stroke="${p.berry}" stroke-width="2.6"/>
        <text x="474" y="256" font-size="14" font-weight="800" fill="${p.text}" text-anchor="middle">Judikative</text>
        <text x="474" y="276" font-size="11.5" font-weight="600" fill="${p.berry}" text-anchor="middle">Unabhängige Gerichte</text>
        <text x="474" y="294" font-size="11" font-weight="600" fill="${p.muted}" text-anchor="middle">Recht sprechen &amp; prüfen</text>
      </g>
    `,
  },

  // ==================== 29. QUINTENZIRKEL ====================
  {
    id: 'musik_kreis',
    title: 'Der Quintenzirkel',
    summary: 'Dur- & Moll-Tonarten, ♯- und ♭-Vorzeichen',
    aliases: ['quintenzirkel', 'tonarten', 'vorzeichen', 'circleoffifths', 'durmoll'],
    tags: ['quintenzirkel', 'musik', 'tonart', 'dur', 'moll', 'vorzeichen', 'quinte', 'akkord', 'kadenz'],
    domains: ['music', 'general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'kreuz', label: 'Kreuz-Tonarten (♯)', note: 'Im Uhrzeigersinn (+1 Quinte): G, D, A, E, H, F♯ – jeder Schritt fügt ein ♯-Vorzeichen hinzu.' },
      { id: 'be', label: 'Be-Tonarten (♭)', note: 'Gegen den Uhrzeigersinn (+1 Quarte): F, B, E♭, A♭, D♭ – jeder Schritt fügt ein ♭-Vorzeichen hinzu.' },
      { id: 'parallele', label: 'Paralleltonarten (Dur/Moll)', note: 'Innen steht zu jeder Dur-Tonart ihre parallele Moll-Tonart mit genau denselben Vorzeichen (z. B. C-Dur / a-Moll).' },
      { id: 'kadenz', label: 'Nachbarn = Hauptakkorde', note: 'Direkte Nachbarn im Kreis sind Subdominante (links) und Dominante (rechts) – perfekt zum Komponieren!' },
    ],
    render: (p, o) => {
      const cx = 300, cy = 170;
      const major = ['C', 'G', 'D', 'A', 'E', 'H', 'F♯', 'D♭', 'A♭', 'E♭', 'B', 'F'];
      const minor = ['a', 'e', 'h', 'f♯', 'c♯', 'g♯', 'd♯', 'b', 'f', 'c', 'g', 'd'];
      const nodes = major
        .map((m, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 12;
          const ox = cx + 118 * Math.cos(ang), oy = cy + 118 * Math.sin(ang);
          const ix = cx + 74 * Math.cos(ang), iy = cy + 74 * Math.sin(ang);
          const pid = i === 0 || i === 1 || i === 11 ? (i === 0 ? 'kadenz' : i === 1 ? 'kreuz' : 'be') : i <= 6 ? 'kreuz' : 'be';
          const col = i === 0 ? p.teal : i <= 6 ? p.amber : p.blue;
          return `
            <g ${partAttrs(pid, o.highlight)}>
              <circle cx="${ox.toFixed(1)}" cy="${oy.toFixed(1)}" r="19" fill="${i === 0 ? p.teal : p.bg}" stroke="${col}" stroke-width="2.2"/>
              <text x="${ox.toFixed(1)}" y="${(oy + 4.5).toFixed(1)}" font-size="12.5" font-weight="800" fill="${i === 0 ? p.onAccent : p.text}" text-anchor="middle">${m}</text>
            </g>
            <g ${partAttrs('parallele', o.highlight)}>
              <circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="13.5" fill="${p.violetSoft}" stroke="${p.violet}" stroke-width="1.5"/>
              <text x="${ix.toFixed(1)}" y="${(iy + 4).toFixed(1)}" font-size="11" font-weight="700" fill="${p.violet}" text-anchor="middle">${minor[i]}</text>
            </g>
          `;
        })
        .join('');
      return `
        <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.violetSoft}" stroke="${p.violet}" stroke-opacity="0.22"/>
        <circle cx="${cx}" cy="${cy}" r="118" fill="none" stroke="${p.muted}" stroke-width="1.6" stroke-dasharray="4 4"/>
        <circle cx="${cx}" cy="${cy}" r="74" fill="none" stroke="${p.violet}" stroke-opacity="0.35" stroke-width="1.4"/>
        ${nodes}
        <g ${partAttrs('kadenz', o.highlight)}>
          <circle class="ps-pulse" cx="${cx}" cy="${cy}" r="36" fill="${p.tealNode}" stroke="${p.teal}" stroke-width="2"/>
          <text x="${cx}" y="${cy - 3}" font-size="11.5" font-weight="800" fill="${p.text}" text-anchor="middle">Quinten-</text>
          <text x="${cx}" y="${cy + 12}" font-size="11.5" font-weight="800" fill="${p.teal}" text-anchor="middle">zirkel</text>
        </g>
        <g ${partAttrs('be', o.highlight)}>${pill(18, 66, 134, '← ♭-Tonarten', p.blue, p.bg, p.text)}</g>
        <g ${partAttrs('kreuz', o.highlight)}>${pill(448, 66, 134, '♯-Tonarten →', p.amber, p.bg, p.text)}</g>
        <g ${partAttrs('parallele', o.highlight)}>${pill(18, 256, 146, 'Innen: Moll-Parallele', p.violet, p.bg, p.text)}</g>
        <g ${partAttrs('kadenz', o.highlight)}>${pill(436, 256, 146, 'Nachbarn = Kadenz', p.teal, p.bg, p.text)}</g>
      `;
    },
  },

  // ==================== 30. RELATIONAL DATENBANK / SQL ====================
  {
    id: 'datenbank',
    title: 'Relationale Datenbank & SQL-JOIN',
    summary: 'Tabellen, Primär-/Fremdschlüssel & Abfragefluss',
    aliases: ['sql', 'relational', 'tabellen', 'fremdschluessel', 'primaerschluessel', 'join', 'database'],
    tags: ['datenbank', 'sql', 'tabelle', 'join', 'schluessel', 'primary', 'foreign', 'informatik', 'backend', 'programmieren'],
    domains: ['java', 'general'],
    width: 600,
    height: 340,
    parts: [
      { id: 'query', label: 'SQL-Abfrage (SELECT)', note: 'Die App sendet eine strukturierte Anfrage (z. B. SELECT … JOIN) an die Datenbank.' },
      { id: 'tabelle', label: 'Tabellen & Zeilen', note: 'Daten liegen sauber getrennt in Tabellen (Entities) – jede Zeile ist ein Datensatz.' },
      { id: 'schluessel', label: 'Primär- & Fremdschlüssel', note: 'PK (Primärschlüssel) identifiziert eindeutig; FK (Fremdschlüssel) verweist auf die andere Tabelle.' },
      { id: 'join', label: 'JOIN-Verknüpfung', note: 'Verbindet zusammengehörige Zeilen aus beiden Tabellen über PK = FK zu einem Ergebnis.' },
    ],
    render: (p, o) => `
      <rect x="6" y="6" width="588" height="328" rx="18" fill="${p.tealSoft}" stroke="${p.teal}" stroke-opacity="0.22"/>
      <!-- Query bar at top -->
      <g ${partAttrs('query', o.highlight)}>
        <rect x="64" y="24" width="472" height="44" rx="12" fill="${p.bg}" stroke="${p.blue}" stroke-width="2.2"/>
        <text x="300" y="50" font-size="12.5" font-weight="800" fill="${p.blue}" text-anchor="middle">SELECT k.name, b.betrag FROM Kunden k JOIN Bestellungen b ON k.id = b.kunde_id</text>
        <path class="ps-flow-fast" d="M210 68 L172 108" fill="none" stroke="${p.blue}" stroke-width="2.8" stroke-dasharray="6 6"/>
        <path class="ps-flow-fast" d="M390 68 L428 108" fill="none" stroke="${p.blue}" stroke-width="2.8" stroke-dasharray="6 6"/>
      </g>
      <!-- Table 1: Kunden -->
      <g ${partAttrs('tabelle', o.highlight)}>
        <rect x="30" y="110" width="218" height="148" rx="12" fill="${p.bg}" stroke="${p.teal}" stroke-width="2.4"/>
        <rect x="30" y="110" width="218" height="32" rx="12" fill="${p.teal}"/>
        <text x="139" y="130" font-size="13" font-weight="800" fill="${p.onAccent}" text-anchor="middle">Kunden</text>
        <text x="48" y="166" font-size="12" font-weight="800" fill="${p.amber}">🔑 id=1</text>
        <text x="122" y="166" font-size="12" font-weight="700" fill="${p.text}">Lea Meier</text>
        <line x1="40" y1="178" x2="238" y2="178" stroke="${p.muted}" stroke-opacity="0.3"/>
        <text x="48" y="202" font-size="12" font-weight="800" fill="${p.amber}">🔑 id=2</text>
        <text x="122" y="202" font-size="12" font-weight="700" fill="${p.text}">Tim Schulz</text>
        <line x1="40" y1="214" x2="238" y2="214" stroke="${p.muted}" stroke-opacity="0.3"/>
        <text x="48" y="238" font-size="12" font-weight="800" fill="${p.muted}">id=3</text>
        <text x="122" y="238" font-size="12" font-weight="600" fill="${p.muted}">Sara Ali</text>
      </g>
      <!-- Table 2: Bestellungen -->
      <g ${partAttrs('tabelle', o.highlight)}>
        <rect x="352" y="110" width="218" height="148" rx="12" fill="${p.bg}" stroke="${p.violet}" stroke-width="2.4"/>
        <rect x="352" y="110" width="218" height="32" rx="12" fill="${p.violet}"/>
        <text x="461" y="130" font-size="13" font-weight="800" fill="${p.onAccent}" text-anchor="middle">Bestellungen</text>
        <text x="366" y="166" font-size="12" font-weight="800" fill="${p.berry}">🔗 kunde_id=1</text>
        <text x="498" y="166" font-size="12" font-weight="700" fill="${p.text}">49 €</text>
        <line x1="362" y1="178" x2="560" y2="178" stroke="${p.muted}" stroke-opacity="0.3"/>
        <text x="366" y="202" font-size="12" font-weight="800" fill="${p.berry}">🔗 kunde_id=1</text>
        <text x="498" y="202" font-size="12" font-weight="700" fill="${p.text}">19 €</text>
        <line x1="362" y1="214" x2="560" y2="214" stroke="${p.muted}" stroke-opacity="0.3"/>
        <text x="366" y="238" font-size="12" font-weight="800" fill="${p.berry}">🔗 kunde_id=2</text>
        <text x="498" y="238" font-size="12" font-weight="700" fill="${p.text}">85 €</text>
      </g>
      <!-- PK -> FK join curves -->
      <g ${partAttrs('join', o.highlight)}>
        <path class="ps-flow" d="M248 162 C298 162 302 162 352 162" fill="none" stroke="${p.amber}" stroke-width="3.2" stroke-dasharray="7 5"/>
        <path class="ps-flow" d="M248 162 C298 162 302 198 352 198" fill="none" stroke="${p.amber}" stroke-width="2.8" stroke-dasharray="7 5"/>
        <path class="ps-flow" d="M248 198 C298 198 302 234 352 234" fill="none" stroke="${p.berry}" stroke-width="2.8" stroke-dasharray="7 5"/>
        ${pill(256, 276, 88, '1 : n JOIN', p.amber, p.amberNode, p.text)}
      </g>
      <g ${partAttrs('schluessel', o.highlight)}>
        ${pill(30, 276, 188, 'PK: Eindeutige ID', p.amber, p.bg, p.text)}
        ${pill(382, 276, 188, 'FK: Verweis auf PK', p.berry, p.bg, p.text)}
      </g>
    `,
  },
];

export const VISUAL_PRESET_IDS = VISUAL_PRESETS.map((p) => p.id);

const PRESET_BY_ID = new Map(VISUAL_PRESETS.map((p) => [norm(p.id), p]));

/** Finds a visual preset by id, alias, or German keyword match. Pure – tested. */
export function resolveVisualPreset(raw?: string): VisualPreset | null {
  const k = norm(raw);
  if (!k) return null;
  if (PRESET_BY_ID.has(k)) return PRESET_BY_ID.get(k)!;
  for (const pr of VISUAL_PRESETS) {
    if (pr.aliases.some((a) => norm(a) === k)) return pr;
  }
  for (const pr of VISUAL_PRESETS) {
    const pid = norm(pr.id);
    if (k.length >= 4 && (pid.includes(k) || k.includes(pid) || pr.aliases.some((a) => a.length >= 4 && k.includes(norm(a))))) {
      return pr;
    }
  }
  return null;
}

/**
 * Picks the most relevant 8–10 visual presets for a given subject/topic so the AI prompt stays compact
 * while always offering the best animated scenes for the current lesson. Pure – tested.
 */
export function relevantPresetsFor(domain: string, topic = '', limit = 9): VisualPreset[] {
  const words = norm(topic);
  const scored = VISUAL_PRESETS.map((pr, idx) => {
    let score = pr.domains.includes(domain as VisualPreset['domains'][number]) ? 2 : 0;
    if (words) {
      if (words.includes(norm(pr.id))) score += 12;
      for (const a of pr.aliases) if (a.length >= 4 && words.includes(norm(a))) score += 8;
      for (const t of pr.tags) if (t.length >= 4 && words.includes(norm(t))) score += 5;
    }
    return { pr, score, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, limit).map((x) => x.pr);
}

/** Compact prompt snippet listing the best matching full-canvas animated presets for this lesson. */
export function presetPromptHint(domain: string, topic = ''): string {
  const list = relevantPresetsFor(domain, topic, 10)
    .map((p) => `${p.id} (${p.summary})`)
    .join(' · ');
  return `Animierte Themen-Presets ("type":"preset", z. B. {"type":"preset","preset":"sonnensystem","highlight":"erde","notes":{"erde":"…"}}): ${list} (alle ${VISUAL_PRESETS.length} Presets sind immer gültig, u.a. auch ${VISUAL_PRESET_IDS.join(',')}).`;
}
