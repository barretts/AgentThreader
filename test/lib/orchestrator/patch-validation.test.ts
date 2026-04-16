import { describe, it, expect } from 'vitest';
import { validatePatch, validatePatchSet } from '../../../src/lib/orchestrator/patch-validation.js';
import type { HealPatch } from '../../../src/lib/contracts/types.js';

describe('validatePatch', () => {
  it('accepts valid shared_context patch in batch scope', () => {
    const patch: HealPatch = { target: 'shared_context', operation: 'append', content: 'hint' };
    const result = validatePatch(patch, ['A', 'B'], 'batch');
    expect(result.valid).toBe(true);
  });

  it('rejects shared_context in task scope', () => {
    const patch: HealPatch = { target: 'shared_context', operation: 'append', content: 'hint' };
    const result = validatePatch(patch, ['A'], 'task');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Task-scope healer cannot modify shared context');
  });

  it('rejects task_prompt for out-of-window task in task scope', () => {
    const patch: HealPatch = { target: 'task_prompt', operation: 'replace', task_id: 'X', content: 'new' };
    const result = validatePatch(patch, ['A', 'B'], 'task');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('outside window');
  });

  it('accepts task_prompt for in-window task', () => {
    const patch: HealPatch = { target: 'task_prompt', operation: 'replace', task_id: 'A', content: 'new' };
    const result = validatePatch(patch, ['A', 'B'], 'task');
    expect(result.valid).toBe(true);
  });

  it('rejects forbidden runtime keys', () => {
    const patch: HealPatch = { target: 'runtime_patch', operation: 'merge', content: { heal_schedule: 'off' } };
    const result = validatePatch(patch, ['A'], 'batch');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('forbidden key');
  });

  it('accepts allowed runtime keys', () => {
    const patch: HealPatch = { target: 'runtime_patch', operation: 'merge', content: { timeout_sec: 600 } };
    const result = validatePatch(patch, ['A'], 'batch');
    expect(result.valid).toBe(true);
  });

  it('warns on unknown runtime keys', () => {
    const patch: HealPatch = { target: 'runtime_patch', operation: 'merge', content: { unknown_key: 42 } };
    const result = validatePatch(patch, ['A'], 'batch');
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(1);
  });
});

describe('validatePatchSet', () => {
  it('validates all patches and aggregates errors', () => {
    const patches: HealPatch[] = [
      { target: 'shared_context', operation: 'append', content: 'ok' },
      { target: 'shared_context', operation: 'append', content: 'fail' },
    ];
    const result = validatePatchSet(patches, ['A'], 'task');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it('passes when all patches are valid', () => {
    const patches: HealPatch[] = [
      { target: 'task_prompt', operation: 'replace', task_id: 'A', content: 'fix' },
      { target: 'contract_hint', operation: 'append', content: 'hint' },
    ];
    const result = validatePatchSet(patches, ['A'], 'task');
    expect(result.valid).toBe(true);
  });
});
