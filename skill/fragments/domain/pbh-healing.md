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

- Zero failures in a window: advance to the next larger batch size.
- Failure rate > 0 but <= threshold: run healer once, retry the same window.
- Failure rate > threshold: shrink one batch level, isolate repeated signatures.
- Same signature repeats after healing: escalate that task.
- No convergence (failing set unchanged across rounds): abort the run.

### Healable vs Non-Healable

Healable: `prompt_gap`, `missing_paths`, `weak_contract`, `contract_error`, `output_format`, `timeout`, `transient_infra`.

Non-healable: `blocked_external`, `real_bug`.

`build_error`, `test_error`, `smoke_error` may be healable when evidence points to prompt or configuration rather than a genuine product defect.

### Convergence

Healing converges when at least one of: total failing count drops, repeated signature count drops, or a broad failure class narrows to a local issue. Healing is non-convergent when the same set persists, same signatures repeat, or budget is exhausted.

### Healer Authority

The healer may emit bounded runtime patches (`timeout_sec`, `concurrency`, `current_batch_size`) validated by the orchestrator against operator limits. The healer must not modify `heal.schedule`, `batch.strategy`, verification commands, protected-file rules, parser behavior, or model identity.