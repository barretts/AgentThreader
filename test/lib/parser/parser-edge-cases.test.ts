/**
 * Parser edge cases derived from 3pp-fix-database production failures.
 *
 * These tests verify that the parser correctly handles:
 * - ANSI/OSC escape codes interleaved with sentinel markers
 * - Garbled JSON from truncated session transcripts
 * - Multiple sentinel blocks from session history
 * - Backslash-quote edge cases in JSON repair
 */
import { describe, it, expect } from 'vitest';
import {
  parseTaskResultFromString,
  parseHealDecisionFromString,
  isParserFailure,
} from '../../../src/lib/parser/parser.js';

describe('parser with ANSI-contaminated input', () => {
  it('parses sentinel with CSI color codes around it', () => {
    const input = `
\x1b[32mINFO\x1b[0m: Starting task
<<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "T1", "status": "DONE", "summary": "Fixed" }
<<<END_TASK_RESULT_V2>>>
\x1b[31mERROR\x1b[0m: some noise after
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.task_id).toBe('T1');
      expect(result.status).toBe('DONE');
    }
  });

  it('parses sentinel with OSC escape sequences interleaved (crush streaming)', () => {
    // Simulates crush's OSC progress bar sequences between tokens
    const input = `
<<<TASK\x1b]9;4;3\x07_RESULT\x1b]9;4;3\x07_V2>>>
\x1b]9;4;3\x07{ "contract_version": "2.0",\x1b]9;4;3\x07 "task_id": "T2", "status": "DONE", "summary": "OK" }\x1b]9;4;3\x07
<<<END_TASK\x1b]9;4;3\x07_RESULT\x1b]9;4;3\x07_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.task_id).toBe('T2');
    }
  });

  it('parses sentinel with ANSI dim codes in stderr format (crush session_id pattern)', () => {
    const input = `
\x1b[2mINFO\x1b[m session created
<<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "T3", "status": "DONE", "summary": "All good" }
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
  });

  it('handles bare control characters mixed with sentinel', () => {
    const input = `\x07\x04
<<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "T4", "status": "DONE", "summary": "Bell and EOT" }
<<<END_TASK_RESULT_V2>>>
\x07`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
  });
});

describe('parser with transcript poisoning scenarios', () => {
  it('uses last-block-wins when multiple sentinel blocks exist', () => {
    // Simulates session transcript contamination where a FAILED result
    // from a prior attempt appears before the real DONE result
    const input = `
--- SESSION TRANSCRIPT ---
[assistant] <<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "T5", "status": "FAILED", "summary": "old", "failure_class": "prompt_gap" }
<<<END_TASK_RESULT_V2>>>
--- END TRANSCRIPT ---

<<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "T5", "status": "DONE", "summary": "Fixed on retry" }
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.status).toBe('DONE');
      expect(result.summary).toBe('Fixed on retry');
    }
  });
});

describe('JSON repair edge cases', () => {
  it('handles escaped backslash before closing quote (lesson: json-string-escape-tracking-bug)', () => {
    const input = `
<<<TASK_RESULT_V2>>>
{
  "contract_version": "2.0",
  "task_id": "T6",
  "status": "DONE",
  "summary": "Fixed path C:\\\\Users\\\\test\\\\"
}
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.task_id).toBe('T6');
    }
  });

  it('removes JS-style comments inside JSON', () => {
    const input = `
<<<TASK_RESULT_V2>>>
{
  // This is a comment from the LLM
  "contract_version": "2.0",
  "task_id": "T7",
  "status": "DONE",
  "summary": "With comments" /* inline */
}
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
  });

  it('repairs trailing comma + removes comments together', () => {
    const input = `
<<<TASK_RESULT_V2>>>
{
  "contract_version": "2.0",
  "task_id": "T8",
  "status": "DONE",
  "summary": "Multiple repairs", // trailing comma
}
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
  });
});

describe('heal decision parser with escape contamination', () => {
  it('parses heal decision through ANSI noise', () => {
    const input = `
\x1b[33mWARN\x1b[0m: some warning
<<<HEAL_DECISION_V2>>>
{
  "contract_version": "2.0",
  "scope": "batch",
  "decision": "RETRY",
  "failure_class": "contract_error",
  "root_cause": "Missing sentinel in prompt instructions.",
  "patches": []
}
<<<END_HEAL_DECISION_V2>>>
`;
    const result = parseHealDecisionFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.decision).toBe('RETRY');
    }
  });
});
