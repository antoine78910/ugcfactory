/**
 * Preset values for ElevenLabs voice `labels` on IVC (`/v1/voices/add`).
 * API expects keys: language, accent, gender, age (see ElevenLabs docs).
 * Accent / gender / age options align with the product UI (voice library filters).
 */

/** Sentinel for “no label selected” in UI Selects (must not be sent to the API). */
export const ELEVENLABS_LABEL_SKIP = "__none__";

/**
 * Languages — common values used in the ElevenLabs voice library (display names).
 * The API stores label values as free-form strings; these match typical dashboard entries.
 */
export const ELEVENLABS_LANGUAGE_OPTIONS: readonly string[] = [
  "Afrikaans",
  "Arabic",
  "Bengali",
  "Bulgarian",
  "Chinese",
  "Croatian",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Estonian",
  "Filipino",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Latvian",
  "Lithuanian",
  "Malay",
  "Mandarin",
  "Norwegian",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Slovak",
  "Slovenian",
  "Spanish",
  "Swahili",
  "Swedish",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Urdu",
  "Vietnamese",
  "Welsh",
].sort((a, b) => a.localeCompare(b));

/**
 * Accent — matches the ElevenLabs voice-library accent filter (dashboard).
 * Includes the set shown in product UI (e.g. Acadian … Quebec, Standard) plus common regional tags.
 */
export const ELEVENLABS_ACCENT_OPTIONS: readonly string[] = [
  "Acadian",
  "African",
  "American",
  "Australian",
  "Belgian",
  "British",
  "Cajun",
  "Canadian",
  "Creole",
  "Indian",
  "Irish",
  "Meridional",
  "Parisian",
  "Quebec",
  "Scottish",
  "South African",
  "Standard",
  "Welsh",
].sort((a, b) => a.localeCompare(b));

/** Gender — ElevenLabs voice library (UI). */
export const ELEVENLABS_GENDER_OPTIONS: readonly string[] = ["Male", "Female", "Neutral"];

/** Age — ElevenLabs voice library (UI). */
export const ELEVENLABS_AGE_OPTIONS: readonly string[] = ["Young", "Middle Aged", "Old"];
