import type { HealDecisionV2, ParserFailure } from "./types.js";
import { parseHealDecision, isParserFailure } from "./parser.js";

export interface ParseHealOptions {
  logPath: string;
}

export interface ParseHealResult {
  ok: boolean;
  healDecision?: HealDecisionV2;
  error?: ParserFailure;
  warnings: string[];
}

export function parseHeal(options: ParseHealOptions): ParseHealResult {
  const result = parseHealDecision(options.logPath);

  if (isParserFailure(result)) {
    return { ok: false, error: result, warnings: [] };
  }

  return { ok: true, healDecision: result, warnings: [] };
}
