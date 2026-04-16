/**
 * Concurrency primitives for parallel task execution.
 *
 * Lessons applied:
 *  - parallel-agent-execution-medium (async pool, checkpoint mutex)
 *  - zombie-orchestrator-state-corruption-critical (serialized state writes)
 */

/**
 * Run an async function over a list of items with bounded concurrency.
 *
 * Uses a sliding-window `Promise.race` pool. Falls back to sequential
 * execution when `concurrency <= 1`, adding zero overhead for the default case.
 *
 * The hard part is not the pool -- it is the shared mutable state. Every
 * `await` in a concurrent code path is a potential interleaving point.
 * Callers must serialize access to shared state (see `CheckpointMutex`).
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (concurrency <= 1) {
    for (const item of items) await fn(item);
    return;
  }

  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled(executing);
}

/**
 * Promise-chain mutex that serializes async operations.
 *
 * In a single-threaded Node.js process with concurrent promises,
 * `.then()` chains guarantee ordering without needing a real lock.
 * Each caller awaits its position in the chain.
 *
 * Primary use case: serializing `checkpoint()` writes so that
 * concurrent task completions don't produce lost updates or
 * file corruption from racing `writeAtomicJson` calls.
 */
export class CheckpointMutex {
  private chain: Promise<void> = Promise.resolve();

  /**
   * Enqueue an async operation. Returns when the operation completes.
   * Operations execute in FIFO order regardless of concurrent callers.
   */
  async run(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn);
    await this.chain;
  }
}
