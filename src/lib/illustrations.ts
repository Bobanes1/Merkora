/**
 * Bold, Studyflix-style two-tone vector illustrations for visual diagrams (forces, scene, callout).
 * All drawings live on a 120×80 coordinate box centered around (60, 40) and use semantic palette tokens
 * so they adapt automatically to Merkora's light and dark themes. Pure (no DOM).
 */
import { ICONS } from './diagramIcons';

export type IllustrationPalette = {
  accent: string;
  node: string;
  stroke: string;
  text: string;
  onAccent: string;
  berry: string;
  amber: string;
  blue: string;
  violet: string;
};

/**
 * Tokens replaced at render time:
 * {{a}} primary accent, {{n}} primary soft fill, {{s}} primary stroke, {{t}} text/dark detail,
 * {{w}} light/white detail, {{b}} berry, {{y}} amber, {{u}} blue, {{v}} violet.
 */
export const ILLUSTRATIONS: Record<string, string> = {
  flugzeug: `
    <ellipse cx="60" cy="44" rx="48" ry="15" fill="{{a}}" opacity="0.1"/>
    <path d="M22 38 L10 18 L22 18 L34 36 Z" fill="{{s}}"/>
    <path d="M16 42 C16 35 26 33 44 33 L92 33 C104 33 113 37 116 42 C113 46 102 48 90 48 L36 48 C24 48 16 46 16 42 Z" fill="{{a}}"/>
    <path d="M94 35 L105 37 C107 38 106 40 103 40 L94 40 Z" fill="{{t}}" opacity="0.65"/>
    <g fill="{{w}}" opacity="0.9">
      <rect x="42" y="37" width="5" height="3.5" rx="1.2"/>
      <rect x="51" y="37" width="5" height="3.5" rx="1.2"/>
      <rect x="60" y="37" width="5" height="3.5" rx="1.2"/>
      <rect x="69" y="37" width="5" height="3.5" rx="1.2"/>
      <rect x="78" y="37" width="5" height="3.5" rx="1.2"/>
    </g>
    <path d="M52 43 L79 43 L66 56 L47 56 Z" fill="{{s}}"/>
    <rect x="60" y="49" width="16" height="7" rx="3.5" fill="{{t}}" opacity="0.75"/>
    <circle cx="75" cy="52.5" r="1.8" fill="{{y}}"/>
    <circle cx="60" cy="41" r="3" fill="{{w}}" stroke="{{t}}" stroke-width="1.3"/>
  `,
  tragflaeche: `
    <path d="M12 28 Q56 10 108 26" fill="none" stroke="{{u}}" stroke-width="2" stroke-dasharray="5 4" opacity="0.8"/>
    <path d="M12 58 Q58 55 108 56" fill="none" stroke="{{u}}" stroke-width="2" stroke-dasharray="5 4" opacity="0.55"/>
    <path d="M20 44 C20 30 46 24 72 30 C88 34 100 40 108 45 C92 47 64 49 40 49 C26 49 20 47 20 44 Z" fill="{{a}}" stroke="{{s}}" stroke-width="2"/>
    <circle cx="32" cy="41" r="2.5" fill="{{w}}" opacity="0.8"/>
  `,
  auto: `
    <ellipse cx="60" cy="60" rx="46" ry="5" fill="{{t}}" opacity="0.12"/>
    <path d="M22 46 L31 28 C34 23 39 21 47 21 L72 21 C79 21 84 24 89 31 L98 37 C106 38 110 42 110 47 L110 54 C110 56 108 58 105 58 L18 58 C15 58 13 56 13 53 L13 48 C13 46 17 46 22 46 Z" fill="{{a}}"/>
    <path d="M36 27 L58 27 L58 38 L29 38 Z" fill="{{w}}" opacity="0.85"/>
    <path d="M62 27 L76 27 C80 27 83 30 87 38 L62 38 Z" fill="{{w}}" opacity="0.85"/>
    <rect x="103" y="42" width="6" height="5" rx="2" fill="{{y}}"/>
    <circle cx="34" cy="58" r="9.5" fill="{{t}}"/>
    <circle cx="34" cy="58" r="4.5" fill="{{w}}" opacity="0.85"/>
    <circle cx="88" cy="58" r="9.5" fill="{{t}}"/>
    <circle cx="88" cy="58" r="4.5" fill="{{w}}" opacity="0.85"/>
  `,
  schiff: `
    <path d="M12 62 Q24 57 36 62 T60 62 T84 62 T108 62" fill="none" stroke="{{u}}" stroke-width="3" stroke-linecap="round"/>
    <path d="M18 44 L104 44 L94 60 L28 60 Z" fill="{{a}}"/>
    <rect x="34" y="28" width="40" height="16" rx="3" fill="{{n}}" stroke="{{s}}" stroke-width="2"/>
    <rect x="44" y="16" width="12" height="12" rx="2" fill="{{b}}"/>
    <g fill="{{s}}">
      <circle cx="44" cy="36" r="2.5"/>
      <circle cx="54" cy="36" r="2.5"/>
      <circle cx="64" cy="36" r="2.5"/>
    </g>
  `,
  rakete: `
    <path d="M52 62 L60 76 L68 62 Z" fill="{{y}}"/>
    <path d="M55 62 L60 71 L65 62 Z" fill="{{b}}"/>
    <path d="M44 50 L32 62 L46 60 Z" fill="{{b}}"/>
    <path d="M76 50 L88 62 L74 60 Z" fill="{{b}}"/>
    <path d="M60 8 C72 18 76 34 76 58 L44 58 C44 34 48 18 60 8 Z" fill="{{a}}"/>
    <path d="M50 22 C54 14 58 10 60 8 C62 10 66 14 70 22 Z" fill="{{b}}"/>
    <circle cx="60" cy="35" r="7.5" fill="{{w}}" stroke="{{s}}" stroke-width="2.5"/>
    <circle cx="60" cy="35" r="4" fill="{{u}}" opacity="0.7"/>
  `,
  koerper: `
    <ellipse cx="60" cy="64" rx="28" ry="5" fill="{{t}}" opacity="0.12"/>
    <rect x="34" y="18" width="52" height="44" rx="10" fill="{{a}}" stroke="{{s}}" stroke-width="2"/>
    <rect x="41" y="24" width="16" height="8" rx="4" fill="{{w}}" opacity="0.28"/>
    <circle cx="60" cy="40" r="3.5" fill="{{w}}" stroke="{{t}}" stroke-width="1.3"/>
  `,
  ball: `
    <ellipse cx="60" cy="67" rx="22" ry="4.5" fill="{{t}}" opacity="0.12"/>
    <circle cx="60" cy="40" r="25" fill="{{a}}" stroke="{{s}}" stroke-width="2"/>
    <circle cx="51" cy="31" r="7" fill="{{w}}" opacity="0.28"/>
    <circle cx="60" cy="40" r="3" fill="{{w}}" stroke="{{t}}" stroke-width="1.3"/>
  `,
  erde: `
    <circle cx="60" cy="40" r="29" fill="{{u}}" opacity="0.88"/>
    <path d="M44 21 C52 20 58 26 55 34 C53 40 44 41 42 48 C40 53 45 60 41 63 C33 56 31 44 33 34 C35 27 39 22 44 21 Z" fill="{{a}}"/>
    <path d="M68 18 C78 21 86 30 85 41 C84 50 76 58 68 60 C65 53 69 47 66 41 C63 36 62 24 68 18 Z" fill="{{a}}"/>
    <circle cx="60" cy="40" r="29" fill="none" stroke="{{s}}" stroke-width="2"/>
  `,
  sonne: `
    <g stroke="{{y}}" stroke-width="3.2" stroke-linecap="round">
      <line x1="60" y1="7" x2="60" y2="15"/>
      <line x1="60" y1="65" x2="60" y2="73"/>
      <line x1="27" y1="40" x2="35" y2="40"/>
      <line x1="85" y1="40" x2="93" y2="40"/>
      <line x1="36" y1="16" x2="42" y2="22"/>
      <line x1="78" y1="58" x2="84" y2="64"/>
      <line x1="84" y1="16" x2="78" y2="22"/>
      <line x1="42" y1="58" x2="36" y2="64"/>
    </g>
    <circle cx="60" cy="40" r="19" fill="{{y}}"/>
    <circle cx="54" cy="34" r="5" fill="{{w}}" opacity="0.35"/>
  `,
  mond: `
    <circle cx="60" cy="40" r="26" fill="{{n}}" stroke="{{s}}" stroke-width="2"/>
    <circle cx="50" cy="32" r="5.5" fill="{{s}}" opacity="0.25"/>
    <circle cx="71" cy="46" r="7" fill="{{s}}" opacity="0.22"/>
    <circle cx="57" cy="52" r="3.5" fill="{{s}}" opacity="0.25"/>
    <circle cx="69" cy="27" r="3" fill="{{s}}" opacity="0.2"/>
  `,
  zelle: `
    <path d="M26 42 C24 22 44 12 66 14 C88 16 98 30 95 46 C92 62 72 68 50 66 C32 64 27 56 26 42 Z" fill="{{n}}" stroke="{{a}}" stroke-width="3"/>
    <ellipse cx="56" cy="39" rx="14" ry="11" fill="{{b}}" opacity="0.85"/>
    <circle cx="59" cy="38" r="4.5" fill="{{w}}" opacity="0.45"/>
    <ellipse cx="79" cy="33" rx="6" ry="3.5" transform="rotate(-25 79 33)" fill="{{y}}"/>
    <ellipse cx="38" cy="51" rx="6" ry="3.5" transform="rotate(20 38 51)" fill="{{y}}"/>
    <circle cx="76" cy="52" r="3.5" fill="{{u}}" opacity="0.8"/>
    <circle cx="40" cy="28" r="3" fill="{{u}}" opacity="0.8"/>
  `,
  herz: `
    <path d="M60 68 C56 64 26 46 26 28 C26 17 35 11 45 11 C52 11 57 15 60 20 C63 15 68 11 75 11 C85 11 94 17 94 28 C94 46 64 64 60 68 Z" fill="{{b}}"/>
    <path d="M37 24 C39 19 44 17 48 18" fill="none" stroke="{{w}}" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
    <path d="M38 41 L49 41 L54 31 L61 49 L67 37 L72 41 L82 41" fill="none" stroke="{{w}}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  `,
  gehirn: `
    <path d="M58 63 C42 65 28 56 28 42 C28 34 32 28 38 25 C38 17 47 13 58 16 Z" fill="{{b}}" opacity="0.85"/>
    <path d="M62 63 C78 65 92 56 92 42 C92 34 88 28 82 25 C82 17 73 13 62 16 Z" fill="{{v}}" opacity="0.85"/>
    <path d="M40 33 C45 31 48 36 45 41 M42 49 C47 47 51 50 50 55 M78 33 C73 31 70 36 73 41 M76 49 C71 47 67 50 68 55" fill="none" stroke="{{w}}" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
  `,
  pflanze: `
    <path d="M48 64 C48 56 54 55 60 55 C66 55 72 56 72 64 Z" fill="{{y}}" opacity="0.85"/>
    <line x1="60" y1="56" x2="60" y2="24" stroke="{{s}}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M60 44 C44 44 36 34 36 24 C48 24 58 30 60 44 Z" fill="{{a}}"/>
    <path d="M60 36 C76 36 84 26 84 16 C72 16 62 22 60 36 Z" fill="{{s}}"/>
    <circle cx="60" cy="18" r="5" fill="{{y}}"/>
  `,
  atom: `
    <ellipse cx="60" cy="40" rx="36" ry="13" fill="none" stroke="{{a}}" stroke-width="2.2"/>
    <ellipse cx="60" cy="40" rx="36" ry="13" transform="rotate(60 60 40)" fill="none" stroke="{{u}}" stroke-width="2.2"/>
    <ellipse cx="60" cy="40" rx="36" ry="13" transform="rotate(-60 60 40)" fill="none" stroke="{{v}}" stroke-width="2.2"/>
    <circle cx="60" cy="40" r="8" fill="{{b}}"/>
    <circle cx="96" cy="40" r="3.5" fill="{{y}}"/>
    <circle cx="42" cy="14" r="3.5" fill="{{y}}"/>
    <circle cx="42" cy="66" r="3.5" fill="{{y}}"/>
  `,
  batterie: `
    <rect x="24" y="22" width="66" height="36" rx="7" fill="{{n}}" stroke="{{s}}" stroke-width="2.5"/>
    <rect x="90" y="32" width="7" height="16" rx="2.5" fill="{{s}}"/>
    <rect x="30" y="28" width="44" height="24" rx="4" fill="{{a}}"/>
    <path d="M56 30 L49 41 L56 41 L53 50 L64 38 L56 38 Z" fill="{{y}}"/>
  `,
  magnet: `
    <path d="M36 16 L36 44 C36 58 46 66 60 66 C74 66 84 58 84 44 L84 16 L70 16 L70 43 C70 50 66 53 60 53 C54 53 50 50 50 43 L50 16 Z" fill="{{b}}"/>
    <rect x="36" y="16" width="14" height="14" fill="{{u}}"/>
    <rect x="70" y="16" width="14" height="14" fill="{{a}}"/>
    <text x="43" y="26" font-size="9" font-weight="800" fill="{{w}}" text-anchor="middle">S</text>
    <text x="77" y="26" font-size="9" font-weight="800" fill="{{w}}" text-anchor="middle">N</text>
  `,
  waage: `
    <rect x="38" y="64" width="44" height="6" rx="3" fill="{{s}}"/>
    <rect x="57" y="18" width="6" height="46" rx="3" fill="{{s}}"/>
    <line x1="26" y1="26" x2="94" y2="26" stroke="{{a}}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="60" cy="26" r="4.5" fill="{{y}}"/>
    <path d="M28 26 L20 46 L36 46 Z" fill="none" stroke="{{s}}" stroke-width="1.8"/>
    <path d="M18 46 Q28 56 38 46 Z" fill="{{a}}"/>
    <path d="M92 26 L84 46 L100 46 Z" fill="none" stroke="{{s}}" stroke-width="1.8"/>
    <path d="M82 46 Q92 56 102 46 Z" fill="{{a}}"/>
  `,
  person: `
    <circle cx="60" cy="26" r="14" fill="{{a}}"/>
    <path d="M32 68 C32 50 44 43 60 43 C76 43 88 50 88 68 Z" fill="{{a}}"/>
    <circle cx="60" cy="26" r="11" fill="{{n}}" opacity="0.25"/>
  `,
  gruppe: `
    <circle cx="36" cy="30" r="10" fill="{{u}}"/>
    <path d="M18 64 C18 51 25 45 36 45 C47 45 54 51 54 64 Z" fill="{{u}}"/>
    <circle cx="84" cy="30" r="10" fill="{{v}}"/>
    <path d="M66 64 C66 51 73 45 84 45 C95 45 102 51 102 64 Z" fill="{{v}}"/>
    <circle cx="60" cy="25" r="12" fill="{{a}}"/>
    <path d="M38 68 C38 52 47 44 60 44 C73 44 82 52 82 68 Z" fill="{{a}}"/>
  `,
  haus: `
    <path d="M22 40 L60 12 L98 40 Z" fill="{{b}}"/>
    <rect x="30" y="38" width="60" height="32" rx="3" fill="{{n}}" stroke="{{s}}" stroke-width="2"/>
    <rect x="52" y="48" width="16" height="22" rx="2" fill="{{a}}"/>
    <rect x="37" y="46" width="10" height="10" rx="1.5" fill="{{y}}"/>
    <rect x="73" y="46" width="10" height="10" rx="1.5" fill="{{y}}"/>
  `,
  fabrik: `
    <rect x="24" y="38" width="72" height="32" rx="3" fill="{{a}}"/>
    <path d="M24 38 L44 26 L44 38 L64 26 L64 38 L84 26 L84 38" fill="{{s}}"/>
    <rect x="82" y="14" width="10" height="24" rx="2" fill="{{b}}"/>
    <circle cx="87" cy="9" r="3.5" fill="{{t}}" opacity="0.25"/>
    <g fill="{{w}}" opacity="0.85">
      <rect x="33" y="47" width="10" height="10" rx="1.5"/>
      <rect x="49" y="47" width="10" height="10" rx="1.5"/>
      <rect x="65" y="47" width="10" height="10" rx="1.5"/>
    </g>
  `,
  geld: `
    <ellipse cx="60" cy="58" rx="26" ry="8" fill="{{y}}"/>
    <rect x="34" y="46" width="52" height="12" fill="{{y}}"/>
    <ellipse cx="60" cy="46" rx="26" ry="8" fill="{{n}}" stroke="{{y}}" stroke-width="2"/>
    <rect x="34" y="34" width="52" height="12" fill="{{y}}" opacity="0.9"/>
    <ellipse cx="60" cy="34" rx="26" ry="8" fill="{{n}}" stroke="{{y}}" stroke-width="2"/>
    <circle cx="60" cy="24" r="13" fill="{{a}}"/>
    <text x="60" y="29" font-size="14" font-weight="800" fill="{{w}}" text-anchor="middle">€</text>
  `,
  computer: `
    <rect x="24" y="14" width="72" height="44" rx="6" fill="{{a}}"/>
    <rect x="30" y="20" width="60" height="32" rx="3" fill="{{n}}"/>
    <path d="M40 30 L56 30 M40 37 L74 37 M40 44 L64 44" stroke="{{s}}" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="52" y="58" width="16" height="8" fill="{{s}}"/>
    <rect x="40" y="65" width="40" height="5" rx="2.5" fill="{{s}}"/>
  `,
  buch: `
    <path d="M60 22 C46 16 30 16 20 22 L20 60 C30 54 46 54 60 60 Z" fill="{{n}}" stroke="{{s}}" stroke-width="2"/>
    <path d="M60 22 C74 16 90 16 100 22 L100 60 C90 54 74 54 60 60 Z" fill="{{a}}" stroke="{{s}}" stroke-width="2"/>
    <path d="M30 31 L50 31 M30 39 L50 39 M30 47 L46 47" stroke="{{s}}" stroke-width="2" stroke-linecap="round"/>
    <path d="M70 31 L90 31 M70 39 L90 39 M70 47 L86 47" stroke="{{w}}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
  `,
  wolke: `
    <path d="M34 58 C23 58 17 51 17 42 C17 34 23 28 31 28 C34 18 44 12 56 12 C70 12 80 21 82 32 C93 32 102 39 102 48 C102 55 96 58 88 58 Z" fill="{{n}}" stroke="{{u}}" stroke-width="2.8"/>
    <path d="M44 63 L40 72 M60 63 L56 72 M76 63 L72 72" stroke="{{u}}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
  `,
  berg: `
    <path d="M16 66 L48 16 L80 66 Z" fill="{{a}}"/>
    <path d="M52 66 L78 24 L104 66 Z" fill="{{s}}"/>
    <path d="M48 16 L38 32 L45 29 L48 34 L53 29 L58 32 Z" fill="{{w}}" opacity="0.92"/>
    <path d="M78 24 L70 37 L76 34 L79 38 L86 37 Z" fill="{{w}}" opacity="0.88"/>
  `,
};

export const ILLUSTRATION_NAMES = Object.keys(ILLUSTRATIONS);

/** Aliases so German/English topic nouns map naturally to a crisp Studyflix illustration. */
const ALIASES: Record<string, string> = {
  plane: 'flugzeug', aircraft: 'flugzeug', jet: 'flugzeug', flieger: 'flugzeug', reise: 'flugzeug',
  wing: 'tragflaeche', fluegel: 'tragflaeche', airfoil: 'tragflaeche',
  car: 'auto', fahrzeug: 'auto', pkw: 'auto', lkw: 'auto', transport: 'auto',
  ship: 'schiff', boot: 'schiff', boat: 'schiff', segelboot: 'schiff',
  rocket: 'rakete', innovation: 'rakete',
  block: 'koerper', kiste: 'koerper', box: 'koerper', masse: 'koerper', objekt: 'koerper', wuerfel: 'koerper',
  kugel: 'ball', sphere: 'ball', planet: 'erde', welt: 'erde', internet: 'erde', globus: 'erde',
  sun: 'sonne', stern: 'sonne',
  moon: 'mond',
  cell: 'zelle', biologie: 'zelle', bakterie: 'zelle',
  heart: 'herz', kreislauf: 'herz', gesundheit: 'herz',
  brain: 'gehirn', kopf: 'gehirn', denken: 'gehirn',
  baum: 'pflanze', tree: 'pflanze', natur: 'pflanze', blatt: 'pflanze', wachstum: 'pflanze',
  wissenschaft: 'atom', physik: 'atom', chemie: 'atom', molekel: 'atom',
  strom: 'batterie', blitz: 'batterie', energie: 'batterie', akku: 'batterie',
  gesetz: 'waage', recht: 'waage', gleichgewicht: 'waage', gericht: 'waage',
  mensch: 'person', kaeufer: 'person', verkaeufer: 'person', sender: 'person', empfaenger: 'person', nutzer: 'person', kunde: 'person',
  team: 'gruppe', gesellschaft: 'gruppe', markt: 'gruppe',
  gebaeude: 'haus', home: 'haus', wohnung: 'haus',
  firma: 'fabrik', unternehmen: 'fabrik', bank: 'fabrik', industrie: 'fabrik',
  euro: 'geld', preis: 'geld', kapital: 'geld', finanz: 'geld',
  laptop: 'computer', server: 'computer', pc: 'computer', technik: 'computer',
  wissen: 'buch', lernen: 'buch', vertrag: 'buch', dokument: 'buch',
  wetter: 'wolke', regen: 'wolke', klima: 'wolke',
  mountain: 'berg', naturlandschaft: 'berg',
};

const norm = (v?: string) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');

/** Picks the best illustration key for an icon name or subject label (substring match included). */
export function resolveIllustration(icon?: string, subject?: string): { kind: 'art' | 'icon'; key: string } | null {
  for (const raw of [icon, subject]) {
    const k = norm(raw);
    if (!k) continue;
    if (ILLUSTRATIONS[k]) return { kind: 'art', key: k };
    if (ALIASES[k]) return { kind: 'art', key: ALIASES[k] };
    if (ICONS[k]) return { kind: 'icon', key: k };
    // Substring match for phrases like "Kräfte am Flugzeug" or "Pflanzenzelle"
    for (const name of ILLUSTRATION_NAMES) if (k.includes(name)) return { kind: 'art', key: name };
    for (const [alias, target] of Object.entries(ALIASES)) if (alias.length >= 4 && k.includes(alias)) return { kind: 'art', key: target };
  }
  return null;
}

/** Renders a Studyflix illustration (or bold icon medallion fallback) scaled to fit (x, y, w, h). */
export function renderIllustration(
  icon: string | undefined,
  subject: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  pal: IllustrationPalette,
): string {
  const match = resolveIllustration(icon, subject);
  if (match?.kind === 'art') {
    const body = ILLUSTRATIONS[match.key]
      .replace(/\{\{a\}\}/g, pal.accent)
      .replace(/\{\{n\}\}/g, pal.node)
      .replace(/\{\{s\}\}/g, pal.stroke)
      .replace(/\{\{t\}\}/g, pal.text)
      .replace(/\{\{w\}\}/g, pal.onAccent)
      .replace(/\{\{b\}\}/g, pal.berry)
      .replace(/\{\{y\}\}/g, pal.amber)
      .replace(/\{\{u\}\}/g, pal.blue)
      .replace(/\{\{v\}\}/g, pal.violet);
    const scale = Math.min(w / 120, h / 80);
    const dx = x + (w - 120 * scale) / 2;
    const dy = y + (h - 80 * scale) / 2;
    return `<g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)}) scale(${scale.toFixed(3)})">${body}</g>`;
  }
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.44;
  if (match?.kind === 'icon') {
    const s = (r * 1.15) / 12;
    return (
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${pal.node}" stroke="${pal.stroke}" stroke-width="2.2"/>` +
      `<g transform="translate(${(cx - 12 * s).toFixed(1)} ${(cy - 12 * s).toFixed(1)}) scale(${s.toFixed(3)})" fill="none" stroke="${pal.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[match.key]}</g>`
    );
  }
  // Clean geometric Studyflix object badge if no motif matches
  return `<rect x="${(cx - r * 1.25).toFixed(1)}" y="${(cy - r * 0.72).toFixed(1)}" width="${(r * 2.5).toFixed(1)}" height="${(r * 1.44).toFixed(1)}" rx="14" fill="${pal.accent}"/>`;
}
