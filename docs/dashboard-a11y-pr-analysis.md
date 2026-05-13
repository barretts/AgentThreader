# agent-threader vs dashboard a11y PRs

Three-way comparison: what the dashboard team actually shipped, what a generic [`agent-threader`](/Users/bsonntag/.claude/skills/agent-threader/SKILL.md) run would produce, and what the domain-specialized [`a11y-remediation-kit`](/Users/ephem/lcode/a11y-remediation-kit/) would produce. Verdicts are honest, with concrete manifest sketches so the construction is challengeable.

- Inputs: 227 raw PRs from `gh pr list` against `heroku/dashboard`
- Source data: [.logs/dashboard-a11y-prs-with-body.json](.logs/dashboard-a11y-prs-with-body.json)
- Relevance scorer: [.logs/score-a11y-relevance.py](.logs/score-a11y-relevance.py)
- Clusterer: [.logs/cluster-a11y-prs.py](.logs/cluster-a11y-prs.py)
- Deep-read digest: [.logs/deep-read-digest.md](.logs/deep-read-digest.md)
- Filter audit: [.logs/relevance-audit.md](.logs/relevance-audit.md)

## Relevance funnel

| Stage | Count | Notes |
| --- | ---: | --- |
| Raw query (`a11y` OR `accessibility` OR `aria` OR `axe` OR `wcag`, title+body) | 227 | known noisy on `axe -> chart axes` |
| HIGH (score >= 0.50) | 156 | included in archetype clustering |
| MEDIUM (0.25 - 0.50) | 43 | included; flagged as "partial a11y intent" inline |
| LOW (0.10 - 0.25) | 13 | appendix only |
| EXCLUDE (< 0.10) | 15 | dropped from analysis with rationale |
| **Kept for clustering** | **199** | 88% retention |

7 of 7 sampled deep-checks at band boundaries agree with the script ([.logs/relevance-audit.md](.logs/relevance-audit.md)). Notable confirmed false positives: [#10271](https://github.com/heroku/dashboard/pull/10271) / [#10332](https://github.com/heroku/dashboard/pull/10332) (chart axes test migration, 56k+43k LOC), [#10750](https://github.com/heroku/dashboard/pull/10750) (CI ergonomics), [#1374](https://github.com/heroku/dashboard/pull/1374) (Ember 1.10 upgrade), [#9512](https://github.com/heroku/dashboard/pull/9512) (refactor).

## Evidence tier disclosure

These verdicts are derived from dashboard PR history alone — tier 2-3 prior-failure artifacts per the expert-curator skill's [Intake](file:///Users/bsonntag/.claude/plugins/cache/aisuite/expert-curator/aisuite.0b27bac776e75010/skills/expert-curator/SKILL.md) ladder. They are NOT measurements from a live agent-threader run. Each "would_match / would_improve / would_misfire / would_miss" label is an *inference from observed PR shape*, not a graded effectiveness score against a baseline.

Trace mining in `~/.claude/projects/-Users-bsonntag-code-{c360-ai-tooling-a11y-expert,dashboard}/` produced no tier-1 evidence (4 traces examined, all are single-PR reviews or skill-refactoring sessions, none are multi-task a11y orchestrations). See [.logs/relevance-audit.md](.logs/relevance-audit.md) "Trace mining (Phase 1 of remediation plan)".

The lessons that flow from these verdicts are therefore **ADVISORY-grade**, not CANDIDATE-grade. The "Residual Evidence Gap" section at the end of this report enumerates what would have to happen to upgrade them.

## Executive summary

| Archetype | n | Merged | HIGH | MED | Verdict (vs. agent-threader) | Conf | Top lesson |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| `icon-sweep-batch` | 54 | 51 | 51 | 3 | **would_improve** with batch-sizing policy | high | [batch-sizing](#archetype-icon-sweep-batch) |
| `component-single-fix` | 60 | 56 | 33 | 27 | **would_match** | high | [verify-profile](#archetype-component-single-fix) |
| `rule-ratchet-single` | 34 | 34 | 34 | 0 | **would_match** with shared verify_profile | high | [verify-profile](#archetype-rule-ratchet-single) |
| `rule-ratchet-onhold` | 14 | 0 | 14 | 0 | **would_misfire** (PBH escalates instead of pausing) | high | [blocked-external subtype](#archetype-rule-ratchet-onhold) |
| `kit-foundation` | 9 | 7 | 5 | 4 | **would_misfire** without shared-include resource locks | high | [shared-include lock](#archetype-kit-foundation) |
| `recent-kit-era` | 8 | 7 | 7 | 1 | **would_match** (validates surface routing) | medium | folded into closing |
| `surface-cascade` | 7 | 6 | 4 | 3 | **would_miss** the inventory precursor | medium | [inventory-first](#archetype-surface-cascade) |
| `codemod-sweep` | 6 | 4 | 5 | 1 | **would_overengineer** as per-file tasks | high | [codemod-vs-task](#archetype-codemod-sweep) |
| `dep-bump-a11y` | 5 | 5 | 3 | 2 | **would_match** with attempt-pair handling | medium | [attempt-pair](#archetype-dep-bump-a11y) |
| `revert` | 2 (a11y) / 81 (broader) | 2 / 81 | 0 | 2 | **would_miss** (no post-merge regression awareness) | high | [revert-detection](#archetype-revert) |

Confidence rubric: **high** = n>=10 OR n<10 with corroborating quote/citation; **medium** = n<10 with no corroborating evidence; **low** = single observation. The `revert` row uses n=81 from the broader dashboard corpus (not just a11y) because the mechanic is content-neutral; see [archetype-revert](#archetype-revert).

Cross-cutting lesson: the [a11y-kit's `pr-scoping-policy.md`](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md) ("one surface family, one page family, one codemod batch, or one axe rule ratchet per PR") is the orchestrator scoping rule agent-threader is missing. See [pr-scoping policy lift](#cross-cutting-pr-scoping-policy).

## Per-archetype findings

### Archetype: icon-sweep-batch

**Count:** 54 (51 merged). Representative: [#9385](https://github.com/heroku/dashboard/pull/9385) "Malibu Accessible Icons Update 14" (7 files), and 14 sister batches `#9535..#9556` "Add @title or aria-hidden to a selection of icons (batch N)".

**Actual PR shape:** one PR per batch of 7-12 components. The mechanical edit is invariant: for each `{{malibu-icon}}` invocation, either add a `title=` (informational icon) or `role="presentation"` (decorative). Verification: aXe browser extension + screenreader spot-check per [#9385](https://github.com/heroku/dashboard/pull/9385) body.

**Generic agent-threader manifest sketch:**

```jsonc
{
  "manifest_digest": "...",
  "tasks": [
    {
      "id": "malibu-icons-batch-14",
      "prompt_ref": "prompts/icon-sweep.md",
      "depends_on": [],
      "timeout_sec": 1800,
      "verify_profile": "axe-rule-ratchet:role-img-alt",
      "resource_lock": null,
      "metadata": {"batch_pack_size": 10, "rule": "role-img-alt"}
    },
    { "id": "malibu-icons-batch-15", "...": "..." }
  ]
}
```

Naive agent-threader would generate one task per icon site (hundreds of items) and chain them. The dashboard team packed 7-12 sites per PR for reviewability. This is the canonical case for a `batch_pack_size` policy at the orchestrator level: take N near-identical mechanical tasks and ship them in one PR. See [contribution: batch sizing](file:///Users/ephem/lcode/agentthreader/lessons/batch-pack-size-policy-medium.md).

**a11y-kit routing:** [`a11y-kit-codemod`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-codemod/a11y-kit-codemod.md) (mechanical template edit), with surface routing via [`a11y-kit-surface-*`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/) for the specific icon family.

**Verdict:** `would_improve`. Naive task-per-site explodes the manifest; with `batch_pack_size` it matches what humans did.

### Archetype: component-single-fix

**Count:** 60 (56 merged). Representative range covers single-file or 2-3-file targeted fixes: [#10526](https://github.com/heroku/dashboard/pull/10526) team filter label, [#10540](https://github.com/heroku/dashboard/pull/10540) oauth toggle label, [#11936](https://github.com/heroku/dashboard/pull/11936) activity feed accessibility, [#11955](https://github.com/heroku/dashboard/pull/11955) button-as-column-header (recent kit-era).

**Actual PR shape:** one audit finding -> one component file change. Verification: targeted aXe rule passes + screenreader spot-check.

**Generic agent-threader manifest sketch:**

```jsonc
{
  "id": "fix-button-as-column-header-collaborators",
  "prompt_ref": "prompts/component-single-fix.md",
  "verify_profile": "axe-rule-ratchet:button-name",
  "timeout_sec": 900,
  "metadata": {"audit_finding": "W-22013243", "page_family": "app/access"}
}
```

**a11y-kit routing:** [`a11y-kit-fix`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-fix/a11y-kit-fix.md), with surface routing.

**Verdict:** `would_match`. The verify_profile is reusable across the 60 PRs in this archetype - see [verify-profile lesson](file:///Users/ephem/lcode/agentthreader/lessons/verify-profile-templates-medium.md).

### Archetype: rule-ratchet-single

**Count:** 34 merged. Representative: [#9645](https://github.com/heroku/dashboard/pull/9645) "Enable aXe autocomplete-valid rule" (11 files, mostly templates + the test helper). Pattern across all 34: delete one rule entry from [`tests/helpers/a11y-audit.js`](file:///Users/bsonntag/code/dashboard/tests/helpers/a11y-audit.js), then fix the N violation sites the test suite surfaces.

**Actual PR shape:** Jamie White shipped ~30 of these in two weeks (Sept 2020). Each PR is single-rule. Verification: every existing `a11yAudit()` call (5,481 of them in the dashboard) re-runs the rule once it's enabled.

**Generic agent-threader manifest sketch:**

```jsonc
{
  "id": "ratchet-rule-autocomplete-valid",
  "prompt_ref": "prompts/rule-ratchet.md",
  "depends_on": [],
  "verify_profile": "axe-rule-ratchet:autocomplete-valid",
  "resource_lock": "shared-include:tests/helpers/a11y-audit.js",
  "timeout_sec": 2400
}
```

The `resource_lock` is critical: all 34 rule-ratchet PRs touch the same file. Without it, concurrent agent-threader tasks would race on the test helper. See [shared-include lock lesson](file:///Users/ephem/lcode/agentthreader/lessons/shared-include-resource-locks-high.md).

**a11y-kit routing:** [`a11y-kit-ratchet`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-ratchet/a11y-kit-ratchet.md).

**Verdict:** `would_match` with shared `verify_profile` template and shared-include `resource_lock`.

### Archetype: rule-ratchet-onhold

**Count:** 14 PRs, **all closed, none merged**. Examples: [#9659](https://github.com/heroku/dashboard/pull/9659) color-contrast, [#9657](https://github.com/heroku/dashboard/pull/9657) button-name, [#9682](https://github.com/heroku/dashboard/pull/9682) link-rules, [#9667](https://github.com/heroku/dashboard/pull/9667) heading-order, [#9673](https://github.com/heroku/dashboard/pull/9673) image-alt. All carry the `on hold` label.

**Actual PR shape:** identical to rule-ratchet-single (delete the rule entry, 1-file PR). But re-enabling the rule revealed real existing violations that needed pre-fixing. The 14 PRs are stuck pending design / batch-fixing of violations. Body: "## What's the plan? - [x] Make the change - [ ] from **Front-end**". The human author opened the PR to surface the work, then paused.

**Generic agent-threader behavior (current):** PBH would mark these `FAILED` after `signature_repeat_limit=2` (build_error: existing violations), then escalate. The healer treats them as terminal.

**The right behavior:** these are `BLOCKED`, not `FAILED`. The blocker is "pre-existing violations need to be fixed first" - a `blocked_external` subtype. PBH should pause escalation and keep the manifest item open across runs until the prerequisite work lands.

**a11y-kit routing:** [`a11y-kit-inventory`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md) first (count violations per rule), then [`a11y-kit-ratchet`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-ratchet/a11y-kit-ratchet.md) after violations are cleared.

**Verdict:** `would_misfire`. See [blocked-external subtype lesson](file:///Users/ephem/lcode/agentthreader/lessons/blocked-external-awaiting-prerequisite-high.md).

### Archetype: kit-foundation

**Count:** 9 (7 merged). Representatives:
- [#9316](https://github.com/heroku/dashboard/pull/9316) "always call a11yAudit after ember test helpers" (339 files, MERGED)
- [#9279](https://github.com/heroku/dashboard/pull/9279) "add a11y auditing after every call" (336 files, **CLOSED** in favor of #9316)
- [#11932](https://github.com/heroku/dashboard/pull/11932) "update ember-a11y-testing to v8 with global config" (468 files, **CLOSED**)
- [#11933](https://github.com/heroku/dashboard/pull/11933) "update ember-a11y-testing to v8 with global config" (469 files, MERGED 1 day later)
- [#11945](https://github.com/heroku/dashboard/pull/11945) "Remove stale a11y-audit imports" (12 files, MERGED 1 week later as follow-up)
- [#9613](https://github.com/heroku/dashboard/pull/9613) "Enable ember-a11y-testing for just svg-img-alt rule" (the first ratchet, 10 files)
- [#9649](https://github.com/heroku/dashboard/pull/9649) "Clean up aXe rule config" (1 file)
- [#10755](https://github.com/heroku/dashboard/pull/10755) "Disable `preload` in `a11y` tests" (1 file)

**Actual pattern:** these PRs touch the dashboard's a11y test helper module - a globally-included file. They are inherently serialized; you can't concurrently restructure global hooks. The `#11932` -> `#11933` pair is the attempt-pair pattern: same PR a day apart, the closed one had a corrupted `pnpm-lock.yaml` (+2341/-1785), the merged one had a clean lockfile (+36/-113). The [#11945](https://github.com/heroku/dashboard/pull/11945) follow-up cleans up 11 stale imports `#11933` missed.

**Generic agent-threader gaps:**
1. No `resource_lock` on the shared test-helper include - all 9 PRs would race.
2. No "attempt-pair" pattern - `--resume` after the first closed attempt should detect the lockfile churn and discard it before retry.
3. No "merge_window" - the 1-week gap between [#11933](https://github.com/heroku/dashboard/pull/11933) merge and [#11945](https://github.com/heroku/dashboard/pull/11945) follow-up should be in a "watch for stragglers" phase, not a terminal DONE.

**a11y-kit routing:** [`a11y-kit-doctor`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-doctor/a11y-kit-doctor.md) (env health) + [`a11y-kit-orchestrator`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-orchestrator/a11y-kit-orchestrator.md) directly.

**Verdict:** `would_misfire` without the resource lock + attempt-pair handling. See [shared-include lesson](file:///Users/ephem/lcode/agentthreader/lessons/shared-include-resource-locks-high.md) and [attempt-pair lesson](file:///Users/ephem/lcode/agentthreader/lessons/attempt-pair-preflight-medium.md).

### Archetype: recent-kit-era

**Count:** 8 (7 merged, 1 open). Representative: [#11930](https://github.com/heroku/dashboard/pull/11930) "Add disclosure pattern to first-run banner toggles" (2 files, kenyaplenty), [#11928](https://github.com/heroku/dashboard/pull/11928) "Add WCAG 1.3.5 autocomplete tokens", [#11955](https://github.com/heroku/dashboard/pull/11955) "Fix button-as-column-header", [#11952](https://github.com/heroku/dashboard/pull/11952) "Improve dismiss button contrast", [#11860](https://github.com/heroku/dashboard/pull/11860) "fixing a11y bug W-22013442".

**Actual pattern:** scoped PRs landing post-2026-03-01 kickoff. Each cites a GUS ticket with `[Accessibility]` prefix. Bodies cite WCAG criteria explicitly ([#11930](https://github.com/heroku/dashboard/pull/11930): "WCAG 2.1.1 and 4.1.2"). Verification steps include explicit screen-reader testing. Authors are the kit-era team (kenyaplenty, kharlowSF, lucasxzh).

**Generic agent-threader manifest sketch:**

```jsonc
{
  "id": "fix-disclosure-pattern-first-run-banner",
  "prompt_ref": "prompts/surface-disclosure.md",
  "verify_profile": "axe-rule-ratchet:button-name+keyboard",
  "metadata": {
    "audit_finding": ["W-22013246", "W-22013240"],
    "wcag_criteria": ["2.1.1", "4.1.2"],
    "surface_family": "disclosure-pattern",
    "page_family": "personal/team-first-run"
  }
}
```

**a11y-kit routing:** maps 1:1 onto the surface skills. [#11930](https://github.com/heroku/dashboard/pull/11930) -> [`a11y-kit-surface-structure`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-structure/a11y-kit-surface-structure.md) (disclosure is a structural pattern). [#11928](https://github.com/heroku/dashboard/pull/11928) -> [`a11y-kit-surface-form`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-form/a11y-kit-surface-form.md) (autocomplete tokens). [#11955](https://github.com/heroku/dashboard/pull/11955) -> [`a11y-kit-surface-structure`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-structure/a11y-kit-surface-structure.md) (table semantics).

**Verdict:** `would_match`. This is empirical evidence that the kit's surface-family routing is correctly designed. See the routing table in the closing section above (folded from a deleted standalone lesson).

### Archetype: surface-cascade

**Count:** 7 (6 merged). Representatives: [#9729](https://github.com/heroku/dashboard/pull/9729) "Create an accessible toggletip component" (9 files, 604+/-444), [#7545](https://github.com/heroku/dashboard/pull/7545) "Improve accessibility of drop-downs and pop-overs" (9 files, 2018), [#11844](https://github.com/heroku/dashboard/pull/11844) "[AppLink] Fix accessibility issues and modernize and colocate", [#9642](https://github.com/heroku/dashboard/pull/9642) "Make the sub-nav component accessible".

**Actual PR shape:** building or replacing a shared component that downstream consumers depend on. [#9729](https://github.com/heroku/dashboard/pull/9729) creates `info-toggletip.js` + `scss` + `hbs` + `boundary.js` - a brand-new component. Body links to a Quip design doc. The PR is preceded by an inventory: where will this be used? The "before" image shows the existing `<TextWithTooltip>` component being replaced.

**Generic agent-threader gap:** no `inventory` precursor task. Tasks that touch shared components would race or churn without one.

**The right shape (mirrors a11y-kit-inventory):**

```jsonc
[
  {
    "id": "inventory-toggletip-consumers",
    "prompt_ref": "prompts/inventory-component-consumers.md",
    "verify_profile": "inventory:done-when-list-emitted",
    "timeout_sec": 600
  },
  {
    "id": "create-info-toggletip-component",
    "prompt_ref": "prompts/surface-create.md",
    "depends_on": ["inventory-toggletip-consumers"],
    "verify_profile": "axe-rule-ratchet:full+keyboard",
    "timeout_sec": 2400
  },
  {
    "id": "migrate-toggletip-consumer-N",
    "depends_on": ["create-info-toggletip-component"],
    "resource_lock": "shared-include:app/components/info-toggletip.hbs"
  }
]
```

**a11y-kit routing:** [`a11y-kit-inventory`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md) + [`a11y-kit-surface-modal`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-modal/a11y-kit-surface-modal.md) / [`-tooltip`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-tooltip/a11y-kit-surface-tooltip.md) / [`-form`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-form/a11y-kit-surface-form.md).

**Verdict:** `would_miss`. See [inventory-first lesson](file:///Users/ephem/lcode/agentthreader/lessons/surface-cascade-workflow-pipeline-medium.md).

### Archetype: codemod-sweep

**Count:** 6 (4 merged). Representatives: [#9316](https://github.com/heroku/dashboard/pull/9316) "always call a11yAudit" (339 files, MERGED), [#9530](https://github.com/heroku/dashboard/pull/9530) "Upgrade malibu 1.6.0" (240 files cascade), [#9495](https://github.com/heroku/dashboard/pull/9495) "Add lint rule for DevCenter links + autofix" (86 files, **CLOSED** unmerged).

**Actual pattern:** mechanical edit applied at scale. [#9316](https://github.com/heroku/dashboard/pull/9316) is the canonical example. Author Stanley Stuart explicitly says in the body: "I broke this PR out so that reviewing the `a11yAudit` function we are writing can be reviewed as its own pull request, rather than get lost in the noise of all the changes here." That is: the codemod tool itself was reviewed in a separate PR; this PR is the bulk apply.

**Failure mode:** [#9495](https://github.com/heroku/dashboard/pull/9495) combined the lint rule + the autofix into one 86-file PR. The PR was abandoned (CLOSED, `in progress` label still on). The a11y-kit's [pr-scoping-policy](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md) says "one codemod batch per PR" - combining tool + apply violated that and the PR became unreviewable.

**Generic agent-threader gap:** if the manifest expresses [#9316](https://github.com/heroku/dashboard/pull/9316) as 339 per-file tasks, the cascade explodes; if as one task with one huge `writes[]`, the verify_profile must be a single build/test gate. Neither is wrong but agent-threader doesn't currently distinguish "codemod" task type from "fix" task type.

**The right shape:** introduce a `task_type=codemod` with single-task semantics, bulk writes, build-gated verify, and an `apply_only=true` flag that forbids subjective edits in the worker prompt.

**a11y-kit routing:** [`a11y-kit-codemod`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-codemod/a11y-kit-codemod.md) for the apply phase, [`a11y-kit-pattern-sweep`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-pattern-sweep/a11y-kit-pattern-sweep.md) for the detect-and-list phase.

**Verdict:** `would_overengineer`. See [codemod-vs-task lesson](file:///Users/ephem/lcode/agentthreader/lessons/task-type-discriminator-medium.md).

### Archetype: dep-bump-a11y

**Count:** 5 (all merged). Representatives: [#10861](https://github.com/heroku/dashboard/pull/10861) ember-power-select 4.x->8.x (body: "Upgrading all the way to 8.x gets us improved accessibility"), [#11504](https://github.com/heroku/dashboard/pull/11504) hk-modal wormhole replacement (body: "Add a caption to the Eco dyno usage table for accessibility"), [#9292](https://github.com/heroku/dashboard/pull/9292) eslint upgrade, [#9289](https://github.com/heroku/dashboard/pull/9289) / [#9558](https://github.com/heroku/dashboard/pull/9558) ember-hk-components bumps.

**Actual pattern:** dep upgrade with a11y as motivation or side-effect. Verification: full test suite + manual smoke. These are inherently one-shot.

**Generic agent-threader manifest sketch:**

```jsonc
{
  "id": "dep-bump-ember-power-select-v8",
  "prompt_ref": "prompts/dep-bump.md",
  "verify_profile": "build+test+smoke:combobox",
  "timeout_sec": 3600,
  "retry_policy": {"max_attempts_per_task": 2, "reset_tasks_on_retry": true}
}
```

The `kit-foundation` archetype already covers the [#11932](https://github.com/heroku/dashboard/pull/11932) -> [#11933](https://github.com/heroku/dashboard/pull/11933) ember-a11y-testing attempt-pair. Same pattern applies to dep-bumps generally.

**a11y-kit routing:** not directly addressed by current kit skills; would fall to [`a11y-kit-doctor`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-doctor/a11y-kit-doctor.md) (env health post-bump).

**Verdict:** `would_match` with attempt-pair handling.

### Archetype: revert

**Count:** 2. [#10919](https://github.com/heroku/dashboard/pull/10919) reverts [#10909](https://github.com/heroku/dashboard/pull/10909) "Address a11y violations in console" (merged 2024-06-12, reverted 2024-06-17 - 5 days later). Body of [#10919](https://github.com/heroku/dashboard/pull/10919): "Reverts heroku/dashboard#10909. https://heroku.support/1403668. https://salesforce-internal.slack.com/archives/C068L8Y5CE4/p1718643796967779". The a11y fix broke production behavior in console; customer support ticket + slack incident drove the revert. [#10537](https://github.com/heroku/dashboard/pull/10537) similarly reverts [#10534](https://github.com/heroku/dashboard/pull/10534).

**Generic agent-threader gap:** today, once a manifest task hits `DONE` (PR merged), it's terminal. There is no concept of "downstream regression detected post-merge".

**The right shape:** add a `regression_post_merge` failure class. The healer's `--watch-merged-prs` phase should monitor merged PRs for revert PRs within N days. If found, re-open the manifest task with the revert PR + customer report attached as evidence, and route to a regression-fix prompt.

**a11y-kit routing:** would route revert detection through [`a11y-kit-orchestrator`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-orchestrator/a11y-kit-orchestrator.md) -> [`a11y-kit-fix`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-fix/a11y-kit-fix.md) with the audit finding re-opened.

**Verdict:** `would_miss`. See [revert-detection lesson](file:///Users/ephem/lcode/agentthreader/lessons/regression-post-merge-failure-class-high.md).

## Cross-cutting: PR scoping policy

The a11y-remediation-kit's [pr-scoping-policy fragment](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md) reads:

> Keep remediation reviewable: one surface family, one page family, one codemod batch, or one axe rule ratchet per PR.
>
> Do not mix visual redesign, structural markup, rule-ratchet changes, and broad shared-component edits unless explicitly approved. Shared-component cascades must be inventory-backed, with consumer list and rollback path.

Empirical support across the corpus:

- All 34 `rule-ratchet-single` PRs are exactly one rule per PR.
- All 54 `icon-sweep-batch` PRs are exactly one codemod batch per PR.
- All 8 `recent-kit-era` PRs are exactly one surface family or one page family per PR.
- The two corpus-wide abandonments ([#9495](https://github.com/heroku/dashboard/pull/9495) lint+autofix combined, [#9279](https://github.com/heroku/dashboard/pull/9279) earlier a11y-audit cascade attempt) both violated this rule.

The policy generalizes to all manifest-driven work, not just a11y. It deserves a place in agent-threader's manifest section as a generic "one-axis-per-PR" rule. See [pr-scoping lift lesson](file:///Users/ephem/lcode/agentthreader/lessons/pr-scoping-policy-high.md).

## What this means for the a11y-remediation-kit deployment

The dashboard corpus is the kit's target codebase. Reading 199 PRs back validates the kit's design:

1. **Surface skills are correctly factored.** The 8 recent-kit-era PRs map 1:1 onto [`a11y-kit-surface-form`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-form/), [`-tooltip`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-tooltip/), [`-modal`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-modal/), [`-combobox`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-combobox/), [`-structure`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-structure/), [`-layout`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-layout/). Routing table:

   | PR | Title | a11y-kit target |
   | --- | --- | --- |
   | [#11860](https://github.com/heroku/dashboard/pull/11860) | fixing a11y bug W-22013442 | [`a11y-kit-fix`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-fix/) |
   | [#11914](https://github.com/heroku/dashboard/pull/11914) | Fix toggle button semantics on favorites button | [`a11y-kit-surface-structure`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-structure/) |
   | [#11916](https://github.com/heroku/dashboard/pull/11916) | Add label and describe App name field | [`a11y-kit-surface-form`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-form/) |
   | [#11926](https://github.com/heroku/dashboard/pull/11926) | Add empty alt default to `<AddonIcon>` | [`a11y-kit-codemod`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-codemod/) |
   | [#11928](https://github.com/heroku/dashboard/pull/11928) | Add WCAG 1.3.5 autocomplete tokens | [`a11y-kit-surface-form`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-form/) |
   | [#11930](https://github.com/heroku/dashboard/pull/11930) | Add disclosure pattern to first-run banner toggles | [`a11y-kit-surface-structure`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-structure/) |
   | [#11936](https://github.com/heroku/dashboard/pull/11936) | Improve activity feed accessibility | [`a11y-kit-fix`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-fix/) |
   | [#11952](https://github.com/heroku/dashboard/pull/11952) | Improve dismiss button contrast | [`a11y-kit-fix`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-fix/) |
   | [#11955](https://github.com/heroku/dashboard/pull/11955) | Fix button-as-column-header | [`a11y-kit-surface-structure`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-surface-structure/) |

   Every kit-era PR routes to exactly one specialized skill. None require ad-hoc orchestration. The kit's surface-skill decomposition is correct.

2. **Portability note — domain skill on top of generic agent-threader.** The a11y-remediation-kit is NOT a fork of agent-threader. It's a domain layer that adds (a) worker prompt templates per surface family, (b) verify profile templates (`axe-rule-ratchet` etc.), (c) routing rules per surface family, (d) manifest scaffolding helpers for inventory -> design -> migrate cascades. It does NOT redefine the `task_result.v2` / `heal_decision.v2` / `state.v2` contracts, the orchestrator's primitives, or the adapter model. This is the right separation for future domain skills (security remediation, framework migration, perf optimization).

2. **The `pr-scoping-policy` fragment is empirically supported** (see above). Keep it canonical.

3. **The kit is missing a `regression_post_merge` handler** that watches for reverts of merged kit PRs. The dashboard's [#10909](https://github.com/heroku/dashboard/pull/10909) -> [#10919](https://github.com/heroku/dashboard/pull/10919) sequence is a cautionary tale.

4. **The kit has [`a11y-kit-ratchet`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-ratchet/) but no `awaiting_violations` blocker concept.** The 14 `rule-ratchet-onhold` PRs from 2020 show that the right move is to call inventory first, fix violations next, ratchet last.

5. **The kit's `a11y-kit-inventory` skill is necessary, not nice-to-have.** Surface-cascade PRs that skipped inventory either churned or got abandoned.

6. **Authors learned across batches.** The `Malibu Accessible Icons Update 1..19` sequence ran with batches of 4-10 files. The later `Add @title or aria-hidden (batch N)` sequence settled at 11-12 files per PR. Empirical batch-pack-size for icon sweeps in this codebase: 10-12 components per PR.

## Residual evidence gap

The expert-curator skill's [Candidate Readiness Checklist Section A](file:///Users/bsonntag/.claude/plugins/cache/aisuite/expert-curator/aisuite.0b27bac776e75010/skills/expert-curator/guides/quality/readiness.md) demands:

> "Baseline run exists for every objective — Claude's response with no skill loaded. This is the evidence the skill adds value."

This report does NOT meet that bar. What's missing:

1. **No live agent-threader baseline.** I never ran agent-threader against a representative dashboard a11y task per archetype. The "what agent-threader would do" manifest sketches are speculation grounded in dashboard PR shapes, not measurement of agent-threader behavior.
2. **No before/after eval re-grade.** Each verdict (`would_match` / `would_improve` / `would_misfire` / `would_miss` / `would_overengineer`) would need a concrete eval: (a) define an objective per archetype, (b) capture the no-skill baseline, (c) apply the proposed lesson, (d) re-run and grade.
3. **No tier-1 trace evidence.** Phase 1 trace mining surveyed 4 traces; all were single-PR reviews or a meta-session, not multi-task orchestration. There is no `~/.claude/projects/<uuid>.jsonl` showing agent-threader producing the wrong manifest shape for an a11y task.

What would upgrade ADVISORY -> CANDIDATE-INPUT:

- Run the agent-threader CLI from [/Users/ephem/lcode/agentthreader/](file:///Users/ephem/lcode/agentthreader/) against ONE representative PR per archetype (10 baseline runs). Capture the traces. Re-grade each verdict against actual output.
- Estimated effort: 4-8 hours; infrastructure risk if the CLI requires an unconfigured platform adapter or model.

Until that work is done, these contributions are **suggestions backed by archival pattern**, not measured improvements. Reviewers should treat them accordingly.

## Appendix A: dropped PRs (LOW + EXCLUDE bands)

28 PRs landed in LOW (13) or EXCLUDE (15). Full list in [.logs/a11y-pr-excluded.csv](.logs/a11y-pr-excluded.csv). Highlights:

| PR | Title | Band | Reason |
| --- | --- | --- | --- |
| [#10271](https://github.com/heroku/dashboard/pull/10271) | Migrate metrics chart axes to qunit (56k LOC) | EXCLUDE | chart-axes token, test migration |
| [#10332](https://github.com/heroku/dashboard/pull/10332) | Migrate metrics chart axes to qunit (43k LOC) | EXCLUDE | same |
| [#10750](https://github.com/heroku/dashboard/pull/10750) | Improve CI ergonomics | LOW | a11y-infra mention is incidental to a CI PR |
| [#1374](https://github.com/heroku/dashboard/pull/1374) | Upgrade to Ember 1.10.1 | EXCLUDE | 2015 dep bump, chart-axes substring in body |
| [#9512](https://github.com/heroku/dashboard/pull/9512) | Remove unnecessary dependent key | EXCLUDE | 1-line refactor; `axes-element` substring |
| [#8882](https://github.com/heroku/dashboard/pull/8882) | Implement paginated apps list | LOW | unrelated feature; stray a11y vocab |
| [#11923](https://github.com/heroku/dashboard/pull/11923) | dependabot: bump `open` 6 -> 11 | EXCLUDE | unrelated dep bump |

## Appendix B: lesson bundle index

Nine lessons ship as a PR against the agent-threader source repo at [/Users/ephem/lcode/agentthreader/lessons/](/Users/ephem/lcode/agentthreader/lessons/):

| Lesson | Severity | n | Confidence |
| --- | --- | ---: | --- |
| `batch-pack-size-policy-medium.md` | medium | 54 | high |
| `blocked-external-awaiting-prerequisite-high.md` | high | 14 | high |
| `task-type-discriminator-medium.md` | medium | 6 | high |
| `regression-post-merge-failure-class-high.md` | high | 81 | high |
| `attempt-pair-preflight-medium.md` | medium | 5 | medium |
| `surface-cascade-workflow-pipeline-medium.md` | medium | 7 | medium |
| `pr-scoping-policy-high.md` | high | 199 | high |
| `shared-include-resource-locks-high.md` | high | 57 | high |
| `verify-profile-templates-medium.md` | medium | 199 | high |

The tenth originally-drafted lesson (`recent-kit-era-confirms-routing`) was a validation observation rather than a new mechanic; it has been folded into the "What this means for the a11y-remediation-kit deployment" section above and the standalone contribution file has been deleted.
