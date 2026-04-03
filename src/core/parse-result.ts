import type { TaskResultV2, ParserFailure } from "./types.js";
import { parseTaskResult, isParserFailure } from "./parser.js";

export interface ParseResultOptions {
  logPath: string;
}

export interface ParseResultResult {
  ok: boolean;
  taskResult?: TaskResultV2;
  error?: ParserFailure;
  warnings: string[];
}

export function parseResult(options: ParseResultOptions): ParseResultResult {
  const result = parseTaskResult(options.logPath);

  if (isParserFailure(result)) {
    return { ok: false, error: result, warnings: [] };
  }

  return { ok: true, taskResult: result, warnings: [] };
}
