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
  lastHealDecision?: string;
  failedTasks: FailedTaskInfo[];
  warnings: string[];
}

export function getStatus(options: StatusOptions): StatusResult {
  const state = loadState(options.statePath);

  const taskSummary: Record<string, number> = {};
  const failedTasks: FailedTaskInfo[] = [];

  for (const [taskId, taskState] of Object.entries(state.tasks)) {
    taskSummary[taskState.status] = (taskSummary[taskState.status] ?? 0) + 1;

    if (taskState.status === "FAILED" || taskState.status === "ESCALATED" || taskState.status === "BLOCKED") {
      failedTasks.push({
        taskId,
        status: taskState.status,
        failureClass: taskState.last_failure_class,
        failureSignature: taskState.last_failure_signature,
        workerAttempts: taskState.worker_attempts,
      });
    }
  }

  const lastRound = state.healing_rounds[state.healing_rounds.length - 1];

  return {
    runId: state.run_id,
    runStatus: state.run_status,
    abortReason: state.abort_reason,
    taskSummary,
    totalTasks: Object.keys(state.tasks).length,
    healingRounds: state.healing_rounds.length,
    lastHealDecision: lastRound?.decision,
    failedTasks,
    warnings: [],
  };
}
