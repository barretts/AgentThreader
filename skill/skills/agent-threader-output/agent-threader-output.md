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

{{include:manual/architecture-overview.md}}

---

## Contracts

{{include:domain/contracts.md}}

---

## Healing Model

{{include:domain/pbh-healing.md}}

---

## Verification and Safety

{{include:domain/verification-safety.md}}

---

## Manual Execution

{{include:manual/execution-model.md}}

---

## State and Resume

{{include:manual/state-resume.md}}

---

## Run Identity Markers

{{include:manual/run-identity.md}}

---

## Normative Specification

The full architecture, contracts, schemas, and behavioral rules are defined in `SPEC.md`. That document is the single source of truth. Read it when you need the end-to-end control flow, complete schema field definitions, or edge-case behavioral rules.

## Canonical Source Of Truth

{{include:meta/schemas-reference.md}}

{{include:meta/templates-reference.md}}

---

## Model Selection

{{include:manual/model-selection.md}}

---

## Portability

{{include:manual/portability-rules.md}}

---

## Workflow

{{include:manual/workflow.md}}
