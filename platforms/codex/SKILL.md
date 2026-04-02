---
name: agent-threader
description: AgentThreader -- build or review manifest-driven agentic CLI orchestration with JSON contracts, schema-validated parsing, PBH self-healing, resumable state, and orchestrator-owned verification.
---

# AgentThreader

This is the Codex platform wrapper. The canonical skill and normative specification live in the shared skill directory.

## Routing

Read these files in order:

1. `agent-threader/SKILL.md` -- when to use, workflow steps, model selection rules
2. `agent-threader/SPEC.md` -- normative v2 architecture, contracts, and behavioral rules
3. `agent-threader/schemas/` -- JSON schemas for manifest, worker result, healer decision, state
4. `agent-threader/templates/` -- TypeScript types and parser utilities

## Self-Healing Requirement

When self-healing mode is requested, ask the user which models to use before building the final runner:

- Worker CLI and worker model (fast/cheap for the inner loop)
- Healer CLI and healer model (stronger for failure diagnosis)

If the user does not specify, state the defaults explicitly:

- Worker: cheaper model on the requested CLI
- Healer: stronger model on the same CLI family

## Boundaries

This wrapper MUST NOT redefine architecture, contracts, or healing policy. The spec (`SPEC.md`) is the single source of truth.
