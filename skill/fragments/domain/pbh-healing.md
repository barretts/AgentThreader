### Progressive Batch Healing (PBH)

PBH is the default healing strategy. It starts with a small healing window, grows when stable, shrinks when unstable, and stops when automation is no longer justified.

### Scheduling Modes

| Mode | Meaning |
| --- | --- |
| `auto` | PBH with adaptive growth and shrink. **Default.** |
| `off` | Healing disabled. |
| `task` | Heal only the single failed task. Window size is always 1. |
| `batch` | Heal at fixed batch checkpoints. Default fixed size is 5. |
| `epoch` | Attempt all pending tasks before healing. |

### PBH Defaults

- `heal.schedule = auto`
- `batch.strategy = fibonacci` (sequence: 1, 2, 3, 5, 8, 13, ...)
- `failure_threshold = 0.2`
- `max_worker_attempts_per_task = 2`
- `max_heal_rounds_per_window = 2`
- `max_total_heal_rounds = 8`
- `signature_repeat_limit = 2`

### PBH Behavior

- **Fatal-transient short-circuit** (checked FIRST): any task in the window with a `failure_class` subtype tagged non-healable (e.g. `transient_infra:api_auth_blocked`, `transient_infra:tool_unavailable`) immediately aborts the run with `run_status: ABORTED`. The standard convergence rules below are NOT applied; no heal rounds are consumed. The operator must resolve the upstream condition and `--resume`. The orchestrator SHOULD print a prominent `abort_reason` message naming the affected tasks and the recommended resolution.
- Zero failures in a window: advance to the next larger batch size.
- Failure rate > 0 but <= threshold: run healer once, retry the same window.
- Failure rate > threshold: shrink one batch level, isolate repeated signatures.
- Same signature repeats after healing: escalate that task.
- No convergence (failing set unchanged across rounds): abort the run.

### Failure Class Taxonomy

| Class | Subtypes (optional) | Healable? | Healer response |
|---|---|---|---|
| `prompt_gap` | -- | yes | patch `task_prompt` |
| `missing_paths` | -- | yes | patch `shared_context` paths |
| `weak_contract` | -- | yes | patch `contract_hint` |
| `contract_error` | -- | yes | patch `task_prompt` (sentinel reminder) |
| `output_format` | -- | yes | patch with stricter formatting guidance |
| `timeout` | -- | yes | runtime patch raising `timeout_sec` |
| `transient_infra` | `api_auth_blocked` | **no** | escalate to operator (run aborts via fatal-transient short-circuit) |
| | `api_rate_limited` | yes | retry with backoff |
| | `tool_unavailable` | **no** | escalate (operator must install missing dependency) |
| | `node_version_missing` | yes | runtime patch widening prewarm set + retry |
| | `network_timeout` | yes | retry with backoff |
| | (bare, no subtype) | yes | retry within budget |
| `blocked_external` | -- | no | escalate |
| `real_bug` | -- | no | escalate |
| `build_error` | -- | conditional | heal if evidence is prompt/config; escalate if product defect |
| `test_error` | -- | conditional | same |
| `smoke_error` | -- | conditional | same; honor red/green test classification |

The subtype convention uses colon notation: `failure_class:subtype` (e.g. `transient_infra:api_auth_blocked`). `generateFailureSignature` already produces this shape; `failure_class` values in `task_result.v2` and `heal_decision.v2` MAY use it. Bare class strings remain valid as a catch-all.

`build_error`, `test_error`, `smoke_error` may be healable when evidence points to prompt or configuration rather than a genuine product defect.

### Red-Test False Failure Pattern

When verification uses a red/green test suite pattern (see Verification and Safety Model), a red-test failure can produce a `smoke_error` failure class even though the green tests pass and the patch is correct. The healer SHOULD recognize this pattern: if the verifier log shows all green tests passing and only red tests failing, the failure is a false positive. The correct response is to refine the red test or accept the result, not to retry the patch.

### Convergence

Healing converges when at least one of: total failing count drops, repeated signature count drops, or a broad failure class narrows to a local issue. Healing is non-convergent when the same set persists, same signatures repeat, or budget is exhausted.

### Healer Authority

The healer may emit bounded runtime patches (`timeout_sec`, `concurrency`, `current_batch_size`) validated by the orchestrator against operator limits. The healer must not modify `heal.schedule`, `batch.strategy`, verification commands, protected-file rules, parser behavior, or model identity.