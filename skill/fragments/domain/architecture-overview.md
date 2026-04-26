### Architecture Overview

The v2 system has five moving parts:

1. **Manifest** -- declares work items, dependencies, timeouts, and verification profiles.
2. **Orchestrator** -- owns scheduling, parsing, verification, checkpointing, healing, and retry policy. The orchestrator is the single source of truth for task status.
3. **Adapters** -- CLI-specific execution layers (`agent`, `opencode`, `claude`) that the orchestrator calls through a uniform `CliAdapter` interface.
4. **Worker** -- the model invocation that performs task work and emits a `task_result.v2` JSON contract fenced by `<<<TASK_RESULT_V2>>>` sentinels.
5. **Healer** -- the model invocation that diagnoses fixable failures and emits a `heal_decision.v2` JSON contract fenced by `<<<HEAL_DECISION_V2>>>` sentinels.

### Control Flow

The orchestrator drains the manifest in a multi-pass loop. `runPool` handles one batch of currently-ready tasks then returns; the orchestrator MUST wrap it in a loop until `isRunComplete` or no tasks are ready, otherwise only chain heads execute.

```text
Manifest
  -> Orchestrator
    loop until isRunComplete(state):
      ready = getReadyTasks(manifest, state, depOrder)
      if ready is empty: break (escalate stalled tasks)
      runPool(ready, concurrency, async (task) =>
        Adapter -> Worker
        Parser and Schema Validator
        Verification Gates
        Worker Output Post-Processing (when artifact has cross-run identifiers)
        State Checkpoint
      )
      Healer (at batch checkpoints when policy requires)
        -> Patch Validation and Application
    finalize: Resume or Escalate
```

Worker and healer outputs are candidate data until the orchestrator validates and commits them to state. Exit code alone is never treated as task success.

The `runManifestToCompletion(manifest, state, policy, workerFn, checkpoint)` helper in `templates/orchestrator.ts` encapsulates the multi-pass loop. Downstream runners SHOULD use it rather than calling `runPool` directly.

### Concurrency Patterns

agent-threader provides two complementary primitives for constraining task execution. Picking the right one matters for throughput on partially-failed manifests.

| Primitive | Semantic | When to use | Failure propagation |
|---|---|---|---|
| `depends_on` | Predecessor must be `DONE` before dependent runs | Task B genuinely consumes A's outputs (writes, evidence, etc.) | A's `FAILED`/`BLOCKED` stalls B -- correctly, since B cannot succeed without A |
| `resource_lock` | At most one task per lock-key runs at a time | Tasks share a mutable resource (workdir, file, external system) but do not consume each other's outputs | Predecessor releases the lock on terminal state; next holder runs regardless of A's outcome |

A task may carry both. `depends_on` gates readiness; `resource_lock` gates execution among ready tasks via an in-process `withResourceLock(key, fn)` helper (see `templates/orchestrator.ts`). Cross-resource tasks remain free to run in parallel up to `policy.concurrency`.

**Anti-pattern:** chaining tasks via `depends_on` purely to serialize on a shared workdir. A `BLOCKED` or `FAILED` predecessor stalls every later task in the chain even though they have no real data dependency. Use `resource_lock` instead. Empirically this difference can be ~9x throughput on the unblocked tail of a stalled chain.

**Resource lock starvation:** the worker pool greedily fills slots from the ready set. If multiple ready tasks share a `resource_lock`, all but one wait while pool slots are wasted. Choose lock keys at the right granularity:

- Too coarse (single `resource_lock="global"`): pool degenerates to single-threaded.
- Too fine (per-task unique key): no exclusion at all.
- Right granularity (one key per actual mutable resource): cross-resource concurrency, within-resource serialization. Example: `workdir:cache/<repo-slug>`.

If the manifest is heavily skewed toward a single resource, prefer `depends_on` chains for ordering or split the resource (e.g. per-task workdirs via `git worktree add`).

### Canonical Source Tree

```text
agent-threader/
  SKILL.md          -- skill entrypoint
  SPEC.md           -- normative architecture specification
  schemas/          -- JSON schemas for all contracts
  templates/        -- TypeScript scaffolding (types, parser, orchestrator utilities)
  platforms/        -- thin wrappers for Codex, Cursor, Claude, Windsurf
```