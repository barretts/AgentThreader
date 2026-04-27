/**
 * Multi-pass execution loop for dependency-chained manifests.
 *
 * `runPool` only drains the `ready` set it was given. With per-chain
 * dependencies, only chain heads are ready on the first call; successors
 * become ready as predecessors finish. Without an outer loop, a chained
 * manifest reports `Completed in 1 passes` while the majority of tasks
 * remain PENDING and forensically invisible from surface logs.
 *
 * `runManifestToCompletion` wraps that outer loop with a hard pass cap,
 * a no-progress guard, and a checkpoint hook between passes.
 */

import type { ManifestTaskV2 } from "../contracts/types.js";
import type { TaskState } from "../state/types.js";
import { getReadyTasks, isRunComplete } from "./scheduling.js";
import { runPool } from "./concurrency.js";

export interface RunToCompletionPolicy {
  concurrency: number;
  /** Hard ceiling on outer passes. Protects against pathological graphs. */
  max_passes?: number;
}

export interface RunToCompletionDeps {
  /** Topological order from `buildDependencyOrder`. */
  dependencyOrder: string[];
  /** Run state mutated by `workerFn` (statuses flip as tasks complete). */
  taskStates: Record<string, TaskState>;
}

export interface RunToCompletionResult {
  passes: number;
  stopped_reason:
    | "complete"
    | "no_ready_tasks"
    | "max_passes_reached"
    | "no_progress";
}

const DEFAULT_MAX_PASSES = 1000;

export async function runManifestToCompletion(
  tasks: ManifestTaskV2[],
  policy: RunToCompletionPolicy,
  workerFn: (taskId: string) => Promise<void>,
  checkpoint: () => Promise<void>,
  deps: RunToCompletionDeps,
): Promise<RunToCompletionResult> {
  const maxPasses = policy.max_passes ?? DEFAULT_MAX_PASSES;
  let passes = 0;
  let lastRemaining = Number.POSITIVE_INFINITY;

  while (passes < maxPasses) {
    if (isRunComplete(deps.taskStates)) {
      return { passes, stopped_reason: "complete" };
    }

    const ready = getReadyTasks(tasks, deps.taskStates, deps.dependencyOrder);
    if (ready.length === 0) {
      return { passes, stopped_reason: "no_ready_tasks" };
    }

    passes++;
    await runPool(ready, policy.concurrency, workerFn);
    await checkpoint();

    // No-progress guard: if the PENDING set did not shrink after running a
    // full pass, we are looping over tasks whose workerFn is a no-op. Bail
    // rather than spin forever.
    const remaining = Object.values(deps.taskStates).filter(
      (ts) => ts.status === "PENDING",
    ).length;
    if (remaining >= lastRemaining) {
      return { passes, stopped_reason: "no_progress" };
    }
    lastRemaining = remaining;
  }

  return { passes, stopped_reason: "max_passes_reached" };
}
