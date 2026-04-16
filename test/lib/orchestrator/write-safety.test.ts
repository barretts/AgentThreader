import { describe, it, expect } from 'vitest';
import { validateWrites } from '../../../src/lib/orchestrator/write-safety.js';
import type { WriteEntry } from '../../../src/lib/contracts/types.js';

const ROOT = '/workspace/project';

describe('validateWrites', () => {
  it('accepts valid relative paths', () => {
    const writes: WriteEntry[] = [
      { path: 'src/main.ts', op: 'replace', encoding: 'utf8', content: 'code' },
    ];
    const result = validateWrites(writes, { workspaceRoot: ROOT });
    expect(result.safe).toBe(true);
  });

  it('rejects absolute paths', () => {
    const writes: WriteEntry[] = [
      { path: '/etc/passwd', op: 'replace', encoding: 'utf8', content: 'hacked' },
    ];
    const result = validateWrites(writes, { workspaceRoot: ROOT });
    expect(result.safe).toBe(false);
    expect(result.errors[0]).toContain('absolute');
  });

  it('rejects path traversal outside workspace', () => {
    const writes: WriteEntry[] = [
      { path: '../../etc/passwd', op: 'replace', encoding: 'utf8', content: 'hacked' },
    ];
    const result = validateWrites(writes, { workspaceRoot: ROOT });
    expect(result.safe).toBe(false);
    expect(result.errors[0]).toContain('escapes workspace');
  });

  it('rejects writes to protected files', () => {
    const writes: WriteEntry[] = [
      { path: 'package-lock.json', op: 'replace', encoding: 'utf8', content: '{}' },
    ];
    const result = validateWrites(writes, {
      workspaceRoot: ROOT,
      protectedPaths: ['package-lock.json'],
    });
    expect(result.safe).toBe(false);
    expect(result.errors[0]).toContain('protected');
  });

  it('detects shrinkage', () => {
    const writes: WriteEntry[] = [
      { path: 'big-file.ts', op: 'replace', encoding: 'utf8', content: 'x' },
    ];
    const existingSizes = new Map([['big-file.ts', 10000]]);
    const result = validateWrites(writes, { workspaceRoot: ROOT }, existingSizes);
    expect(result.safe).toBe(false);
    expect(result.errors[0]).toContain('Shrinkage');
  });

  it('allows shrinkage below minimum byte threshold', () => {
    const writes: WriteEntry[] = [
      { path: 'tiny.ts', op: 'replace', encoding: 'utf8', content: 'x' },
    ];
    const existingSizes = new Map([['tiny.ts', 10]]);
    const result = validateWrites(writes, { workspaceRoot: ROOT }, existingSizes);
    expect(result.safe).toBe(true);
  });

  it('rejects writes with neither content nor content_ref', () => {
    const writes: WriteEntry[] = [
      { path: 'empty.ts', op: 'create', encoding: 'utf8' },
    ];
    const result = validateWrites(writes, { workspaceRoot: ROOT });
    expect(result.safe).toBe(false);
    expect(result.errors[0]).toContain('neither content nor content_ref');
  });
});
