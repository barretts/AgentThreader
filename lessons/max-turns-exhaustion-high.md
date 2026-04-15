# Max Turns Exhaustion

**Threat Level**: HIGH
**Discovered**: Run 1 (attempt 1)
**Impact**: Task fails completely -- no output files, no sentinel, no recoverability

## Problem

Claude CLI `--print` mode with `--max-turns 25` exhausted all turns before completing the 7-step pipeline. The entire output was:

```
Error: Reached max turns (25)
```

Exit code was 1. No files were written to the patches directory, no sentinel was emitted, and the orchestrator had nothing to parse.

## Root Cause

The worker prompt asks Claude to execute 7 sequential steps, each involving multiple tool calls (Bash commands, file writes, file reads). With `--allowedTools Bash,Read,Write,Edit,MultiEdit`, every tool call costs a turn. A typical task requires:

- ~3 turns for research (`gh api`, reading JSON, extracting fields)
- ~5 turns for setup (`mkdir`, `npm init`, `npm install`, checking versions)
- ~5 turns for writing the test (create file, run test, iterate)
- ~5 turns for creating the patch (analyze source, write patch, write diff)
- ~3 turns for running the green test
- ~5 turns for documentation (README, metadata, notes)
- ~2 turns for cleanup and sentinel

That's ~28 turns minimum for a clean run, and easily 40+ if the model needs to iterate on test failures.

## Resolution

Increased `--max-turns` from 25 to 50. This gives the model enough headroom for the full pipeline plus iteration on failures.

## Prevention

For future agent-threader tasks with multi-step pipelines, budget turns at roughly 2x the expected number of tool calls. Monitor the `duration_ms` and exit code in the orchestrator logs -- exit code 1 with "Reached max turns" in stdout is the signature of this failure.
