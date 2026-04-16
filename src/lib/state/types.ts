// ─── Task Status ─────────────────────────────────────────────────────────────

export type TaskStatus = "PENDING" | "RUNNING" | "DONE" | "BLOCKED" | "FAILED" | "ESCALATED";

// ─── History Entry ───────────────────────────────────────────────────────────

export interface HistoryEntry {
  task_id: string;
  phase: "worker" | "verify" | "healer" | "rollback";
  attempt_number: number;
  log_path: string;
  verify_log_path?: string | null;
  exit_code?: number | null;
  failure_class?: string | null;
  failure_signature?: string | null;
  applied_patch_ids?: string[];
  duration_sec?: number | null;
  timestamp: string;
}

// ─── Task State ──────────────────────────────────────────────────────────────

export interface TaskState {
  status: TaskStatus;
  worker_attempts: number;
  healer_attempts: number;
  last_failure_class: string | null;
  last_failure_signature: string | null;
  /** Extracted diagnostic lines from the last execution for healer visibility. */
  last_log_tail: string | null;
  applied_patch_ids: string[];
  history: HistoryEntry[];
}

// ─── Run Policy ──────────────────────────────────────────────────────────────

export interface RunPolicy {
  heal_schedule: "auto" | "off" | "task" | "batch" | "epoch";
  batch_strategy: "fibonacci" | "fixed";
  current_batch_size: number;
  failure_threshold: number;
  max_worker_attempts_per_task: number;
  max_heal_rounds_per_window: number;
  max_total_heal_rounds: number;
  signature_repeat_limit: number;
  /** Concurrency level for parallel task execution. 0 = use manifest policy. */
  concurrency: number;
}

// ─── Healing Round ───────────────────────────────────────────────────────────

export interface HealingRound {
  round_number: number;
  scope: "task" | "batch" | "epoch";
  window_task_ids: string[];
  failed_task_ids: string[];
  decision: "RETRY" | "ESCALATE" | "NOT_FIXABLE";
  applied_patch_ids: string[];
  timestamp: string;
}

// ─── State V2 ────────────────────────────────────────────────────────────────

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

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_POLICY: RunPolicy = {
  heal_schedule: "auto",
  batch_strategy: "fibonacci",
  current_batch_size: 1,
  failure_threshold: 0.5,
  max_worker_attempts_per_task: 3,
  max_heal_rounds_per_window: 2,
  max_total_heal_rounds: 8,
  signature_repeat_limit: 2,
  concurrency: 1,
};

export const FIBONACCI_BATCH_SEQUENCE = [1, 2, 3, 5, 8, 13] as const;
