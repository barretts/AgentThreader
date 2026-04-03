### Contracts

All public contracts are JSON, versioned (`"2.0"`), and schema-validated. Machine-readable schemas live in `schemas/`.

### manifest.v2

Declares tasks with required fields: `id`, `prompt_ref`, `depends_on`, `timeout_sec`, `verify_profile`. Optional: `context_refs`, `priority`, `retry_policy`, `metadata`.

Tasks are topologically sorted by `depends_on`. Lower `priority` values run first. A task cannot start until all dependencies are `DONE`.

### task_result.v2

Emitted by the worker inside `<<<TASK_RESULT_V2>>>` / `<<<END_TASK_RESULT_V2>>>` sentinels.

Required fields: `contract_version`, `task_id`, `status` (DONE | BLOCKED | FAILED | CONTRACT_ERROR), `summary`.

Optional: `changed_files`, `writes[]` (with `path`, `op`, `encoding`, `content` or `content_ref`), `evidence` (commands, log_refs, notes), `failure_class`.

### heal_decision.v2

Emitted by the healer inside `<<<HEAL_DECISION_V2>>>` / `<<<END_HEAL_DECISION_V2>>>` sentinels.

Required fields: `contract_version`, `scope` (task | batch | epoch), `decision` (RETRY | ESCALATE | NOT_FIXABLE), `failure_class`, `root_cause`, `patches[]`.

Patch targets: `shared_context`, `task_prompt`, `runtime_patch`, `contract_hint`. Each patch has `target`, `operation` (replace | append | merge), and `content`.

Optional: `learned_rule`, `escalations[]`, `retry_policy` (`reset_tasks`, `retry_window`).

### state.v2

Persistent run state with: `run_id`, `run_status` (RUNNING | COMPLETED | ABORTED), `policy`, per-task state (status, attempts, failure signatures, history), and `healing_rounds[]`. Written atomically via temp file + rename.