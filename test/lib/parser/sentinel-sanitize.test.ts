import { describe, it, expect } from 'vitest';
import { sanitizeSentinels, sanitizeAndTruncate } from '../../../src/lib/parser/sentinel-sanitize.js';

describe('sanitizeSentinels', () => {
  it('redacts TASK_RESULT_V2 start sentinel', () => {
    const input = 'before <<<TASK_RESULT_V2>>> after';
    expect(sanitizeSentinels(input)).toBe('before [SENTINEL_REDACTED] after');
  });

  it('redacts TASK_RESULT_V2 end sentinel', () => {
    const input = 'before <<<END_TASK_RESULT_V2>>> after';
    expect(sanitizeSentinels(input)).toBe('before [SENTINEL_REDACTED] after');
  });

  it('redacts HEAL_DECISION_V2 sentinels', () => {
    const input = '<<<HEAL_DECISION_V2>>>json<<<END_HEAL_DECISION_V2>>>';
    expect(sanitizeSentinels(input)).toBe('[SENTINEL_REDACTED]json[SENTINEL_REDACTED]');
  });

  it('redacts multiple occurrences', () => {
    const input = '<<<TASK_RESULT_V2>>>first<<<END_TASK_RESULT_V2>>> <<<TASK_RESULT_V2>>>second<<<END_TASK_RESULT_V2>>>';
    const result = sanitizeSentinels(input);
    expect(result).not.toContain('<<<TASK_RESULT_V2>>>');
    expect(result).not.toContain('<<<END_TASK_RESULT_V2>>>');
    expect(result).toContain('first');
    expect(result).toContain('second');
  });

  it('leaves text without sentinels unchanged', () => {
    const input = 'This is regular text with no sentinel markers.';
    expect(sanitizeSentinels(input)).toBe(input);
  });
});

describe('sanitizeAndTruncate', () => {
  it('truncates and sanitizes', () => {
    const input = '<<<TASK_RESULT_V2>>>' + 'x'.repeat(400);
    const result = sanitizeAndTruncate(input, 300);
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result).not.toContain('<<<TASK_RESULT_V2>>>');
  });

  it('handles short inputs without truncation', () => {
    const input = 'short text';
    expect(sanitizeAndTruncate(input)).toBe('short text');
  });
});
