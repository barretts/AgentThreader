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

### Non-Interactive (Print Mode) Flags

When running a CLI in non-interactive `--print` mode (e.g. Claude CLI), the adapter MUST configure:

- **Turn budget**: Set `--max-turns` to at least 2x the expected tool-call count for the task pipeline. A 7-step pipeline typically requires 28+ turns; 50 is the recommended minimum. Exhausting turns produces exit code 1 with no output files and no recoverability.
- **Permission bypass**: Include `--dangerously-skip-permissions` when running unattended. Without it, blocked permission prompts silently consume turns in print mode.
- **External directory access**: If the worker needs to operate outside the workspace root (e.g. `/tmp`), add `--add-dir /tmp` to grant explicit access. Without it, file operations outside the workspace are denied even with `--dangerously-skip-permissions`.
- **Tool restrictions**: Avoid restricting `--allowedTools` unless there is a specific security reason. Restricting tools does not reduce risk in print mode but does increase turn exhaustion by blocking expected operations.

### Temp Directory Cleanup

Workers that create temp directories outside the workspace root (e.g. `/tmp/vuln-*`) may fail to clean them up due to permission scoping. The orchestrator SHOULD add a post-run cleanup sweep for known temp directory patterns rather than relying on worker cleanup. Over many tasks, leaked temp directories with `node_modules` can accumulate significant disk usage.

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