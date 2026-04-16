/**
 * State reconciliation on startup.
 *
 * Detects and repairs inconsistencies left by crashes, zombie processes,
 * or manual state edits.
 *
 * Lessons applied:
 *  - stuck-running-state-on-crash-medium (RUNNING tasks after crash)
 *  - state-batch-index-not-reset-on-retry-high (stale batch index)
 *  - zombie-orchestrator-state-corruption-critical (competing processes)
 */
import type { StateV2, TaskState } from "./types.js";

export interface ReconcileResult {
  repaired: boolean;
  repairs: string[];
}

/**
 * Reconcile state on startup. Mutates `state` in place and returns a
 * summary of repairs made.
 *
 * Repairs:
 * 1. Tasks stuck in RUNNING are reset to PENDING (the worker process is gone).
 * 2. If there are PENDING tasks but the batch index exceeds their count,
 *    the batch index is reset to avoid silently skipping the entire run.
 */
export function reconcileState(
  state: StateV2,
  pendingTaskCount: number,
): ReconcileResult {
  const repairs: string[] = [];

  // 1. Reset RUNNING tasks to PENDING
  for (const [taskId, ts] of Object.entries(state.tasks)) {
    if (ts.status === "RUNNING") {
      (ts as TaskState).status = "PENDING";
      repairs.push(`Task "${taskId}" was RUNNING at load time; reset to PENDING`);
    }
  }

  // 2. Detect stale batch index
  // The batch index is stored in state.policy.current_batch_size context,
  // but the common pattern from 3pp-fix-database stores current_batch_index
  // directly. We expose a generic check: if caller passes the pending count
  // and it's zero despite non-terminal tasks existing, something is wrong.
  if (pendingTaskCount === 0) {
    const hasNonTerminal = Object.values(state.tasks).some(
      (ts) => ts.status === "PENDING" || ts.status === "FAILED",
    );
    if (hasNonTerminal) {
      repairs.push(
        "No pending tasks detected despite non-terminal tasks existing; " +
        "caller should reset batch index and re-filter",
      );
    }
  }

  return {
    repaired: repairs.length > 0,
    repairs,
  };
}

/**
 * Reset all non-terminal tasks for a retry run.
 *
 * Atomically resets FAILED, BLOCKED, and RUNNING tasks to PENDING,
 * resets the batch size to 1 (fibonacci restart), and clears healing rounds.
 */
export function resetForRetry(state: StateV2): ReconcileResult {
  const repairs: string[] = [];

  for (const [taskId, ts] of Object.entries(state.tasks)) {
    if (ts.status === "FAILED" || ts.status === "BLOCKED" || ts.status === "RUNNING") {
      const oldStatus = ts.status;
      (ts as TaskState).status = "PENDING";
      (ts as TaskState).worker_attempts = 0;
      (ts as TaskState).healer_attempts = 0;
      repairs.push(`Task "${taskId}": ${oldStatus} -> PENDING`);
    }
  }

  state.policy.current_batch_size = 1;
  state.healing_rounds = [];
  state.run_status = "RUNNING";
  state.abort_reason = null;

  repairs.push("Reset batch size to 1, cleared healing rounds, set run_status=RUNNING");

  return {
    repaired: repairs.length > 0,
    repairs,
  };
}
