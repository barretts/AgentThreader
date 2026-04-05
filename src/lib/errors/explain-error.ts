import type { ParserErrorCode } from '../contracts/types.js';

export interface ErrorExplanation {
  code: string;
  category: 'app' | 'parser';
  meaning: string;
  likelyCauses: string[];
  suggestedFixes: string[];
}

const EXPLANATIONS: Record<string, ErrorExplanation> = {
  APP_ERROR: {
    code: 'APP_ERROR',
    category: 'app',
    meaning: 'A generic application error was thrown.',
    likelyCauses: ['Unexpected runtime condition', 'Unhandled edge case in command flow'],
    suggestedFixes: ['Rerun with a narrower input and inspect command output', 'Use `agent-threader explain <code>` on a more specific code when available'],
  },
  NOT_FOUND_ERROR: {
    code: 'NOT_FOUND_ERROR',
    category: 'app',
    meaning: 'A required file or entity could not be found.',
    likelyCauses: ['Incorrect file path', 'Missing state or manifest file'],
    suggestedFixes: ['Verify the path exists', 'Run from the expected working directory'],
  },
  COMMAND_ERROR: {
    code: 'COMMAND_ERROR',
    category: 'app',
    meaning: 'A subprocess command failed.',
    likelyCauses: ['Build/test command exited non-zero', 'Missing tool in PATH'],
    suggestedFixes: ['Run the failing command directly to inspect full output', 'Install the required tool and retry'],
  },
  CONFIG_ERROR: {
    code: 'CONFIG_ERROR',
    category: 'app',
    meaning: 'A configuration or contract file could not be read or validated.',
    likelyCauses: ['Invalid JSON syntax', 'Schema mismatch', 'Unreadable file permissions'],
    suggestedFixes: ['Validate JSON formatting', 'Run `agent-threader validate-manifest <path>`', 'Check file permissions'],
  },
  NO_SENTINEL: {
    code: 'NO_SENTINEL',
    category: 'parser',
    meaning: 'Expected contract sentinel block was not found in log output.',
    likelyCauses: ['Worker/healer did not emit fenced contract', 'Wrong log file was parsed'],
    suggestedFixes: ['Ensure prompts require the correct sentinel marker', 'Confirm you passed the correct log path'],
  },
  INVALID_JSON: {
    code: 'INVALID_JSON',
    category: 'parser',
    meaning: 'Contract sentinel was found, but JSON could not be parsed.',
    likelyCauses: ['Malformed JSON emitted by model', 'Truncated contract output'],
    suggestedFixes: ['Tighten prompt instructions for strict JSON', 'Retry task and verify full contract block is present'],
  },
  SCHEMA_VIOLATION: {
    code: 'SCHEMA_VIOLATION',
    category: 'parser',
    meaning: 'JSON parsed successfully, but contract schema validation failed.',
    likelyCauses: ['Unexpected field names/types', 'Missing required contract fields'],
    suggestedFixes: ['Compare output against schema in `skill/schemas`', 'Update prompt to enforce exact field names and enums'],
  },
  MISSING_REQUIRED_FIELD: {
    code: 'MISSING_REQUIRED_FIELD',
    category: 'parser',
    meaning: 'Required contract fields are missing from output.',
    likelyCauses: ['Model omitted fields', 'Prompt did not include complete contract requirements'],
    suggestedFixes: ['Include required fields explicitly in prompt template', 'Use examples that include full contract shape'],
  },
  UNSUPPORTED_VERSION: {
    code: 'UNSUPPORTED_VERSION',
    category: 'parser',
    meaning: 'Contract version in output is not supported by this runtime.',
    likelyCauses: ['Outdated prompts', 'Mixed version artifacts in workflow'],
    suggestedFixes: ['Emit contract_version 2.0 for v2 contracts', 'Align prompt/system instructions with current schema version'],
  },
};

export function explainErrorCode(code: string): ErrorExplanation | undefined {
  const key = code.trim().toUpperCase() as ParserErrorCode | string;
  return EXPLANATIONS[key];
}

export function listKnownErrorCodes(): string[] {
  return Object.keys(EXPLANATIONS).sort();
}
