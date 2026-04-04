import type { StateV2 } from "./types.js";
import { loadState } from "./state.js";

export interface StatusOptions {
  statePath: string;
}

export interface FailedTaskInfo {
  taskId: string;
  status: string;
  failureClass: string | null;
  failureSignature: string | null;
  workerAttempts: number;
}

export interface StatusResult {
  runId: string;
  runStatus: string;
  abortReason: string | null;
  taskSummary: Record<string, number>;
  totalTasks: number;
  healingRounds: number;
  lastHealDecision: string | null;
  failedTasks: FailedTaskInfo[];
}

export function getStatus(options: StatusOptions): StatusResult {
  const state: StateV2 = loadState(options.statePath);

  const taskSummary: Record<string, number> = {};
  const failedTasks: FailedTaskInfo[] = [];
  let totalTasks = 0;

  for (const [taskId, ts] of Object.entries(state.tasks)) {
    totalTasks++;
    taskSummary[ts.status] = (taskSummary[ts.status] ?? 0) + 1;

    if (ts.status === "FAILED" || ts.status === "ESCALATED" || ts.status === "BLOCKED") {
      failedTasks.push({
        taskId,
        status: ts.status,
        failureClass: ts.last_failure_class,
        failureSignature: ts.last_failure_signature,
        workerAttempts: ts.worker_attempts,
      });
    }
  }

  const lastRound = state.healing_rounds.length > 0
    ? state.healing_rounds[state.healing_rounds.length - 1]
    : null;

  return {
    runId: state.run_id,
    runStatus: state.run_status,
    abortReason: state.abort_reason,
    taskSummary,
    totalTasks,
    healingRounds: state.healing_rounds.length,
    lastHealDecision: lastRound?.decision ?? null,
    failedTasks,
  };
}
