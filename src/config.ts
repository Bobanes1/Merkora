/** Release information. AI features always use the user's own API key (no built-in key). */
export const APP_VERSION = '0.8.4';

/**
 * A second AI model just for the chat (tutor, explanations, grading) – switched off for now:
 * everything runs over the one model from the settings. Saved chat-model settings stay untouched,
 * so setting this to true brings the option back.
 */
export const SECOND_MODEL = false;

/**
 * Pictures of PDF slides on AI cards ("Modelle und Abbildungen aus PDF-Folien") – switched off for now:
 * no slide detection, no checkbox, no setting. Cards that already have a slide picture keep it.
 * Setting this to true brings the feature back (the saved setting stays untouched).
 */
export const SLIDE_FIGURES = false;
