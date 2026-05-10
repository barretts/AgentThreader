### Manual Execution Model

This output is for environments where the agent coordinates work directly through prompts, files, logs, and contract validation. Do not rely on companion commands, generated shell wrappers, or installed project utilities to drive the loop.

### Orchestrator Responsibilities

The orchestrator must:

- Keep the manifest and state file as the source of truth.
- Materialize each worker or healer assignment as a prompt record that includes shared context, task-specific context, contract requirements, and verification expectations.
- Persist the complete model response or transcript before parsing it.
- Extract the last matching fenced contract block for the expected contract type.
- Validate contract fields, path safety, write preconditions, and shrinkage rules before applying writes.
- Run verification gates after writes and record evidence paths in state.
- Stop on blocked external dependencies, repeated failure signatures, or exhausted healing rounds.

### Worker and Healer Turns

Worker turns perform task work and return exactly one `task_result.v2` block. Healer turns diagnose fixable prompt, context, output-format, timeout, or transient-infrastructure failures and return exactly one `heal_decision.v2` block.

When multiple model surfaces are available, choose one that can preserve full transcripts and file evidence. The execution surface is outside the architecture; the contract, validation, state, and verification rules remain the same.

### Artifact Handling

Keep each task's prompt record, response log, parsed contract, verification log, and state checkpoint addressable by path. Later healing turns should inspect those durable artifacts instead of relying on memory or chat history.
