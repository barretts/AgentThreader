import { describe, expect, it } from 'vitest';
import { explainErrorCode, listKnownErrorCodes } from '../../../src/lib/errors/explain-error.js';

describe('explainErrorCode', () => {
  it('returns parser explanation for known code', () => {
    const result = explainErrorCode('no_sentinel');
    expect(result?.code).toBe('NO_SENTINEL');
    expect(result?.category).toBe('parser');
  });

  it('returns undefined for unknown code', () => {
    expect(explainErrorCode('NOT_A_REAL_CODE')).toBeUndefined();
  });
});

describe('listKnownErrorCodes', () => {
  it('includes both app and parser codes', () => {
    const known = listKnownErrorCodes();
    expect(known).toContain('CONFIG_ERROR');
    expect(known).toContain('SCHEMA_VIOLATION');
  });
});
