---
description: AgentThreader -- build automation scripts that thread agentic CLI tools (agent, opencode, claude) over batches of tasks with JSON contracts, schema-validated parsing, PBH self-healing, resumable state, and orchestrator-owned verification. Use when the user needs batch prompt runners, resumable agent loops, self-healing retry workflows, or overnight unattended runs.
---

# AgentThreader

This workflow implements the **AgentThreader v2** specification.

Read the canonical skill and spec before generating any runner code:

1. Read `agent-threader/SKILL.md` for triggers, workflow steps, and model selection rules.
2. Read `agent-threader/SPEC.md` for the normative architecture, contracts, and behavioral rules.
3. Read the JSON schemas in `agent-threader/schemas/` when you need exact field definitions.
4. Use the TypeScript types and parser from `agent-threader/templates/` as the starting point for implementation.

## Routing

Use this workflow for requests involving:

- batch prompt runners over tasks, manifests, components, stories, or tickets
- looping `agent`, `opencode`, or `claude` across many items
- resumable or checkpointed agent loops
- outer-loop prompt repair or self-healing retries
- log triage followed by targeted recheck runs
- overnight or unattended batch runs with verification gates

## Self-Healing Requirement

If the user wants a healing or repair loop around the worker loop:

- Ask which **worker CLI and model** to use (runs each task -- can be fast/cheap).
- Ask which **healer CLI and model** to use (diagnoses failures -- should be more capable).
- If the user does not care, state the default assumption explicitly before proceeding:
  - Worker: the CLI the user is already using, default model
  - Healer: same CLI family, stronger model tier

## Key v2 Contracts

Workers emit results inside `<<<TASK_RESULT_V2>>>` / `<<<END_TASK_RESULT_V2>>>` fences as JSON.

Healers emit decisions inside `<<<HEAL_DECISION_V2>>>` / `<<<END_HEAL_DECISION_V2>>>` fences as JSON.

The orchestrator parses and schema-validates these contracts before any state mutation. Exit code alone is never treated as success.

## Default Healing: Progressive Batch Healing (PBH)

- Start with batch size 1, grow via fibonacci (1, 2, 3, 5, 8, 13...) when stable
- Shrink when failure rate exceeds threshold (default 0.2)
- Escalate tasks that repeat the same failure signature after healing
- Abort the run when healing stops converging
- Manual overrides: `--heal-schedule off|task|batch|epoch`

## Implementation Checklist

When building a runner, verify:

- [ ] Manifest is JSON conforming to `manifest.v2` schema
- [ ] Worker prompts instruct the model to emit `<<<TASK_RESULT_V2>>>` JSON
- [ ] Parser uses "last block wins" to defeat prompt echo contamination
- [ ] Parser applies JSON repair (strip fences, trailing commas, comments) before validation
- [ ] Contract-error failures get one free retry with formatting reminder (no heal budget consumed)
- [ ] Verification gates are orchestrator-owned and run after parse, before DONE
- [ ] State is JSON conforming to `state.v2` schema, written atomically (temp + rename)
- [ ] `--resume` skips DONE tasks and validates `manifest_digest`
- [ ] Protected-file denylist, shrinkage detection, and backup-before-write are enforced
- [ ] Rollback on verification failure restores from backup
- [ ] Signal handler (SIGINT/SIGTERM) saves state and terminates children
- [ ] Non-destructive logging: full logs written first, then parsed
- [ ] CLI invocation goes through an adapter, never direct from orchestrator core
- [ ] Healer patches are scope-checked before application (task-scope healer cannot touch shared context)
- [ ] Convergence detection compares failure signatures across rounds
- [ ] Run aborts with a recorded reason when healing stops converging

## Boundaries

- The spec (`SPEC.md`) is the single source of truth. Do not redefine architecture here.
- Put reusable orchestrator code in the repo under `scripts/` or a dedicated package.
- Keep this workflow file as a thin routing layer only.
