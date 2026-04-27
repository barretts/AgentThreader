### Contracts

All public contracts are JSON, versioned (`"2.0"`), and schema-validated. Machine-readable schemas live in `schemas/`.

### manifest.v2

Declares tasks with required fields: `id`, `prompt_ref`, `depends_on`, `timeout_sec`, `verify_profile`. Optional: `context_refs`, `priority`, `retry_policy`, `resource_lock`, `metadata`.

Tasks are topologically sorted by `depends_on`. Lower `priority` values run first. A task cannot start until all dependencies are `DONE`.

`resource_lock` (optional, string) names a mutex key. Tasks sharing a `resource_lock` value serialize on an in-process mutex; tasks with different values (or `null`) are unconstrained beyond `policy.concurrency`. Unlike `depends_on`, `resource_lock` does NOT propagate state -- a `FAILED` or `BLOCKED` predecessor simply releases its lock so the next holder can proceed. Use `resource_lock` for shared-resource serialization (workdir, file, external system) and `depends_on` for genuine output dependencies. See "Concurrency Patterns" in the Architecture section.

### task_result.v2

Emitted by the worker inside `<<<TASK_RESULT_V2>>>` / `<<<END_TASK_RESULT_V2>>>` sentinels.

Required fields: `contract_version`, `task_id`, `status` (DONE | BLOCKED | FAILED | CONTRACT_ERROR), `summary`.

Optional: `changed_files`, `writes[]` (with `path`, `op`, `encoding`, `content` or `content_ref`), `evidence` (commands, log_refs, notes), `failure_class`.

#### Parser failure shape

When parsing the worker's output fails, the parser returns a `ParserFailure` with a `kind` discriminator instead of a single bare error class:

| `kind` | Meaning | Mapped `failure_class` |
|---|---|---|
| `no_output` | Worker exited with empty or very short output (below threshold). Typically signals a transient-infra problem (API auth, rate limit, network) rather than a prompt-shape issue. | `transient_infra` (subtype determined from output sample where possible) |
| `no_sentinel` | Output is substantive but missing the `<<<TASK_RESULT_V2>>>` block. Prompt did not enforce the contract. | `contract_error` |
| `json_invalid` | Sentinel block found but its body is not valid JSON. Repair (strip code fences, trailing commas) was attempted and failed. | `output_format` |
| `schema_violation` | JSON parses but does not satisfy `task_result.v2.json`. | `weak_contract` |

Distinguishing these matters: a `no_output` from a 401-blocked worker model is not the same bug as a `no_sentinel` from a worker that forgot the closing block, and the healer should respond differently. See "Healable vs Non-Healable" in the Healing Model.

### heal_decision.v2

Emitted by the healer inside `<<<HEAL_DECISION_V2>>>` / `<<<END_HEAL_DECISION_V2>>>` sentinels.

Required fields: `contract_version`, `scope` (task | batch | epoch), `decision` (RETRY | ESCALATE | NOT_FIXABLE), `failure_class`, `root_cause`, `patches[]`.

Patch targets: `shared_context`, `task_prompt`, `runtime_patch`, `contract_hint`. Each patch has `target`, `operation` (replace | append | merge), and `content`.

Optional: `learned_rule`, `escalations[]`, `retry_policy` (`reset_tasks`, `retry_window`).

### state.v2

Persistent run state with: `run_id`, `run_status` (RUNNING | COMPLETED | ABORTED), `policy`, per-task state (status, attempts, failure signatures, history), and `healing_rounds[]`. Written atomically via temp file + rename.