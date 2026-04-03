// Error hierarchy
export { AppError, NotFoundError, CommandError, ConfigError } from './errors/types.js';

// Output formatting
export { OutputFormatter } from './cli/output-formatter.js';

// Types
export type {
  ManifestV2, ManifestTaskV2, RetryPolicy,
  VerifyProfileRegistry, VerifyProfile, VerifyStep,
  TaskResultV2, WriteEntry, Evidence,
  HealDecisionV2, HealPatch, HealRetryPolicy,
  StateV2, RunPolicy, TaskStatus, TaskState, HistoryEntry, HealingRound,
  ParserErrorCode, PreparedInvocation, ExecutionArtifact, ParserFailure,
  AdapterHealth, RunContext, CliAdapter, FailureClass,
} from './core/types.js';
export { DEFAULT_POLICY, HEALABLE_FAILURE_CLASSES, NON_HEALABLE_FAILURE_CLASSES, FIBONACCI_BATCH_SEQUENCE } from './core/types.js';

// Parser
export { parseTaskResult, parseHealDecision, parseTaskResultFromString, parseHealDecisionFromString, generateFailureSignature, isParserFailure } from './core/parser.js';

// State
export { loadState, writeState, initializeState, computeManifestDigest } from './core/state.js';

// Commands (core modules)
export { validateManifest } from './core/validate-manifest.js';
export type { ValidateManifestOptions, ValidateManifestResult, Issue } from './core/validate-manifest.js';

export { initState } from './core/init-state.js';
export type { InitStateOptions, InitStateResult } from './core/init-state.js';

export { parseResult } from './core/parse-result.js';
export type { ParseResultOptions, ParseResultResult } from './core/parse-result.js';

export { parseHeal } from './core/parse-heal.js';
export type { ParseHealOptions, ParseHealResult } from './core/parse-heal.js';

export { getStatus } from './core/status.js';
export type { StatusOptions, StatusResult, FailedTaskInfo } from './core/status.js';

export { getLogs } from './core/logs.js';
export type { LogsOptions, LogsResult, LogEntry } from './core/logs.js';
