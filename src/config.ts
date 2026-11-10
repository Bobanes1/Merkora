/** Release information and the built-in free AI access. */
export const APP_VERSION = '0.3.0';

/**
 * Free default: OpenRouter with NVIDIA Nemotron (free model). The key is NOT part of the source code:
 * it is read at build time from VITE_MERKORA_FREE_KEY (file `.env.local`, never committed).
 * Builds without it simply ask for an own key. Anyone with a built copy can read the key – keep such builds private.
 */
export const FREE_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export const FREE_KEY: string = (import.meta.env.VITE_MERKORA_FREE_KEY as string | undefined)?.trim() ?? '';
export const FREE_LABEL = 'NVIDIA Nemotron 3 Ultra (kostenlos)';
