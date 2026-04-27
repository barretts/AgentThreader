import { describe, it, expect } from 'vitest';
import { runManifestToCompletion } from '../../../src/lib/orchestrator/run-to-completion.js';
import { buildDependencyOrder } from '../../../src/lib/orchestrator/scheduling.js';
import type { ManifestTaskV2 } from '../../../src/lib/contracts/types.js';
import type { TaskState } from '../../../src/lib/state/types.js';

function makeTask(id: string, depends_on: string[] = []): ManifestTaskV2 {
  return { id, prompt_ref: `prompts/${id}.md`, depends_on, timeout_sec: 300, verify_profile: 'default' };
}

function initStates(tasks: ManifestTaskV2[]): Record<string, TaskState> {
  const out: Record<string, TaskState> = {};
  for (const t of tasks) {
    out[t.id] = {
      status: 'PENDING',
      worker_attempts: 0,
      healer_attempts: 0,
      last_failure_class: null,
      last_failure_signature: null,
      last_log_tail: null,
      applied_patch_ids: [],
      history: [],
    };
  }
  return out;
}

describe('runManifestToCompletion', () => {
  it('drives a dependency chain to completion over multiple passes', async () => {
    // A -> B -> C: only A is ready initially.
    const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
    const order = buildDependencyOrder(tasks).order;
    const taskStates = initStates(tasks);
    let checkpointCalls = 0;

    const result = await runManifestToCompletion(
      tasks,
      { concurrency: 4 },
      async (id) => { taskStates[id].status = 'DONE'; },
      async () => { checkpointCalls++; },
      { dependencyOrder: order, taskStates },
    );

    expect(result.stopped_reason).toBe('complete');
    // Three serial ready-passes, each picking up one newly-ready task.
    expect(result.passes).toBe(3);
    expect(checkpointCalls).toBe(3);
    expect(taskStates.A.status).toBe('DONE');
    expect(taskStates.B.status).toBe('DONE');
    expect(taskStates.C.status).toBe('DONE');
  });

  it('exits with no_ready_tasks when a predecessor blocks its successors', async () => {
    const tasks = [makeTask('A'), makeTask('B', ['A'])];
    const order = buildDependencyOrder(tasks).order;
    const taskStates = initStates(tasks);

    const result = await runManifestToCompletion(
      tasks,
      { concurrency: 1 },
      async (id) => {
        // A fails in a way that never satisfies B's depends_on.
        taskStates[id].status = 'FAILED';
      },
      async () => {},
      { dependencyOrder: order, taskStates },
    );

    expect(result.stopped_reason).toBe('no_ready_tasks');
    expect(result.passes).toBe(1);
    expect(taskStates.B.status).toBe('PENDING');
  });

  it('bails with no_progress when the worker is a no-op on PENDING tasks', async () => {
    const tasks = [makeTask('A')];
    const order = buildDependencyOrder(tasks).order;
    const taskStates = initStates(tasks);

    const result = await runManifestToCompletion(
      tasks,
      { concurrency: 1 },
      async () => { /* no status change */ },
      async () => {},
      { dependencyOrder: order, taskStates },
    );

    expect(result.stopped_reason).toBe('no_progress');
  });

  it('honors max_passes ceiling', async () => {
    const tasks = [makeTask('A'), makeTask('B', ['A'])];
    const order = buildDependencyOrder(tasks).order;
    const taskStates = initStates(tasks);
    let calls = 0;

    const result = await runManifestToCompletion(
      tasks,
      { concurrency: 1, max_passes: 1 },
      async (id) => {
        calls++;
        taskStates[id].status = 'DONE';
      },
      async () => {},
      { dependencyOrder: order, taskStates },
    );

    expect(result.passes).toBe(1);
    expect(calls).toBe(1);
    expect(result.stopped_reason).toBe('max_passes_reached');
  });

  it('returns complete without running a pass when nothing is pending', async () => {
    const tasks = [makeTask('A')];
    const order = buildDependencyOrder(tasks).order;
    const taskStates = initStates(tasks);
    taskStates.A.status = 'DONE';

    const result = await runManifestToCompletion(
      tasks,
      { concurrency: 1 },
      async () => { throw new Error('should not run'); },
      async () => { throw new Error('should not checkpoint'); },
      { dependencyOrder: order, taskStates },
    );

    expect(result.passes).toBe(0);
    expect(result.stopped_reason).toBe('complete');
  });
});
