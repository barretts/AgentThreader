import { describe, it, expect } from 'vitest';
import { checkWindowFatalTransient } from '../../../src/lib/orchestrator/healing-policy.js';
import type { TaskState } from '../../../src/lib/state/types.js';

function ts(status: TaskState['status'], cls: string | null = null): TaskState {
  return {
    status,
    worker_attempts: 0,
    healer_attempts: 0,
    last_failure_class: cls,
    last_failure_signature: null,
    last_log_tail: null,
    applied_patch_ids: [],
    history: [],
  };
}

describe('checkWindowFatalTransient', () => {
  it('returns fatal=false when no task carries a fatal subtype', () => {
    const outcome = {
      windowTaskIds: ['a', 'b'],
      taskStates: {
        a: ts('DONE'),
        b: ts('FAILED', 'test_error'),
      },
    };
    const r = checkWindowFatalTransient(outcome);
    expect(r.fatal).toBe(false);
    expect(r.taskIds).toEqual([]);
    expect(r.subtype).toBeNull();
  });

  it('detects api_auth_blocked as fatal', () => {
    const outcome = {
      windowTaskIds: ['a', 'b'],
      taskStates: {
        a: ts('FAILED', 'transient_infra:api_auth_blocked'),
        b: ts('FAILED', 'test_error'),
      },
    };
    const r = checkWindowFatalTransient(outcome);
    expect(r.fatal).toBe(true);
    expect(r.subtype).toBe('transient_infra:api_auth_blocked');
    expect(r.taskIds).toEqual(['a']);
    expect(r.reason).toContain('operator action required');
  });

  it('collects every matching task and remembers the first subtype seen', () => {
    const outcome = {
      windowTaskIds: ['a', 'b', 'c'],
      taskStates: {
        a: ts('FAILED', 'transient_infra:tool_unavailable'),
        b: ts('FAILED', 'transient_infra:api_auth_blocked'),
        c: ts('FAILED', 'transient_infra:tool_unavailable'),
      },
    };
    const r = checkWindowFatalTransient(outcome);
    expect(r.fatal).toBe(true);
    expect(r.subtype).toBe('transient_infra:tool_unavailable');
    expect(r.taskIds).toEqual(['a', 'b', 'c']);
  });

  it('respects a caller-supplied fatal set', () => {
    const outcome = {
      windowTaskIds: ['a'],
      taskStates: { a: ts('FAILED', 'custom:bad') },
    };
    const r = checkWindowFatalTransient(outcome, new Set(['custom:bad']));
    expect(r.fatal).toBe(true);
    expect(r.subtype).toBe('custom:bad');
  });

  it('ignores non-fatal transient_infra classes (coarse class alone is not fatal)', () => {
    const outcome = {
      windowTaskIds: ['a'],
      taskStates: { a: ts('FAILED', 'transient_infra') },
    };
    const r = checkWindowFatalTransient(outcome);
    expect(r.fatal).toBe(false);
  });
});
