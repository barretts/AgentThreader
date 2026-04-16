# AgentThreader Orchestrator Boilerplate

A ready-to-run template for building a manifest-driven agentic orchestrator using AgentThreader's library primitives.

## What This Gives You

- A complete orchestrator that schedules tasks, executes them via CLI adapters, verifies results, and self-heals
- Parallel execution with bounded concurrency and serialized checkpoints
- State reconciliation on startup (recovers from crashes, zombie processes, stale batch indices)
- Process lockfile to prevent concurrent orchestrator instances from corrupting state
- Terminal escape stripping for parsing raw CLI output
- Diagnostic line extraction so the healer sees actual errors, not just "no sentinel found"
- Sentinel sanitization to prevent transcript poisoning
- Kill command for cleaning up orphaned processes

## Quick Start

```bash
# 1. Copy this directory to your project
cp -r boilerplate/ my-orchestrator/
cd my-orchestrator/

# 2. Install dependencies
npm install

# 2.5. Validate scaffold contracts
npm test

# 3. Edit the manifest and adapter
#    - manifest.json: define your tasks
#    - src/my-adapter.ts: wire your CLI agent
#    - prompts/: write your task and healer prompts

# 4. Run
npx tsx src/orchestrator.ts --manifest manifest.json --state state/state.json
```

## Project Structure

```
boilerplate/
  src/
    orchestrator.ts       # Main orchestrator loop (wires all primitives)
    my-adapter.ts         # Example CLI adapter (customize for your agent CLI)
  manifest.json           # Example manifest with 3 tasks
  prompts/
    task.md               # Example task prompt template
    healer.md             # Example healer prompt template
  verify-profiles.json    # Example verify profile registry
  test/
    contracts.test.mjs    # Contract checks for prompts and config
  package.json            # Dependencies (just agent-threader + tsx)
  tsconfig.json           # TypeScript config
```

## TDD Workflow

1. Add or update a test first for the behavior you need.
2. Run `npm test` and confirm the test fails for the expected reason.
3. Implement the smallest change required to make it pass.
4. Re-run `npm test` before starting a full orchestration run.

## Architecture (from lessons learned)

Every pattern in this boilerplate comes from a real production failure documented in `lessons/`:

| Pattern | Source Lesson |
|---------|--------------|
| Strip terminal escapes before sentinel parsing | crush-pipeline-four-output-bugs-high |
| Use `executeSingle()` for healer, not the task pipeline | crush-pipeline-four-output-bugs-high (issue 3) |
| Scope task cwd to sandbox, healer cwd to project root | crush-cwd-scoped-to-patch-dir-medium, healer-cwd-wrong-directory-medium |
| Checkpoint mutex for parallel writes | parallel-agent-execution-medium |
| Reconcile RUNNING tasks to PENDING on startup | stuck-running-state-on-crash-medium |
| Auto-reset batch index when it exceeds pending count | state-batch-index-not-reset-on-retry-high |
| Lockfile prevents zombie state corruption | zombie-orchestrator-state-corruption-critical |
| Diagnostic log tail fed to healer | healer-blind-to-agent-output-high |
| Sanitize sentinels in transcript appendages | session-transcript-sentinel-poisoning-critical |
| Transient error detection for retry logic | crush-pipeline-four-output-bugs-high (issue 4) |
| Kill command for orphaned processes | orchestrator-kill-command-medium |

## Customization

1. **Adapter**: Replace `my-adapter.ts` with your CLI agent adapter. Implement `prepare()`, `execute()`, `executeSingle()`, `extractResult()`, and `healthcheck()`.

2. **Manifest**: Define tasks with prompts, dependencies, timeouts, and verify profiles.

3. **Verify Profiles**: Define verification steps (test commands, lint checks, etc.) that the orchestrator runs after each task.

4. **Prompts**: Write prompt templates with `{{TASK_ID}}` and `{{CONTEXT}}` placeholders.

5. **Concurrency**: Set `--concurrency N` for parallel task execution (default: 1 sequential).
