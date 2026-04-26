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
- **Argv terminator**: when using a variadic flag (e.g. `--add-dir`) before the prompt, place `--` immediately after the last variadic value and before the prompt. Without it, `--add-dir` greedily consumes the prompt as a second directory and Claude exits with the misleading error `Error: Input must be provided either through stdin or as a prompt argument when using --print`. Convention: include `--` before every prompt invocation, even when no variadic flag is present (it is harmless). Concrete shape: `["--add-dir", workDir, "--", prompt]`.
- **Stdin handling**: in `--print` mode, close stdin explicitly. Spawn Claude with `stdio[0] = "ignore"` (Node `child_process`), or redirect from `/dev/null` (shell). Default piped or inherited stdin causes Claude to block on stdin read until EOF, producing silent multi-minute hangs that are indistinguishable from legitimate long-running tasks. There is no error signal; the only symptom is absence of progress.
- **Output format**: for unattended runs the adapter MUST use `--output-format stream-json --verbose --include-partial-messages`. Default text mode buffers the entire response until end-of-turn and provides no progress signal -- a productively-running worker is indistinguishable from a hung one. Stream-json emits per-event JSON lines (`system/init`, `assistant/text`, `assistant/tool_use`, `user/tool_result`, `result`) that the orchestrator parses for per-task progress and hang detection. Capture the canonical assistant response from the `result` event's `result` field; concatenating `assistant/text` chunks can produce duplicates under `--include-partial-messages`.

### Worker Environment

Workers run concurrently. Tools that mutate shared user state (toolchain installers, package caches, system-wide config) are unsafe in workers because parallel invocations race. Empirical example: two concurrent `nvm install` calls for different node majors corrupted `~/.nvm/versions/` because both wrote to the alias map and shell init concurrently.

**Pattern: pre-warm-then-use.**

1. The orchestrator inspects all manifest tasks BEFORE starting the worker pool. It enumerates the set of unique toolchain versions / shared resources required.
2. Sequentially (one at a time) the orchestrator installs/prepares each unique resource, capturing logs.
3. Worker prompts forbid the install/mutation operation explicitly. Workers may only USE the resource (e.g. `nvm use`, `pyenv shell`).
4. If a worker's USE call fails because the resource is not pre-warmed, the worker MUST set `failure_class: "transient_infra:<subtype>"` (e.g. `node_version_missing`) and exit. The orchestrator widens its pre-warm set on retry.

**Toolchains affected:** nvm, pyenv, rbenv, sdkman, asdf -- anything that writes to a user-level shared directory. Same pattern for shared package caches, system-wide config, etc.

**Exact-version pins:** when prewarming toolchains, install the EXACT version specified by repo configuration files (`.nvmrc`, `.node-version`, `engines.node`), not just the major. `nvm use 18.14.2` requires `18.14.2` specifically -- `nvm install 18` (latest 18.x) does not satisfy it. Same applies to pyenv/rbenv/sdkman pin files. Surface CONFLICT diagnostics when two sources within a repo disagree (e.g. `.node-version=18.14.2` vs `engines.node=^22.13.1`).

`templates/orchestrator.ts` ships a `prewarmToolchains(requirements)` helper that serializes installs and captures logs. Workers reference this protocol via the prompt's "do not install" hard rule.

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