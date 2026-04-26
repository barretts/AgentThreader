/**
 * AgentThreader v2 — Type Definitions
 *
 * These types correspond 1:1 to the JSON schemas in ../schemas/.
 * They are the canonical TypeScript representation of the v2 contract stack.
 */

// ─── Manifest ────────────────────────────────────────────────────────────────

export interface ManifestV2 {
  manifest_version: "2.0";
  run_id: string;
  tasks: ManifestTaskV2[];
}

export interface ManifestTaskV2 {
  id: string;
  prompt_ref: string;
  depends_on: string[];
  timeout_sec: number;
  verify_profile: string;
  context_refs?: string[];
  priority?: number;
  retry_policy?: RetryPolicy;
  /**
   * Mutex key. Tasks sharing a `resource_lock` value serialize on an
   * in-process mutex (`withResourceLock`); tasks with different values (or
   * `null`) are unconstrained beyond `policy.concurrency`. Unlike
   * `depends_on`, `resource_lock` does NOT propagate state -- a FAILED or
   * BLOCKED predecessor releases its lock so the next holder can run.
   * Use for shared-resource serialization (workdir, file, external system);
   * use `depends_on` for genuine output dependencies.
   */
  resource_lock?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RetryPolicy {
  max_attempts?: number;
  retry_on?: string[];
}

// ─── Verify Profile Registry ─────────────────────────────────────────────────

export interface VerifyProfileRegistry {
  profiles: Record<string, VerifyProfile>;
}

export interface VerifyProfile {
  steps: VerifyStep[];
  rollback_on_failure: boolean;
}

export interface VerifyStep {
  name: string;
  cmd: string;
  cwd: string;
  timeout_sec: number;
}

// ─── Task Result (Worker Output) ─────────────────────────────────────────────

export interface TaskResultV2 {
  contract_version: "2.0";
  task_id: string;
  status: "DONE" | "BLOCKED" | "FAILED" | "CONTRACT_ERROR";
  summary: string;
  changed_files?: string[];
  writes?: WriteEntry[];
  evidence?: Evidence;
  failure_class?: string;
}

export interface WriteEntry {
  path: string;
  op: "create" | "replace" | "append";
  encoding: "utf8";
  content?: string;
  content_ref?: string;
  sha256_before?: string;
}

export interface Evidence {
  commands?: string[];
  log_refs?: string[];
  notes?: string[];
}

// ─── Heal Decision (Healer Output) ──────────────────────────────────────────

export interface HealDecisionV2 {
  contract_version: "2.0";
  scope: "task" | "batch" | "epoch";
  decision: "RETRY" | "ESCALATE" | "NOT_FIXABLE";
  failure_class: string;
  root_cause: string;
  patches: HealPatch[];
  learned_rule?: string;
  escalations?: Array<{ task_id: string; reason: string }>;
  retry_policy?: HealRetryPolicy;
}

export interface HealPatch {
  target: "shared_context" | "task_prompt" | "runtime_patch" | "contract_hint";
  operation: "replace" | "append" | "merge";
  path?: string;
  task_id?: string;
  content?: string | Record<string, unknown>;
}

export interface HealRetryPolicy {
  reset_tasks?: string[];
  retry_window?: "same_window" | "shrink_window" | "next_epoch";
}

// ─── Run State ───────────────────────────────────────────────────────────────

export interface StateV2 {
  state_version: "2.0";
  run_id: string;
  run_status: "RUNNING" | "COMPLETED" | "ABORTED";
  abort_reason: string | null;
  manifest_digest: string;
  policy: RunPolicy;
  /**
   * CLI flags / mode that produced the prior manifest. Optional, but
   * RECOMMENDED for orchestrators that support `--resume`. The resume
   * mode-flag check requires either a missing `invocation` (legacy state)
   * or a matching `argv_digest` between the prior run and the current
   * invocation; otherwise resume MUST fail loudly to prevent merging a
   * fresh manifest of a different mode into the prior state.
   */
  invocation?: InvocationRecord;
  tasks: Record<string, TaskState>;
  healing_rounds: HealingRound[];
}

export interface InvocationRecord {
  /** Top-level orchestrator phase (e.g. "babysit", "review"). */
  phase: string;
  /** Manifest-builder mode within the phase (e.g. "vuln-targeted"). */
  mode: string;
  /** Mode-affecting CLI flags as parsed (booleans, csv lists, etc.). */
  flags?: Record<string, unknown>;
  /** Canonical hash of sorted-flags + sorted-targets. Stable across functionally-equivalent invocations. */
  argv_digest: string;
  /** Optional convenience copy of the top-level manifest_digest at invocation time. */
  manifest_digest?: string;
}

export interface RunPolicy {
  heal_schedule: "auto" | "off" | "task" | "batch" | "epoch";
  batch_strategy: "fibonacci" | "fixed";
  current_batch_size: number;
  failure_threshold: number;
  max_worker_attempts_per_task: number;
  max_heal_rounds_per_window: number;
  max_total_heal_rounds: number;
  signature_repeat_limit: number;
}

export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "BLOCKED"
  | "FAILED"
  | "ESCALATED";

export interface TaskState {
  status: TaskStatus;
  worker_attempts: number;
  healer_attempts: number;
  last_failure_class: string | null;
  last_failure_signature: string | null;
  applied_patch_ids: string[];
  history: HistoryEntry[];
}

export interface HistoryEntry {
  task_id: string;
  phase: "worker" | "verify" | "healer" | "rollback";
  attempt_number: number;
  log_path: string;
  verify_log_path?: string | null;
  exit_code?: number | null;
  failure_class?: string | null;
  failure_signature?: string | null;
  applied_patch_ids: string[];
  duration_sec?: number | null;
  timestamp: string;
}

export interface HealingRound {
  round_number: number;
  scope: "task" | "batch" | "epoch";
  window_task_ids: string[];
  failed_task_ids: string[];
  decision: "RETRY" | "ESCALATE" | "NOT_FIXABLE";
  applied_patch_ids: string[];
  timestamp: string;
}

// ─── Adapter Interface ───────────────────────────────────────────────────────

export type ParserErrorCode =
  | "NO_OUTPUT"            // Worker emitted empty / very short output (likely transient_infra)
  | "NO_SENTINEL"          // Output present but missing TASK_RESULT_V2 sentinels
  | "INVALID_JSON"         // Sentinels present, JSON malformed
  | "SCHEMA_VIOLATION"
  | "MISSING_REQUIRED_FIELD"
  | "UNSUPPORTED_VERSION";

/**
 * Discriminated kind for `ParserFailure`. Distinguishes "the worker
 * exited with little/no output" (likely a transient infra problem) from
 * "the worker spoke at length but forgot the sentinel block" (likely a
 * prompt-shape issue). The orchestrator routes these to different
 * `failure_class` values for healer routing.
 */
export type ParserFailureKind =
  | "no_output"
  | "no_sentinel"
  | "json_invalid"
  | "schema_violation";

export interface PreparedInvocation {
  cwd: string;
  argv: string[];
  env?: Record<string, string>;
  stdin?: string | null;
  timeoutSec: number;
}

export interface ExecutionArtifact {
  logPath: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
}

export interface ParserFailure {
  ok: false;
  code: ParserErrorCode;
  /**
   * Discriminated kind for routing healer behavior. `no_output` should map
   * to `transient_infra` (worker likely couldn't produce work);
   * `no_sentinel` to `contract_error`; `json_invalid` to `output_format`;
   * `schema_violation` to `weak_contract`.
   */
  kind: ParserFailureKind;
  message: string;
  /** Length of the raw worker output (for diagnostics). */
  rawLength?: number;
  /** Up to ~200 chars of the worker output for log surfacing. */
  sample?: string;
}

export interface AdapterHealth {
  ready: boolean;
  details: string[];
}

export interface RunContext {
  repoRoot: string;
  logsDir: string;
  sharedContextPaths: string[];
  contractHints: Map<string, string[]>;
  policy: RunPolicy;
}

export interface CliAdapter {
  id: string;
  capabilities: {
    stdinPrompt: boolean;
    argPrompt: boolean;
    pty: boolean;
    interactive: boolean;
  };
  prepare(task: ManifestTaskV2, ctx: RunContext): PreparedInvocation;
  execute(
    invocation: PreparedInvocation,
    ctx: RunContext,
  ): Promise<ExecutionArtifact>;
  extractResult(
    artifact: ExecutionArtifact,
    ctx: RunContext,
  ): Promise<TaskResultV2 | ParserFailure>;
  healthcheck(ctx: RunContext): Promise<AdapterHealth>;
}

// ─── Failure Classification ──────────────────────────────────────────────────

/**
 * Bare failure classes. `transient_infra` and the conditional classes
 * (`build_error`, `test_error`, `smoke_error`) MAY be further qualified
 * with a colon-notation subtype (e.g. `transient_infra:api_auth_blocked`).
 * See `FailureClassWithSubtype` and the Healing Model section of the
 * skill spec for the full taxonomy.
 */
export type FailureClass =
  | "prompt_gap"
  | "missing_paths"
  | "weak_contract"
  | "contract_error"
  | "output_format"
  | "build_error"
  | "test_error"
  | "smoke_error"
  | "timeout"
  | "transient_infra"
  | "blocked_external"
  | "real_bug"
  | "unknown";

/**
 * Recommended subtypes for `transient_infra`. Routes healer behavior:
 *  - `api_auth_blocked`, `tool_unavailable`: non-healable, fatal-transient short-circuit
 *  - `api_rate_limited`, `network_timeout`: retry with backoff
 *  - `node_version_missing` (and analogous): runtime patch widening prewarm + retry
 */
export type TransientInfraSubtype =
  | "api_auth_blocked"
  | "api_rate_limited"
  | "tool_unavailable"
  | "node_version_missing"
  | "network_timeout";

export type TransientInfraClass = "transient_infra" | `transient_infra:${TransientInfraSubtype}`;

/** Full failure class union including supported subtypes via colon notation. */
export type FailureClassWithSubtype = FailureClass | TransientInfraClass;

export const HEALABLE_FAILURE_CLASSES: ReadonlySet<string> = new Set([
  "prompt_gap",
  "missing_paths",
  "weak_contract",
  "contract_error",
  "output_format",
  "timeout",
  "transient_infra",
  "transient_infra:api_rate_limited",
  "transient_infra:network_timeout",
  "transient_infra:node_version_missing",
]);

export const NON_HEALABLE_FAILURE_CLASSES: ReadonlySet<string> = new Set([
  "blocked_external",
  "real_bug",
]);

/**
 * Subtypes that MUST short-circuit the run (fatal-transient). PBH MUST NOT
 * consume heal rounds against these; the orchestrator aborts with
 * `run_status: ABORTED` and an operator-actionable `abort_reason`.
 */
export const FATAL_TRANSIENT_INFRA_SUBTYPES: ReadonlySet<string> = new Set([
  "transient_infra:api_auth_blocked",
  "transient_infra:tool_unavailable",
]);

export function isFatalTransient(failureClass: string | null | undefined): boolean {
  return failureClass != null && FATAL_TRANSIENT_INFRA_SUBTYPES.has(failureClass);
}

// ─── PBH Fibonacci Sequence ─────────────────────────────────────────────────

export const FIBONACCI_BATCH_SEQUENCE = [1, 2, 3, 5, 8, 13, 21, 34] as const;

// ─── Default Policy ──────────────────────────────────────────────────────────

export const DEFAULT_POLICY: RunPolicy = {
  heal_schedule: "auto",
  batch_strategy: "fibonacci",
  current_batch_size: 1,
  failure_threshold: 0.2,
  max_worker_attempts_per_task: 2,
  max_heal_rounds_per_window: 2,
  max_total_heal_rounds: 8,
  signature_repeat_limit: 2,
};
