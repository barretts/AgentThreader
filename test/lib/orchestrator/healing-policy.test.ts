import { describe, it, expect } from 'vitest';
import {
  isHealableFailure,
  computeFailureRate,
  shouldHeal,
  checkConvergence,
  shouldEscalateTask,
  shouldAbortRun,
} from '../../../src/lib/orchestrator/healing-policy.js';
import type { TaskState, RunPolicy } from '../../../src/lib/state/types.js';
import { DEFAULT_POLICY } from '../../../src/lib/state/types.js';

function makeTaskState(
  status: TaskState['status'],
  failureClass: string | null = null,
  failureSignature: string | null = null,
  workerAttempts = 0,
): TaskState {
  return {
    status,
    worker_attempts: workerAttempts,
    healer_attempts: 0,
    last_failure_class: failureClass,
    last_failure_signature: failureSignature,
    last_log_tail: null,
    applied_patch_ids: [],
    history: [],
  };
}

describe('isHealableFailure', () => {
  it('prompt_gap is healable', () => expect(isHealableFailure('prompt_gap')).toBe(true));
  it('contract_error is healable', () => expect(isHealableFailure('contract_error')).toBe(true));
  it('real_bug is not healable', () => expect(isHealableFailure('real_bug')).toBe(false));
  it('blocked_external is not healable', () => expect(isHealableFailure('blocked_external')).toBe(false));
  it('null is not healable', () => expect(isHealableFailure(null)).toBe(false));
});

describe('computeFailureRate', () => {
  it('returns 0 when no healable failures', () => {
    const result = computeFailureRate({
      windowTaskIds: ['A', 'B'],
      taskStates: {
        A: makeTaskState('DONE', 'prompt_gap'),
        B: makeTaskState('DONE', 'prompt_gap'),
      },
    });
    expect(result.rate).toBe(0);
  });

  it('returns correct rate for mixed window', () => {
    const result = computeFailureRate({
      windowTaskIds: ['A', 'B', 'C', 'D'],
      taskStates: {
        A: makeTaskState('DONE', 'prompt_gap'),
        B: makeTaskState('FAILED', 'prompt_gap'),
        C: makeTaskState('DONE', 'prompt_gap'),
        D: makeTaskState('BLOCKED', 'blocked_external'),
      },
    });
    // 3 healable attempted (A, B, C), 1 healable failed (B)
    expect(result.rate).toBeCloseTo(1 / 3);
    expect(result.shouldSkipHealer).toBe(false);
  });

  it('skips healer when no healable tasks in window', () => {
    const result = computeFailureRate({
      windowTaskIds: ['A'],
      taskStates: {
        A: makeTaskState('BLOCKED', 'blocked_external'),
      },
    });
    expect(result.shouldSkipHealer).toBe(true);
  });
});

describe('shouldHeal', () => {
  it('returns false when healing is off', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, heal_schedule: 'off' };
    const result = shouldHeal({
      windowOutcome: { windowTaskIds: ['A'], taskStates: { A: makeTaskState('FAILED', 'prompt_gap') } },
      policy,
      healingRounds: [],
    });
    expect(result.shouldHeal).toBe(false);
  });

  it('returns abort when budget exhausted', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, max_total_heal_rounds: 2 };
    const result = shouldHeal({
      windowOutcome: { windowTaskIds: ['A'], taskStates: { A: makeTaskState('FAILED', 'prompt_gap') } },
      policy,
      healingRounds: [{} as never, {} as never],
    });
    expect(result.shouldAbort).toBe(true);
  });
});

describe('checkConvergence', () => {
  it('first round is always converging', () => {
    const result = checkConvergence(
      { failedTaskIds: ['A'], signatures: new Set(['sig1']) },
      null,
    );
    expect(result.converging).toBe(true);
  });

  it('detects convergence when fail count drops', () => {
    const result = checkConvergence(
      { failedTaskIds: ['A'], signatures: new Set(['sig1']) },
      { failedTaskIds: ['A', 'B'], signatures: new Set(['sig1', 'sig2']) },
    );
    expect(result.converging).toBe(true);
  });

  it('detects non-convergence when same set persists', () => {
    const result = checkConvergence(
      { failedTaskIds: ['A', 'B'], signatures: new Set(['sig1']) },
      { failedTaskIds: ['A', 'B'], signatures: new Set(['sig1']) },
    );
    expect(result.converging).toBe(false);
  });
});

describe('shouldEscalateTask', () => {
  it('escalates non-healable failures', () => {
    const ts = makeTaskState('FAILED', 'real_bug');
    const result = shouldEscalateTask(ts, DEFAULT_POLICY);
    expect(result.escalate).toBe(true);
  });

  it('does not escalate within limits', () => {
    const ts = makeTaskState('FAILED', 'prompt_gap', null, 1);
    const result = shouldEscalateTask(ts, DEFAULT_POLICY);
    expect(result.escalate).toBe(false);
  });
});

describe('shouldAbortRun', () => {
  it('aborts when heal budget exhausted', () => {
    const rounds = Array.from({ length: 8 }, () => ({} as never));
    const result = shouldAbortRun(DEFAULT_POLICY, rounds, {});
    expect(result.abort).toBe(true);
  });

  it('does not abort when budget remains', () => {
    const result = shouldAbortRun(DEFAULT_POLICY, [], {
      A: makeTaskState('PENDING'),
    });
    expect(result.abort).toBe(false);
  });
});
