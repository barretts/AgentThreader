### Adapter Model

Adapters are the only place where CLI-specific behavior lives. The orchestrator core never calls CLIs directly -- it goes through `CliAdapter.execute`.

### Adapter Responsibilities

- Construct the concrete CLI invocation (command, flags, working directory).
- Decide whether prompt delivery uses stdin, argv, or PTY interaction.
- Manage PTY or expect requirements for interactive CLIs.
- Capture combined stdout and stderr to the execution log.
- Return execution artifacts to the orchestrator.
- Delegate contract parsing and schema validation to the shared parser utilities.

### Orchestrator Boundary

The orchestrator must:

- Never call CLIs directly except through `CliAdapter.execute`.
- Never parse raw logs without going through parser and validator modules.
- Never assume exit code alone means success.
- Remain CLI-agnostic outside the adapter boundary.

### Reference Adapters

Initial adapters: `agent`, `opencode`, `claude`. All share one orchestrator contract model.

### Interactive CLI Handling

For interactive CLIs, prompt rescue logic and TTY heuristics are adapter-local. Interactive adapters should implement ANSI stripping, bounded idle detection, finite rescue attempts, and explicit completion detection.

### CliAdapter Interface

```typescript
interface CliAdapter {
  id: string;
  capabilities: { stdinPrompt: boolean; argPrompt: boolean; pty: boolean; interactive: boolean };
  prepare(task, ctx): PreparedInvocation;
  execute(invocation, ctx): Promise<ExecutionArtifact>;
  extractResult(artifact, ctx): Promise<TaskResultV2 | ParserFailure>;
  healthcheck(ctx): Promise<AdapterHealth>;
}
```