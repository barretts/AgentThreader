/**
 * Sentinel marker sanitization to prevent transcript poisoning.
 *
 * When appending supplementary content (session transcripts, diagnostic
 * summaries, healer feedback) to the same output stream that the parser
 * scans for sentinel markers, all sentinel markers in the supplementary
 * text must be redacted. Otherwise the parser may cross-pair a START from
 * the transcript with an END from raw stdout, producing garbled JSON.
 *
 * Lessons applied:
 *  - session-transcript-sentinel-poisoning-critical
 *  - file-check-fallback-scope-medium
 */

const SENTINEL_MARKERS = [
  "<<<TASK_RESULT_V2>>>",
  "<<<END_TASK_RESULT_V2>>>",
  "<<<HEAL_DECISION_V2>>>",
  "<<<END_HEAL_DECISION_V2>>>",
] as const;

const SENTINEL_MARKERS_RE = new RegExp(
  SENTINEL_MARKERS.map((s) => s.replace(/[<>]/g, (c) => `\\${c}`)).join("|"),
  "g",
);

/**
 * Replace all sentinel markers in a string with `[SENTINEL_REDACTED]`.
 *
 * Use this on session transcripts, diagnostic summaries, or any supplementary
 * text before appending it to the output stream that the parser will scan.
 */
export function sanitizeSentinels(text: string): string {
  return text.replace(SENTINEL_MARKERS_RE, "[SENTINEL_REDACTED]");
}

/**
 * Truncate text to a maximum length and sanitize sentinel markers.
 *
 * Typical usage: formatting transcript text parts before inclusion in
 * combined output streams.
 */
export function sanitizeAndTruncate(text: string, maxLength = 300): string {
  return sanitizeSentinels(text.slice(0, maxLength));
}
