/**
 * Automatic language detection for flashcards & smart ranking of system and Piper neural voices.
 * Pure TypeScript (tested in Node without browser globals).
 */

export type SpeechLang = 'de' | 'en' | 'fr' | 'es' | 'it';

export type VoiceLike = {
  name: string;
  lang: string;
  voiceURI?: string;
  localService?: boolean;
  default?: boolean;
};

const STOPWORDS: Record<SpeechLang, Set<string>> = {
  de: new Set([
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
    'und', 'oder', 'aber', 'nicht', 'kein', 'keine', 'ist', 'sind', 'war', 'waren', 'wird', 'werden',
    'hat', 'haben', 'hatte', 'kann', 'können', 'muss', 'müssen', 'soll', 'mit', 'von', 'für', 'auf',
    'aus', 'bei', 'nach', 'über', 'unter', 'durch', 'gegen', 'ohne', 'zwischen', 'wie', 'was', 'wer',
    'wo', 'wann', 'warum', 'welche', 'welcher', 'welches', 'sich', 'auch', 'noch', 'nur', 'schon',
    'sehr', 'mehr', 'als', 'wenn', 'weil', 'dass', 'wobei', 'sowie', 'zum', 'zur', 'beim', 'vom',
    'im', 'am', 'um', 'zu', 'es', 'er', 'sie', 'wir', 'ihr', 'ich', 'du', 'man', 'dies', 'diese',
    'dieser', 'dieses', 'alle', 'immer', 'hier', 'dort', 'dann', 'denn', 'doch', 'etwa', 'beispiel',
    'nenne', 'erkläre', 'beschreibe', 'definiere', 'unterschied', 'funktion', 'bedeutung', 'wirkung',
  ]),
  en: new Set([
    'the', 'and', 'or', 'but', 'not', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may',
    'might', 'must', 'with', 'from', 'for', 'into', 'onto', 'upon', 'about', 'above', 'below',
    'between', 'through', 'during', 'before', 'after', 'without', 'within', 'what', 'which', 'who',
    'whom', 'whose', 'where', 'when', 'why', 'how', 'this', 'that', 'these', 'those', 'there',
    'their', 'they', 'them', 'your', 'you', 'our', 'we', 'she', 'he', 'it', 'its', 'his', 'her',
    'to', 'of', 'in', 'on', 'at', 'by', 'as', 'an', 'if', 'then', 'than', 'because', 'while',
    'also', 'only', 'just', 'very', 'more', 'most', 'some', 'any', 'all', 'each', 'every', 'other',
    'explain', 'define', 'describe', 'difference', 'example', 'meaning', 'function', 'process',
  ]),
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'et', 'ou', 'mais', 'donc', 'car',
    'ni', 'ne', 'pas', 'plus', 'est', 'sont', 'était', 'être', 'avoir', 'fait', 'faire', 'peut',
    'peuvent', 'doit', 'avec', 'sans', 'pour', 'par', 'dans', 'sur', 'sous', 'entre', 'chez',
    'vers', 'qui', 'que', 'quoi', 'dont', 'où', 'quand', 'comment', 'pourquoi', 'quel', 'quelle',
    'quels', 'quelles', 'ce', 'cet', 'cette', 'ces', 'cela', 'ceci', 'son', 'sa', 'ses', 'leur',
    'leurs', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'votre', 'nous', 'vous', 'ils',
    'elles', 'elle', 'je', 'tu', 'il', 'on', 'très', 'aussi', 'tout', 'tous', 'toute', 'toutes',
    'comme', 'ainsi', 'alors', 'depuis', 'avant', 'après', 'expliquez', 'définissez', 'exemple',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'del', 'al', 'y', 'o', 'pero', 'sino',
    'no', 'es', 'son', 'era', 'eran', 'fue', 'ser', 'estar', 'está', 'están', 'hay', 'tiene',
    'tienen', 'puede', 'pueden', 'con', 'sin', 'para', 'por', 'en', 'sobre', 'entre', 'hacia',
    'desde', 'hasta', 'qué', 'quién', 'cuál', 'cuándo', 'dónde', 'cómo', 'porque', 'este', 'esta',
    'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'su', 'sus', 'mi', 'mis', 'tu', 'tus',
    'nuestro', 'nuestra', 'nosotros', 'vosotros', 'ellos', 'ellas', 'ella', 'yo', 'muy', 'más',
    'también', 'todo', 'todos', 'toda', 'todas', 'como', 'cuando', 'donde', 'siempre', 'ejemplo',
  ]),
  it: new Set([
    'il', 'lo', 'la', 'gli', 'le', 'un', 'uno', 'una', 'del', 'dello', 'della', 'dei', 'degli',
    'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'e', 'ed', 'o', 'ma', 'però', 'non',
    'è', 'sono', 'era', 'erano', 'essere', 'avere', 'ha', 'hanno', 'può', 'possono', 'con', 'senza',
    'per', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sulla', 'tra', 'fra', 'da',
    'dal', 'dalla', 'che', 'chi', 'cosa', 'quale', 'quali', 'quando', 'dove', 'come', 'perché',
    'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'suo', 'sua', 'suoi', 'sue',
    'loro', 'nostro', 'nostra', 'noi', 'voi', 'essi', 'esse', 'io', 'molto', 'più', 'anche',
    'tutto', 'tutti', 'tutta', 'tutte', 'sempre', 'esempio', 'spiega', 'definisci',
  ]),
};

/**
 * Detects the dominant language of a card/sentence across DE, EN, FR, ES, IT.
 * Falls back to `fallback` (default `'de'`) when text is too short or ambiguous.
 */
export function detectSpeechLang(text: string, fallback: SpeechLang = 'de'): SpeechLang {
  const clean = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .trim();
  if (!clean) return fallback;

  const scores: Record<SpeechLang, number> = { de: 0, en: 0, fr: 0, es: 0, it: 0 };

  // 1. Strong character / diacritic cues
  if (/ß/.test(clean)) scores.de += 6;
  const deUmlauts = (clean.match(/[äöüÄÖÜ]/g) ?? []).length;
  if (deUmlauts) scores.de += Math.min(8, deUmlauts * 2.5);

  if (/[ñÑ¿¡]/.test(clean)) scores.es += 7;
  const esAcc = (clean.match(/[áíóúÁÍÓÚ]/g) ?? []).length;
  if (esAcc) scores.es += Math.min(5, esAcc * 1.6);

  if (/[çÇœŒêÊëËîÎïÏûÛâÂ]/.test(clean)) scores.fr += 5.5;
  const frAcc = (clean.match(/[éèàùÉÈÀÙ]/g) ?? []).length;
  if (frAcc) {
    scores.fr += Math.min(4.5, frAcc * 1.4);
    scores.it += Math.min(2.5, frAcc * 0.7);
  }
  if (/[ìòÌÒ]/.test(clean)) scores.it += 3.5;

  // French / Italian contractions (l', d', c', j', n', qu', dell', nell', all')
  if (/\b(?:c|j|n|qu|s)'\p{L}/iu.test(clean)) scores.fr += 4;
  if (/\b(?:dell|nell|all|sull|un)'\p{L}/iu.test(clean)) scores.it += 4;
  if (/\b(?:don|can|won|isn|aren|wasn|weren|doesn|didn|hasn|haven|wouldn|couldn|shouldn)'t\b/i.test(clean)) scores.en += 5;
  if (/\b(?:i'm|it's|that's|there's|you're|we're|they're|i've|you've)\b/i.test(clean)) scores.en += 4.5;

  // 2. Word-level stopword + suffix scoring
  const words = clean
    .toLowerCase()
    .split(/[\s'’-]+/)
    .filter((w) => w.length >= 2);

  for (const w of words) {
    for (const lang of ['de', 'en', 'fr', 'es', 'it'] as const) {
      if (STOPWORDS[lang].has(w)) scores[lang] += 2.2;
    }
    // Characteristic endings (light weight so stopwords still dominate)
    if (/(?:ung|keit|heit|schaft|chen|lein|lich|isch)$/.test(w)) scores.de += 1.4;
    if (/(?:tion|sion|ment|ness|ship|able|ible|ing|ght)$/.test(w) && !/ung$/.test(w)) {
      if (/(?:ness|ship|ing|ght)$/.test(w)) scores.en += 1.5;
      else scores.en += 0.6;
    }
    if (/(?:eux|euse|oir|ment|tion|eau|aux)$/.test(w)) scores.fr += 0.9;
    if (/(?:ción|sión|dad|mente|ando|iendo)$/.test(w)) scores.es += 1.4;
    if (/(?:zione|sione|tà|gli|cchi|ezza|mento)$/.test(w)) scores.it += 1.5;
  }

  // Capitalized non-initial nouns in multi-word text strongly signal German
  const rawTokens = clean.split(/\s+/).filter((t) => t.length >= 3);
  if (rawTokens.length >= 4) {
    const midCaps = rawTokens.slice(1).filter((t) => /^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(t)).length;
    if (midCaps >= 2) scores.de += Math.min(4, midCaps * 1.1);
  }

  const ranked = (Object.entries(scores) as [SpeechLang, number][]).sort((a, b) => b[1] - a[1]);
  const [bestLang, bestScore] = ranked[0];
  const secondScore = ranked[1][1];

  // Require clear signal before overriding fallback
  if (bestScore < 2.0) return fallback;
  if (bestLang !== fallback && bestScore - secondScore < 1.2) return fallback;
  return bestLang;
}

/**
 * Scores a browser/OS SpeechSynthesisVoice for a target language,
 * strongly preferring Natural / Neural / Enhanced / Premium voices over legacy robotic ones.
 */
export function scoreSystemVoice(voice: VoiceLike, targetLang: SpeechLang): number {
  const vLang = (voice.lang || '').toLowerCase().replace('_', '-');
  const name = voice.name || '';
  let score = 0;

  if (vLang === targetLang || vLang.startsWith(targetLang + '-')) {
    score += 100;
    // Prefer standard locales (de-DE, en-US/GB, fr-FR, es-ES, it-IT)
    if (
      (targetLang === 'de' && vLang === 'de-de') ||
      (targetLang === 'en' && (vLang === 'en-us' || vLang === 'en-gb')) ||
      (targetLang === 'fr' && vLang === 'fr-fr') ||
      (targetLang === 'es' && vLang === 'es-es') ||
      (targetLang === 'it' && vLang === 'it-it')
    ) {
      score += 6;
    }
  } else {
    return -50;
  }

  // Modern neural / high-quality voice indicators
  if (/natural|neural/i.test(name)) score += 48;
  else if (/premium|enhanced|siri/i.test(name)) score += 38;
  else if (/online/i.test(name)) score += 32;
  else if (/google/i.test(name)) score += 24;
  else if (/wavenet|studio|multilingual/i.test(name)) score += 35;

  // Well-known good desktop voices (Windows 11 Natural / macOS Anna/Markus/Samantha)
  if (/\b(katja|conrad|amala|florian|seraphina|aria|jenny|guy|sonia|denise|henri|elvira|alvaro|elsa|diego|anna|markus|petra|viktor|samantha|daniel|amelie|thomas|monica|alice)\b/i.test(name)) {
    score += 10;
  }

  // Penalize legacy robotic engines
  if (/espeak|festival|compact|desktop\b|hedda|stefan|david|zira|hazel|hortense|helena desktop/i.test(name)) {
    score -= 22;
  }

  if (voice.default) score += 2;
  return score;
}

/** Picks the highest-quality system voice for `targetLang`, or falls back gracefully. */
export function pickBestSystemVoice<T extends VoiceLike>(
  voices: readonly T[],
  targetLang: SpeechLang,
  preferredURI?: string,
  respectPreferred = true,
): T | undefined {
  if (!voices.length) return undefined;
  if (respectPreferred && preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact && (exact.lang || '').toLowerCase().startsWith(targetLang)) return exact;
  }
  let best: T | undefined;
  let bestScore = -999;
  for (const v of voices) {
    const s = scoreSystemVoice(v, targetLang);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  if (best && bestScore > 0) return best;
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  return voices[0];
}

/**
 * Picks the best installed Piper neural voice for `targetLang`.
 * Returns `undefined` when no Piper voice is installed for that language.
 */
export function pickPiperVoiceForLang(
  installedIds: readonly string[],
  targetLang: SpeechLang,
  preferredVoiceId?: string,
  autoDetect = true,
): string | undefined {
  if (!installedIds.length) return undefined;
  const langOf = (id: string) => id.slice(0, 2).toLowerCase();
  if (preferredVoiceId && installedIds.includes(preferredVoiceId)) {
    if (!autoDetect || langOf(preferredVoiceId) === targetLang) return preferredVoiceId;
  }
  const matching = installedIds.filter((id) => langOf(id) === targetLang);
  if (!matching.length) {
    return autoDetect ? undefined : (preferredVoiceId && installedIds.includes(preferredVoiceId) ? preferredVoiceId : installedIds[0]);
  }
  const qualityRank = (id: string) => (id.endsWith('-high') ? 3 : id.endsWith('-medium') ? 2 : 1);
  return [...matching].sort((a, b) => qualityRank(b) - qualityRank(a))[0];
}

export const LANG_LABELS: Record<SpeechLang, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
};
