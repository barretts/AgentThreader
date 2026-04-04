import type { StateV2 } from "./types.js";
import { loadState } from "./state.js";

export interface LogsOptions {
  statePath: string;
  taskId?: string;
  phase?: string;
}

export interface LogEntry {
  taskId: string;
  phase: string;
  attempt: number;
  logPath: string;
  verifyLogPath: string | null;
  exitCode: number | null;
  timestamp: string;
}

export interface LogsResult {
  entries: LogEntry[];
}

export function getLogs(options: LogsOptions): LogsResult {
  const state: StateV2 = loadState(options.statePath);
  const entries: LogEntry[] = [];

  for (const [taskId, ts] of Object.entries(state.tasks)) {
    if (options.taskId && taskId !== options.taskId) continue;

    for (const h of ts.history) {
      if (options.phase && h.phase !== options.phase) continue;

      entries.push({
        taskId: h.task_id,
        phase: h.phase,
        attempt: h.attempt_number,
        logPath: h.log_path,
        verifyLogPath: h.verify_log_path ?? null,
        exitCode: h.exit_code ?? null,
        timestamp: h.timestamp,
      });
    }
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { entries };
}
