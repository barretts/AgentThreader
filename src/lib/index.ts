// ─── Errors ──────────────────────────────────────────────────────────────────
export { AppError, NotFoundError, CommandError, ConfigError } from './errors/types.js';
export { explainErrorCode, listKnownErrorCodes } from './errors/explain-error.js';
export type { ErrorExplanation } from './errors/explain-error.js';

// ─── Contract Types ──────────────────────────────────────────────────────────
export type {
  ManifestV2, ManifestTaskV2, RetryPolicy,
  VerifyProfileRegistry, VerifyProfile, VerifyStep,
  TaskResultV2, WriteEntry, Evidence,
  HealDecisionV2, HealPatch, HealRetryPolicy,
  ParserErrorCode, ParserFailure, FailureClass,
} from './contracts/types.js';
export {
  HEALABLE_FAILURE_CLASSES,
  NON_HEALABLE_FAILURE_CLASSES,
  FATAL_TRANSIENT_INFRA_SUBTYPES,
} from './contracts/types.js';

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

// ─── Diagnostics ─────────────────────────────────────────────────────────────
export { runDoctor } from './diagnostics/doctor.js';
export type { DoctorOptions, DoctorResult, DoctorCheck, DoctorStatus } from './diagnostics/doctor.js';

export { extractDiagnosticLines } from './diagnostics/extract-diagnostics.js';
export type { DiagnosticExtraction } from './diagnostics/extract-diagnostics.js';

// ─── Orchestrator Primitives ─────────────────────────────────────────────────
export {
  buildDependencyOrder, getReadyTasks, isTerminalStatus, isRunComplete,
  growBatchSize, shrinkBatchSize, computeEffectiveWindowSize,
  isHealableFailure, computeFailureRate, shouldHeal,
  checkConvergence, shouldEscalateTask, shouldAbortRun,
  checkWindowFatalTransient,
  validatePatch, validatePatchSet,
  validateWrites,
  runManifestToCompletion,
  prewarmToolchains, dedupeRequirements,
} from './orchestrator/index.js';
export type {
  SchedulingResult, BatchDecision,
  WindowOutcome, FailureRateResult, HealDecisionInput,
  ShouldHealResult, ConvergenceResult, EscalationResult, RunAbortResult,
  FatalTransientResult,
  PatchValidationResult, WriteSafetyOptions, WriteSafetyResult,
  RunToCompletionPolicy, RunToCompletionDeps, RunToCompletionResult,
  PrewarmRequirement, PrewarmOutcome, PrewarmResult, PrewarmInstallFn,
} from './orchestrator/index.js';

export { runPool, CheckpointMutex, ResourceLockRegistry } from './orchestrator/concurrency.js';
export { killOrphanedProcesses } from './orchestrator/kill.js';
export type { KillResult } from './orchestrator/kill.js';

// ─── Terminal Utilities ──────────────────────────────────────────────────────
export { stripTermEscapes, hasVisibleContent } from './term-utils.js';

// ─── Sentinel Sanitization ───────────────────────────────────────────────────
export { sanitizeSentinels, sanitizeAndTruncate } from './parser/sentinel-sanitize.js';

// ─── State Reconciliation ────────────────────────────────────────────────────
export { reconcileState, resetForRetry } from './state/reconcile.js';
export type { ReconcileResult } from './state/reconcile.js';

// ─── Lockfile ────────────────────────────────────────────────────────────────
export { acquireLock, forceAcquireLock, releaseLock } from './state/lockfile.js';
export type { LockfileResult } from './state/lockfile.js';

// ─── Adapter Presets ────────────────────────────────────────────────────────
export {
  CLAUDE_PRESET, CRUSH_PRESET, CURSOR_PRESET,
  ADAPTER_PRESETS, getAdapterPreset, listAdapterPresets, buildArgv,
} from './adapters/presets.js';
export type { AdapterPreset } from './adapters/presets.js';

// ─── CLR Bridge Adapter ─────────────────────────────────────────────────────
// Thin bridge that delegates CLI interaction to `cli-runner-learner`.
// CLR is an OPTIONAL peer dependency; if not installed, only the bridge
// constructor works -- calling any method throws an actionable error.
export { createClrAdapter, ClrCliAdapter } from './adapters/clr-bridge.js';
export type { CreateClrAdapterOptions } from './adapters/clr-bridge.js';

// ─── Scaffold ───────────────────────────────────────────────────────────────
export { scaffold } from './scaffold/scaffold.js';
export type { ScaffoldOptions, ScaffoldResult } from './scaffold/scaffold.js';
