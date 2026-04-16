import { describe, it, expect } from 'vitest';
import { reconcileState, resetForRetry } from '../../../src/lib/state/reconcile.js';
import { DEFAULT_POLICY } from '../../../src/lib/state/types.js';
import type { StateV2 } from '../../../src/lib/state/types.js';

function makeState(taskStatuses: Record<string, string>): StateV2 {
  const tasks: StateV2['tasks'] = {};
  for (const [id, status] of Object.entries(taskStatuses)) {
    tasks[id] = {
      status: status as any,
      worker_attempts: status === 'DONE' ? 1 : 0,
      healer_attempts: 0,
      last_failure_class: null,
      last_failure_signature: null,
      last_log_tail: null,
      applied_patch_ids: [],
      history: [],
    };
  }
  return {
    state_version: '2.0',
    run_id: 'test-run',
    run_status: 'RUNNING',
    abort_reason: null,
    manifest_digest: 'abc123',
    policy: { ...DEFAULT_POLICY },
    tasks,
    healing_rounds: [],
  };
}

describe('reconcileState', () => {
  it('resets RUNNING tasks to PENDING', () => {
    const state = makeState({ a: 'RUNNING', b: 'DONE', c: 'PENDING' });
    const result = reconcileState(state, 1);
    expect(result.repaired).toBe(true);
    expect(state.tasks['a'].status).toBe('PENDING');
    expect(state.tasks['b'].status).toBe('DONE');
    expect(result.repairs).toHaveLength(1);
    expect(result.repairs[0]).toContain('RUNNING');
  });

  it('detects zero pending count with non-terminal tasks', () => {
    const state = makeState({ a: 'FAILED', b: 'DONE' });
    const result = reconcileState(state, 0);
    expect(result.repaired).toBe(true);
    expect(result.repairs.some(r => r.includes('batch index'))).toBe(true);
  });

  it('returns no repairs when state is clean', () => {
    const state = makeState({ a: 'PENDING', b: 'DONE' });
    const result = reconcileState(state, 1);
    expect(result.repaired).toBe(false);
    expect(result.repairs).toHaveLength(0);
  });
});

describe('resetForRetry', () => {
  it('resets FAILED, BLOCKED, and RUNNING to PENDING', () => {
    const state = makeState({
      a: 'FAILED',
      b: 'BLOCKED',
      c: 'RUNNING',
      d: 'DONE',
      e: 'ESCALATED',
    });
    const result = resetForRetry(state);

    expect(result.repaired).toBe(true);
    expect(state.tasks['a'].status).toBe('PENDING');
    expect(state.tasks['b'].status).toBe('PENDING');
    expect(state.tasks['c'].status).toBe('PENDING');
    expect(state.tasks['d'].status).toBe('DONE');
    expect(state.tasks['e'].status).toBe('ESCALATED');
  });

  it('resets batch size and healing rounds', () => {
    const state = makeState({ a: 'FAILED' });
    state.policy.current_batch_size = 8;
    state.healing_rounds = [{ round_number: 1, scope: 'batch', window_task_ids: ['a'], failed_task_ids: ['a'], decision: 'RETRY', applied_patch_ids: [], timestamp: '' }];
    state.run_status = 'ABORTED';

    resetForRetry(state);

    expect(state.policy.current_batch_size).toBe(1);
    expect(state.healing_rounds).toHaveLength(0);
    expect(state.run_status).toBe('RUNNING');
  });

  it('resets worker_attempts and healer_attempts', () => {
    const state = makeState({ a: 'FAILED' });
    state.tasks['a'].worker_attempts = 3;
    state.tasks['a'].healer_attempts = 2;

    resetForRetry(state);

    expect(state.tasks['a'].worker_attempts).toBe(0);
    expect(state.tasks['a'].healer_attempts).toBe(0);
  });
});
