import { scaffold, type ScaffoldOptions, type ScaffoldResult } from '../../lib/scaffold/scaffold.js';

export interface ScaffoldCommandOptions extends ScaffoldOptions {
  json: boolean;
}

export function scaffoldCommand(options: ScaffoldCommandOptions): ScaffoldResult {
  return scaffold({
    targetDir: options.targetDir,
    projectName: options.projectName,
    force: options.force,
  });
}
