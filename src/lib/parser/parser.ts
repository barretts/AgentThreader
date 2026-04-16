import { readFileSync } from "node:fs";
import type {
  TaskResultV2,
  HealDecisionV2,
  ParserFailure,
  ParserErrorCode,
} from "../contracts/types.js";
import { validateTaskResultSchema, validateHealDecisionSchema } from "../contracts/schema-validator.js";
import { stripTermEscapes } from "../term-utils.js";

const TASK_RESULT_START = "<<<TASK_RESULT_V2>>>";
const TASK_RESULT_END = "<<<END_TASK_RESULT_V2>>>";
const HEAL_DECISION_START = "<<<HEAL_DECISION_V2>>>";
const HEAL_DECISION_END = "<<<END_HEAL_DECISION_V2>>>";

export function parseTaskResult(
  logPath: string,
): TaskResultV2 | ParserFailure {
  const raw = readFileSync(logPath, "utf8");
  return parseTaskResultFromString(raw);
}

export function parseHealDecision(
  logPath: string,
): HealDecisionV2 | ParserFailure {
  const raw = readFileSync(logPath, "utf8");
  return parseHealDecisionFromString(raw);
}

export function parseTaskResultFromString(
  raw: string,
): TaskResultV2 | ParserFailure {
  const cleaned = stripTermEscapes(raw);
  const extracted = extractLastFencedBlock(cleaned, TASK_RESULT_START, TASK_RESULT_END);
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

export function parseHealDecisionFromString(
  raw: string,
): HealDecisionV2 | ParserFailure {
  const cleaned = stripTermEscapes(raw);
  const extracted = extractLastFencedBlock(cleaned, HEAL_DECISION_START, HEAL_DECISION_END);
  if (!extracted) {
    return fail("NO_SENTINEL", "No <<<HEAL_DECISION_V2>>> block found in output");
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

function extractLastFencedBlock(
  text: string,
  startSentinel: string,
  endSentinel: string,
): string | null {
  let lastMatch: string | null = null;
  let searchFrom = 0;

  for (;;) {
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

function repairJson(raw: string): string {
  let text = raw.trim();

  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[lines.length - 1].trim() === "```") {
      lines.shift();
      lines.pop();
      text = lines.join("\n").trim();
    }
  }

  text = removeComments(text);
  text = text.replace(/,\s*([\]}])/g, "$1");

  return text;
}

function removeComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < text.length) {
    if (inString) {
      if (text[i] === '"') {
        let backslashes = 0;
        for (let j = i - 1; j >= 0 && text[j] === "\\"; j--) backslashes++;
        if (backslashes % 2 === 0) {
          inString = false;
        }
      }
      result += text[i];
      i++;
    } else {
      if (text[i] === '"') {
        inString = true;
        result += text[i];
        i++;
      } else if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
      } else if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && i + 1 < text.length && text[i + 1] === "/")) {
          i++;
        }
        if (i < text.length) i += 2;
      } else {
        result += text[i];
        i++;
      }
    }
  }

  return result;
}

function validateTaskResult(data: unknown): TaskResultV2 | ParserFailure {
  if (typeof data !== "object" || data === null) {
    return fail("SCHEMA_VIOLATION", "Task result must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.contract_version !== "2.0") {
    return fail("UNSUPPORTED_VERSION", `Expected contract_version "2.0", got "${String(obj.contract_version)}"`);
  }

  const schemaResult = validateTaskResultSchema(data);
  if (!schemaResult.valid) {
    const first = schemaResult.errors[0];
    const code: ParserErrorCode = first?.keyword === "required" ? "MISSING_REQUIRED_FIELD" : "SCHEMA_VIOLATION";
    return fail(code, schemaResult.errors.map(e => `${e.path}: ${e.message}`).join("; "));
  }

  return data as TaskResultV2;
}

function validateHealDecision(data: unknown): HealDecisionV2 | ParserFailure {
  if (typeof data !== "object" || data === null) {
    return fail("SCHEMA_VIOLATION", "Heal decision must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.contract_version !== "2.0") {
    return fail("UNSUPPORTED_VERSION", `Expected contract_version "2.0", got "${String(obj.contract_version)}"`);
  }

  const schemaResult = validateHealDecisionSchema(data);
  if (!schemaResult.valid) {
    const first = schemaResult.errors[0];
    const code: ParserErrorCode = first?.keyword === "required" ? "MISSING_REQUIRED_FIELD" : "SCHEMA_VIOLATION";
    return fail(code, schemaResult.errors.map(e => `${e.path}: ${e.message}`).join("; "));
  }

  return data as HealDecisionV2;
}

export function generateFailureSignature(
  failureClass: string,
  primarySignal: string,
  maxLength = 120,
): string {
  let sig = primarySignal;
  sig = sig.replace(/\/[\w./-]+/g, "<path>");
  sig = sig.replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, "<ts>");
  sig = sig.replace(/\b\d{4,}\b/g, "<n>");
  sig = sig.toLowerCase().replace(/\s+/g, " ").trim();

  if (sig.length > maxLength - failureClass.length - 1) {
    sig = sig.slice(0, maxLength - failureClass.length - 1);
  }

  return `${failureClass}:${sig}`;
}

function fail(code: ParserErrorCode, message: string): ParserFailure {
  return { ok: false, code, message };
}

export function isParserFailure(
  result: TaskResultV2 | HealDecisionV2 | ParserFailure,
): result is ParserFailure {
  return "ok" in result && result.ok === false;
}
