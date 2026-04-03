---
name: agent-threader
version: "2.0"
description: "AgentThreader -- build or review manifest-driven agentic CLI orchestration with structured JSON contracts, schema-validated parsing, resumable state, dependency-aware scheduling, bounded self-healing, and orchestrator-owned verification."
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

## Architecture

{{include:domain/architecture-overview.md}}

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

## Adapter Model

{{include:domain/adapter-model.md}}

---

## State and Resume

{{include:domain/state-resume.md}}

---

## Normative Specification

The full architecture, contracts, schemas, and behavioral rules are defined in `SPEC.md`. That document is the single source of truth. Read it when you need the end-to-end control flow, complete schema field definitions, or edge-case behavioral rules.

## Canonical Source Of Truth

{{include:meta/schemas-reference.md}}

{{include:meta/templates-reference.md}}

---

## Model Selection

{{include:common/model-selection.md}}

---

## Portability

{{include:common/portability-rules.md}}

---

## Workflow

{{include:common/workflow.md}}
