# Attempt-Pair Pre-Flight Check

**Threat Level**: MEDIUM
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 5
**Confidence**: medium
**Target Section**: State and Resume / Attempt-Pair Pattern (new subsection)
**Impact**: When the same task title shows up twice (a CLOSED-unmerged attempt + a successor) by the same author, today's `--resume` treats them as separate manifest invocations. The orchestrator should detect prior attempts and surface the prior-diff failure mode (lockfile churn, scope creep) to the next worker as preamble.

**Context:** [heroku/dashboard#11932](https://github.com/heroku/dashboard/pull/11932) and [#11933](https://github.com/heroku/dashboard/pull/11933) are the same PR: identical title, identical author, identical body summary, opened one day apart. #11932 (CLOSED) had a corrupted `pnpm-lock.yaml` (+2341/-1785). #11933 (MERGED) had a clean lockfile (+36/-113). The difference was a single mistake in the lockfile that the author noticed and re-rolled. Today's `--resume` semantics treat both attempts as separate manifest invocations; the orchestrator can't tell that #11933 supersedes #11932.

## Observation

The pattern recurs in the corpus:

| First attempt (closed) | Successor (merged) | Hours between | Distinguishing factor |
|---|---|---:|---|
| [#11932](https://github.com/heroku/dashboard/pull/11932) | [#11933](https://github.com/heroku/dashboard/pull/11933) | ~25h | Lockfile churn cleaned up |
| [#9279](https://github.com/heroku/dashboard/pull/9279) | [#9316](https://github.com/heroku/dashboard/pull/9316) | ~700h | Scope split: helper PR separated from cascade |
| [#9370](https://github.com/heroku/dashboard/pull/9370) | [#9372](https://github.com/heroku/dashboard/pull/9372) | ~1h | Same icon batch, re-rolled |
| [#9371](https://github.com/heroku/dashboard/pull/9371) | [#9373](https://github.com/heroku/dashboard/pull/9373) | ~1h | Same |
| [#10549](https://github.com/heroku/dashboard/pull/10549) | [#10556](https://github.com/heroku/dashboard/pull/10556) | ~200h | Aria-required attribute re-attempt |

These pairs share three signals that the orchestrator can detect deterministically:

1. **Same title (modulo whitespace)** across two PRs by the same author.
2. **Same intent** (manifest task id, GUS ticket, or `[Accessibility]` bracket in body).
3. **First is CLOSED-unmerged**; second is OPEN or MERGED, opened later.

Today's `state.v2.invocation` records `argv_digest` and `manifest_digest` for the current run, which catches `--resume` flag-mismatch but does NOT catch attempt pairs in the wild PR history.

## Suggested Fix

### Pre-flight check at task start

When a task transitions from `PENDING` to `RUNNING`, the orchestrator runs a pre-flight query against the platform:

```
For task t about to start:
  query: PRs by current author with title similarity > 0.85 to t.intended_pr_title
  filter: state == CLOSED-unmerged AND createdAt within last 30 days
  for each match m:
    state.tasks[t.id].evidence.prior_attempts.append({
      pr_url: m.url,
      closed_at: m.closedAt,
      diff_summary: m.diff_summary
    })
    diff_critique = compareDiffShape(m.diff, expected_diff_shape(t))
    if diff_critique.lockfile_churn_excessive:
      worker_prompt += "Prior attempt {{m.url}} was closed due to excessive lockfile churn (+{{m.lockfile_additions}}/-{{m.lockfile_deletions}}). Re-roll the lockfile from main cleanly before proposing changes."
```

### Worker prompt augmentation

When `state.tasks[t.id].evidence.prior_attempts` is non-empty, the worker prompt prepends an attempt-pair preamble:

> ATTEMPT PAIR DETECTED. The author previously opened `{{prior_pr_url}}` for this task and closed it without merging on `{{closed_at}}`. The closed diff has the following shape:
>
> {{diff_shape_summary}}
>
> Do not re-create the closed diff verbatim. Read the closed PR comments (already fetched into `evidence.prior_attempts[].comments`) for the reason it was closed. Address that reason in your new diff.

### New manifest task field: `intended_pr_title`

```jsonc
{
  "id": "kit-foundation-ember-a11y-testing-v8",
  "intended_pr_title": "chore: update ember-a11y-testing to v8 with global config",
  "task_type": "codemod",
  ...
}
```

This makes the title-similarity check deterministic; without it, the orchestrator has to derive a title from the worker output, which is fragile.

### SKILL.md additions

Under "State and Resume", add an "Attempt-Pair Pattern" subsection:

> #### Attempt-Pair Pattern
>
> Before starting any task that will produce a PR, the orchestrator queries the target platform for prior CLOSED-unmerged PRs by the same author with title similarity > 0.85 to `task.intended_pr_title` within a 30-day window. Each match is attached to `state.tasks[t.id].evidence.prior_attempts` and the worker prompt receives an attempt-pair preamble that summarizes the prior diff shape and reason for closure.
>
> Common prior-attempt failure modes the preamble must surface:
>
> - **Lockfile churn**: prior diff had > 1000 lockfile lines changed; current attempt must roll lockfile cleanly from main first.
> - **Scope creep**: prior diff combined codemod tool + apply; current attempt must split.
> - **Verify gate skipped**: prior diff merged green CI but rolled back; current attempt must re-run the same verify gate.
>
> This is distinct from `--resume` (which acts on the same `state.v2.json`). Attempt-pair detection looks at the *platform's* PR history, including PRs from before the current run.

### Adapter capability

```typescript
interface CliAdapter {
  // ...existing fields...
  findPriorAttempts?(params: {
    author: string;
    intendedTitle: string;
    sinceDays: number;
  }): Promise<PriorAttempt[]>;
}
```

The default adapter implementation uses `gh pr list --search "author:<a> in:title <title-tokens> is:closed -is:merged"` with a string-similarity post-filter.

## Evidence pointer

- Canonical attempt-pair: [heroku/dashboard#11932](https://github.com/heroku/dashboard/pull/11932) (CLOSED, lockfile +2341/-1785) -> [#11933](https://github.com/heroku/dashboard/pull/11933) (MERGED, lockfile +36/-113), one day apart, same author, same title, same body intent.
- Same author, longer gap: [#9279](https://github.com/heroku/dashboard/pull/9279) "add a11y auditing after every call" CLOSED -> [#9316](https://github.com/heroku/dashboard/pull/9316) "always call a11yAudit after ember test helpers" MERGED, ~30 days apart, scope splits across boundary.
- Icon-batch re-rolls: [#9370](https://github.com/heroku/dashboard/pull/9370) / [#9371](https://github.com/heroku/dashboard/pull/9371) closed one hour before their merged twins [#9372](https://github.com/heroku/dashboard/pull/9372) / [#9373](https://github.com/heroku/dashboard/pull/9373).
- Title-similarity threshold: empirically, all five observed attempt pairs in the corpus have title similarity > 0.85 (edit distance / max-length).
