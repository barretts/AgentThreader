<!-- managed_by: agent-threader-output -->
---
name: agent-threader-output
version: "2.0"
description: "AgentThreader manual-output variant -- build or review manifest-driven agent orchestration with structured JSON contracts, schema-validated parsing, resumable state, dependency-aware scheduling, bounded self-healing, and orchestrator-owned verification."
---

# AgentThreader Manual Output

## When To Use This Skill

Use this skill when manual chat execution no longer scales and the right answer is a repeatable runner coordinated directly through prompts, files, logs, contracts, state, and verification evidence.

Matching requests include:

- batch prompt runners over tasks, manifests, components, stories, or tickets
- manual model turns across many items with durable prompt records and response logs
- resumable or checkpointed agent loops with per-task evidence
- self-healing outer loops that diagnose failures and patch prompts
- overnight or unattended batch runs with verification gates
- stage-based workflows where items pass through multiple prompt phases
- log triage followed by targeted recheck runs

## Architecture

### Manual Architecture Overview

The manual v2 system has five moving parts:

1. **Manifest** -- declares work items, dependencies, timeouts, and verification profiles.
2. **Orchestrator** -- the agent-owned control loop that schedules work, parses contracts, runs verification, checkpoints state, and decides when healing is allowed.
3. **Prompt records** -- durable files or messages that carry each worker or healer assignment, shared context, expected outputs, and evidence requirements.
4. **Worker turn** -- a bounded model interaction that performs one task and emits a `task_result.v2` JSON contract fenced by `<<<TASK_RESULT_V2>>>` sentinels.
5. **Healer turn** -- a bounded model interaction that diagnoses fixable failures and emits a `heal_decision.v2` JSON contract fenced by `<<<HEAL_DECISION_V2>>>` sentinels.

### Control Flow

The orchestrator drains the manifest in a multi-pass loop. Every worker and healer response is treated as candidate data until its fenced JSON is parsed, validated, and written into state.

```text
Manifest
  -> Orchestrator
    loop until isRunComplete(state):
      ready = dependency-ready tasks from manifest and state
      if ready is empty: break and escalate stalled tasks
      for each ready task allowed by concurrency/resource policy:
        Write or assemble worker prompt record
        Run worker turn through the available model surface
        Persist complete transcript or response log
        Parse and validate TASK_RESULT_V2
        Run verification gates
        Apply allowed writes only after validation
        Checkpoint state
      At healing checkpoints when policy allows:
        Write or assemble healer prompt record
        Run healer turn through the available model surface
        Persist complete transcript or response log
        Parse and validate HEAL_DECISION_V2
        Apply allowed prompt, shared-context, or runtime-policy patches
    finalize: completed, resumable, escalated, or aborted
```

Exit status, conversational confidence, and prose summaries are never enough for success. The orchestrator trusts only parsed contracts, verified file state, and recorded evidence.

### Concurrency Patterns

Use `depends_on` when a later task consumes a predecessor's outputs. Use `resource_lock` when tasks share a mutable resource but do not consume each other's outputs. A failed dependency should stall its dependents; a released resource lock should not stall unrelated later work.

Choose lock keys at the granularity of the actual mutable resource, such as one key per worktree, repository checkout, package cache, or external test environment.

---

## Contracts

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

---

## Healing Model

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

---

## Verification and Safety

### Verification and Safety Model

### Verification Ownership

Verification always belongs to the orchestrator. It runs after successful parse and before final task success. The worker may report evidence, but does not own pass/fail classification.

### Verification Layers

| Layer | Timing | Purpose |
| --- | --- | --- |
| Post-parse validation | After parsing worker output | Contract integrity, candidate writes, path safety |
| Post-write build/test | After writes are applied | Build, test, lint, or type failures caused by the change |
| Final smoke/browser | After build and test pass | Runtime behavior, UI behavior, custom project checks |

### Allowed Write Path

1. Worker emits `writes[]` in `task_result.v2`.
2. Orchestrator validates those writes.
3. Orchestrator applies those writes.
4. Orchestrator verifies the result.

### Required Write Safeguards

- Path normalization (writes cannot escape workspace root).
- Protected-file denylist.
- Shrinkage detection: reject replacement when original > 100 bytes and replacement < 50% of original size (unless explicitly allowed).
- Optional `sha256_before` precondition validation.
- Backup before write.
- Rollback on verification failure.

### Red/Green Test Suite Classification

When a verification gate runs tests that contain both "red" suites (demonstrating a vulnerability or bug exists) and "green" suites (proving the fix works), the verifier MUST distinguish between them:

- Suite name containing `"without patch"` = red test: failures are acceptable
- Suite name containing `"with patch"` = green test: failures are mandatory pass

If exit code is non-zero but all failures are in red suites and at least one green test passed, verification SHOULD pass. If any green test fails, verification MUST fail with specific test names reported.

Worker prompts SHOULD enforce a naming convention:

```javascript
describe('TASK-ID - without patch (vulnerability exists)', () => { ... });
describe('TASK-ID - with patch (vulnerability fixed)', () => { ... });
```

This pattern is especially important for security exploit testing, where red tests are best-effort vulnerability demos that may be fragile, version-dependent, or environment-specific. Only the green tests (proof of fix) should gate verification.

### Self-Contained Output Directories

When the worker produces output in a patch or task directory, that directory MUST be independently runnable. Each output directory SHOULD include a `package.json` declaring its dependencies so that the verifier can install them before running tests.

The verification gate SHOULD auto-detect a `package.json` in the output directory and run `npm install --no-audit --no-fund` before executing tests. If `node_modules` already exists, the install step SHOULD be skipped.

### Worker Output Post-Processing

When the worker emits content that consumers parse for stable identifiers (PR markers, sigs, file headers, comment metadata), the orchestrator MUST own the canonical form of those identifiers. Treat worker output as advisory; rewrite to canonical form post-verify.

**Why:** workers drift. The same prompt applied across many runs produces visibly different formattings of "the same" identifier block. Stable parsing downstream requires deterministic canonical form. Empirical example: a single rebody prompt applied to 7 PRs produced 7 different signature-footer shapes (some `<sub>`-wrapped, some plain prose, some missing the hash entirely, some with model-invented hash values).

**Pattern:**

1. Worker emits the artifact (PR body, comment, file content) including its best-effort version of the canonical block (or omitting it entirely).
2. Orchestrator's verify gate accepts the artifact's content correctness.
3. AFTER verify, the orchestrator applies a post-processor that:
   - Strips any improvised version of the canonical block (regex-driven cleanup).
   - Re-injects the canonical version computed in-process from run identity / project constants.
   - Is idempotent: running multiple times on the same input produces the same output.
4. Orchestrator commits the post-processed artifact (e.g. `gh pr edit --body-file`).

**Required:** post-processors must be idempotent and must not change content semantics. They are formatting-only.

**Forbidden:** the worker MUST NOT be the source of truth for cross-run identifiers. Workers may provide a placeholder or omit the block entirely; the orchestrator fills it in. See "Run Identity Markers" for the canonical three-tier identity pattern (visible header + HTML-comment marker + paired-hash sig footer).

`templates/orchestrator.ts` ships a `postProcessArtifact(ref, identity, processor)` helper for the strip-then-canonicalize pattern.

### Healer Patch Safety

Healer patches follow the same validation model. The healer is forbidden from editing product source files directly, disabling verification, bypassing protected-file rules, or changing healing schedule mid-run.

---

## Manual Execution

### Manual Execution Model

This output is for environments where the agent coordinates work directly through prompts, files, logs, and contract validation. Do not rely on companion commands, generated shell wrappers, or installed project utilities to drive the loop.

### Orchestrator Responsibilities

The orchestrator must:

- Keep the manifest and state file as the source of truth.
- Materialize each worker or healer assignment as a prompt record that includes shared context, task-specific context, contract requirements, and verification expectations.
- Persist the complete model response or transcript before parsing it.
- Extract the last matching fenced contract block for the expected contract type.
- Validate contract fields, path safety, write preconditions, and shrinkage rules before applying writes.
- Run verification gates after writes and record evidence paths in state.
- Stop on blocked external dependencies, repeated failure signatures, or exhausted healing rounds.

### Worker and Healer Turns

Worker turns perform task work and return exactly one `task_result.v2` block. Healer turns diagnose fixable prompt, context, output-format, timeout, or transient-infrastructure failures and return exactly one `heal_decision.v2` block.

When multiple model surfaces are available, choose one that can preserve full transcripts and file evidence. The execution surface is outside the architecture; the contract, validation, state, and verification rules remain the same.

### Artifact Handling

Keep each task's prompt record, response log, parsed contract, verification log, and state checkpoint addressable by path. Later healing turns should inspect those durable artifacts instead of relying on memory or chat history.

---

## State and Resume

### State and Resume

State is the durable ledger for a manual run. It records manifest digest, task status, attempts, failure signatures, verification evidence, healing rounds, and the paths of prompt records and response logs.

Resume must be conservative:

- Re-read the manifest and state before starting new work.
- Recompute dependency readiness from persisted state, not from chat history.
- Treat missing prompt records, missing response logs, or missing verification evidence as resumability failures for the affected task.
- Fail loudly if the manifest mode, task set, dependencies, or verification profile changed in a way that cannot be reconciled.
- Never mark a task done from prose alone; require a valid contract and verification evidence.

`manifest_digest` should continue to reconcile content drift within the same run mode. If a manifest change invalidates prior assumptions, start a new run or perform an explicit reconciliation step before more worker turns.

---

## Run Identity Markers

### Run Identity Markers

When this workflow produces artifacts that outlive a single run -- pull requests, review comments, repo files, generated documents, prompt records, or verification reports -- embed a stable three-tier identity pattern in the artifact body so consumers can answer "which run produced this?" with a deterministic search.

Use:

- `run_id`: logical batch identity from the manifest.
- `task_id`: task identity from the manifest.
- `attempt`: monotonically increasing attempt number for that task.

Prefer compact identity lines near the top or bottom of generated artifacts:

```text
Run: <run_id>
Task: <task_id>
Attempt: <attempt>
```

Do not use conversational memory as the only identity source. The manifest, state file, and durable artifacts must be enough to reconcile a run after interruption.

---

## Normative Specification

The full architecture, contracts, schemas, and behavioral rules are defined in `SPEC.md`. That document is the single source of truth. Read it when you need the end-to-end control flow, complete schema field definitions, or edge-case behavioral rules.

## Canonical Source Of Truth

### Schemas

Machine-readable JSON schemas live in `schemas/`. The `$schema` meta-schema declaration is intentionally omitted -- default Ajv (draft-07) does not resolve draft-2020-12, and none of these schemas use 2020-12-specific features:

| Schema | Contract |
| --- | --- |
| `manifest.v2.json` | Task manifest: tasks with deps, timeouts, verify profiles |
| `verify_profile.v2.json` | Operator-defined verification profiles with steps and rollback flag |
| `task_result.v2.json` | Worker output: task_id, status, summary, optional writes and evidence |
| `heal_decision.v2.json` | Healer output: decision, patches, learned_rule |
| `state.v2.json` | Persistent run state: run_status, policy, per-task state, healing_rounds |

These schemas are the machine-readable authority. The orchestrator validates all contracts against them before state mutation.

### Templates

Reference implementation skeletons live in `templates/`:

| File | Contents |
| --- | --- |
| `types.ts` | TypeScript type definitions for all v2 contracts: `ManifestV2`, `TaskResultV2`, `HealDecisionV2`, `StateV2`, `CliAdapter` interface, failure classes, PBH fibonacci sequence, default policy |
| `parser.ts` | Shared parser and validator: sentinel extraction (last block wins), JSON repair (strip markdown fences, trailing commas, JS comments), task result and heal decision validation, failure signature generation |
| `orchestrator.ts` | Shared runtime utilities: `writeAtomicJson` (temp file + rename) and `stableFailureSignature` (normalizes failure fingerprints) |

These templates are starting points for downstream runner implementations. Copy them into your project and extend as needed.

---

## Model Selection

### Model Selection Rule

When the user requests a self-healing runner, ask which model surfaces to use before generating the runner:

- **Worker model surface** -- performs each task and can be fast or cheap.
- **Healer model surface** -- diagnoses failures and should be more capable.

If the user does not specify, state the defaults explicitly before proceeding:

- Worker: the currently available model surface.
- Healer: the strongest available model surface in the same environment.

---

## Portability

### Portability Rules

Manual runners may adapt:

- where prompt records are stored
- how model turns are initiated
- how transcripts and verification logs are persisted
- approval handling and setup notes

Manual runners MUST preserve:

- contract field names and sentinel strings
- parser behavior
- PBH defaults and convergence rules
- state transitions and resume semantics
- path safety, shrinkage checks, and verification ownership

Manual runners MUST NOT redefine architecture, contracts, or healing policy. The transport can vary; the contract model cannot.

---

## Workflow

### Workflow

1. Define the unit of work: component, story, work package, ticket, file, or review item.
2. Create the `manifest.v2` JSON with task ids, dependencies, timeouts, verification profiles, and retry policy.
3. Write shared context and per-task prompt records.
4. Define the completion contract in each prompt record and require the worker to emit `<<<TASK_RESULT_V2>>>`.
5. Initialize the state file from the manifest.
6. Run one worker turn at a time until contract parsing, write validation, checkpointing, and verification are stable.
7. Add concurrency only after sequential execution is stable, and gate shared resources with `resource_lock`.
8. Add verification gates for build, test, lint, smoke, browser, or project-specific checks.
9. Add healing only after the base loop works; use PBH policy and bounded healer turns.
10. Resume by reading the persisted state, prompt records, response logs, and verification evidence.
