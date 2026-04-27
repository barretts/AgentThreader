### State, Resume, and Convergence

### Atomic State Writes

Mandatory. The orchestrator writes state via a temporary file followed by atomic rename on the same filesystem. State is checkpointed after every task attempt and every healing round.

### Resume Semantics

- `DONE` tasks are skipped on resume if `manifest_digest` still matches.
- If `manifest_digest` changes, the orchestrator warns or forces reconciliation.
- `ESCALATED` tasks are not retried automatically.
- `FAILED` and `BLOCKED` tasks are eligible only if retry policy allows.
- **Mode/flag preservation:** `state.v2.invocation` records the CLI flags / mode that produced the prior manifest. `--resume` requires either no mode-affecting flags (orchestrator reads `state.invocation` and reconstructs the prior mode) or matching flags (operator explicitly repeats the prior mode). A flag mismatch that would change the manifest mode (e.g. switching between two manifest builders) FAILS LOUDLY at resume; the operator must either match the prior mode or start a new run. `manifest_digest` continues to reconcile content drift within a mode.

Reconciliation handles: tasks removed since last run, tasks added, tasks whose `prompt_ref`, `depends_on`, or `verify_profile` changed.

`state.v2.invocation` shape:

```jsonc
{
  "invocation": {
    "phase": "<phase-name>",          // e.g. "babysit", "review", "discover"
    "mode": "<mode-name>",            // e.g. "vuln-targeted", "rebody-existing", "tend-pass"
    "flags": { /* mode-affecting CLI flags */ },
    "argv_digest": "sha256:...",      // canonical hash of sorted-flags + sorted-repos
    "manifest_digest": "sha256:..."
  }
}
```

`--resume` workflow on flag mismatch:

```
ERROR: Cannot --resume with different invocation flags than the prior run.

Prior run (state.json):  mode=<prior-mode>  flags=<prior-flags>
Current invocation:      mode=<current-mode>  flags=<current-flags>

To resume the prior run, repeat its mode flags or omit them entirely.
To start a new run with the current flags, drop --resume (state will be archived first).
```

### Archival

**Mandate: never delete prior-run artifacts.** At the start of any non-resume run, the orchestrator MUST move prior `state.json`, `manifest.json`, and run identity files into `<state-dir>/archive/<prior_run_id>/` (or a timestamp-tagged directory if the prior `run_id` is unrecoverable) BEFORE overwriting. Use `renameSync` for filesystem atomicity within a mount point; fall back to copy + delete only across mounts.

Worker logs in per-task workdirs that would be wiped by a fresh checkout/clean MUST be relocated under `reports/worker-logs/<task-key>/<timestamp>/` BEFORE the wipe. Workers may write new logs to their workdir's `.logs/` knowing they will be archived.

The archival mandate is non-overridable for normal orchestrator startup. Operator-level "delete archives older than N days" tooling is acceptable as a separate command, not as a normal-run side effect. Forbidden in normal startup: `rm -rf <state-dir>`, `rmSync(<state-dir>, { recursive: true })`, `git clean -fdx` inside a workdir before logs are preserved, truncating worker logs / healing decision logs / per-task per-attempt evidence.

`templates/orchestrator.ts` ships `archivePriorRunArtifacts({ stateDir, archiveSubdir, tag })` for the rename-based pattern.

### Failure Signature Generation

Stable failure signatures follow this algorithm:

1. Start with the normalized failure class.
2. Extract the primary stable signal from parser output, verification logs, or error codes.
3. Remove timestamps, absolute paths, task IDs, and unstable numbers.
4. Lowercase and collapse whitespace.
5. Truncate to a stable maximum length.

Format: `<failure_class>:<normalized_signal>` (e.g., `build_error:missing_cn_import`).

### Escalation Rules

Per-task: escalate when a task repeats the same signature `signature_repeat_limit` times after healing, or when a non-healable failure exhausts retry policy.

Per-run: escalate when `max_total_heal_rounds` is exhausted without convergence, or continuing would only repeat the same failure set.

Escalated tasks remain in state for reporting. Aborted runs record `run_status: ABORTED` with a non-empty `abort_reason`.