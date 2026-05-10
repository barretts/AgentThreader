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
