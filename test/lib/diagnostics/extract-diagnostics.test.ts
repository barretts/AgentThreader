import { describe, it, expect } from 'vitest';
import { extractDiagnosticLines } from '../../../src/lib/diagnostics/extract-diagnostics.js';

describe('extractDiagnosticLines', () => {
  it('extracts error lines with context', () => {
    const raw = [
      'Starting build...',
      'Compiling main.ts',
      'ERROR: Cannot find module "foo"',
      'at /src/main.ts:42',
      'Build finished.',
    ].join('\n');

    const result = extractDiagnosticLines(raw);
    expect(result.diagnosticText).toContain('Cannot find module');
    expect(result.diagnosticText).toContain('Compiling main.ts');
    expect(result.diagnosticText).toContain('DIAGNOSTIC LINES');
    expect(result.diagnosticText).toContain('LAST 10 LINES');
  });

  it('detects transient error patterns', () => {
    const raw = 'stream error: stream ID 15; NO_ERROR; received from peer\nDone.';
    const result = extractDiagnosticLines(raw);
    expect(result.hasTransientErrors).toBe(true);
    expect(result.transientPatterns).toContain('stream error');
  });

  it('detects ECONNREFUSED as transient', () => {
    const raw = 'Error: connect ECONNREFUSED 127.0.0.1:8080';
    const result = extractDiagnosticLines(raw);
    expect(result.hasTransientErrors).toBe(true);
    expect(result.transientPatterns).toContain('ECONNREFUSED');
  });

  it('returns no transient patterns for clean output', () => {
    const raw = 'All tests passed.\nDone in 5.2s.';
    const result = extractDiagnosticLines(raw);
    expect(result.hasTransientErrors).toBe(false);
    expect(result.transientPatterns).toEqual([]);
  });

  it('strips ANSI escapes before matching', () => {
    const raw = '\x1b[31mERROR\x1b[0m: test failed\nDone.';
    const result = extractDiagnosticLines(raw);
    expect(result.diagnosticText).toContain('ERROR: test failed');
  });

  it('caps output at 5000 characters', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `ERROR: line ${i} ${'x'.repeat(50)}`);
    const result = extractDiagnosticLines(lines.join('\n'));
    expect(result.diagnosticText.length).toBeLessThanOrEqual(5020);
  });

  it('includes last 10 lines as tail context', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`);
    const result = extractDiagnosticLines(lines.join('\n'));
    expect(result.diagnosticText).toContain('Line 19');
    expect(result.diagnosticText).toContain('Line 10');
  });
});
