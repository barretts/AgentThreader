# Temp Directory Cleanup Leaks

**Threat Level**: LOW
**Discovered**: Run 3 (successful run, post-verification)
**Impact**: Disk space accumulates over time; no immediate task failure

## Problem

After a successful end-to-end run, leftover temp files remain at `/tmp/vuln-GHSA-952p-6rrq-rcjv/`:

```
/tmp/vuln-GHSA-952p-6rrq-rcjv/
  orig/       (copy of vulnerable source for diff generation)
  patched/    (copy of patched source for diff generation)
```

The worker's step 7 instructs `rm -rf /tmp/vuln-{{GHSA_ID}}` but Claude's permission model blocked the deletion (even with `--dangerously-skip-permissions`) because `/tmp` is outside the workspace root.

The successful run's evidence notes confirm:
```
Temp dir /tmp/vuln-GHSA-952p-6rrq-rcjv cleanup was denied by permission prompt.
```

## Root Cause

Claude Code scopes file operations to the workspace root directory. `--dangerously-skip-permissions` skips interactive confirmation but doesn't extend the allowed directory scope. The `--add-dir` flag is needed to grant access to additional directories.

## Resolution

This is a non-blocking issue -- the orchestrator doesn't fail on cleanup failures. The worker prompt already instructs cleanup as best-effort.

## Recommended Fix

Add `--add-dir /tmp` to the Claude CLI adapter args:

```typescript
args: [
  "--print",
  "--dangerously-skip-permissions",
  "--add-dir", "/tmp",
  "--max-turns", "50",
  "--verbose",
],
```

Alternatively, add a post-run cleanup step in the orchestrator that sweeps `/tmp/vuln-GHSA-*` directories after each batch completes.

## Scale Impact

Over 129 tasks, each leaving ~50-200MB of `node_modules` in `/tmp`, this could accumulate 6-25GB of unreclaimable temp data. For long overnight runs, monitor disk space or add the orchestrator cleanup sweep.
