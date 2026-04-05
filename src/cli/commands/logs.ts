import { getLogs, type LogsOptions, type LogsResult } from '../../lib/state/logs.js';

export interface LogsCommandOptions extends LogsOptions {
  json: boolean;
}

export function logsCommand(options: LogsCommandOptions): LogsResult {
  return getLogs({
    statePath: options.statePath,
    taskId: options.taskId,
    phase: options.phase,
  });
}
