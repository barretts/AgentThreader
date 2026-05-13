# `blocked_external:awaiting_prerequisite` Failure Subtype

**Threat Level**: HIGH
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 14
**Confidence**: high
**Target Section**: Healing Model / Failure Class Taxonomy (new subtype) + State and Resume / Escalation Rules
**Impact**: Today's PBH retries rule-ratchet PRs whose failure is `the audited surface has pre-existing violations`. Each retry surfaces the same violations, signature repeats, task escalates as FAILED. 14 dashboard PRs sit closed-with-`on hold` because the human author saw this and paused; the orchestrator has no equivalent state.

**Context:** 14 of the dashboard's 48 rule-ratchet PRs sit in a `CLOSED` + `on hold` labeled state, all by the same author (Jamie White, Sept 2020), all 1-file PRs that delete a single `: { enabled: false }` entry from [`tests/helpers/a11y-audit.js`](file:///Users/bsonntag/code/dashboard/tests/helpers/a11y-audit.js). They didn't fail. They're paused -- the test suite revealed pre-existing violations the team needs to fix before re-enabling the rule is safe.

Today's PBH model treats their failure mode (`build_error:axe_violation_existing`) as healable: PBH retries the worker prompt, the rule still surfaces the same violations, signature repeats, the task escalates. That misclassifies the situation: the work is correct, the world isn't ready.

## Observation

Concrete examples from the corpus:

| PR | Rule | State | Body says |
|---|---|---|---|
| [#9659](https://github.com/heroku/dashboard/pull/9659) | `color-contrast` | CLOSED + `on hold` | "[x] Make the change. [ ] from Front-end." |
| [#9657](https://github.com/heroku/dashboard/pull/9657) | `button-name` | CLOSED + `on hold` | same |
| [#9682](https://github.com/heroku/dashboard/pull/9682) | `link-*` | CLOSED + `on hold` | same |
| [#9667](https://github.com/heroku/dashboard/pull/9667) | `heading-order` | CLOSED + `on hold` | same |
| [#9673](https://github.com/heroku/dashboard/pull/9673) | `image-alt` | CLOSED + `on hold` | same |
| ... 9 more identical-shape PRs |

The diff is identical across these PRs: one line in one file. The verify_profile fails because the rule, once enabled, surfaces real existing violations in production templates. The human opened the PR so the work is visible, then paused pending the violation-fix work.

In contrast, [#9645](https://github.com/heroku/dashboard/pull/9645) "Enable aXe autocomplete-valid rule" (same author, same shape) merged because the rule was already passing -- 11 files were touched to fix the 10 sites at the same time. The pattern that distinguishes mergeable from on-hold is whether violations cleanly resolve **inside the same PR**.

Current `failure_class` taxonomy in [SKILL.md](/Users/bsonntag/.claude/skills/agent-threader/SKILL.md):

> `build_error`, `test_error`, `smoke_error` may be healable when evidence points to prompt or configuration rather than a genuine product defect.

This is too coarse. A `build_error` whose root cause is "the audited surface has 47 pre-existing color-contrast violations across 23 templates" is not a prompt bug; it's a prerequisite-work blocker. PBH today retries, escalates, marks as FAILED. The dashboard's human author solved this with a label: `on hold`.

## Suggested Fix

### Add failure class subtype

Extend the Failure Class Taxonomy table in SKILL.md with a new subtype:

| Class | Subtype | Healable? | Healer response |
|---|---|---|---|
| `blocked_external` | `awaiting_prerequisite` | **no** | Mark BLOCKED, do not retry, keep manifest item open across `--resume` |
| `blocked_external` | `awaiting_design_decision` | **no** | Same |
| `blocked_external` | `awaiting_human_review` | **no** | Same |

These join the existing bare `blocked_external` as enumerated subtypes.

### Worker prompt contract

Workers that detect a prerequisite-violation situation should emit:

```json
{
  "contract_version": "2.0",
  "task_id": "ratchet-rule-color-contrast",
  "status": "BLOCKED",
  "failure_class": "blocked_external:awaiting_prerequisite",
  "summary": "Re-enabling color-contrast surfaces 47 existing violations across 23 templates; ratchet must follow violation-fix work.",
  "evidence": {
    "commands": ["pnpm test:axe"],
    "log_refs": [".logs/run-axe-color-contrast-1.log"],
    "notes": "Top 5 violating selectors: ..."
  }
}
```

The orchestrator MUST persist `BLOCKED` with `failure_class.startsWith("blocked_external:")` to `state.v2` and MUST NOT re-attempt the task within the current run. Next `--resume` re-evaluates only after a configurable cooldown (default 7 days) AND `--unblock` is set. Consequence of violating: the worker burns heal rounds re-discovering the same pre-existing violations, eventually escalating a task that should have stayed paused.

### PBH escalation rules update

Replace the current rule

> Per-task: escalate when a task repeats the same signature `signature_repeat_limit` times after healing, or when a non-healable failure exhausts retry policy.

with

> Per-task: escalate when a task repeats the same signature `signature_repeat_limit` times after healing. Non-healable failures (`blocked_external:*`, `regression_post_merge`, `transient_infra:api_auth_blocked`, `transient_infra:tool_unavailable`) skip escalation entirely and remain BLOCKED in state for human review on the next run.

### SKILL.md additions

Under "Healing Model / PBH Behavior", before the existing "Fatal-transient short-circuit" bullet, add:

> - **Prerequisite-blocked short-circuit:** any task that emits `failure_class: "blocked_external:awaiting_*"` is moved to `BLOCKED` and pulled out of the healing window. It does NOT consume heal rounds and does NOT trigger escalation. The orchestrator records the prerequisite in `state.v2.tasks[].blocked_reason` and surfaces it in the run summary.

### Routing implication

The right pre-work for `rule-ratchet` tasks is an `inventory` task that counts violations per rule **before** the ratchet runs. If `inventory.violation_count > 0`, the ratchet task auto-emits `BLOCKED:awaiting_prerequisite` without spawning a worker. This is exactly what the [`a11y-kit-inventory`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md) -> [`a11y-kit-ratchet`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-ratchet/a11y-kit-ratchet.md) routing does in the kit.

## Evidence pointer

- Representative on-hold PRs: [heroku/dashboard#9659](https://github.com/heroku/dashboard/pull/9659), [#9657](https://github.com/heroku/dashboard/pull/9657), [#9682](https://github.com/heroku/dashboard/pull/9682), [#9667](https://github.com/heroku/dashboard/pull/9667), [#9673](https://github.com/heroku/dashboard/pull/9673), and 9 more closed-with-`on hold`.
- Successful counterpart: [heroku/dashboard#9645](https://github.com/heroku/dashboard/pull/9645) - merged because the 10 violation sites were fixed in-PR.
- a11y-kit inventory skill: [/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md).
- Cluster: `rule-ratchet-onhold` in [.logs/a11y-pr-archetypes-summary.md](/Users/ephem/lcode/a11y-docs/.logs/a11y-pr-archetypes-summary.md) -- 14 PRs, 0 merged, all HIGH band.
