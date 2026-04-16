/**
 * Extract diagnostic lines (errors, warnings, stack traces) from raw CLI output.
 *
 * Provides the healer and human operators with actionable log fragments instead
 * of opaque error classifications like "no sentinel found."
 *
 * Lessons applied:
 *  - healer-blind-to-agent-output-high
 *  - crush-pipeline-four-output-bugs-high
 */
import { stripTermEscapes } from "../term-utils.js";

const DIAGNOSTIC_PATTERNS =
  /\b(error|erro|err|fail|fatal|exception|panic|cannot|could not|unable|refused|denied|missing|not found|no such|timeout|timed out|crash|abort|reject|invalid|undefined|null|broken|corrupt|mismatch|incompatible|deprecated|warning|warn|problem|unexpected|unhandled|traceback|stack trace|ENOENT|EACCES|EPERM|ECONNREFUSED|ETIMEDOUT|E2BIG|ENOMEM|exitcode|exit code|non-zero|killed|signal|segfault|oom)\b/i;

const TRANSIENT_ERROR_PATTERNS =
  /\b(stream error|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|fetch failed|socket hang up|network error|429|rate limit|too many requests|gateway timeout|502|503|504)\b/i;

export interface DiagnosticExtraction {
  /** Error/warning lines with small context windows, plus last 10 lines as tail. Capped at 5000 chars. */
  diagnosticText: string;
  /** Whether any transient infrastructure error patterns were detected. */
  hasTransientErrors: boolean;
  /** The specific transient error patterns found (for retry decision logic). */
  transientPatterns: string[];
}

/**
 * Extract diagnostic lines from raw CLI output.
 *
 * Strips terminal escapes, greps for error/warning keywords with 1-line context,
 * appends the last 10 non-empty lines as tail context, and caps at 5000 chars.
 */
export function extractDiagnosticLines(raw: string): DiagnosticExtraction {
  const clean = stripTermEscapes(raw);
  const lines = clean.split("\n");

  const diagnostics: string[] = [];
  const contextLines = 1;
  const seen = new Set<number>();
  const transientPatterns: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (DIAGNOSTIC_PATTERNS.test(lines[i])) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) {
        if (!seen.has(j) && lines[j].trim().length > 0) {
          seen.add(j);
          diagnostics.push(lines[j].trimEnd());
        }
      }
    }

    const transientMatch = lines[i].match(TRANSIENT_ERROR_PATTERNS);
    if (transientMatch) {
      transientPatterns.push(transientMatch[1]);
    }
  }

  const tail: string[] = [];
  for (let i = lines.length - 1; i >= 0 && tail.length < 10; i--) {
    if (lines[i].trim().length > 0) {
      tail.unshift(lines[i].trimEnd());
    }
  }

  const parts: string[] = [];
  if (diagnostics.length > 0) {
    const capped =
      diagnostics.length > 60
        ? [
            ...diagnostics.slice(0, 30),
            `... (${diagnostics.length - 60} more diagnostic lines) ...`,
            ...diagnostics.slice(-30),
          ]
        : diagnostics;
    parts.push("--- DIAGNOSTIC LINES (errors/warnings) ---");
    parts.push(...capped);
  }
  parts.push("--- LAST 10 LINES ---");
  parts.push(...tail);

  let diagnosticText = parts.join("\n");
  if (diagnosticText.length > 5000) {
    diagnosticText = diagnosticText.slice(0, 5000) + "\n... (truncated)";
  }

  return {
    diagnosticText,
    hasTransientErrors: transientPatterns.length > 0,
    transientPatterns: [...new Set(transientPatterns)],
  };
}
