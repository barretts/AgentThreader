import { initState, type InitStateOptions, type InitStateResult } from '../../core/init-state.js';

export interface InitStateCommandOptions extends InitStateOptions {
  json: boolean;
}

export async function initStateCommand(options: InitStateCommandOptions): Promise<InitStateResult> {
  return initState({
    manifestPath: options.manifestPath,
    outputPath: options.outputPath,
    heal: options.heal,
    batchStrategy: options.batchStrategy,
  });
}
