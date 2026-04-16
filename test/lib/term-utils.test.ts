import { describe, it, expect } from 'vitest';
import { stripTermEscapes, hasVisibleContent } from '../../src/lib/term-utils.js';

describe('stripTermEscapes', () => {
  it('strips CSI color codes', () => {
    const input = '\x1b[31mERROR\x1b[0m: something failed';
    expect(stripTermEscapes(input)).toBe('ERROR: something failed');
  });

  it('strips OSC sequences (progress bars, title changes)', () => {
    const input = 'hello\x1b]9;4;3\x07world';
    expect(stripTermEscapes(input)).toBe('helloworld');
  });

  it('strips mixed CSI and OSC sequences', () => {
    const input = '\x1b[2msession_id\x1b[m\x1b[2m=\x1b[m9c7d69ac-aa79';
    expect(stripTermEscapes(input)).toBe('session_id=9c7d69ac-aa79');
  });

  it('strips 8-bit C1 CSI sequences', () => {
    const input = '\x9b31mtest\x9b0m';
    expect(stripTermEscapes(input)).toBe('test');
  });

  it('strips bare control characters but preserves tab and newline', () => {
    const input = 'line1\ttab\nline2\x07bell\x04eof';
    // \x07 (BEL) and \x04 (^D) are stripped; text after them remains
    expect(stripTermEscapes(input)).toBe('line1\ttab\nline2belleof');
  });

  it('returns empty string for empty input', () => {
    expect(stripTermEscapes('')).toBe('');
  });

  it('preserves clean text unchanged', () => {
    const input = 'This is clean text with no escapes.';
    expect(stripTermEscapes(input)).toBe(input);
  });

  it('handles OSC-interleaved sentinel markers', () => {
    const input = '<<<TASK\x1b]9;4;3\x07_RESULT\x1b]9;4;3\x07_V2>>>';
    expect(stripTermEscapes(input)).toBe('<<<TASK_RESULT_V2>>>');
  });
});

describe('hasVisibleContent', () => {
  it('returns true for visible text', () => {
    expect(hasVisibleContent('hello')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(hasVisibleContent('')).toBe(false);
  });

  it('returns false for whitespace only', () => {
    expect(hasVisibleContent('   \t  ')).toBe(false);
  });

  it('returns false for ANSI-only content', () => {
    expect(hasVisibleContent('\x1b[31m\x1b[0m')).toBe(false);
  });

  it('returns false for OSC-only content', () => {
    expect(hasVisibleContent('\x1b]9;4;3\x07\x1b]9;4;3\x07')).toBe(false);
  });

  it('returns true when visible chars exist among escapes', () => {
    expect(hasVisibleContent('\x1b[31mX\x1b[0m')).toBe(true);
  });
});
