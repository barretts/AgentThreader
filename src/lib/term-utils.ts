/**
 * Shared terminal escape sequence stripping and visible-content detection.
 *
 * Covers:
 *  - CSI sequences  (ESC [ params letter)
 *  - OSC sequences  (ESC ] ... BEL  or  ESC ] ... ST)
 *  - Other 2-3 char ESC sequences (ESC char, ESC ( char, etc.)
 *  - 8-bit C1 CSI   (0x9B params letter)
 *  - Bare control chars (0x00-0x08, 0x0B-0x1F, 0x7F) -- preserves TAB (0x09) and LF (0x0A)
 *
 * Lessons applied:
 *  - ansi-ghost-lines-in-pty-output-low
 *  - osc-escape-sequences-bypass-ansi-filter-medium
 *  - crush-pipeline-four-output-bugs-high (issue 1 & 2)
 *  - crush-session-persistence-across-steps-medium
 */
const TERM_ESCAPE_RE =
  /\x1b(?:\[[0-9;?]*[A-Za-z~]|\][^\x07]*\x07|\][^\x1b]*\x1b\\|[^\[\]].?)|\x9b[0-9;?]*[A-Za-z~]|[\x00-\x08\x0b-\x1f\x7f]/g;

/** Strip all terminal escape sequences and control characters from a string. */
export function stripTermEscapes(s: string): string {
  return s.replace(TERM_ESCAPE_RE, "");
}

/** Returns true if the line contains at least one printable non-whitespace character after stripping escapes. */
export function hasVisibleContent(line: string): boolean {
  return stripTermEscapes(line).trim().length > 0;
}
