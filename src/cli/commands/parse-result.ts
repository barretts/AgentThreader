import { parseResult, type ParseResultOptions, type ParseResultResult } from '../../lib/parser/parse-result.js';

export interface ParseResultCommandOptions extends ParseResultOptions {
  json: boolean;
}

export function parseResultCommand(options: ParseResultCommandOptions): ParseResultResult {
  return parseResult({ logPath: options.logPath });
}
