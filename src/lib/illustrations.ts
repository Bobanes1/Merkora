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
  // ---------- IT, Netzwerke & Informatik ----------
  paket: `
    <ellipse cx="60" cy="67" rx="30" ry="5" fill="{{t}}" opacity="0.12"/>
    <path d="M26 28 L60 13 L94 28 L60 43 Z" fill="{{y}}"/>
    <path d="M26 28 L60 43 L60 66 L26 51 Z" fill="{{a}}"/>
    <path d="M94 28 L60 43 L60 66 L94 51 Z" fill="{{s}}"/>
    <path d="M43 20.5 L77 35.5" stroke="{{w}}" stroke-width="3.2" stroke-linecap="round" opacity="0.85"/>
    <rect x="33" y="42" width="14" height="9" rx="2" fill="{{w}}" opacity="0.85"/>
  `,
  brief: `
    <ellipse cx="60" cy="64" rx="36" ry="5" fill="{{t}}" opacity="0.12"/>
    <rect x="20" y="20" width="80" height="44" rx="7" fill="{{n}}" stroke="{{s}}" stroke-width="2.5"/>
    <path d="M22 23 L60 46 L98 23" fill="none" stroke="{{a}}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="88" cy="24" r="9" fill="{{b}}"/>
    <path d="M84 24 L87 27 L93 21" fill="none" stroke="{{w}}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  kabel: `
    <path d="M12 40 L108 40" stroke="{{a}}" stroke-width="7" stroke-linecap="round"/>
    <path d="M12 40 L108 40" stroke="{{w}}" stroke-width="2" stroke-dasharray="6 6" opacity="0.75"/>
    <rect x="10" y="30" width="16" height="20" rx="4" fill="{{s}}"/>
    <rect x="94" y="30" width="16" height="20" rx="4" fill="{{s}}"/>
    <circle cx="42" cy="40" r="6" fill="{{y}}"/>
    <circle cx="78" cy="40" r="6" fill="{{y}}"/>
  `,
  router: `
    <line x1="36" y1="36" x2="30" y2="14" stroke="{{s}}" stroke-width="3.2" stroke-linecap="round"/>
    <line x1="84" y1="36" x2="90" y2="14" stroke="{{s}}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M22 18 Q30 9 38 18 M82 18 Q90 9 98 18" fill="none" stroke="{{u}}" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="18" y="36" width="84" height="26" rx="7" fill="{{a}}"/>
    <circle cx="33" cy="49" r="3.5" fill="{{y}}"/>
    <circle cx="45" cy="49" r="3.5" fill="{{w}}" opacity="0.9"/>
    <circle cx="57" cy="49" r="3.5" fill="{{w}}" opacity="0.9"/>
    <rect x="74" y="45" width="18" height="8" rx="3" fill="{{n}}" opacity="0.9"/>
  `,
  server: `
    <rect x="28" y="12" width="64" height="17" rx="4" fill="{{a}}"/>
    <rect x="28" y="32" width="64" height="17" rx="4" fill="{{s}}"/>
    <rect x="28" y="52" width="64" height="17" rx="4" fill="{{a}}"/>
    <g fill="{{y}}">
      <circle cx="38" cy="20.5" r="2.8"/><circle cx="38" cy="40.5" r="2.8"/><circle cx="38" cy="60.5" r="2.8"/>
    </g>
    <g stroke="{{w}}" stroke-width="2.4" stroke-linecap="round" opacity="0.85">
      <line x1="48" y1="20.5" x2="82" y2="20.5"/><line x1="48" y1="40.5" x2="82" y2="40.5"/><line x1="48" y1="60.5" x2="82" y2="60.5"/>
    </g>
  `,
  netzwerk: `
    <g stroke="{{s}}" stroke-width="2.4" opacity="0.8">
      <line x1="60" y1="40" x2="26" y2="20"/><line x1="60" y1="40" x2="94" y2="20"/>
      <line x1="60" y1="40" x2="26" y2="60"/><line x1="60" y1="40" x2="94" y2="60"/>
      <line x1="26" y1="20" x2="94" y2="20" stroke-dasharray="4 3"/>
      <line x1="26" y1="60" x2="94" y2="60" stroke-dasharray="4 3"/>
    </g>
    <circle cx="26" cy="20" r="9" fill="{{u}}"/><circle cx="94" cy="20" r="9" fill="{{v}}"/>
    <circle cx="26" cy="60" r="9" fill="{{y}}"/><circle cx="94" cy="60" r="9" fill="{{b}}"/>
    <circle cx="60" cy="40" r="13" fill="{{a}}" stroke="{{w}}" stroke-width="2.5"/>
  `,
  schloss: `
    <path d="M42 36 L42 26 C42 16 50 10 60 10 C70 10 78 16 78 26 L78 36" fill="none" stroke="{{s}}" stroke-width="6" stroke-linecap="round"/>
    <rect x="30" y="34" width="60" height="36" rx="8" fill="{{a}}"/>
    <circle cx="60" cy="49" r="5" fill="{{y}}"/>
    <rect x="57.5" y="51" width="5" height="10" rx="2" fill="{{y}}"/>
  `,
  schluessel: `
    <circle cx="38" cy="40" r="16" fill="{{y}}" stroke="{{s}}" stroke-width="2.5"/>
    <circle cx="38" cy="40" r="6" fill="{{n}}"/>
    <rect x="52" y="35" width="48" height="10" rx="4" fill="{{y}}" stroke="{{s}}" stroke-width="2"/>
    <rect x="76" y="45" width="7" height="10" rx="2" fill="{{y}}"/>
    <rect x="89" y="45" width="7" height="13" rx="2" fill="{{y}}"/>
  `,
  datenbank: `
    <path d="M30 22 L30 58 C30 64 43 68 60 68 C77 68 90 64 90 58 L90 22 Z" fill="{{a}}"/>
    <ellipse cx="60" cy="22" rx="30" ry="9" fill="{{n}}" stroke="{{s}}" stroke-width="2.4"/>
    <path d="M30 35 C30 41 43 45 60 45 C77 45 90 41 90 35" fill="none" stroke="{{w}}" stroke-width="2.2" opacity="0.8"/>
    <path d="M30 48 C30 54 43 58 60 58 C77 58 90 54 90 48" fill="none" stroke="{{w}}" stroke-width="2.2" opacity="0.8"/>
  `,
  smartphone: `
    <rect x="40" y="8" width="40" height="64" rx="8" fill="{{a}}"/>
    <rect x="45" y="15" width="30" height="46" rx="3" fill="{{n}}"/>
    <rect x="54" y="11" width="12" height="2.2" rx="1" fill="{{w}}" opacity="0.7"/>
    <circle cx="60" cy="66" r="2.6" fill="{{w}}" opacity="0.85"/>
    <rect x="49" y="21" width="22" height="9" rx="2.5" fill="{{u}}" opacity="0.8"/>
    <rect x="49" y="34" width="10" height="10" rx="2.5" fill="{{y}}"/>
    <rect x="61" y="34" width="10" height="10" rx="2.5" fill="{{b}}"/>
    <rect x="49" y="47" width="22" height="8" rx="2.5" fill="{{s}}" opacity="0.45"/>
  `,
  browser: `
    <rect x="16" y="12" width="88" height="56" rx="7" fill="{{n}}" stroke="{{s}}" stroke-width="2.4"/>
    <path d="M16 24 L104 24" stroke="{{s}}" stroke-width="2"/>
    <circle cx="25" cy="18" r="2.6" fill="{{b}}"/><circle cx="33" cy="18" r="2.6" fill="{{y}}"/><circle cx="41" cy="18" r="2.6" fill="{{a}}"/>
    <rect x="50" y="15" width="46" height="6" rx="3" fill="{{w}}" opacity="0.85"/>
    <rect x="24" y="31" width="32" height="29" rx="4" fill="{{a}}" opacity="0.85"/>
    <path d="M63 36 L94 36 M63 45 L90 45 M63 54 L84 54" stroke="{{s}}" stroke-width="3" stroke-linecap="round"/>
  `,
  code: `
    <rect x="18" y="14" width="84" height="52" rx="8" fill="{{t}}" opacity="0.88"/>
    <path d="M44 30 L32 40 L44 50" fill="none" stroke="{{a}}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M76 30 L88 40 L76 50" fill="none" stroke="{{y}}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="65" y1="26" x2="55" y2="54" stroke="{{b}}" stroke-width="4" stroke-linecap="round"/>
  `,
  chip: `
    <g stroke="{{s}}" stroke-width="3" stroke-linecap="round">
      <line x1="46" y1="10" x2="46" y2="20"/><line x1="60" y1="10" x2="60" y2="20"/><line x1="74" y1="10" x2="74" y2="20"/>
      <line x1="46" y1="60" x2="46" y2="70"/><line x1="60" y1="60" x2="60" y2="70"/><line x1="74" y1="60" x2="74" y2="70"/>
      <line x1="26" y1="30" x2="36" y2="30"/><line x1="26" y1="40" x2="36" y2="40"/><line x1="26" y1="50" x2="36" y2="50"/>
      <line x1="84" y1="30" x2="94" y2="30"/><line x1="84" y1="40" x2="94" y2="40"/><line x1="84" y1="50" x2="94" y2="50"/>
    </g>
    <rect x="36" y="20" width="48" height="40" rx="6" fill="{{a}}"/>
    <rect x="46" y="29" width="28" height="22" rx="3" fill="{{y}}"/>
  `,
  // ---------- Physik & Technik ----------
  zahnrad: `
    <circle cx="48" cy="44" r="20" fill="{{a}}" stroke="{{s}}" stroke-width="2.5" stroke-dasharray="7 5"/>
    <circle cx="48" cy="44" r="14" fill="{{a}}"/>
    <circle cx="48" cy="44" r="6" fill="{{n}}"/>
    <circle cx="79" cy="28" r="13" fill="{{y}}" stroke="{{s}}" stroke-width="2.2" stroke-dasharray="5 4"/>
    <circle cx="79" cy="28" r="9" fill="{{y}}"/>
    <circle cx="79" cy="28" r="3.8" fill="{{n}}"/>
  `,
  hebel: `
    <polygon points="52,66 64,44 76,66" fill="{{s}}"/>
    <line x1="18" y1="49" x2="104" y2="35" stroke="{{a}}" stroke-width="5.5" stroke-linecap="round"/>
    <rect x="18" y="31" width="18" height="16" rx="3" fill="{{b}}"/>
    <rect x="86" y="19" width="14" height="14" rx="3" fill="{{y}}"/>
    <circle cx="64" cy="42" r="4.5" fill="{{w}}" stroke="{{t}}" stroke-width="1.5"/>
  `,
  feder: `
    <rect x="36" y="10" width="48" height="7" rx="3" fill="{{s}}"/>
    <path d="M60 17 L60 22 L46 28 L74 35 L46 42 L74 49 L46 56 L60 61 L60 66" fill="none" stroke="{{a}}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="44" y="61" width="32" height="13" rx="4" fill="{{b}}"/>
  `,
  welle: `
    <line x1="12" y1="40" x2="108" y2="40" stroke="{{s}}" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.6"/>
    <path d="M14 40 Q26 12 38 40 T62 40 T86 40 T106 40" fill="none" stroke="{{a}}" stroke-width="4" stroke-linecap="round"/>
    <path d="M14 40 Q26 24 38 40 T62 40 T86 40 T106 40" fill="none" stroke="{{u}}" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
  `,
  prisma: `
    <line x1="10" y1="44" x2="46" y2="38" stroke="{{t}}" stroke-width="3.2" stroke-linecap="round" opacity="0.8"/>
    <polygon points="60,12 32,64 88,64" fill="{{n}}" stroke="{{s}}" stroke-width="2.8" stroke-linejoin="round"/>
    <line x1="72" y1="34" x2="108" y2="24" stroke="{{b}}" stroke-width="3" stroke-linecap="round"/>
    <line x1="74" y1="39" x2="108" y2="39" stroke="{{y}}" stroke-width="3" stroke-linecap="round"/>
    <line x1="76" y1="44" x2="108" y2="54" stroke="{{u}}" stroke-width="3" stroke-linecap="round"/>
  `,
  lampe: `
    <path d="M44 48 C37 42 35 30 42 21 C49 12 71 12 78 21 C85 30 83 42 76 48 C72 52 71 55 71 58 L49 58 C49 55 48 52 44 48 Z" fill="{{y}}"/>
    <path d="M52 24 C47 28 47 35 50 40" fill="none" stroke="{{w}}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    <rect x="49" y="58" width="22" height="6" rx="2" fill="{{s}}"/>
    <rect x="52" y="65" width="16" height="5" rx="2.5" fill="{{a}}"/>
  `,
  stromkreis: `
    <rect x="24" y="18" width="72" height="44" rx="10" fill="none" stroke="{{a}}" stroke-width="3.2"/>
    <rect x="16" y="30" width="16" height="20" rx="3" fill="{{y}}" stroke="{{s}}" stroke-width="2"/>
    <circle cx="96" cy="40" r="10" fill="{{b}}"/>
    <path d="M92 36 L100 44 M100 36 L92 44" stroke="{{w}}" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="48" y="12" width="24" height="12" rx="3" fill="{{u}}"/>
  `,
  thermometer: `
    <rect x="52" y="10" width="16" height="44" rx="8" fill="{{n}}" stroke="{{s}}" stroke-width="2.5"/>
    <circle cx="60" cy="57" r="13" fill="{{b}}"/>
    <rect x="56.5" y="26" width="7" height="26" rx="3.5" fill="{{b}}"/>
    <g stroke="{{s}}" stroke-width="2" stroke-linecap="round">
      <line x1="72" y1="20" x2="80" y2="20"/><line x1="72" y1="30" x2="78" y2="30"/><line x1="72" y1="40" x2="80" y2="40"/>
    </g>
  `,
  satellit: `
    <rect x="14" y="28" width="28" height="20" rx="3" fill="{{u}}" stroke="{{s}}" stroke-width="2"/>
    <rect x="78" y="28" width="28" height="20" rx="3" fill="{{u}}" stroke="{{s}}" stroke-width="2"/>
    <rect x="46" y="24" width="28" height="28" rx="5" fill="{{a}}"/>
    <circle cx="60" cy="38" r="6" fill="{{y}}"/>
    <path d="M52 56 Q60 66 68 56 M46 62 Q60 75 74 62" fill="none" stroke="{{b}}" stroke-width="2.4" stroke-linecap="round"/>
  `,
  // ---------- Biologie & Medizin ----------
  dna: `
    <path d="M38 10 C38 25 82 25 82 40 C82 55 38 55 38 70" fill="none" stroke="{{a}}" stroke-width="4" stroke-linecap="round"/>
    <path d="M82 10 C82 25 38 25 38 40 C38 55 82 55 82 70" fill="none" stroke="{{b}}" stroke-width="4" stroke-linecap="round"/>
    <g stroke="{{y}}" stroke-width="3" stroke-linecap="round">
      <line x1="45" y1="18" x2="75" y2="18"/><line x1="48" y1="31" x2="72" y2="31"/>
      <line x1="48" y1="49" x2="72" y2="49"/><line x1="45" y1="62" x2="75" y2="62"/>
    </g>
  `,
  lunge: `
    <path d="M60 12 L60 32 M60 28 L46 38 M60 28 L74 38" fill="none" stroke="{{s}}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M53 24 C36 24 24 38 24 54 C24 64 32 68 42 66 C50 64 54 56 54 46 Z" fill="{{b}}" opacity="0.86"/>
    <path d="M67 24 C84 24 96 38 96 54 C96 64 88 68 78 66 C70 64 66 56 66 46 Z" fill="{{b}}" opacity="0.86"/>
  `,
  auge: `
    <path d="M16 40 C30 18 90 18 104 40 C90 62 30 62 16 40 Z" fill="{{n}}" stroke="{{s}}" stroke-width="2.8"/>
    <circle cx="60" cy="40" r="15" fill="{{u}}"/>
    <circle cx="60" cy="40" r="7.5" fill="{{t}}"/>
    <circle cx="55" cy="35" r="3" fill="{{w}}"/>
  `,
  bakterie: `
    <g stroke="{{a}}" stroke-width="3" stroke-linecap="round">
      <line x1="60" y1="10" x2="60" y2="19"/><line x1="60" y1="61" x2="60" y2="70"/>
      <line x1="30" y1="40" x2="39" y2="40"/><line x1="81" y1="40" x2="90" y2="40"/>
      <line x1="38" y1="18" x2="45" y2="25"/><line x1="75" y1="55" x2="82" y2="62"/>
      <line x1="82" y1="18" x2="75" y2="25"/><line x1="45" y1="55" x2="38" y2="62"/>
    </g>
    <circle cx="60" cy="40" r="22" fill="{{a}}"/>
    <circle cx="53" cy="35" r="4.5" fill="{{y}}"/>
    <circle cx="68" cy="44" r="5.5" fill="{{b}}"/>
    <circle cx="58" cy="50" r="3" fill="{{w}}" opacity="0.7"/>
  `,
  blut: `
    <path d="M60 12 C74 30 82 40 82 50 C82 62 72 70 60 70 C48 70 38 62 38 50 C38 40 46 30 60 12 Z" fill="{{b}}"/>
    <path d="M49 48 C49 55 54 60 60 60" fill="none" stroke="{{w}}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
  `,
  knochen: `
    <circle cx="30" cy="33" r="8" fill="{{n}}" stroke="{{s}}" stroke-width="2.2"/>
    <circle cx="30" cy="47" r="8" fill="{{n}}" stroke="{{s}}" stroke-width="2.2"/>
    <circle cx="90" cy="33" r="8" fill="{{n}}" stroke="{{s}}" stroke-width="2.2"/>
    <circle cx="90" cy="47" r="8" fill="{{n}}" stroke="{{s}}" stroke-width="2.2"/>
    <rect x="30" y="34" width="60" height="12" fill="{{n}}"/>
    <line x1="34" y1="34" x2="86" y2="34" stroke="{{s}}" stroke-width="2.2"/>
    <line x1="34" y1="46" x2="86" y2="46" stroke="{{s}}" stroke-width="2.2"/>
  `,
  baum: `
    <rect x="54" y="44" width="12" height="24" rx="3" fill="{{y}}"/>
    <circle cx="60" cy="28" r="18" fill="{{a}}"/>
    <circle cx="44" cy="38" r="14" fill="{{s}}"/>
    <circle cx="76" cy="38" r="14" fill="{{s}}"/>
  `,
  mikroskop: `
    <rect x="32" y="62" width="56" height="8" rx="4" fill="{{s}}"/>
    <path d="M68 62 C82 56 84 36 72 28" fill="none" stroke="{{s}}" stroke-width="5" stroke-linecap="round"/>
    <rect x="50" y="14" width="14" height="30" rx="4" transform="rotate(18 57 29)" fill="{{a}}"/>
    <rect x="40" y="48" width="28" height="5" rx="2.5" fill="{{y}}"/>
  `,
  // ---------- Chemie & Erde ----------
  molekuel: `
    <line x1="34" y1="54" x2="60" y2="28" stroke="{{s}}" stroke-width="4"/>
    <line x1="86" y1="54" x2="60" y2="28" stroke="{{s}}" stroke-width="4"/>
    <circle cx="60" cy="28" r="15" fill="{{b}}"/>
    <circle cx="34" cy="54" r="11" fill="{{u}}"/>
    <circle cx="86" cy="54" r="11" fill="{{u}}"/>
    <circle cx="55" cy="23" r="4" fill="{{w}}" opacity="0.35"/>
  `,
  kolben: `
    <path d="M50 14 L70 14 L70 30 L88 60 C90 64 87 68 82 68 L38 68 C33 68 30 64 32 60 L50 30 Z" fill="{{n}}" stroke="{{s}}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M40 48 L80 48 L86 60 C87 63 85 66 81 66 L39 66 C35 66 33 63 34 60 Z" fill="{{a}}"/>
    <circle cx="52" cy="56" r="3" fill="{{w}}" opacity="0.8"/><circle cx="66" cy="53" r="2.5" fill="{{y}}"/>
    <rect x="46" y="10" width="28" height="5" rx="2.5" fill="{{s}}"/>
  `,
  flamme: `
    <path d="M60 10 C78 26 84 40 80 54 C77 64 69 70 60 70 C51 70 43 64 40 54 C36 40 44 26 60 10 Z" fill="{{b}}"/>
    <path d="M60 30 C70 40 72 50 69 58 C67 64 64 67 60 67 C56 67 53 64 51 58 C48 50 51 40 60 30 Z" fill="{{y}}"/>
  `,
  tropfen: `
    <path d="M60 12 C75 31 83 41 83 51 C83 63 73 71 60 71 C47 71 37 63 37 51 C37 41 45 31 60 12 Z" fill="{{u}}"/>
    <path d="M49 48 C49 56 54 61 60 61" fill="none" stroke="{{w}}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  `,
  kompass: `
    <circle cx="60" cy="40" r="28" fill="{{n}}" stroke="{{s}}" stroke-width="3"/>
    <polygon points="60,16 67,40 53,40" fill="{{b}}"/>
    <polygon points="60,64 67,40 53,40" fill="{{u}}"/>
    <circle cx="60" cy="40" r="4" fill="{{w}}" stroke="{{t}}" stroke-width="1.5"/>
  `,
  vulkan: `
    <path d="M18 68 L48 26 L72 26 L102 68 Z" fill="{{s}}"/>
    <path d="M48 26 L54 36 L60 28 L66 37 L72 26 Z" fill="{{b}}"/>
    <circle cx="56" cy="15" r="7" fill="{{y}}" opacity="0.85"/>
    <circle cx="68" cy="14" r="5" fill="{{b}}" opacity="0.8"/>
  `,
  // ---------- Wirtschaft, Recht, Kommunikation & Musik ----------
  vertrag: `
    <rect x="30" y="10" width="54" height="62" rx="6" fill="{{n}}" stroke="{{s}}" stroke-width="2.4"/>
    <g stroke="{{s}}" stroke-width="2.4" stroke-linecap="round">
      <line x1="40" y1="23" x2="72" y2="23"/><line x1="40" y1="33" x2="74" y2="33"/><line x1="40" y1="43" x2="66" y2="43"/>
    </g>
    <path d="M40 58 Q48 52 54 58 T68 56" fill="none" stroke="{{a}}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="82" cy="56" r="11" fill="{{b}}"/>
    <path d="M77 56 L80.5 59.5 L87 53" fill="none" stroke="{{w}}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  gericht: `
    <rect x="26" y="60" width="44" height="8" rx="3" fill="{{s}}"/>
    <rect x="44" y="18" width="32" height="16" rx="4" transform="rotate(-30 60 26)" fill="{{a}}"/>
    <line x1="62" y1="30" x2="90" y2="58" stroke="{{y}}" stroke-width="6" stroke-linecap="round"/>
  `,
  bank: `
    <polygon points="18,30 60,10 102,30" fill="{{a}}"/>
    <rect x="22" y="30" width="76" height="6" rx="2" fill="{{s}}"/>
    <rect x="28" y="36" width="10" height="24" fill="{{n}}" stroke="{{s}}" stroke-width="1.8"/>
    <rect x="55" y="36" width="10" height="24" fill="{{n}}" stroke="{{s}}" stroke-width="1.8"/>
    <rect x="82" y="36" width="10" height="24" fill="{{n}}" stroke="{{s}}" stroke-width="1.8"/>
    <rect x="18" y="60" width="84" height="8" rx="3" fill="{{s}}"/>
  `,
  handel: `
    <path d="M20 20 L32 20 L40 50 L88 50 L96 28 L35 28" fill="none" stroke="{{a}}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="36,28 94,28 87,49 41,49" fill="{{a}}" opacity="0.22"/>
    <circle cx="48" cy="61" r="6" fill="{{s}}"/><circle cx="82" cy="61" r="6" fill="{{s}}"/>
    <rect x="50" y="14" width="14" height="14" rx="2.5" fill="{{y}}"/>
    <rect x="68" y="17" width="12" height="11" rx="2.5" fill="{{b}}"/>
  `,
  lkw: `
    <rect x="16" y="22" width="56" height="34" rx="5" fill="{{a}}"/>
    <path d="M72 30 L92 30 L102 42 L102 56 L72 56 Z" fill="{{y}}"/>
    <path d="M77 35 L90 35 L96 42 L77 42 Z" fill="{{w}}" opacity="0.85"/>
    <circle cx="34" cy="58" r="8.5" fill="{{t}}"/><circle cx="34" cy="58" r="3.8" fill="{{w}}"/>
    <circle cx="86" cy="58" r="8.5" fill="{{t}}"/><circle cx="86" cy="58" r="3.8" fill="{{w}}"/>
  `,
  chart: `
    <rect x="22" y="44" width="14" height="22" rx="3" fill="{{u}}"/>
    <rect x="44" y="34" width="14" height="32" rx="3" fill="{{a}}"/>
    <rect x="66" y="24" width="14" height="42" rx="3" fill="{{v}}"/>
    <path d="M22 36 L48 26 L70 20 L94 12" fill="none" stroke="{{b}}" stroke-width="3.2" stroke-linecap="round"/>
    <polygon points="98,10 88,9 93,18" fill="{{b}}"/>
  `,
  megafon: `
    <path d="M26 34 L46 34 L82 16 L82 62 L46 44 L26 44 Z" fill="{{a}}"/>
    <rect x="32" y="44" width="10" height="18" rx="4" fill="{{s}}"/>
    <path d="M90 28 Q98 39 90 50 M96 22 Q107 39 96 56" fill="none" stroke="{{y}}" stroke-width="3" stroke-linecap="round"/>
  `,
  uhr: `
    <circle cx="60" cy="40" r="27" fill="{{n}}" stroke="{{a}}" stroke-width="4"/>
    <line x1="60" y1="40" x2="60" y2="23" stroke="{{t}}" stroke-width="3.2" stroke-linecap="round"/>
    <line x1="60" y1="40" x2="74" y2="46" stroke="{{b}}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="60" cy="40" r="3.5" fill="{{a}}"/>
  `,
  ziel: `
    <circle cx="60" cy="40" r="27" fill="{{b}}" opacity="0.22" stroke="{{b}}" stroke-width="3"/>
    <circle cx="60" cy="40" r="18" fill="{{n}}" stroke="{{a}}" stroke-width="3"/>
    <circle cx="60" cy="40" r="8" fill="{{b}}"/>
    <line x1="86" y1="14" x2="63" y2="37" stroke="{{t}}" stroke-width="3" stroke-linecap="round"/>
    <polygon points="60,40 69,37 63,31" fill="{{t}}"/>
  `,
  sprechblase: `
    <rect x="18" y="16" width="54" height="34" rx="10" fill="{{a}}"/>
    <polygon points="32,50 26,62 44,50" fill="{{a}}"/>
    <rect x="50" y="30" width="52" height="30" rx="9" fill="{{n}}" stroke="{{u}}" stroke-width="2.6"/>
    <polygon points="84,60 92,70 76,60" fill="{{u}}"/>
    <g stroke="{{w}}" stroke-width="2.6" stroke-linecap="round">
      <line x1="30" y1="29" x2="58" y2="29"/><line x1="30" y1="38" x2="48" y2="38"/>
    </g>
  `,
  note: `
    <path d="M46 56 L46 20 L86 14 L86 50" fill="none" stroke="{{a}}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M46 28 L86 22" stroke="{{v}}" stroke-width="4"/>
    <ellipse cx="38" cy="57" rx="11" ry="8" transform="rotate(-18 38 57)" fill="{{b}}"/>
    <ellipse cx="78" cy="51" rx="11" ry="8" transform="rotate(-18 78 51)" fill="{{a}}"/>
  `,
};

export const ILLUSTRATION_NAMES = Object.keys(ILLUSTRATIONS);

/** Aliases so German/English topic nouns map naturally to a crisp Studyflix illustration. */
const ALIASES: Record<string, string> = {
  plane: 'flugzeug', aircraft: 'flugzeug', jet: 'flugzeug', flieger: 'flugzeug', reise: 'flugzeug', luftfahrt: 'flugzeug',
  wing: 'tragflaeche', fluegel: 'tragflaeche', airfoil: 'tragflaeche', auftrieb: 'tragflaeche',
  car: 'auto', fahrzeug: 'auto', pkw: 'auto', bremsweg: 'auto', motor: 'auto',
  ship: 'schiff', boot: 'schiff', boat: 'schiff', segelboot: 'schiff',
  rocket: 'rakete', innovation: 'rakete', antrieb: 'rakete', weltraum: 'rakete',
  block: 'koerper', kiste: 'koerper', box: 'koerper', masse: 'koerper', objekt: 'koerper', wuerfel: 'koerper',
  kugel: 'ball', sphere: 'ball',
  planet: 'erde', welt: 'erde', globus: 'erde', erdkugel: 'erde', oekologie: 'erde',
  sun: 'sonne', stern: 'sonne', solar: 'sonne', licht: 'sonne',
  moon: 'mond', gezeiten: 'mond',
  cell: 'zelle', biologie: 'zelle', membran: 'zelle', zellkern: 'zelle', mitose: 'zelle',
  heart: 'herz', kreislauf: 'herz', puls: 'herz', medizin: 'herz', gesundheit: 'herz',
  brain: 'gehirn', kopf: 'gehirn', denken: 'gehirn', psychologie: 'gehirn', gedaechtnis: 'gehirn', neuron: 'gehirn',
  blatt: 'pflanze', fotosynthese: 'pflanze', photosynthese: 'pflanze', natur: 'pflanze', wachstum: 'pflanze',
  wald: 'baum', oekosystem: 'baum', umwelt: 'baum',
  wissenschaft: 'atom', physik: 'atom', kern: 'atom', elektron: 'atom', proton: 'atom',
  strom: 'batterie', blitz: 'batterie', energie: 'batterie', akku: 'batterie', spannung: 'batterie',
  gleichgewicht: 'waage', gerechtigkeit: 'waage', abwaegen: 'waage', bilanz: 'waage',
  mensch: 'person', kaeufer: 'person', verkaeufer: 'person', sender: 'person', empfaenger: 'person', nutzer: 'person', kunde: 'person', benutzer: 'person', patient: 'person', schueler: 'person',
  team: 'gruppe', gesellschaft: 'gruppe', publikum: 'gruppe', zielgruppe: 'gruppe', gemeinschaft: 'gruppe',
  gebaeude: 'haus', home: 'haus', wohnung: 'haus', haushalt: 'haus',
  firma: 'fabrik', unternehmen: 'fabrik', industrie: 'fabrik', produktion: 'fabrik', hersteller: 'fabrik',
  euro: 'geld', preis: 'geld', kapital: 'geld', finanz: 'geld', zins: 'geld', kosten: 'geld', lohn: 'geld', steuer: 'geld', inflation: 'geld',
  laptop: 'computer', pc: 'computer', rechner: 'computer', geraet: 'computer', client: 'computer',
  wissen: 'buch', lernen: 'buch', literatur: 'buch', geschichte: 'buch', theorie: 'buch', lehrbuch: 'buch',
  wetter: 'wolke', regen: 'wolke', klima: 'wolke', cloud: 'wolke', atmosphaere: 'wolke',
  mountain: 'berg', gebirge: 'berg', gipfel: 'berg',
  // IT & Netzwerke
  datenpaket: 'paket', packet: 'paket', pakete: 'paket', paketvermittlung: 'paket', sendung: 'paket', payload: 'paket',
  nachricht: 'brief', mail: 'brief', email: 'brief', post: 'brief', botschaft: 'brief',
  leitung: 'kabel', leitungsvermittlung: 'kabel', kanal: 'kabel', glasfaser: 'kabel', verbindung: 'kabel', leiter: 'kabel',
  switch: 'router', gateway: 'router', vermittlung: 'router', wlan: 'router', wifi: 'router',
  host: 'server', rechenzentrum: 'server', backend: 'server',
  internet: 'netzwerk', netz: 'netzwerk', knoten: 'netzwerk', topologie: 'netzwerk', dns: 'netzwerk', ipv4: 'netzwerk', ipv6: 'netzwerk', tcp: 'netzwerk', http: 'netzwerk', protokoll: 'netzwerk',
  sicherheit: 'schloss', verschluesselung: 'schloss', datenschutz: 'schloss', firewall: 'schloss', https: 'schloss', passwort: 'schloss', schutz: 'schloss',
  key: 'schluessel', kryptografie: 'schluessel', authentifizierung: 'schluessel', zugang: 'schluessel',
  sql: 'datenbank', speicher: 'datenbank', archiv: 'datenbank', register: 'datenbank',
  handy: 'smartphone', mobil: 'smartphone', app: 'smartphone', streaming: 'smartphone',
  web: 'browser', website: 'browser', webseite: 'browser', url: 'browser', fernseher: 'browser', bildschirm: 'browser',
  programm: 'code', algorithmus: 'code', software: 'code', skript: 'code', funktion: 'code', java: 'code', python: 'code',
  cpu: 'chip', prozessor: 'chip', hardware: 'chip', mikrochip: 'chip', transistor: 'chip',
  // Physik & Technik
  mechanik: 'zahnrad', prozess: 'zahnrad', system: 'zahnrad', getriebe: 'zahnrad', ablauf: 'zahnrad',
  drehmoment: 'hebel', kraftarm: 'hebel', wippe: 'hebel',
  schwingung: 'feder', elastizitaet: 'feder', hooke: 'feder',
  frequenz: 'welle', schall: 'welle', signal: 'welle', strahlung: 'welle', elektromagnetism: 'welle',
  optik: 'prisma', brechung: 'prisma', spektrum: 'prisma', farbe: 'prisma',
  idee: 'lampe', gluhbirne: 'lampe', gluehbirne: 'lampe', leuchte: 'lampe', erkenntnis: 'lampe',
  schaltung: 'stromkreis', widerstand: 'stromkreis', ohm: 'stromkreis',
  waerme: 'thermometer', temperatur: 'thermometer', fieber: 'thermometer', thermodynamik: 'thermometer',
  gps: 'satellit', funk: 'satellit', orbit: 'satellit',
  // Biologie & Medizin
  genetik: 'dna', rna: 'dna', gen: 'dna', vererbung: 'dna', mutation: 'dna', chromosom: 'dna', meiose: 'dna',
  atmung: 'lunge', sauerstoff: 'lunge', gasaustausch: 'lunge',
  sehen: 'auge', wahrnehmung: 'auge', linse: 'auge', blick: 'auge',
  virus: 'bakterie', keim: 'bakterie', infektion: 'bakterie', immunsystem: 'bakterie', erreger: 'bakterie',
  blutkoerperchen: 'blut', gefaess: 'blut', arterie: 'blut', vene: 'blut',
  skelett: 'knochen', anatomie: 'knochen', gelenk: 'knochen',
  labor: 'mikroskop', forschung: 'mikroskop', analyse: 'mikroskop',
  // Chemie & Erde
  chemie: 'molekuel', bindung: 'molekuel', stoff: 'molekuel', verbindungchemie: 'molekuel',
  reaktion: 'kolben', experiment: 'kolben', saeure: 'kolben', base: 'kolben', loesung: 'kolben',
  feuer: 'flamme', verbrennung: 'flamme', exotherm: 'flamme', hitze: 'flamme',
  wasser: 'tropfen', fluessigkeit: 'tropfen', osmose: 'tropfen',
  navigation: 'kompass', richtung: 'kompass', orientierung: 'kompass', geografie: 'kompass',
  tektonik: 'vulkan', geologie: 'vulkan', erdkruste: 'vulkan', magma: 'vulkan',
  // Wirtschaft, Recht, Kommunikation & Musik
  dokument: 'vertrag', gesetz: 'vertrag', regel: 'vertrag', norm: 'vertrag', kaufvertrag: 'vertrag', antrag: 'vertrag',
  recht: 'gericht', urteil: 'gericht', justiz: 'gericht', klage: 'gericht', strafrecht: 'gericht', zivilrecht: 'gericht',
  kredit: 'bank', zentralbank: 'bank', konto: 'bank', boerse: 'bank',
  markt: 'handel', konsum: 'handel', einkauf: 'handel', nachfrage: 'handel', verkauf: 'handel',
  logistik: 'lkw', lieferung: 'lkw', transport: 'lkw', angebot: 'lkw', lieferkette: 'lkw',
  kurs: 'chart', statistik: 'chart', trend: 'chart', rendite: 'chart', umsatz: 'chart', wirtschaft: 'chart',
  werbung: 'megafon', marketing: 'megafon', pr: 'megafon', oeffentlichkeit: 'megafon', medium: 'megafon', medien: 'megafon',
  zeit: 'uhr', dauer: 'uhr', frist: 'uhr', takt: 'uhr', deadline: 'uhr',
  strategie: 'ziel', fokus: 'ziel', erfolg: 'ziel', ergebnis: 'ziel',
  dialog: 'sprechblase', gespraech: 'sprechblase', sprache: 'sprechblase', kommunikation: 'sprechblase', verhandlung: 'sprechblase', rhetorik: 'sprechblase',
  musik: 'note', ton: 'note', melodie: 'note', akkord: 'note', rhythmus: 'note', intervall: 'note',
};

const norm = (v?: string) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

const wordsOf = (v?: string) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Short names that should only match whole words (to avoid e.g. "automatisch" → "auto" or "führung" → "uhr")
const EXACT_ONLY = new Set(['auto', 'ball', 'bank', 'uhr', 'lkw', 'dna', 'rna', 'gen', 'key', 'web', 'app', 'url', 'cpu', 'sql', 'tcp', 'dns', 'gps', 'pr', 'ton', 'box', 'pc']);

/** Strict Studyflix preset matcher for a label/title (returns a key in ILLUSTRATIONS or null). */
export function matchIllustration(text?: string): string | null {
  if (!text) return null;
  const full = norm(text);
  if (!full) return null;
  if (ILLUSTRATIONS[full]) return full;
  if (ALIASES[full]) return ALIASES[full];
  const words = wordsOf(text);
  for (const w of words) {
    if (ILLUSTRATIONS[w]) return w;
    if (ALIASES[w]) return ALIASES[w];
  }
  // Compound German words (e.g. "Paketvermittlung", "Leitungsvermittlung", "Pflanzenzelle", "Kaufvertrag")
  for (const w of words) {
    if (w.length < 5) continue;
    for (const name of ILLUSTRATION_NAMES) {
      if (name.length >= 4 && !EXACT_ONLY.has(name) && (w.startsWith(name) || w.endsWith(name))) return name;
    }
    for (const [alias, target] of Object.entries(ALIASES)) {
      if (alias.length >= 4 && !EXACT_ONLY.has(alias) && (w.startsWith(alias) || w.endsWith(alias))) return target;
    }
  }
  // Longer phrase substring fallback (e.g. "Kräfte am Flugzeug")
  for (const name of ILLUSTRATION_NAMES) if (name.length >= 5 && full.includes(name)) return name;
  for (const [alias, target] of Object.entries(ALIASES)) if (alias.length >= 5 && full.includes(alias)) return target;
  return null;
}

/** Picks the best illustration key for an icon name or subject label (substring match included). */
export function resolveIllustration(icon?: string, subject?: string): { kind: 'art' | 'icon'; key: string } | null {
  for (const raw of [icon, subject]) {
    const art = matchIllustration(raw);
    if (art) return { kind: 'art', key: art };
    const k = norm(raw);
    if (k && ICONS[k]) return { kind: 'icon', key: k };
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

export type IllustrationMotion = 'float' | 'bob' | 'pulse' | 'spin' | 'rock' | 'idle';

const MOTION_BY_KEY: Record<string, IllustrationMotion> = {
  // floating / flying / gliding motifs
  flugzeug: 'float', tragflaeche: 'float', rakete: 'float', wolke: 'float', satellit: 'float',
  ball: 'float', mond: 'float', tropfen: 'float', note: 'float', paket: 'float', brief: 'float', sprechblase: 'float',
  // swaying / rocking / rolling motifs
  schiff: 'bob', pflanze: 'bob', baum: 'bob', waage: 'bob', hebel: 'bob', feder: 'bob',
  kompass: 'bob', welle: 'bob', auto: 'bob', lkw: 'bob',
  // pulsing / living / radiating motifs
  herz: 'pulse', gehirn: 'pulse', lunge: 'pulse', lampe: 'pulse', flamme: 'pulse', sonne: 'pulse',
  zelle: 'pulse', bakterie: 'pulse', blut: 'pulse', dna: 'pulse', router: 'pulse', netzwerk: 'pulse',
  stromkreis: 'pulse', batterie: 'pulse', magnet: 'pulse', vulkan: 'pulse', ziel: 'pulse', megafon: 'pulse',
  auge: 'pulse', chip: 'pulse',
  // rotating / oscillating scientific motifs
  zahnrad: 'spin',
  atom: 'rock', erde: 'rock', molekuel: 'rock', uhr: 'rock', kolben: 'rock', mikroskop: 'rock', prisma: 'rock',
};

/** Ambient Studyflix motion style for an illustration motif (used when a diagram is rendered animated). Pure – tested. */
export function illustrationMotion(icon?: string, subject?: string): IllustrationMotion {
  const match = resolveIllustration(icon, subject);
  if (match?.kind === 'art') return MOTION_BY_KEY[match.key] ?? 'idle';
  return 'idle';
}

