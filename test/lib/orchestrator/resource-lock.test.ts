import { describe, it, expect } from 'vitest';
import { ResourceLockRegistry } from '../../../src/lib/orchestrator/concurrency.js';

describe('ResourceLockRegistry', () => {
  it('serializes same-key holders in FIFO order', async () => {
    const reg = new ResourceLockRegistry();
    const log: string[] = [];

    const a = reg.withLock('repo-1', async () => {
      log.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a-end');
    });
    const b = reg.withLock('repo-1', async () => {
      log.push('b-start');
      log.push('b-end');
    });

    await Promise.all([a, b]);
    expect(log).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('does not serialize across different keys', async () => {
    const reg = new ResourceLockRegistry();
    let active = 0;
    let maxActive = 0;

    const task = (key: string) =>
      reg.withLock(key, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });

    await Promise.all([task('a'), task('b'), task('c')]);
    expect(maxActive).toBe(3);
  });

  it('releases the slot after a holder throws (no poison)', async () => {
    const reg = new ResourceLockRegistry();
    const log: string[] = [];

    const failing = reg.withLock('k', async () => {
      log.push('failing');
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');

    await reg.withLock('k', async () => {
      log.push('next');
    });

    expect(log).toEqual(['failing', 'next']);
  });

  it('runs without locking when key is null/undefined/empty', async () => {
    const reg = new ResourceLockRegistry();
    const log: string[] = [];
    await Promise.all([
      reg.withLock(null, async () => {
        log.push('n-start');
        await new Promise((r) => setTimeout(r, 5));
        log.push('n-end');
      }),
      reg.withLock(undefined, async () => {
        log.push('u');
      }),
      reg.withLock('', async () => {
        log.push('e');
      }),
    ]);
    // Non-locking calls can interleave; we only assert all three ran.
    expect(log.sort()).toEqual(['e', 'n-end', 'n-start', 'u']);
  });

  it('returns the wrapped function result', async () => {
    const reg = new ResourceLockRegistry();
    const result = await reg.withLock('k', async () => 42);
    expect(result).toBe(42);
  });
});
