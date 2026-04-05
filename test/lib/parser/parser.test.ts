import { describe, it, expect } from 'vitest';
import {
  parseTaskResultFromString,
  parseHealDecisionFromString,
  generateFailureSignature,
  isParserFailure,
} from '../../../src/lib/parser/parser.js';

describe('parseTaskResultFromString', () => {
  it('parses a valid task result', () => {
    const input = `
Some model prose here.
<<<TASK_RESULT_V2>>>
{
  "contract_version": "2.0",
  "task_id": "WP-017",
  "status": "DONE",
  "summary": "Fixed the button component."
}
<<<END_TASK_RESULT_V2>>>
More prose.
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.task_id).toBe('WP-017');
      expect(result.status).toBe('DONE');
    }
  });

  it('uses last block wins for prompt echo contamination', () => {
    const input = `
<<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "echo", "status": "FAILED", "summary": "echo" }
<<<END_TASK_RESULT_V2>>>
<<<TASK_RESULT_V2>>>
{ "contract_version": "2.0", "task_id": "real", "status": "DONE", "summary": "real result" }
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.task_id).toBe('real');
    }
  });

  it('returns NO_SENTINEL when fences are missing', () => {
    const result = parseTaskResultFromString('no fences here');
    expect(isParserFailure(result)).toBe(true);
    if (isParserFailure(result)) {
      expect(result.code).toBe('NO_SENTINEL');
    }
  });

  it('repairs trailing commas in JSON', () => {
    const input = `
<<<TASK_RESULT_V2>>>
{
  "contract_version": "2.0",
  "task_id": "WP-018",
  "status": "DONE",
  "summary": "Fixed it",
}
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
  });

  it('strips markdown code fences inside sentinel block', () => {
    const input = `
<<<TASK_RESULT_V2>>>
\`\`\`json
{
  "contract_version": "2.0",
  "task_id": "WP-019",
  "status": "DONE",
  "summary": "Stripped fences"
}
\`\`\`
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(false);
  });

  it('returns UNSUPPORTED_VERSION for wrong contract version', () => {
    const input = `
<<<TASK_RESULT_V2>>>
{ "contract_version": "1.0", "task_id": "X", "status": "DONE", "summary": "old" }
<<<END_TASK_RESULT_V2>>>
`;
    const result = parseTaskResultFromString(input);
    expect(isParserFailure(result)).toBe(true);
    if (isParserFailure(result)) {
      expect(result.code).toBe('UNSUPPORTED_VERSION');
    }
  });
});

describe('parseHealDecisionFromString', () => {
  it('parses a valid heal decision', () => {
    const input = `
<<<HEAL_DECISION_V2>>>
{
  "contract_version": "2.0",
  "scope": "batch",
  "decision": "RETRY",
  "failure_class": "prompt_gap",
  "root_cause": "Missing import convention.",
  "patches": []
}
<<<END_HEAL_DECISION_V2>>>
`;
    const result = parseHealDecisionFromString(input);
    expect(isParserFailure(result)).toBe(false);
    if (!isParserFailure(result)) {
      expect(result.decision).toBe('RETRY');
      expect(result.failure_class).toBe('prompt_gap');
    }
  });
});

describe('generateFailureSignature', () => {
  it('normalizes paths and timestamps', () => {
    const sig = generateFailureSignature('build_error', 'Cannot find /Users/foo/bar.ts at 2026-03-20T15:21:00Z');
    expect(sig).toContain('build_error:');
    expect(sig).not.toContain('/Users/foo/bar.ts');
    expect(sig).not.toContain('2026-03-20');
  });

  it('truncates long signals', () => {
    const sig = generateFailureSignature('test_error', 'a'.repeat(200));
    expect(sig.length).toBeLessThanOrEqual(120);
  });
});
