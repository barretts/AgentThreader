### State, Resume, and Convergence

### Atomic State Writes

Mandatory. The orchestrator writes state via a temporary file followed by atomic rename on the same filesystem. State is checkpointed after every task attempt and every healing round.

### Resume Semantics

- `DONE` tasks are skipped on resume if `manifest_digest` still matches.
- If `manifest_digest` changes, the orchestrator warns or forces reconciliation.
- `ESCALATED` tasks are not retried automatically.
- `FAILED` and `BLOCKED` tasks are eligible only if retry policy allows.

Reconciliation handles: tasks removed since last run, tasks added, tasks whose `prompt_ref`, `depends_on`, or `verify_profile` changed.

### Failure Signature Generation

Stable failure signatures follow this algorithm:

1. Start with the normalized failure class.
2. Extract the primary stable signal from parser output, verification logs, or error codes.
3. Remove timestamps, absolute paths, task IDs, and unstable numbers.
4. Lowercase and collapse whitespace.
5. Truncate to a stable maximum length.

Format: `<failure_class>:<normalized_signal>` (e.g., `build_error:missing_cn_import`).

### Escalation Rules

Per-task: escalate when a task repeats the same signature `signature_repeat_limit` times after healing, or when a non-healable failure exhausts retry policy.

Per-run: escalate when `max_total_heal_rounds` is exhausted without convergence, or continuing would only repeat the same failure set.

Escalated tasks remain in state for reporting. Aborted runs record `run_status: ABORTED` with a non-empty `abort_reason`.