---
name: agent-threader
version: "2.0"
description: AgentThreader -- build or review manifest-driven agentic CLI orchestration with structured JSON contracts, schema-validated parsing, resumable state, dependency-aware scheduling, bounded self-healing, and orchestrator-owned verification.
---

# AgentThreader

## When To Use This Skill

Use this skill when manual chat execution no longer scales and the right answer is a repeatable runner around an agentic CLI.

Matching requests include:

- batch prompt runners over tasks, manifests, components, stories, or tickets
- looping an agentic CLI (`agent`, `opencode`, `claude`) across many items
- resumable or checkpointed agent loops with per-task logs
- self-healing outer loops that diagnose failures and patch prompts
- overnight or unattended batch runs with verification gates
- stage-based workflows where items pass through multiple prompt phases
- log triage followed by targeted recheck runs

## Architecture Summary

The v2 system has five moving parts:

1. **Manifest** — declares work items, dependencies, timeouts, and verification profiles
2. **Orchestrator** — owns scheduling, parsing, verification, checkpointing, healing, and retry policy
3. **Adapters** — CLI-specific execution layers (`agent`, `opencode`, `claude`) that the orchestrator calls through a uniform interface
4. **Worker** — the model invocation that performs task work and emits a `task_result.v2` JSON contract
5. **Healer** — the model invocation that diagnoses fixable failures and emits a `heal_decision.v2` JSON contract

The default healing strategy is **Progressive Batch Healing (PBH)**: start with small batches, grow when stable, shrink when unstable, escalate when stuck.

## Normative Specification

The full architecture, contracts, schemas, and behavioral rules are defined in `SPEC.md` in this directory. That document is the single source of truth.

Read `SPEC.md` when you need:

- the end-to-end control flow
- JSON schemas for manifest, worker result, healer decision, and state
- PBH scheduling rules and defaults
- verification and write-safety model
- adapter interface contract
- failure classification, signature generation, and convergence rules
- resume and reconciliation semantics

## Canonical Source Of Truth

Use these directories with clear ownership boundaries:

- `SPEC.md` — normative behavior and runtime rules
- `schemas/` — machine-readable contract authority
- `templates/` — shared parser, types, and runtime scaffolding
- `platforms/` — thin translation layers for Codex, Cursor, Claude, and Windsurf

The orchestrator core should stay platform-neutral. Platform packaging may change invocation syntax and workspace UX, but not contracts or state semantics.

## Schemas

Machine-readable JSON schemas live in `schemas/`:

- `manifest.v2.json`
- `verify_profile.v2.json`
- `task_result.v2.json`
- `heal_decision.v2.json`
- `state.v2.json`

## Templates

Reference implementation skeletons live in `templates/`:

- `types.ts` — TypeScript type definitions for all contracts and the adapter interface
- `parser.ts` — shared parser and validator utilities (sentinel extraction, JSON repair, schema validation)
- `orchestrator.ts` — shared runtime utilities for atomic state writes and stable failure signatures

## Self-Healing: Model Selection Rule

When the user requests a self-healing runner, ask which models to use before generating code:

- **Worker CLI and model** — runs the inner loop (can be fast/cheap)
- **Healer CLI and model** — runs the outer diagnosis loop (should be more capable)

If the user does not specify, state the defaults explicitly before proceeding:

- Worker: the CLI the user is already using, default model
- Healer: same CLI family, stronger model tier

## Platform Wrappers

Platform-specific wrappers live in `platforms/`. They are thin routing layers only.

- `platforms/windsurf/` — Windsurf workflow
- `platforms/cursor/` — Cursor rule + skill pointer
- `platforms/codex/` — Codex agent registration
- `platforms/claude/` — Claude command

Platform wrappers MUST NOT redefine architecture, contracts, or healing policy.

## Portability Rule

Platform wrappers may adapt:

- invocation command and flags
- prompt transport (`stdin`, argument, or PTY)
- approval handling and setup notes

Platform wrappers MUST preserve:

- contract field names and sentinel strings
- parser behavior
- PBH defaults and convergence rules
- state transitions and resume semantics

## Workflow

1. Define the unit of work (component, story, work package, ticket, file).
2. Create the manifest (`manifest.v2` JSON).
3. Write shared context and per-task prompts.
4. Define the completion contract in the prompt (instruct the worker to emit `<<<TASK_RESULT_V2>>>`).
5. Choose the CLI adapter (`agent`, `opencode`, `claude`).
6. Build the orchestrator (use `templates/` as starting point).
7. Run sequential first, add concurrency after contracts and parsing are stable.
8. Add verification gates (build, test, lint, smoke).
9. Add healing only after the base loop works (`--heal auto`).
10. Resume with `--resume` after interruptions.
