/** Release information. AI features always use the user's own API key (no built-in key). */
export const APP_VERSION = '0.7.4';

/**
 * A second AI model just for the chat (tutor, explanations, grading) – switched off for now:
 * everything runs over the one model from the settings. Saved chat-model settings stay untouched,
 * so setting this to true brings the option back.
 */
export const SECOND_MODEL = false;
