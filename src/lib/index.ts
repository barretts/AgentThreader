// ─── Errors ──────────────────────────────────────────────────────────────────
export { AppError, NotFoundError, CommandError, ConfigError } from './errors/types.js';

// ─── Contract Types ──────────────────────────────────────────────────────────
export type {
  ManifestV2, ManifestTaskV2, RetryPolicy,
  VerifyProfileRegistry, VerifyProfile, VerifyStep,
  TaskResultV2, WriteEntry, Evidence,
  HealDecisionV2, HealPatch, HealRetryPolicy,
  ParserErrorCode, ParserFailure, FailureClass,
} from './contracts/types.js';
export { HEALABLE_FAILURE_CLASSES, NON_HEALABLE_FAILURE_CLASSES } from './contracts/types.js';

// ─── State Types ─────────────────────────────────────────────────────────────
export type {
  StateV2, RunPolicy, TaskStatus, TaskState, HistoryEntry, HealingRound,
} from './state/types.js';
export { DEFAULT_POLICY, FIBONACCI_BATCH_SEQUENCE } from './state/types.js';

// ─── Adapter Types ───────────────────────────────────────────────────────────
export type {
  PreparedInvocation, ExecutionArtifact, AdapterHealth, RunContext, CliAdapter,
} from './adapters/types.js';

// ─── Parser ──────────────────────────────────────────────────────────────────
export {
  parseTaskResult, parseHealDecision,
  parseTaskResultFromString, parseHealDecisionFromString,
  generateFailureSignature, isParserFailure,
} from './parser/parser.js';

// ─── State ───────────────────────────────────────────────────────────────────
export { loadState, writeState, initializeState, computeManifestDigest } from './state/state.js';

// ─── Schema Validators ───────────────────────────────────────────────────────
export {
  validateManifestSchema, validateTaskResultSchema, validateHealDecisionSchema,
  validateStateSchema, validateVerifyProfileSchema,
} from './contracts/schema-validator.js';
export type { SchemaValidationResult, SchemaError } from './contracts/schema-validator.js';

// ─── Contracts ───────────────────────────────────────────────────────────────
export { validateManifest } from './contracts/validate-manifest.js';
export type { ValidateManifestOptions, ValidateManifestResult, Issue } from './contracts/validate-manifest.js';

// ─── State Commands ──────────────────────────────────────────────────────────
export { initState } from './state/init-state.js';
export type { InitStateOptions, InitStateResult } from './state/init-state.js';

export { getStatus } from './state/status.js';
export type { StatusOptions, StatusResult, FailedTaskInfo } from './state/status.js';

export { getLogs } from './state/logs.js';
export type { LogsOptions, LogsResult, LogEntry } from './state/logs.js';

// ─── Parser Commands ─────────────────────────────────────────────────────────
export { parseResult } from './parser/parse-result.js';
export type { ParseResultOptions, ParseResultResult } from './parser/parse-result.js';

export { parseHeal } from './parser/parse-heal.js';
export type { ParseHealOptions, ParseHealResult } from './parser/parse-heal.js';

// ─── Orchestrator Primitives ─────────────────────────────────────────────────
export {
  buildDependencyOrder, getReadyTasks, isTerminalStatus, isRunComplete,
  growBatchSize, shrinkBatchSize, computeEffectiveWindowSize,
  isHealableFailure, computeFailureRate, shouldHeal,
  checkConvergence, shouldEscalateTask, shouldAbortRun,
  validatePatch, validatePatchSet,
  validateWrites,
} from './orchestrator/index.js';
export type {
  SchedulingResult, BatchDecision,
  WindowOutcome, FailureRateResult, HealDecisionInput,
  ShouldHealResult, ConvergenceResult, EscalationResult, RunAbortResult,
  PatchValidationResult, WriteSafetyOptions, WriteSafetyResult,
} from './orchestrator/index.js';
