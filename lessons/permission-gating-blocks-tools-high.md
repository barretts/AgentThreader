# Permission Gating Blocks Tool Execution

**Threat Level**: HIGH
**Discovered**: Run 1 (attempt 1)
**Impact**: Claude burns turns on permission prompts it cannot answer in --print mode, contributing to turn exhaustion

## Problem

The initial adapter used `--allowedTools Bash,Read,Write,Edit,MultiEdit` but did NOT include `--dangerously-skip-permissions`. In `--print` (non-interactive) mode, Claude cannot respond to permission prompts. Each blocked tool call still counts as a turn, accelerating the max-turns exhaustion.

Even after adding `--dangerously-skip-permissions`, Claude's workspace permissions are scoped to the `--cwd` directory. Operations on `/tmp/vuln-*` directories (outside the workspace root) still triggered permission issues. The final successful run's log notes:

```
Temp dir /tmp/vuln-GHSA-952p-6rrq-rcjv cleanup was denied by permission prompt.
```

## Root Cause

Claude Code's permission model restricts file operations to the workspace root by default. `--dangerously-skip-permissions` skips interactive permission prompts but the `--add-dir` flag is still needed to explicitly grant access to directories outside the workspace. We didn't use `--add-dir /tmp`.

## Resolution

1. Added `--dangerously-skip-permissions` to bypass interactive prompts
2. Removed the explicit `--allowedTools` restriction (all tools available by default)
3. The `/tmp` cleanup failure is non-blocking -- the orchestrator treats it as a soft warning

## Prevention

For future runs, consider adding `--add-dir /tmp` to the Claude CLI args to grant explicit access. Alternatively, restructure the worker to do all work inside the patches directory itself (avoiding `/tmp` entirely) and install deps directly there. This also makes the output self-contained.

## Remaining Risk

Leftover `/tmp/vuln-*` directories accumulate across runs. Over 129 tasks, this could consume meaningful disk space (each contains a full `node_modules`). A post-run cleanup sweep should be added to the orchestrator.
