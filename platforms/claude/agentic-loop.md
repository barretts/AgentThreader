# AgentThreader

Build a script that threads an agentic CLI over a work list, with JSON contracts, schema-validated parsing, resumable state, and optional PBH self-healing.

## Trigger

Use when the user needs to:

- Run an LLM CLI (`agent`, `opencode`, `claude`) against many items
- Batch-process a checklist/manifest through an agentic tool
- Create a parallel or sequential automation harness for LLM-driven tasks
- Add automatic failure analysis and retry with prompt healing

## Routing

This is the Claude platform wrapper. The canonical skill and normative specification live in the shared skill directory.

Read these files in order:

1. `agent-threader/SKILL.md` -- when to use, workflow steps, model selection rules
2. `agent-threader/SPEC.md` -- normative v2 architecture, contracts, and behavioral rules
3. `agent-threader/schemas/` -- JSON schemas for manifest, worker result, healer decision, state
4. `agent-threader/templates/` -- TypeScript types and parser utilities

## Self-Healing Requirement

If the user wants a healing or repair loop:

- Ask which worker CLI and worker model to use (fast/cheap for the inner loop)
- Ask which healer CLI and healer model to use (stronger for failure diagnosis)
- If the user does not care, state the defaults explicitly before proceeding

## Claude CLI Adapter Flags

When building the Claude adapter's `prepare()` method, include these flags for `--print` mode:

```typescript
args: [
  "--print",
  "--dangerously-skip-permissions",
  "--add-dir", "/tmp",
  "--max-turns", "50",
  "--verbose",
]
```

**Why these matter:**

- `--max-turns 50`: A multi-step pipeline (research, setup, write, test, patch, docs, cleanup) needs ~28-40 turns. The default or a low cap (e.g. 25) exhausts turns before completion, producing exit code 1 with no output.
- `--dangerously-skip-permissions`: In print mode the model cannot answer interactive permission prompts. Each blocked prompt still burns a turn, accelerating turn exhaustion.
- `--add-dir /tmp`: Grants file access to `/tmp` for workers that install dependencies or create scratch directories outside the workspace root. Without it, cleanup and temp-dir operations are silently denied.
- `--verbose`: Useful for debugging turn consumption and permission issues in orchestrator logs.

## Boundaries

This wrapper MUST NOT redefine architecture, contracts, or healing policy. The spec (`SPEC.md`) is the single source of truth.
