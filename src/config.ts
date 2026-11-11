/** Release information and the built-in free AI access. */
export const APP_VERSION = '0.5.0';

/**
 * Free default: OpenRouter with NVIDIA Nemotron (free model). The key is NOT part of the source code:
 * it is read at build time from VITE_MERKORA_FREE_KEY (file `.env.local`, never committed).
 * Builds without it simply ask for an own key. Anyone with a built copy can read the key – keep such builds private.
 */
// Tested 2026-11-11: Nemotron 3 Ultra mostly returned empty replies or gibberish; 3.5 Super answered reliably in ~3 s.
export const FREE_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
/** Used on the last retry when the main free model fails (slower, but reliable). */
export const FREE_FALLBACK_MODEL = 'nvidia/nemotron-3.5-lightning:free';
export const FREE_KEY: string = (import.meta.env.VITE_MERKORA_FREE_KEY as string | undefined)?.trim() ?? '';
export const FREE_LABEL = 'NVIDIA Nemotron 3.5 Super (kostenlos)';
