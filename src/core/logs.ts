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
  warnings: string[];
}

export function getLogs(options: LogsOptions): LogsResult {
  const state = loadState(options.statePath);
  let entries: LogEntry[] = [];

  for (const [taskId, taskState] of Object.entries(state.tasks)) {
    for (const h of taskState.history) {
      entries.push({
        taskId,
        phase: h.phase,
        attempt: h.attempt_number,
        logPath: h.log_path,
        verifyLogPath: h.verify_log_path ?? null,
        exitCode: h.exit_code ?? null,
        timestamp: h.timestamp,
      });
    }
  }

  if (options.taskId) {
    entries = entries.filter(e => e.taskId === options.taskId);
  }
  if (options.phase) {
    entries = entries.filter(e => e.phase === options.phase);
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { entries, warnings: [] };
}
