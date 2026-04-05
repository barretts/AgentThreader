import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../../src/lib/diagnostics/doctor.js';

describe('runDoctor', () => {
  it('returns structured checks with stable ids', () => {
    const result = runDoctor();
    const ids = result.checks.map((check) => check.id);

    expect(ids).toContain('node_version');
    expect(ids).toContain('npm_available');
    expect(ids).toContain('home_writable');
    expect(ids).toContain('install_script_sync');
    expect(ids).toContain('compiled_artifacts');
  });

  it('reports ok only when no fatal checks', () => {
    const result = runDoctor();
    const hasFatal = result.checks.some((check) => check.status === 'fail');
    expect(result.ok).toBe(!hasFatal);
  });
});
