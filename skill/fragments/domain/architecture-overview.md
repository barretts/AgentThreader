### Architecture Overview

The v2 system has five moving parts:

1. **Manifest** -- declares work items, dependencies, timeouts, and verification profiles.
2. **Orchestrator** -- owns scheduling, parsing, verification, checkpointing, healing, and retry policy. The orchestrator is the single source of truth for task status.
3. **Adapters** -- CLI-specific execution layers (`agent`, `opencode`, `claude`) that the orchestrator calls through a uniform `CliAdapter` interface.
4. **Worker** -- the model invocation that performs task work and emits a `task_result.v2` JSON contract fenced by `<<<TASK_RESULT_V2>>>` sentinels.
5. **Healer** -- the model invocation that diagnoses fixable failures and emits a `heal_decision.v2` JSON contract fenced by `<<<HEAL_DECISION_V2>>>` sentinels.

### Control Flow

```text
Manifest
  -> Orchestrator
    -> Adapter -> Worker
    -> Parser and Schema Validator
    -> Verification Gates
    -> State Checkpoint
    -> Healer (at batch checkpoints when policy requires)
      -> Patch Validation and Application
    -> Resume or Escalate
```

Worker and healer outputs are candidate data until the orchestrator validates and commits them to state. Exit code alone is never treated as task success.

### Canonical Source Tree

```text
agent-threader/
  SKILL.md          -- skill entrypoint
  SPEC.md           -- normative architecture specification
  schemas/          -- JSON schemas for all contracts
  templates/        -- TypeScript scaffolding (types, parser, orchestrator utilities)
  platforms/        -- thin wrappers for Codex, Cursor, Claude, Windsurf
```