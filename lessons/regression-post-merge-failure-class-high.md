# `regression_post_merge` Failure Class + Watch-Merged-PRs Phase

**Threat Level**: HIGH
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 81
**Confidence**: high
**Target Section**: Healing Model / Failure Class Taxonomy + State and Resume / Watch Window (new subsection)
**Impact**: Once a task reaches DONE (PR merged), agent-threader treats it as terminal. A merged PR reverted 1-14 days later for a customer-visible regression silently leaves the manifest task closed. The audit finding is still open; the orchestrator doesn't know. 81 dashboard reverts analyzed: 64% within 24h, 93% within 14 days.

**Context:** [heroku/dashboard#10909](https://github.com/heroku/dashboard/pull/10909) "Address a11y violations in console" merged 2024-06-12. Five days later, [#10919](https://github.com/heroku/dashboard/pull/10919) reverted it, with the body citing a customer support ticket (heroku.support/1403668) and a Slack incident thread. The a11y fix broke production console behavior; the revert was a fast incident response. Today's agent-threader treats `DONE` (PR merged) as terminal -- it has no concept of "post-merge regression detected" and no mechanism to re-open the manifest task with the new evidence.

## Observation

The dashboard a11y subset has 2 explicit `revert` PRs, but the broader `heroku/dashboard` revert history is much richer. Querying `gh pr list --search "in:title revert" --limit 100` and pairing each revert with the PR it reverts gives **81 valid revert pairs** with both timestamps. Distribution of days-from-merge-to-revert:

| Window | Count | % of n=81 |
| --- | ---: | ---: |
| <=1 day | 52 | 64.2% |
| <=3 days | 63 | 77.8% |
| <=7 days | 69 | 85.2% |
| <=14 days | 75 | 92.6% |
| <=30 days | 79 | 97.5% |
| > 30 days | 2 | 2.5% |

Min: 0.01 days. Median: 0.31 days (~7 hours — most reverts are same-day). Mean: 48.4 days (skewed by 2 multi-year outliers). Max: 3677 days (a decade-late revert, almost certainly a different "reverting" pattern).

The two a11y-specific examples that motivated this lesson land mid-distribution:

| Revert PR | Reverts | Days | Reason |
|---|---|---:|---|
| [#10919](https://github.com/heroku/dashboard/pull/10919) | [#10909](https://github.com/heroku/dashboard/pull/10909) | 5 | Customer support ticket + Slack incident |
| [#10537](https://github.com/heroku/dashboard/pull/10537) | [#10534](https://github.com/heroku/dashboard/pull/10534) | 1 | Unspecified regression |

Each is a real downstream signal that the manifest task ("fix the audit finding") is NOT done. The original a11y violation is still open; the fix shipped, broke something, got rolled back, and the next attempt needs the regression as evidence.

Today's flow:

```
worker fixes audit finding -> DONE
PR merges -> task stays DONE in state.v2
PR reverted 5 days later -> agent-threader doesn't notice
human re-opens the GUS ticket -> manifest doesn't know
next --resume run skips the task (it's DONE)
```

The healer model in [SKILL.md](/Users/bsonntag/.claude/skills/agent-threader/SKILL.md) has nine failure classes, none of which apply post-merge. The closest is `real_bug` ("no, escalate"), but that fires inside the worker run, not after the PR ships.

## Suggested Fix

### New failure class: `regression_post_merge`

Add to the Failure Class Taxonomy table:

| Class | Subtypes | Healable? | Healer response |
|---|---|---|---|
| `regression_post_merge` | `revert_pr_detected`, `customer_incident_linked`, `gus_reopened` | conditional | Re-open task with new evidence; route to fix-with-regression prompt |

### New orchestrator phase: `--watch-merged-prs`

Add a phase that runs at the start of every `--resume` invocation OR on demand via `--watch-merged-prs`:

```
For each task with state == DONE and PR linked in state.v2.tasks[].outcomes.pr_url:
  query the platform for revert PRs against that SHA / PR number
  if found, set:
    state.tasks[task_id].status = FAILED
    state.tasks[task_id].failure_class = "regression_post_merge:revert_pr_detected"
    state.tasks[task_id].evidence.revert_pr_url = <revert URL>
    state.tasks[task_id].evidence.revert_reason_link = <body links extracted>
    state.tasks[task_id].attempts += 1
```

The platform query is provider-specific (GitHub: `gh pr list --search "is:merged base:main reverts:<sha>"`); the adapter exposes a `findRevertPRs(merged_pr_url)` capability.

### Watch window default

```jsonc
{
  "policy": {
    "watch_merged_prs": {
      "enabled": true,
      "window_days": 14,
      "providers": ["github"]
    }
  }
}
```

`window_days: 14` catches 92.6% of dashboard reverts (75 of 81); the two 30+ day outliers are not regular regression reverts (one is a re-apply, one is a deprecated-feature re-removal) and fall outside this failure mode. Projects wanting tighter feedback can set `3` (78% same-week, no long tail) or `7` (85%, middle ground).

### Healer prompt template

`prompts/heal-regression-post-merge.md`:

> Task `{{task_id}}` shipped as PR `{{pr_url}}` and was reverted by `{{revert_pr_url}}` within `{{days_to_revert}}` days. Read the revert PR's body for the regression evidence -- often a linked customer ticket, Slack incident, or production log.
>
> Do not blindly re-apply the original fix. Instead:
>
> 1. Identify what the original fix broke.
> 2. Find a smaller change that addresses the audit finding without the regression.
> 3. Include the revert reason in the new PR body so reviewers see the prior failure mode.
>
> If you cannot find a regression-free fix, emit `FAILED:real_bug` with the regression evidence; do not retry blindly.

### SKILL.md additions

Under "State and Resume", add a "Watch Window" subsection:

> #### Watch Window (post-merge regression detection)
>
> Once a task reaches `DONE` and its PR merges, the orchestrator records the PR URL in `state.tasks[task_id].outcomes.pr_url`. At every `--resume` (or on-demand `--watch-merged-prs`), the orchestrator queries the platform for revert PRs against merged tasks within `policy.watch_merged_prs.window_days` (default 14). If found:
>
> 1. The task is re-opened with `status = FAILED` and `failure_class = "regression_post_merge:revert_pr_detected"`.
> 2. The revert PR URL and any linked customer/incident URLs are stored in `state.tasks[task_id].evidence`.
> 3. The next worker invocation receives a regression-aware healer prompt that requires acknowledging the prior failure mode.
>
> This makes manifest tasks durable against post-merge regression, not just pre-merge verification. It does not relitigate tasks that pass the watch window cleanly.

### State schema delta

`schemas/state.v2.json` task entry:

```jsonc
{
  "outcomes": {
    "pr_url": { "type": ["string", "null"] },
    "pr_merged_at": { "type": ["string", "null"], "format": "date-time" }
  },
  "regression_history": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "revert_pr_url": { "type": "string" },
        "detected_at": { "type": "string", "format": "date-time" },
        "linked_incidents": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

## Evidence pointer

- A11y-specific canonical revert: [heroku/dashboard#10919](https://github.com/heroku/dashboard/pull/10919) reverts [#10909](https://github.com/heroku/dashboard/pull/10909). Body: "https://heroku.support/1403668. https://salesforce-internal.slack.com/archives/C068L8Y5CE4/p1718643796967779".
- A11y-specific earlier revert: [heroku/dashboard#10537](https://github.com/heroku/dashboard/pull/10537) reverts [#10534](https://github.com/heroku/dashboard/pull/10534) one day after merge.
- Broader corpus: 81 dashboard revert pairs analyzed in `/Users/ephem/lcode/a11y-docs/.logs/dashboard-reverts-analyzed.json`; full distribution in `/Users/ephem/lcode/a11y-docs/.logs/dashboard-reverts-summary.md`. The empirical 14-day window catches 92.6%.
