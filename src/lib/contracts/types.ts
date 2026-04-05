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

// ─── Parser ─────────────────────────────────────────────────────────────────

export type ParserErrorCode =
  | "NO_SENTINEL"
  | "INVALID_JSON"
  | "SCHEMA_VIOLATION"
  | "MISSING_REQUIRED_FIELD"
  | "UNSUPPORTED_VERSION";

export interface ParserFailure {
  ok: false;
  code: ParserErrorCode;
  message: string;
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
