// Scheduling
export { buildDependencyOrder, getReadyTasks, isTerminalStatus, isRunComplete } from './scheduling.js';
export type { SchedulingResult } from './scheduling.js';

// Batch strategy
export { growBatchSize, shrinkBatchSize, computeEffectiveWindowSize } from './batch-strategy.js';
export type { BatchDecision } from './batch-strategy.js';

// Healing policy
export {
  isHealableFailure, computeFailureRate, shouldHeal,
  checkConvergence, shouldEscalateTask, shouldAbortRun,
  checkWindowFatalTransient,
} from './healing-policy.js';
export type {
  WindowOutcome, FailureRateResult, HealDecisionInput,
  ShouldHealResult, ConvergenceResult, EscalationResult, RunAbortResult,
  FatalTransientResult,
} from './healing-policy.js';

// Multi-pass runner
export { runManifestToCompletion } from './run-to-completion.js';
export type {
  RunToCompletionPolicy, RunToCompletionDeps, RunToCompletionResult,
} from './run-to-completion.js';

// Toolchain prewarm
export { prewarmToolchains, dedupeRequirements } from './prewarm.js';
export type {
  PrewarmRequirement, PrewarmOutcome, PrewarmResult, PrewarmInstallFn,
} from './prewarm.js';

// Resource lock (re-exported from concurrency for discoverability)
export { ResourceLockRegistry, CheckpointMutex, runPool } from './concurrency.js';

// Patch validation
export { validatePatch, validatePatchSet } from './patch-validation.js';
export type { PatchValidationResult } from './patch-validation.js';

// Write safety
export { validateWrites } from './write-safety.js';
export type { WriteSafetyOptions, WriteSafetyResult } from './write-safety.js';
