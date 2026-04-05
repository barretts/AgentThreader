import { getStatus, type StatusOptions, type StatusResult } from '../../lib/state/status.js';

export interface StatusCommandOptions extends StatusOptions {
  json: boolean;
}

export function statusCommand(options: StatusCommandOptions): StatusResult {
  return getStatus({ statePath: options.statePath });
}
