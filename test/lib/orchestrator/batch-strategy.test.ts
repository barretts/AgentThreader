import { describe, it, expect } from 'vitest';
import {
  growBatchSize, shrinkBatchSize, computeEffectiveWindowSize,
} from '../../../src/lib/orchestrator/batch-strategy.js';
import { DEFAULT_POLICY } from '../../../src/lib/state/types.js';
import type { RunPolicy } from '../../../src/lib/state/types.js';

describe('growBatchSize', () => {
  it('grows from 1 to 2 in fibonacci', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, current_batch_size: 1 };
    const result = growBatchSize(policy);
    expect(result.nextBatchSize).toBe(2);
  });

  it('grows through fibonacci sequence', () => {
    const sizes = [1, 2, 3, 5, 8, 13];
    for (let i = 0; i < sizes.length - 1; i++) {
      const policy: RunPolicy = { ...DEFAULT_POLICY, current_batch_size: sizes[i] };
      expect(growBatchSize(policy).nextBatchSize).toBe(sizes[i + 1]);
    }
  });

  it('stays at max fibonacci step', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, current_batch_size: 13 };
    expect(growBatchSize(policy).nextBatchSize).toBe(13);
  });

  it('no growth for fixed strategy', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, batch_strategy: 'fixed', current_batch_size: 5 };
    expect(growBatchSize(policy).nextBatchSize).toBe(5);
  });

  it('snaps to nearest fibonacci when current is non-standard', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, current_batch_size: 4 };
    const result = growBatchSize(policy);
    expect(result.nextBatchSize).toBe(5);
  });
});

describe('shrinkBatchSize', () => {
  it('shrinks from 5 to 3', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, current_batch_size: 5 };
    expect(shrinkBatchSize(policy).nextBatchSize).toBe(3);
  });

  it('cannot shrink below 1', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, current_batch_size: 1 };
    expect(shrinkBatchSize(policy).nextBatchSize).toBe(1);
  });

  it('no shrink for fixed strategy', () => {
    const policy: RunPolicy = { ...DEFAULT_POLICY, batch_strategy: 'fixed', current_batch_size: 5 };
    expect(shrinkBatchSize(policy).nextBatchSize).toBe(5);
  });
});

describe('computeEffectiveWindowSize', () => {
  it('returns batch size when enough tasks', () => {
    expect(computeEffectiveWindowSize(5, 10)).toBe(5);
  });

  it('returns task count when fewer than batch size', () => {
    expect(computeEffectiveWindowSize(10, 3)).toBe(3);
  });

  it('returns 0 when no tasks', () => {
    expect(computeEffectiveWindowSize(5, 0)).toBe(0);
  });
});
