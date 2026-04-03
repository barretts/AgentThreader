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
  tasks: Record<string, TaskState>;
  healing_rounds: HealingRound[];
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
  | "NO_SENTINEL"
  | "INVALID_JSON"
  | "SCHEMA_VIOLATION"
  | "MISSING_REQUIRED_FIELD"
  | "UNSUPPORTED_VERSION";

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
  message: string;
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

export const HEALABLE_FAILURE_CLASSES: ReadonlySet<string> = new Set([
  "prompt_gap",
  "missing_paths",
  "weak_contract",
  "contract_error",
  "output_format",
  "timeout",
  "transient_infra",
]);

export const NON_HEALABLE_FAILURE_CLASSES: ReadonlySet<string> = new Set([
  "blocked_external",
  "real_bug",
]);

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
