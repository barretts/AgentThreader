/**
 * AgentThreader v2 — Shared Parser and Validator Utilities
 *
 * This module is the ONLY authority for interpreting worker and healer contracts.
 * Adapters MUST delegate to these functions rather than implementing their own parsing.
 *
 * Key behaviors:
 * - Extracts fenced JSON blocks using custom sentinels
 * - Uses "last block wins" to defeat prompt echo contamination
 * - Applies conservative JSON repair before validation
 * - Returns deterministic ParserFailure on invalid output
 */

import { readFileSync } from "node:fs";
import type {
  TaskResultV2,
  HealDecisionV2,
  ParserFailure,
  ParserErrorCode,
} from "./types.js";

// ─── Sentinels ───────────────────────────────────────────────────────────────

const TASK_RESULT_START = "<<<TASK_RESULT_V2>>>";
const TASK_RESULT_END = "<<<END_TASK_RESULT_V2>>>";
const HEAL_DECISION_START = "<<<HEAL_DECISION_V2>>>";
const HEAL_DECISION_END = "<<<END_HEAL_DECISION_V2>>>";

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract and validate a TaskResultV2 from a worker log file.
 * Uses the LAST matching fenced block to defeat prompt echo contamination.
 */
export function parseTaskResult(
  logPath: string,
): TaskResultV2 | ParserFailure {
  const raw = readFileSync(logPath, "utf8");
  return parseTaskResultFromString(raw);
}

/**
 * Extract and validate a HealDecisionV2 from a healer log file.
 * Uses the LAST matching fenced block to defeat prompt echo contamination.
 */
export function parseHealDecision(
  logPath: string,
): HealDecisionV2 | ParserFailure {
  const raw = readFileSync(logPath, "utf8");
  return parseHealDecisionFromString(raw);
}

/**
 * Parse TaskResultV2 from a raw string (useful for testing).
 */
export function parseTaskResultFromString(
  raw: string,
): TaskResultV2 | ParserFailure {
  const extracted = extractLastFencedBlock(
    raw,
    TASK_RESULT_START,
    TASK_RESULT_END,
  );
  if (!extracted) {
    return fail("NO_SENTINEL", "No <<<TASK_RESULT_V2>>> block found in output");
  }

  const repaired = repairJson(extracted);

  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (e) {
    return fail(
      "INVALID_JSON",
      `Invalid JSON in TASK_RESULT_V2 block: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validateTaskResult(parsed);
}

/**
 * Parse HealDecisionV2 from a raw string (useful for testing).
 */
export function parseHealDecisionFromString(
  raw: string,
): HealDecisionV2 | ParserFailure {
  const extracted = extractLastFencedBlock(
    raw,
    HEAL_DECISION_START,
    HEAL_DECISION_END,
  );
  if (!extracted) {
    return fail(
      "NO_SENTINEL",
      "No <<<HEAL_DECISION_V2>>> block found in output",
    );
  }

  const repaired = repairJson(extracted);

  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (e) {
    return fail(
      "INVALID_JSON",
      `Invalid JSON in HEAL_DECISION_V2 block: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validateHealDecision(parsed);
}

// ─── Sentinel Extraction ─────────────────────────────────────────────────────

/**
 * Extract the LAST matching fenced block between start and end sentinels.
 * "Last block wins" defeats prompt echo contamination.
 */
function extractLastFencedBlock(
  text: string,
  startSentinel: string,
  endSentinel: string,
): string | null {
  let lastMatch: string | null = null;
  let searchFrom = 0;

  while (true) {
    const startIdx = text.indexOf(startSentinel, searchFrom);
    if (startIdx === -1) break;

    const contentStart = startIdx + startSentinel.length;
    const endIdx = text.indexOf(endSentinel, contentStart);
    if (endIdx === -1) break;

    lastMatch = text.slice(contentStart, endIdx).trim();
    searchFrom = endIdx + endSentinel.length;
  }

  return lastMatch;
}

// ─── JSON Repair ─────────────────────────────────────────────────────────────

/**
 * Conservative JSON repair pass. Handles common LLM JSON mistakes:
 * - Strips outer markdown fences (```json ... ```)
 * - Removes trailing commas before } or ]
 * - Removes JavaScript-style single-line and multi-line comments
 */
function repairJson(raw: string): string {
  let text = raw.trim();

  // Strip outer markdown fences
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[lines.length - 1].trim() === "```") {
      // Remove first line (```json or ```) and last line (```)
      lines.shift();
      lines.pop();
      text = lines.join("\n").trim();
    }
  }

  // Remove single-line comments (// ...) — but not inside strings
  text = removeComments(text);

  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([\]}])/g, "$1");

  return text;
}

/**
 * Remove JS-style comments from JSON text while preserving string contents.
 * This is a simple state machine that tracks whether we're inside a string.
 */
function removeComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < text.length) {
    if (inString) {
      if (text[i] === "\\" && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i += 2;
        continue;
      }
      if (text[i] === '"') {
        inString = false;
      }
      result += text[i];
      i++;
    } else {
      // Check for string start
      if (text[i] === '"') {
        inString = true;
        result += text[i];
        i++;
      }
      // Check for single-line comment
      else if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "/") {
        // Skip to end of line
        while (i < text.length && text[i] !== "\n") i++;
      }
      // Check for multi-line comment
      else if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "*") {
        i += 2;
        while (
          i < text.length &&
          !(text[i] === "*" && i + 1 < text.length && text[i + 1] === "/")
        ) {
          i++;
        }
        if (i < text.length) i += 2; // skip */
      } else {
        result += text[i];
        i++;
      }
    }
  }

  return result;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_TASK_STATUSES = new Set([
  "DONE",
  "BLOCKED",
  "FAILED",
  "CONTRACT_ERROR",
]);

function validateTaskResult(data: unknown): TaskResultV2 | ParserFailure {
  if (typeof data !== "object" || data === null) {
    return fail("SCHEMA_VIOLATION", "Task result must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.contract_version !== "2.0") {
    return fail(
      "UNSUPPORTED_VERSION",
      `Expected contract_version "2.0", got "${String(obj.contract_version)}"`,
    );
  }

  for (const field of ["task_id", "status", "summary"] as const) {
    if (typeof obj[field] !== "string" || (obj[field] as string).length === 0) {
      return fail("MISSING_REQUIRED_FIELD", `Missing or empty required field: ${field}`);
    }
  }

  if (!VALID_TASK_STATUSES.has(obj.status as string)) {
    return fail(
      "SCHEMA_VIOLATION",
      `Invalid status "${String(obj.status)}". Must be one of: ${[...VALID_TASK_STATUSES].join(", ")}`,
    );
  }

  // Validate writes[] if present
  if (obj.writes !== undefined) {
    if (!Array.isArray(obj.writes)) {
      return fail("SCHEMA_VIOLATION", "writes must be an array");
    }
    for (const w of obj.writes as Array<Record<string, unknown>>) {
      if (!w.content && !w.content_ref) {
        return fail(
          "SCHEMA_VIOLATION",
          `Write entry for "${String(w.path)}" must have content or content_ref`,
        );
      }
    }
  }

  return obj as unknown as TaskResultV2;
}

const VALID_HEAL_DECISIONS = new Set(["RETRY", "ESCALATE", "NOT_FIXABLE"]);
const VALID_HEAL_SCOPES = new Set(["task", "batch", "epoch"]);

function validateHealDecision(data: unknown): HealDecisionV2 | ParserFailure {
  if (typeof data !== "object" || data === null) {
    return fail("SCHEMA_VIOLATION", "Heal decision must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.contract_version !== "2.0") {
    return fail(
      "UNSUPPORTED_VERSION",
      `Expected contract_version "2.0", got "${String(obj.contract_version)}"`,
    );
  }

  for (const field of [
    "scope",
    "decision",
    "failure_class",
    "root_cause",
  ] as const) {
    if (typeof obj[field] !== "string" || (obj[field] as string).length === 0) {
      return fail("MISSING_REQUIRED_FIELD", `Missing or empty required field: ${field}`);
    }
  }

  if (!VALID_HEAL_SCOPES.has(obj.scope as string)) {
    return fail(
      "SCHEMA_VIOLATION",
      `Invalid scope "${String(obj.scope)}". Must be one of: ${[...VALID_HEAL_SCOPES].join(", ")}`,
    );
  }

  if (!VALID_HEAL_DECISIONS.has(obj.decision as string)) {
    return fail(
      "SCHEMA_VIOLATION",
      `Invalid decision "${String(obj.decision)}". Must be one of: ${[...VALID_HEAL_DECISIONS].join(", ")}`,
    );
  }

  if (!Array.isArray(obj.patches)) {
    return fail("MISSING_REQUIRED_FIELD", "Missing required field: patches");
  }

  return obj as unknown as HealDecisionV2;
}

// ─── Failure Signature Generation ────────────────────────────────────────────

/**
 * Generate a stable failure signature from a failure class and signal.
 *
 * Algorithm (per SPEC.md §10):
 * 1. Start with the normalized failure class
 * 2. Extract the primary stable signal
 * 3. Remove timestamps, absolute paths, task IDs, and unstable numbers
 * 4. Lowercase and collapse whitespace
 * 5. Truncate to a stable maximum length
 */
export function generateFailureSignature(
  failureClass: string,
  primarySignal: string,
  maxLength = 120,
): string {
  let sig = primarySignal;

  // Remove absolute paths
  sig = sig.replace(/\/[\w./-]+/g, "<path>");

  // Remove ISO timestamps
  sig = sig.replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, "<ts>");

  // Remove standalone large numbers (likely line numbers, PIDs, etc.)
  sig = sig.replace(/\b\d{4,}\b/g, "<n>");

  // Lowercase and collapse whitespace
  sig = sig.toLowerCase().replace(/\s+/g, " ").trim();

  // Truncate
  if (sig.length > maxLength - failureClass.length - 1) {
    sig = sig.slice(0, maxLength - failureClass.length - 1);
  }

  return `${failureClass}:${sig}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fail(code: ParserErrorCode, message: string): ParserFailure {
  return { ok: false, code, message };
}

/**
 * Type guard to check if a parse result is a ParserFailure.
 */
export function isParserFailure(
  result: TaskResultV2 | HealDecisionV2 | ParserFailure,
): result is ParserFailure {
  return "ok" in result && result.ok === false;
}
