# AgentThreader Agents Guide

This document describes the agent roles, workflows, and patterns for the AgentThreader system.

## Overview

AgentThreader is a portable skill and companion CLI for manifest-driven agentic CLI orchestration. It provides structured contracts, resumable state, orchestrator-owned verification, and bounded self-healing for running agentic CLIs across many tasks.

## Core Components

### 1. Manifest

The manifest declares work items, dependencies, timeouts, and verification profiles. It is the source of truth for what work needs to be done.

**Location:** `manifest.v2` (or any path specified via CLI)

**Required Fields:**
- `manifest_version`: Must be `"2.0"`
- `run_id`: Logical run identifier
- `tasks`: Array of task definitions

**Example:**
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

### 2. Orchestrator

The orchestrator owns scheduling, parsing, verification, checkpointing, healing, and retry policy. It is the single source of truth for task status.

**Location:** `src/lib/orchestrator/`

**Responsibilities:**
- Load and validate manifest
- Build dependency-resolved pending queue
- Run worker tasks through adapters
- Parse fenced result JSON from worker output
- Run verification gates
- Classify task outcome and generate failure signatures
- Checkpoint state atomically
- Invoke healer at batch checkpoints when policy says healing is needed
- Apply validated allowed patches
- Stop on completion, bounded non-convergence, or unrecoverable escalation

### 3. Adapters

Adapters are CLI-specific execution layers that invoke specific CLIs through a uniform interface.

**Location:** `src/lib/adapters/`

**Supported Adapters:**
- `agent` - OpenAI Codex agent
- `opencode` - OpenCode CLI
- `claude` - Anthropic Claude CLI

**Adapter Responsibilities:**
- Construct the concrete CLI invocation
- Decide whether prompt delivery uses stdin, argv, or PTY interaction
- Manage PTY or expect requirements for interactive CLIs
- Capture combined stdout and stderr to the execution log
- Return execution artifacts to the orchestrator
- Delegate contract parsing and schema validation to shared parser utilities

### 4. Worker

The worker is the model invocation that performs task work and emits a `task_result.v2` JSON contract.

**Location:** Defined in task prompts under `prompts/`

**Responsibilities:**
- Read the task prompt and shared context
- Execute the requested work
- Emit a `task_result.v2` JSON contract in fenced format

**Output Format:**
```text
<<<TASK_RESULT_V2>>>
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
    "commands": ["pnpm --filter sample-site test:filter button"],
    "log_refs": ["logs/WP-017.verify.log"]
  }
}
<<<END_TASK_RESULT_V2>>>
```

### 5. Healer

The healer is the model invocation that analyzes fixable failures and emits a `heal_decision.v2` JSON contract.

**Location:** Defined in healer prompts

**Responsibilities:**
- Analyze failed tasks and their failure signatures
- Propose bounded recovery patches
- Emit a `heal_decision.v2` JSON contract

**Output Format:**
```text
<<<HEAL_DECISION_V2>>>
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
    }
  ],
  "learned_rule": "When GTS tasks fail in a group, patch shared context before retrying isolated prompts.",
  "retry_policy": {
    "reset_tasks": ["WP-017", "WP-018"],
    "retry_window": "same_window"
  }
}
<<<END_HEAL_DECISION_V2>>>
```

## Healing Model (PBH)

Progressive Batch Healing (PBH) is the default healing strategy.

### Scheduling Modes

| Mode | Meaning |
|------|---------|
| `auto` | Use Progressive Batch Healing with adaptive growth and shrink behavior (default) |
| `off` | Disable healing entirely |
| `task` | Heal only the single failed task being retried |
| `batch` | Heal at fixed batch checkpoints using a fixed batch size |
| `epoch` | Attempt all currently pending tasks before healing |

### PBH Defaults

| Setting | Default |
|---------|---------|
| `heal.schedule` | `auto` |
| `batch.strategy` | `fibonacci` |
| `failure_threshold` | `0.2` |
| `max_worker_attempts_per_task` | `2` |
| `max_heal_rounds_per_window` | `2` |
| `max_total_heal_rounds` | `8` |
| `signature_repeat_limit` | `2` |

### PBH Behavior

1. Start with a small healing window (batch size 1)
2. Increase batch size only after successful or stable windows
3. Reduce batch size when failures imply systemic instability
4. Retry only after a validated healer patch set is applied
5. Stop when:
   - Zero failures in a window (grow batch)
   - Failure rate ≤ threshold (heal once, retry)
   - Failure rate > threshold (shrink batch, isolate signatures)
   - Same failure signature repeats (escalate)
   - No convergence after allowed healing rounds (abort)

### Healable vs Non-Healable Failures

**Healable:**
- `prompt_gap`
- `missing_paths`
- `weak_contract`
- `contract_error`
- `output_format`
- `timeout`
- `transient_infra`

**Non-Healable:**
- `blocked_external`
- `real_bug`

**May be healable:**
- `build_error` (when evidence points to prompt/context)
- `test_error` (when evidence points to prompt/context)
- `smoke_error` (when evidence points to prompt/context)

## Workflow

### Standard Workflow

1. Define the unit of work (component, story, work package, ticket, file)
2. Create the manifest (`manifest.v2` JSON)
3. Write shared context and per-task prompts
4. Define the completion contract in the prompt (instruct the worker to emit `<<<TASK_RESULT_V2>>>`)
5. Choose the CLI adapter (`agent`, `opencode`, `claude`)
6. Build the orchestrator (use `templates/` as starting point)
7. Run sequential first, add concurrency after contracts and parsing are stable
8. Add verification gates (build, test, lint, smoke)
9. Add healing only after the base loop works (`--heal auto`)
10. Resume with `--resume` after interruptions

### Self-Healing Workflow

When the user requests a self-healing runner:

1. Ask which models to use:
   - **Worker CLI and model** — runs the inner loop (can be fast/cheap)
   - **Healer CLI and model** — runs the outer diagnosis loop (should be more capable)
2. If not specified, state the defaults explicitly:
   - Worker: the CLI the user is already using, default model
   - Healer: same CLI family, stronger model tier
3. Generate the orchestrator code with healing enabled
4. Run with `--heal auto`

## CLI Commands

### Scaffold

Create a new orchestrator project.

```bash
agent-threader scaffold <target-dir>
# Alias: new
```

### Validate Manifest

Validate a manifest file against the schema.

```bash
agent-threader validate-manifest <path>
# Alias: validate
```

### Initialize State

Initialize or load state from a manifest.

```bash
agent-threader init-state <manifest-path>
# Alias: init
```

### Parse Result

Parse a worker result log file.

```bash
agent-threader parse-result <log-path>
# Alias: parse
```

### Parse Heal

Parse a healer decision log file.

```bash
agent-threader parse-heal <log-path>
# Alias: heal
```

### Status

Show the current state of a run.

```bash
agent-threader status [state-path]
# Alias: st
```

### Logs

Show the history of a run.

```bash
agent-threader logs [state-path]
# Alias: history
```

### Doctor

Diagnose the system and environment.

```bash
agent-threader doctor
# Alias: diag
```

### Explain

Explain an error or code snippet.

```bash
agent-threader explain [code]
# Alias: why
```

All commands support `--json` for machine-readable output.

## State Management

### State File

State is stored in a JSON file with the `.state.v2` extension.

**Required Fields:**
- `state_version`: Must be `"2.0"`
- `run_id`: Current run identifier
- `run_status`: One of `RUNNING`, `COMPLETED`, `ABORTED`
- `manifest_digest`: Hash of the normalized manifest
- `policy`: Effective runtime policy
- `tasks`: Per-task state keyed by task ID
- `healing_rounds`: Ordered record of healing checkpoints

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| `PENDING` | `RUNNING` | Worker invocation starts |
| `RUNNING` | `DONE` | Worker succeeds and verification passes |
| `RUNNING` | `FAILED` | Worker fails or verification fails |
| `RUNNING` | `BLOCKED` | Task cannot proceed (external dependency) |
| `RUNNING` | `ESCALATED` | Healing exhausted without fix |
| `RUNNING` | `COMPLETED` | All tasks `DONE` |
| `RUNNING` | `ABORTED` | Non-convergence or unrecoverable error |

## Verification Model

### Verification Ownership

Verification always belongs to the orchestrator. The worker MAY report evidence, but the orchestrator owns final pass/fail classification.

### Verification Layers

1. **Post-parse validation** — Immediately after parsing worker output
   - Validate contract integrity
   - Validate candidate writes
   - Validate path safety
   - Validate parser consistency

2. **Post-write build or test validation** — After writes are applied
   - Build validation
   - Test validation
   - Lint validation
   - Type validation

3. **Final smoke or browser validation** — After build and test pass
   - Runtime behavior validation
   - UI behavior validation
   - Custom project checks

### Write Safeguards

- Path normalization (writes cannot escape workspace root)
- Protected-file denylist
- Shrinkage detection
- Optional `sha256_before` precondition validation
- Backup before write
- Rollback on verification failure

### Default Shrinkage Rule

Reject a replacement when:
- The original file is larger than 100 bytes
- The replacement is less than 50% of the original size
- The task or operator has not explicitly allowed the shrinkage

## Platform Wrappers

Platform-specific wrappers live in `platforms/`. They are thin routing layers only.

| Platform | Location | Description |
|----------|----------|-------------|
| Windsurf | `platforms/windsurf/` | Windsurf workflow |
| Cursor | `platforms/cursor/` | Cursor rule + skill pointer |
| Codex | `platforms/codex/` | Codex agent registration |
| Claude | `platforms/claude/` | Claude command |

Platform wrappers MUST NOT redefine architecture, contracts, or healing policy. They MAY adapt:
- Invocation command and flags
- Prompt transport (stdin, argument, or PTY)
- Approval handling and setup notes

## Templates

Reference implementation skeletons live in `templates/`:

- `types.ts` — TypeScript type definitions for all contracts and the adapter interface
- `parser.ts` — Shared parser and validator utilities (sentinel extraction, JSON repair, schema validation)
- `orchestrator.ts` — Shared runtime utilities for atomic state writes and stable failure signatures

## Schemas

Machine-readable JSON schemas live in `schemas/`:

- `manifest.v2.json` — Manifest schema
- `verify_profile.v2.json` — Verification profile registry schema
- `task_result.v2.json` — Worker result schema
- `heal_decision.v2.json` — Healer decision schema
- `state.v2.json` — State schema

## Best Practices

### Prompt Design

1. Define clear completion contracts (what output format is expected)
2. Include shared context for all tasks
3. Specify verification requirements
4. Use fenced JSON blocks for structured output
5. Keep prompts focused and specific

### Manifest Design

1. Use unique, stable task IDs
2. Define clear dependencies
3. Set appropriate timeouts
4. Choose appropriate verification profiles
5. Configure retry policies for transient failures

### Healing Configuration

1. Start with `--heal auto` after the base loop works
2. Monitor failure signatures for patterns
3. Adjust batch size based on stability
4. Escalate when healing stops making progress
5. Document learned rules for future runs

### Concurrency

1. Start sequential to validate contracts and parsing
2. Add concurrency only after everything is stable
3. Monitor resource usage
4. Respect dependency ordering
5. Use `--concurrency N` to set parallelism

## Common Patterns

### Batch Prompt Runner

Run a prompt across many items:

```json
{
  "manifest_version": "2.0",
  "run_id": "batch-20260320",
  "tasks": [
    {"id": "item-1", "prompt_ref": "prompts/analyze.md", "depends_on": []},
    {"id": "item-2", "prompt_ref": "prompts/analyze.md", "depends_on": []},
    {"id": "item-3", "prompt_ref": "prompts/analyze.md", "depends_on": []}
  ]
}
```

### Stage-Based Workflow

Items pass through multiple prompt phases:

```json
{
  "manifest_version": "2.0",
  "run_id": "stage-20260320",
  "tasks": [
    {"id": "stage1-1", "prompt_ref": "prompts/analyze.md", "depends_on": []},
    {"id": "stage2-1", "prompt_ref": "prompts/fix.md", "depends_on": ["stage1-1"]},
    {"id": "stage3-1", "prompt_ref": "prompts/verify.md", "depends_on": ["stage2-1"]}
  ]
}
```

### Overnight Batch Run

Run unattended with verification gates:

```bash
agent-threader init-state manifest.json --heal auto --verify build --verify test
```

### Log Triage

Run failed tasks through targeted recheck:

```bash
agent-threader parse-heal logs/failed.log --heal auto
```

## Resume and Reconciliation

### Resume

Resume a run after interruption:

```bash
agent-threader init-state manifest.json --resume
```

### Reconciliation

Reconcile when the manifest changes:

```bash
agent-threader init-state new-manifest.json --reconcile
```

Reconciliation handles:
- Tasks removed from the manifest
- Tasks added since the last run
- Tasks whose `prompt_ref`, `depends_on`, or `verify_profile` changed

## Failure Classification

The orchestrator classifies failures into normalized categories:

| Failure Class | Description |
|---------------|-------------|
| `prompt_gap` | Missing information in the prompt |
| `missing_paths` | File paths not found |
| `weak_contract` | Output doesn't meet contract requirements |
| `contract_error` | Invalid contract format |
| `output_format` | Output in wrong format |
| `timeout` | Task exceeded timeout |
| `transient_infra` | Temporary infrastructure issue |
| `blocked_external` | External dependency blocking progress |
| `real_bug` | Genuine code defect |
| `build_error` | Build failure |
| `test_error` | Test failure |
| `smoke_error` | Smoke test failure |

## Failure Signature

The orchestrator generates a stable, comparable fingerprint for repeated failures:

```
<failure_class>:<detailed_description>
```

Example: `build_error:missing-cn-import`

The orchestrator escalates a task when the same failure signature repeats beyond `signature_repeat_limit` (default: 2).

## Documentation

- [README.md](./README.md) — Project overview and setup
- [SPEC.md](./skill/SPEC.md) — Normative v2 architecture specification
- [SKILL.md](./skill/SKILL.md) — Skill entrypoint
- [package.json](./package.json) — Package metadata and scripts

## License

MIT. See [LICENSE](./LICENSE).