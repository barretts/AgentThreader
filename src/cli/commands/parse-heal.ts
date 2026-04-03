import { parseHeal, type ParseHealOptions, type ParseHealResult } from '../../lib/parser/parse-heal.js';

export interface ParseHealCommandOptions extends ParseHealOptions {
  json: boolean;
}

export function parseHealCommand(options: ParseHealCommandOptions): ParseHealResult {
  return parseHeal({ logPath: options.logPath });
}
