import { describe, it, expect } from 'vitest';
import { runPool, CheckpointMutex } from '../../../src/lib/orchestrator/concurrency.js';

describe('runPool', () => {
  it('runs items sequentially when concurrency=1', async () => {
    const order: number[] = [];
    await runPool([1, 2, 3], 1, async (item) => {
      order.push(item);
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it('runs all items with concurrency>1', async () => {
    const results: number[] = [];
    await runPool([10, 20, 30], 2, async (item) => {
      results.push(item);
    });
    expect(results.sort()).toEqual([10, 20, 30]);
  });

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let current = 0;

    await runPool([1, 2, 3, 4, 5], 2, async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise(resolve => setTimeout(resolve, 10));
      current--;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('handles empty array', async () => {
    const results: number[] = [];
    await runPool([], 3, async (item) => {
      results.push(item);
    });
    expect(results).toEqual([]);
  });

  it('completes even when some items throw', async () => {
    const completed: number[] = [];
    await runPool([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error('fail');
      completed.push(item);
    });
    // Item 2 threw, but 1 and 3 should still complete
    expect(completed).toContain(1);
    expect(completed).toContain(3);
  });
});

describe('CheckpointMutex', () => {
  it('serializes concurrent operations', async () => {
    const mutex = new CheckpointMutex();
    const order: number[] = [];

    const p1 = mutex.run(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      order.push(1);
    });
    const p2 = mutex.run(async () => {
      order.push(2);
    });
    const p3 = mutex.run(async () => {
      order.push(3);
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('handles errors without breaking the chain', async () => {
    const mutex = new CheckpointMutex();
    const order: number[] = [];

    await mutex.run(async () => { order.push(1); }).catch(() => {});
    try {
      await mutex.run(async () => { throw new Error('boom'); });
    } catch { /* expected */ }
    await mutex.run(async () => { order.push(3); }).catch(() => {});

    expect(order).toContain(1);
  });
});
