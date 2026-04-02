# AgentThreader v2: Stand-Alone Architecture Specification

**Status:** Normative v2 design proposal

**Audience:** Engineers implementing or reviewing reusable runners that invoke agentic CLIs across many tasks.

**Normative keywords:** `MUST`, `SHOULD`, and `MAY` are used in the RFC sense. `MUST` is required behavior. `SHOULD` is the default or strongly recommended behavior. `MAY` is optional behavior.

## 1. Problem Statement

This specification defines a standard architecture for building runners that repeatedly invoke agentic CLIs such as `agent`, `opencode`, and `claude` across many tasks. The purpose of the system is to make large prompt-driven workflows durable, inspectable, resumable, and safe enough to run unattended.

The hard problems in this domain are not prompt formatting alone. The hard problems are:

- durable state and resume behavior after interruptions
- deterministic parsing of machine-readable results from model output
- external verification owned by the runner instead of the model
- bounded recovery after fixable failures
- portability across multiple CLIs without rewriting the orchestrator

Prior v1 implementations diverged in three main areas:

- healing schedule: per-task, fixed batch, or epoch-based
- parser strategy: regex/text extraction versus structured contracts
- platform packaging: each IDE or tool surface redefining architecture in its own wrapper

This v2 specification replaces that divergence with one canonical design. The system defined here is intended for:

- batch code edits
- audit and evaluation runs
- stage-based workflows
- resumable overnight runs
- bounded self-healing after fixable failures

This v2 specification is not trying to solve:

- general-purpose multi-agent planning frameworks
- autonomous source-code editing by the healer
- unbounded retry loops
- platform-specific UX beyond thin wrappers

## 2. Goals and Non-Goals

### Goals

- Define one vocabulary, one runtime model, and one contract stack for all implementations.
- Make the orchestrator the single source of truth for task status, verification, checkpointing, and healing policy.
- Standardize worker and healer output as schema-validated JSON contracts.
- Preserve CLI portability through adapters rather than forking orchestrator logic.
- Define a default healing model that starts conservative, expands when stable, and stops when automation is no longer justified.
- Define enough detail that a peer can implement the system without prior knowledge of v1 variants or this repository.

### Non-Goals

- This document does not prescribe project-specific build, test, or browser commands.
- This document does not require a specific product repository structure beyond the files needed by the runner.
- This document does not require a specific agent model or provider.
- This document does not define a UI or dashboard for monitoring runs.

### Assumptions

- Readers are technical peers evaluating architecture, not end users.
- The document is a normative v2 design document, not a brainstorm or rough proposal.
- Platform wrappers are packaging concerns and are not allowed to redefine architecture.
- The reference implementation is expected to run TypeScript via global `tsx`.

## 3. Glossary

| Term | Definition |
| --- | --- |
| `Task` | The smallest unit of work the runner schedules, executes, verifies, and tracks. |
| `Manifest` | The source of truth for the set of tasks and their metadata. |
| `Shared Context` | Reusable prompt material applied to multiple tasks, such as operating constraints, style rules, or output contract reminders. |
| `Worker` | The model or CLI invocation that performs the actual task work. |
| `Healer` | The model or CLI invocation that analyzes fixable failures and emits allowed patches to prompts, shared context, or bounded runtime knobs. |
| `Orchestrator` | The deterministic runtime that owns scheduling, parsing, verification, checkpointing, healing, and retry policy. |
| `Adapter` | The CLI-specific execution layer used by the orchestrator to invoke a tool without embedding tool-specific behavior in the core runtime. |
| `Verification Gate` | Any external check run by the orchestrator after worker output is parsed, such as build, test, lint, smoke, or browser validation. |
| `Failure Class` | The normalized reason category assigned to a failed task. |
| `Failure Signature` | The stable, comparable fingerprint used to detect repeated failures across tasks or retries. |
| `Batch` | The current window of ready tasks processed before the orchestrator evaluates whether healing is needed. |
| `Epoch` | One full sweep over all currently pending tasks. |
| `PBH` | Progressive Batch Healing, the default healing strategy that adjusts batch size based on observed stability. |
| `Convergence` | Evidence that healing is reducing failures rather than repeating them. |
| `Escalation` | A terminal outcome where the system stops retrying a task or run because further automated healing is not justified. |

## 4. System Overview

The canonical v2 system has five moving parts:

- a manifest that declares work
- an orchestrator that owns truth
- adapters that invoke specific CLIs
- a worker that proposes task results
- a healer that proposes bounded recovery patches

At a high level, the system operates like this:

```text
Manifest
  -> Orchestrator
    -> Adapter
      -> Worker
    -> Parser and Schema Validator
    -> Verification Gates
    -> State Checkpoint
    -> Healer Checkpoint
      -> Adapter
        -> Healer
      -> Patch Validation and Application
    -> Resume or Escalate
```

The orchestrator owns truth at every stage. Worker and healer outputs are only candidate data until the orchestrator validates them and commits them to state.

### Canonical Source Tree

The canonical source of truth SHOULD be organized like this:

```text
agent-threader/
  SKILL.md
  SPEC.md
  schemas/
  templates/
  platforms/
```

The purpose of each top-level artifact is:

- `SKILL.md`: short entrypoint describing when to use the skill and where the normative specification lives
- `SPEC.md`: the normative architecture document
- `schemas/`: JSON schemas for manifest, worker result, healer decision, and state
- `templates/`: reference runtime, parser, and adapter skeletons
- `platforms/`: thin wrappers for `cursor`, `codex`, `claude`, and `windsurf`

Platform wrappers MUST NOT define new architectural behavior. They MAY describe invocation syntax, UX wording, or tool-specific setup.

### Default Configuration

| Setting | Default |
| --- | --- |
| Reference runtime | TypeScript via global `tsx` |
| Contract format | Fenced JSON only |
| Default healing schedule | `auto` |
| Default healing strategy | `PBH` |
| Batch growth strategy | `fibonacci` |
| Manual batch size default | `5` |
| Failure threshold | `0.2` |
| Max worker attempts per task | `2` |
| Max heal rounds per window | `2` |
| Max total heal rounds | `8` |
| Signature repeat limit | `2` |
| Verification owner | Orchestrator |
| Parser authority | Schema-validated parser modules only |

## 5. Canonical Runtime Model

### Runtime Choice

The reference implementation SHOULD be a typed TypeScript orchestrator executed via global `tsx`.

This choice means:

- `tsx` is assumed to be globally available in environments using the reference implementation
- shell and expect remain valid as adapter implementations, not as the canonical orchestration core
- Python is no longer the normative parser runtime
- conforming orchestrators MAY be implemented in other languages if they preserve the same contracts, state transitions, parser guarantees, and healing behavior

### Stable Ordering Rules

The orchestrator MUST build a stable execution order:

- Tasks MUST be topologically sorted by `depends_on`.
- Lower `priority` values SHOULD run before higher `priority` values.
- If dependency depth and priority are equal, manifest order MUST be preserved.
- A task MUST NOT start until all of its dependencies are `DONE`.

### Concurrency and Window Semantics

In this specification, `concurrency` and `parallelism` mean the same thing: two or more worker processes executing at the same time and consuming real runtime resources such as CPU threads, process slots, or provider capacity.

The orchestrator MUST support these rules:

- Default `concurrency` is `1`.
- A window is the scheduling set currently being attempted before a healing checkpoint.
- The effective attempted window size is `min(current_batch_size, count of ready tasks in the current scheduling slice)`.
- Tasks within a window MAY run sequentially or in parallel.
- If `concurrency > 1`, tasks in the same window MAY execute simultaneously, but each task MUST still respect `depends_on`.
- A window is complete only when every runnable task assigned to that window has settled into one of: `DONE`, `BLOCKED`, `FAILED`, or `ESCALATED` for that attempt.
- Healing MUST NOT trigger mid-window.
- Every concurrently executed task MUST write to its own worker log and verify log paths.
- State updates from concurrent completions MUST still preserve atomic checkpoint semantics.

### End-to-End Control Flow

The orchestrator MUST implement this control flow:

1. Load the manifest.
2. Load or initialize state.
3. Validate the manifest against `manifest.v2`.
4. Build the dependency-resolved pending queue.
5. Run worker tasks through adapters.
6. Parse fenced result JSON from worker output.
7. Run verification gates.
8. Classify task outcome and generate a failure signature if needed.
9. Checkpoint state atomically.
10. Invoke the healer at batch checkpoints when policy says healing is needed.
11. Apply validated allowed patches.
12. Reset retryable tasks and continue.
13. Stop on completion, bounded non-convergence, or unrecoverable escalation.

### Core Runtime Rules

- The orchestrator MUST capture combined stdout and stderr for every worker and healer invocation.
- Exit code alone MUST NOT be treated as task success.
- The orchestrator MUST parse and validate worker and healer contracts before any state mutation.
- The orchestrator MUST run verification after parse succeeds and before a task can become `DONE`.
- The orchestrator MUST checkpoint state after every task attempt and every healing round.
- The orchestrator MUST treat direct model prose outside the fenced contracts as non-authoritative.
- The orchestrator MUST use non-destructive logging: write full logs first, then inspect or parse them.
- The orchestrator MUST trap shutdown signals, terminate child processes it started, and leave state in a resumable condition.

### Shared Skill Utilities

Parser, validation, hashing, rollback, and state utility functions SHOULD exist as shared skill utilities rather than being reimplemented inside each adapter.

Adapters MAY expose convenience helpers, but contract extraction and schema validation MUST resolve to shared parser and validator utilities so all adapters produce identical acceptance and failure behavior.

### Parser Error Handling

The parser layer MUST return deterministic error classes. At minimum, it MUST support:

- `NO_SENTINEL`
- `INVALID_JSON`
- `SCHEMA_VIOLATION`
- `MISSING_REQUIRED_FIELD`
- `UNSUPPORTED_VERSION`

Parser errors SHOULD be converted into normalized failure classes and signatures by the orchestrator.

Before returning `INVALID_JSON`, the shared parser utility SHOULD attempt a conservative repair pass limited to:

- stripping outer markdown fences
- removing trailing commas
- removing JavaScript-style comments

If repair still fails, the task MUST be treated as a contract error.

## 6. Healing Model (`PBH`)

### Scheduling Modes

The canonical schedule enum MUST be:

- `auto`
- `off`
- `task`
- `batch`
- `epoch`

The meaning of each mode is:

| Mode | Meaning |
| --- | --- |
| `auto` | Use Progressive Batch Healing with adaptive growth and shrink behavior. |
| `off` | Disable healing entirely. |
| `task` | Heal only the single failed task being retried. Effective window size is always `1`. |
| `batch` | Heal at fixed batch checkpoints using a fixed `batch_size`. Default fixed batch size is `5`. |
| `epoch` | Attempt all currently pending tasks before healing. Effective window size is all pending tasks in the epoch. |

`auto` MUST be the default and MUST be the only mode that uses progressive growth and shrink behavior.

### PBH Definition

Progressive Batch Healing (`PBH`) is the default healing strategy. Under PBH:

- the orchestrator starts with a small healing window
- it increases batch size only after successful or stable windows
- it reduces batch size when failures imply systemic instability
- it retries only after a validated healer patch set is applied

### PBH Defaults

The default PBH policy MUST be:

- `heal.schedule = auto`
- `batch.strategy = fibonacci`
- fibonacci sequence = `1, 2, 3, 5, 8, 13, ...`
- `failure_threshold = 0.2`
- `max_worker_attempts_per_task = 2`
- `max_heal_rounds_per_window = 2`
- `max_total_heal_rounds = 8`
- `signature_repeat_limit = 2`

### Failure Rate

For PBH, `failure_rate` MUST be defined as:

```text
failure_rate = healable_failed_tasks_in_window / attempted_healable_tasks_in_window
```

`healable_failed_tasks_in_window` includes only tasks in the current window that:

- were attempted in the current window, and
- ended the attempt in a non-`DONE` state, and
- are currently classified by the orchestrator as healable

`BLOCKED` tasks and non-healable failures MUST NOT count toward the PBH failure-rate numerator. They still count for reporting and MAY cause escalation, but they do not consume heal budget by themselves.

If `attempted_healable_tasks_in_window == 0`, then:

- `failure_rate` is treated as `0`
- the orchestrator MUST skip healer invocation for that window
- the window MAY still produce escalations for blocked or non-healable failures

### PBH Behavior

The orchestrator MUST implement the following behavior in `auto` mode:

- If a window finishes with zero failures, move to the next larger batch size in the configured sequence.
- If failure rate is greater than `0` but less than or equal to `failure_threshold`, run the healer once and retry the same window.
- If failure rate is above `failure_threshold`, shrink one batch level and isolate repeated signatures.
- If the same task repeats the same failure signature after allowed healing, escalate that task.
- If healing rounds stop reducing total failing tasks or signature diversity, abort the run and record the non-convergence reason in the run summary and state.

If PBH fails to heal a run, the run MUST be aborted rather than looping indefinitely. The abort record MUST include a human-readable reason, such as:

- repeated same failure signatures after allowed retries
- no reduction in failing task count across heal rounds
- total healing budget exhausted
- current window contains only non-healable outcomes

### Healable Versus Non-Healable Failures

The orchestrator MUST classify each failure as `healable` or `non_healable`.

The default healable set SHOULD include:

- `prompt_gap`
- `missing_paths`
- `weak_contract`
- `contract_error`
- `output_format`
- `timeout`
- `transient_infra`

The default non-healable set SHOULD include:

- `blocked_external`
- `real_bug`

`build_error`, `test_error`, and `smoke_error` MAY be treated as healable when evidence points to prompt, context, or runtime configuration rather than a genuine product defect.

Tasks that fail with parser-layer contract errors SHOULD receive one automatic contract-format retry before consuming normal task retry or heal budget. This retry SHOULD append a strict formatting reminder to the next worker prompt and MUST NOT invoke the healer.

### Healer Authority Under Guardrails

The healer MAY emit bounded runtime patches, but only under guardrails enforced by the orchestrator.

Allowed runtime keys are:

- `timeout_sec`
- `concurrency`
- `current_batch_size`

The healer MUST NOT modify:

- `heal.schedule`
- `batch.strategy`
- verification commands
- protected-file rules
- parser behavior
- model provider or model identity

The orchestrator MUST validate runtime patches against operator-defined limits before applying them.

## 7. Public Interfaces and Schemas

All public contracts MUST be JSON, versioned, and schema-validated.

### `manifest.v2`

#### Required Top-Level Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `manifest_version` | string | Contract version. MUST be `"2.0"`. |
| `run_id` | string | Logical run identifier. |
| `tasks` | array | Ordered list of task definitions. |

#### Required Task Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable, unique task identifier. |
| `prompt_ref` | string | Relative path or logical reference to the task prompt. |
| `depends_on` | array of strings | Upstream task IDs that must be `DONE` before execution. |
| `timeout_sec` | number | Task timeout in seconds. |
| `verify_profile` | string | Name of the project-defined verification profile. |

#### Optional Task Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `context_refs` | array of strings | Shared context references applied to the task. |
| `priority` | number | Lower number means earlier scheduling within the same dependency depth. |
| `retry_policy` | object | Task-specific retry constraints. |
| `metadata` | object | Arbitrary task metadata for reporting or filtering. |

`metadata` keys SHOULD remain flat unless nested structure is required for interoperability with an external system.

#### `retry_policy` Shape

| Field | Type | Meaning |
| --- | --- | --- |
| `max_attempts` | number | Maximum worker attempts for this task. Defaults to global policy if omitted. |
| `retry_on` | array of strings | Failure classes eligible for retry. |

### `verify_profile` Registry

`verify_profile` is a manifest reference to an operator-defined verification profile. The profile registry is outside the worker contract and MUST be resolved by the orchestrator from project configuration.

The canonical schema for this operator-owned registry is `schemas/verify_profile.v2.json`.

The minimum logical shape of a profile registry is:

```json
{
  "profiles": {
    "build_and_test": {
      "steps": [
        {
          "name": "build",
          "cmd": "pnpm build",
          "cwd": ".",
          "timeout_sec": 300
        },
        {
          "name": "test",
          "cmd": "pnpm test",
          "cwd": ".",
          "timeout_sec": 600
        }
      ],
      "rollback_on_failure": true
    }
  }
}
```

The orchestrator MAY load this registry from any project-defined path, but the registry format SHOULD be documented wherever the runner is packaged and SHOULD validate against `verify_profile.v2`.

#### Example

```json
{
  "manifest_version": "2.0",
  "run_id": "run-20260320-001",
  "tasks": [
    {
      "id": "WP-017",
      "prompt_ref": "prompts/WP-017.md",
      "context_refs": ["_shared-context.md"],
      "depends_on": [],
      "priority": 1,
      "timeout_sec": 900,
      "verify_profile": "build_and_test",
      "retry_policy": {
        "max_attempts": 2,
        "retry_on": ["prompt_gap", "timeout", "transient_infra"]
      },
      "metadata": {
        "component": "button"
      }
    }
  ]
}
```

### `task_result.v2`

The worker MUST emit exactly one fenced JSON block:

```text
<<<TASK_RESULT_V2>>>
{ ...json... }
<<<END_TASK_RESULT_V2>>>
```

#### Required Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `contract_version` | string | MUST be `"2.0"`. |
| `task_id` | string | Task ID matching the current manifest task. |
| `status` | string | One of `DONE`, `BLOCKED`, `FAILED`, `CONTRACT_ERROR`. |
| `summary` | string | Short human-readable summary of what happened. |

#### Optional Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `changed_files` | array of strings | Relative file paths changed by the proposed work. |
| `writes` | array | Proposed file write operations applied by the orchestrator. |
| `evidence` | object | Commands, log references, or notes supplied by the worker. |
| `failure_class` | string | Optional worker-supplied hint. The orchestrator still owns final classification. |

#### `writes[]` Shape

| Field | Type | Meaning |
| --- | --- | --- |
| `path` | string | Relative normalized path. MUST NOT escape the workspace root. |
| `op` | string | One of `create`, `replace`, `append`. |
| `encoding` | string | MUST be `"utf8"` for the reference implementation. |
| `content` | string | Inline file content to be applied by the orchestrator. |
| `content_ref` | string | Optional path to staged content written by the worker tooling instead of inline content. |
| `sha256_before` | string | Optional precondition hash for conflict detection. |

At least one of `content` or `content_ref` MUST be present for each write entry.

The orchestrator SHOULD prefer inline `content` for small and medium files. `content_ref` MAY be used when the worker environment can stage large content more reliably than JSON escaping.

#### `evidence` Shape

| Field | Type | Meaning |
| --- | --- | --- |
| `commands` | array of strings | Commands the worker claims to have run. |
| `log_refs` | array of strings | Relative log references produced by the worker. |
| `notes` | array of strings | Additional structured evidence notes. |

#### Example

```json
{
  "contract_version": "2.0",
  "task_id": "WP-017",
  "status": "DONE",
  "summary": "Implemented focus-visible fix and updated tests.",
  "changed_files": [
    "packages/ui/button.tsx",
    "packages/ui/button.test.ts"
  ],
  "writes": [
    {
      "path": "packages/ui/button.tsx",
      "op": "replace",
      "encoding": "utf8",
      "content": "export function Button() {}",
      "sha256_before": "sha256:example"
    }
  ],
  "evidence": {
    "commands": [
      "pnpm --filter sample-site test:filter button"
    ],
    "log_refs": [
      "logs/WP-017.verify.log"
    ]
  }
}
```

### `heal_decision.v2`

The healer MUST emit exactly one fenced JSON block:

```text
<<<HEAL_DECISION_V2>>>
{ ...json... }
<<<END_HEAL_DECISION_V2>>>
```

#### Required Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `contract_version` | string | MUST be `"2.0"`. |
| `scope` | string | Advisory healer view of the current healing level. One of `task`, `batch`, `epoch`. |
| `decision` | string | One of `RETRY`, `ESCALATE`, `NOT_FIXABLE`. |
| `failure_class` | string | Normalized failure class the healer is addressing. |
| `root_cause` | string | One-sentence diagnosis of the repeated issue. |
| `patches` | array | Allowed patch operations. |

#### Optional Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `learned_rule` | string | Reusable rule recorded by the orchestrator for future runs. |
| `escalations` | array | Explicit per-task escalation records. |
| `retry_policy` | object | Optional retry/reset directives for the orchestrator. |

#### `patches[]` Shape

| Field | Type | Meaning |
| --- | --- | --- |
| `target` | string | One of `shared_context`, `task_prompt`, `runtime_patch`, `contract_hint`. |
| `operation` | string | One of `replace`, `append`, `merge`. |
| `path` | string | Required for `shared_context` and task prompt file replacements. |
| `task_id` | string | Required when target is `task_prompt`. |
| `content` | string or object | Patch payload. String for text replacements, object for runtime merge content. |

`scope` is informational and MAY be recorded for diagnostics, but the orchestrator MUST derive actual patch applicability from:

- the active healing schedule
- the current window membership
- the patch targets present in `patches[]`

The orchestrator MUST NOT grant additional authority solely because the healer labeled a decision as `epoch` or `batch`.

`contract_hint` means non-authoritative text merged into future prompt assembly. It is not a file write by itself. The orchestrator MUST apply `contract_hint` like this:

- current healing scope means the set of task IDs included in the healer input bundle for the current invocation
- if `task_id` is present, append the hint to the next assembled worker prompt for that task only
- if `task_id` is absent, append the hint to the next assembled prompt for every task in the current healing scope
- `contract_hint` MUST NOT be written to disk unless another patch explicitly writes a file

#### `retry_policy` Shape

| Field | Type | Meaning |
| --- | --- | --- |
| `reset_tasks` | array of strings | Tasks to reset to pending for retry. |
| `retry_window` | string | One of `same_window`, `shrink_window`, `next_epoch`. |

#### Example

```json
{
  "contract_version": "2.0",
  "scope": "batch",
  "decision": "RETRY",
  "failure_class": "prompt_gap",
  "root_cause": "Shared context omitted the import convention needed by multiple tasks.",
  "patches": [
    {
      "target": "shared_context",
      "operation": "append",
      "path": "_shared-context.md",
      "content": "Always include the cn() import rule."
    },
    {
      "target": "task_prompt",
      "operation": "replace",
      "task_id": "WP-017",
      "path": "prompts/WP-017.md",
      "content": "Use the shared import convention and emit TASK_RESULT_V2."
    },
    {
      "target": "runtime_patch",
      "operation": "merge",
      "content": {
        "timeout_sec": 1200,
        "current_batch_size": 2
      }
    },
    {
      "target": "contract_hint",
      "operation": "append",
      "task_id": "WP-017",
      "content": "Return exactly one TASK_RESULT_V2 block at end of output."
    }
  ],
  "learned_rule": "When GTS tasks fail in a group, patch shared context before retrying isolated prompts.",
  "retry_policy": {
    "reset_tasks": ["WP-017", "WP-018"],
    "retry_window": "same_window"
  },
  "escalations": []
}
```

### `state.v2`

#### Required Top-Level Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `state_version` | string | MUST be `"2.0"`. |
| `run_id` | string | Current run identifier. |
| `run_status` | string | One of `RUNNING`, `COMPLETED`, `ABORTED`. |
| `abort_reason` | string or null | Human-readable abort reason when `run_status` is `ABORTED`. |
| `manifest_digest` | string | Hash of the normalized manifest used for resume validation. |
| `policy` | object | Effective runtime policy for this run. |
| `tasks` | object | Per-task state keyed by task ID. |
| `healing_rounds` | array | Ordered record of healing checkpoints. |

#### Required `policy` Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `heal_schedule` | string | Effective schedule mode. |
| `batch_strategy` | string | Usually `fibonacci` or `fixed`. |
| `current_batch_size` | number | Current effective window size. |
| `failure_threshold` | number | PBH threshold for the current run. |
| `max_worker_attempts_per_task` | number | Effective retry cap. |
| `max_heal_rounds_per_window` | number | Effective heal cap per window. |
| `max_total_heal_rounds` | number | Effective total heal budget. |
| `signature_repeat_limit` | number | Repeated signature escalation cap. |

#### Required Per-Task Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | string | One of `PENDING`, `RUNNING`, `DONE`, `BLOCKED`, `FAILED`, `ESCALATED`. |
| `worker_attempts` | number | Current worker attempt count. |
| `healer_attempts` | number | Current healer attempt count affecting the task. |
| `last_failure_class` | string or null | Most recent normalized failure class. |
| `last_failure_signature` | string or null | Most recent normalized failure signature. |
| `applied_patch_ids` | array of strings | Patch identifiers applied to this task or its shared context. |
| `history` | array | Attempt history records. |

#### Required History Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `task_id` | string | Task ID for the record. |
| `phase` | string | One of `worker`, `verify`, `healer`, `rollback`. |
| `attempt_number` | number | Monotonic attempt number within the phase. |
| `log_path` | string | Relative path to the primary log. |
| `verify_log_path` | string or null | Relative path to verification log when applicable. |
| `exit_code` | number or null | Process exit code when applicable. |
| `failure_class` | string or null | Failure class for that attempt. |
| `failure_signature` | string or null | Failure signature for that attempt. |
| `applied_patch_ids` | array of strings | Patches active for that attempt. |
| `duration_sec` | number or null | Attempt duration in seconds when measurable. |
| `timestamp` | string | ISO-8601 timestamp. |

#### Example

```json
{
  "state_version": "2.0",
  "run_id": "run-20260320-001",
  "run_status": "RUNNING",
  "abort_reason": null,
  "manifest_digest": "sha256:example",
  "policy": {
    "heal_schedule": "auto",
    "batch_strategy": "fibonacci",
    "current_batch_size": 2,
    "failure_threshold": 0.2,
    "max_worker_attempts_per_task": 2,
    "max_heal_rounds_per_window": 2,
    "max_total_heal_rounds": 8,
    "signature_repeat_limit": 2
  },
  "tasks": {
    "WP-017": {
      "status": "FAILED",
      "worker_attempts": 1,
      "healer_attempts": 1,
      "last_failure_class": "build_error",
      "last_failure_signature": "build_error:missing-cn-import",
      "applied_patch_ids": ["patch-001"],
      "history": [
        {
          "task_id": "WP-017",
          "phase": "worker",
          "attempt_number": 1,
          "log_path": "logs/WP-017.worker.1.log",
          "verify_log_path": "logs/WP-017.verify.1.log",
          "exit_code": 0,
          "failure_class": "build_error",
          "failure_signature": "build_error:missing-cn-import",
          "applied_patch_ids": [],
          "duration_sec": 42,
          "timestamp": "2026-03-20T15:21:00Z"
        }
      ]
    }
  },
  "healing_rounds": [
    {
      "round_number": 1,
      "scope": "batch",
      "window_task_ids": ["WP-017", "WP-018"],
      "failed_task_ids": ["WP-017", "WP-018"],
      "decision": "RETRY",
      "applied_patch_ids": ["patch-001"],
      "timestamp": "2026-03-20T15:25:00Z"
    }
  ]
}
```

### `adapter.v2`

The reference adapter contract SHOULD be expressed in TypeScript like this:

```ts
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

export interface CliAdapter {
  id: string;
  capabilities: {
    stdinPrompt: boolean;
    argPrompt: boolean;
    pty: boolean;
    interactive: boolean;
  };
  prepare(task: ManifestTaskV2, ctx: RunContext): PreparedInvocation;
  execute(invocation: PreparedInvocation, ctx: RunContext): Promise<ExecutionArtifact>;
  extractResult(artifact: ExecutionArtifact, ctx: RunContext): Promise<TaskResultV2 | ParserFailure>;
  healthcheck(ctx: RunContext): Promise<AdapterHealth>;
}
```

`extractResult` MUST validate `task_result.v2` and MUST return deterministic parser failures on invalid output.
`extractResult` MUST use the shared parser and validator utilities provided by the skill rather than adapter-specific parsing logic.

## 8. Verification and Safety Model

### Verification Ownership

Verification always belongs to the orchestrator. Verification MUST run after successful parse and before final task success.

The worker MAY report evidence, but the worker does not own final pass or fail classification.

If verification fails, the orchestrator MUST NOT record `DONE` regardless of the worker-declared `status`.

### Verification Layers

The orchestrator MUST support three verification layers:

| Layer | Timing | Purpose |
| --- | --- | --- |
| Post-parse validation | Immediately after parsing worker output | Validate contract integrity, candidate writes, path safety, and parser consistency. |
| Post-write build or test validation | After writes are applied | Detect build, test, lint, or type failures caused by the change. |
| Final smoke or browser validation | After build and test pass | Confirm runtime behavior, UI behavior, or custom project checks when needed. |

### Allowed Write Path

The only canonical write path is:

1. worker emits `writes[]` in `task_result.v2`
2. orchestrator validates those writes
3. orchestrator applies those writes
4. orchestrator verifies the result

Worker output MUST NOT be treated as direct authority to mutate protected files outside this path.

### Required Write Safeguards

The orchestrator MUST enforce these safeguards:

- path normalization so writes cannot escape the workspace root
- protected-file denylist
- shrinkage detection
- optional `sha256_before` precondition validation
- backup before write
- rollback on verification failure

The default shrinkage rule SHOULD reject a replacement when:

- the original file is larger than `100` bytes, and
- the replacement is less than `50%` of the original size, and
- the task or operator has not explicitly allowed the shrinkage

### Healer Patch Safety

Healer patches are subject to the same validation model for prompt and shared context files.

The healer is forbidden from:

- editing product source files directly
- disabling verification
- bypassing protected-file rules
- changing healing schedule mid-run

`runtime_patch` targets MAY adjust bounded runtime settings only when those settings are exposed by the operator configuration.

### Parser Authority

The parser and validator modules are the only authority allowed to interpret worker and healer contracts.

The orchestrator MUST NOT:

- parse unconstrained model prose with regex as the normative path
- trust exit code alone as success
- treat an unvalidated JSON body as a valid contract

If multiple fenced blocks exist in a log, the parser MUST use the last matching fenced block for that contract type. This rule exists to defeat prompt echo contamination and duplicate draft outputs.

## 9. Adapter Model

### Adapter Responsibilities

Adapters are the only place where CLI-specific behavior lives. An adapter MUST:

- construct the concrete CLI invocation
- decide whether prompt delivery uses stdin, argv, or PTY interaction
- manage PTY or expect requirements for interactive CLIs
- capture combined stdout and stderr to the execution log
- return execution artifacts to the orchestrator
- delegate contract parsing and schema validation to the shared parser and validator utilities

### Orchestrator Responsibilities

The orchestrator core MUST:

- never call CLIs directly except through `CliAdapter.execute`
- never parse raw logs without going through parser and validator modules
- never assume exit code alone means success
- remain CLI-agnostic outside the adapter boundary

### Initial Reference Adapters

The initial reference adapters SHOULD be:

- `agent`
- `opencode`
- `claude`

These adapters MUST share one orchestrator contract model even if their invocation mechanics differ.

### Interactive CLIs

For interactive CLIs, prompt rescue logic and TTY heuristics are adapter-local behavior. The core runtime MUST NOT embed tool-specific rescue logic.

Examples of adapter-local behavior include:

- trust prompt handling
- permission prompt handling
- idle detection
- PTY completion heuristics

Interactive adapters SHOULD also implement:

- ANSI stripping before parser handoff
- bounded idle detection
- finite rescue attempts for blocked prompts
- explicit completion detection before declaring success

### Design Proof From Recent Tempest Runners

Recent Tempest runners provide empirical design proof for several behaviors that this specification adopts:

- the newest gap-remediation runner demonstrated dependency-aware scheduling, bounded concurrency, backups, and rollback on verification failure
- storybook audit and fix runners demonstrated long-running batch logging and semaphore or file-lock style coordination
- component-check plus expect wrappers demonstrated server lifecycle ownership and adapter-local handling for interactive CLIs

These examples are evidence for the design. They are not normative inputs to the specification and are not required to understand or implement v2.

## 10. State, Resume, and Convergence Rules

### Atomic State Writes

Atomic state writes are mandatory. The orchestrator MUST write state via a temporary file followed by atomic rename on the same filesystem.

### Resume Semantics

The orchestrator MUST implement resume like this:

- `DONE` tasks are skipped on resume if `manifest_digest` still matches
- if `manifest_digest` changes, the orchestrator MUST warn or force reconciliation before reuse
- `ESCALATED` tasks are not retried automatically
- `FAILED` and `BLOCKED` tasks are eligible only if retry policy allows it

The orchestrator SHOULD provide a reconciliation mode that can mark affected tasks back to `PENDING` when the manifest changes in a way that invalidates prior attempts.

At minimum, reconciliation SHOULD handle:

- tasks removed from the manifest since the last run
- tasks added since the last run
- tasks whose `prompt_ref`, `depends_on`, or `verify_profile` changed

### Failure Signature Generation

The orchestrator MUST generate stable failure signatures. The failure signature algorithm MUST:

1. start with the normalized failure class
2. extract the primary stable signal from parser output, verification logs, or known error codes
3. remove timestamps, absolute paths, task IDs, and obviously unstable numeric fragments where possible
4. lowercase and collapse whitespace
5. truncate to a stable maximum length

The resulting format SHOULD be:

```text
<failure_class>:<normalized_primary_signal>
```

Examples:

- `contract_error:no_sentinel`
- `build_error:missing_cn_import`
- `timeout:worker_idle`

### Convergence Rules

Healing is converging only if at least one of these conditions is true after a healing round:

- total failing task count drops
- repeated signature count drops
- a broader failure class narrows to a more local and isolated issue

Healing is non-convergent if any of these conditions is true:

- the same task repeats the same signature after allowed retries
- the same failing set persists across rounds
- total healing budget is exhausted without measurable improvement

### Escalation Rules

Per-task escalation MUST happen when:

- a task repeats the same failure signature `signature_repeat_limit` times after healing
- a failure is classified as non-healable and retry policy does not permit further attempts

Per-run escalation MUST happen when:

- `max_total_heal_rounds` is exhausted without convergence
- the orchestrator determines that continuing would only repeat the same failure set

Escalated tasks MUST remain in state for reporting and MUST NOT be silently dropped.

When a run is aborted for non-convergence, the orchestrator MUST:

- set `run_status` to `ABORTED`
- write a non-empty `abort_reason`
- persist the final failing task set and last observed failure signatures
- include the same reason in the human-readable run summary

### Learned Rule Lifecycle

`learned_rule` entries are durable run artifacts, not automatic policy changes.

The orchestrator MUST:

- record each accepted `learned_rule` in state or a linked healing journal
- record which healing round produced the rule

The orchestrator MUST NOT automatically promote a learned rule into canonical shared context unless an operator or higher-level workflow explicitly chooses to do so.

The orchestrator MAY expose learned rules to future runs as optional advisory input, but this behavior MUST be opt-in and clearly labeled as non-canonical.

## 11. Rollout and Migration

### Replace-Now Migration Strategy

This specification assumes a replace-now migration. The migration steps are:

1. Freeze schemas and enums.
2. Publish canonical `SKILL.md` and `SPEC.md`.
3. Add the TSX reference orchestrator and validator modules.
4. Wrap current shell and expect flows behind adapters.
5. Replace platform-specific authoritative docs with thin wrappers.
6. Mark legacy parsing and legacy contract docs as deprecated.
7. Run a reference validation manifest before declaring cutover complete.

### Legacy Variant Behavior

After cutover:

- old docs remain historical references only
- old docs MUST NOT define new behavior
- legacy text or XML parsing MAY exist only as an explicit compatibility plugin
- compatibility plugins are non-normative and MUST NOT be the default path

### Wrapper Rules

Platform-specific wrapper files MUST:

- point to the canonical `SKILL.md` and `SPEC.md`
- stay thin
- avoid duplicating architecture

Platform-specific wrapper files MUST NOT:

- redefine healing policy
- redefine contract formats
- introduce parser behavior not described by the canonical spec

### Recommended Packaging Outcome

The migration SHOULD leave one canonical source tree plus thin platform wrappers. Monolithic platform-specific architecture documents SHOULD be retired as authoritative artifacts.

## 12. Test Plan and Acceptance Criteria

### Architecture-Level Test Scenarios

The minimum test matrix MUST cover:

- valid worker JSON result
- missing worker fence
- invalid worker JSON
- invalid healer JSON
- schema violation on either contract
- prompt echo contamination with multiple fenced blocks
- automatic contract-error retry without heal-budget consumption
- successful verification after write
- failed verification with rollback
- protected-file rejection
- shrinkage rejection
- concurrent window completion with atomic checkpoints
- signal-triggered shutdown with resumable state
- resume after interruption
- manifest digest mismatch
- PBH growth on stable windows
- PBH retry on moderate failures
- PBH shrink on instability
- PBH abort with recorded non-convergence reason
- repeated-signature escalation
- adapter parity across `agent`, `opencode`, and `claude`

### Implementation Acceptance Criteria

The implementation is complete only if:

- all platform wrappers consume the same canonical schemas
- the reference runtime uses the same control flow and healing policy regardless of adapter
- at least one integration test exists per adapter
- legacy regex-only parser paths are disabled by default
- migration behavior is documented without ambiguity

### Document Acceptance Criteria

The document is acceptable only if:

- a peer unfamiliar with repository history can explain the system after reading it once
- a second engineer can implement schemas and runtime behavior without asking what key terms mean
- all defaults, stop conditions, and safety rules are explicitly named
- the specification no longer depends on Tempest-specific local paths to make sense

## 13. Appendix: Mapping from Legacy Variants

| Legacy concept | v2 mapping |
| --- | --- |
| Per-task healing | `heal.schedule = task` |
| Fixed batch healing | `heal.schedule = batch` with fixed `batch_size` |
| Epoch healing | `heal.schedule = epoch` |
| New default healing | `heal.schedule = auto` with `PBH` |
| Shell-first regex parser stack | Fenced JSON contracts plus schema validation |
| Monolithic platform docs | Thin wrappers pointing to canonical `SKILL.md` and `SPEC.md` |
| Shell or expect orchestration cores | Adapter implementations beneath the reference orchestrator or conforming alternate runtimes |
| Tempest runner behavior | Design proof only, not normative spec text |

The practical effect of this mapping is:

- old per-task healing still exists, but it is no longer the default
- old fixed batch healing still exists, but it is now an explicit override
- old epoch healing still exists, but it is now an explicit override
- the new default is adaptive `PBH`
- the new parser path is structured JSON plus schema validation, not text scraping

## Final Position

v2 is a spec-first, adapter-based, typed orchestration system with:

- one orchestrator-owned execution model
- one strict JSON contract stack
- one adapter boundary for multiple CLIs
- one default healing policy: `PBH`
- one reference runtime: TypeScript via global `tsx`
- conforming alternate runtimes allowed if they preserve the same contracts, state transitions, parser guarantees, and healing behavior

This document is written so that a peer can understand the system without any other repo context and implement it without needing unwritten design assumptions.
