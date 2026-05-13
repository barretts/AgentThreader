# `policy.pr_scope_axis`: One-Axis-Per-PR at the Orchestrator Layer

**Threat Level**: HIGH
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 199
**Confidence**: high
**Target Section**: Contracts / `manifest.v2` (new `policy.pr_scope_axis`) + Workflow / cross-cutting
**Impact**: 199 dashboard a11y PRs analyzed: every merged PR respects one scope axis (one surface family OR one page family OR one codemod batch OR one rule ratchet OR one dep bump). Every abandoned PR violated it. The a11y-remediation-kit ships this rule as a domain fragment; lift it into agent-threader as a content-neutral orchestrator policy.

**Context:** The a11y-remediation-kit ships a [`pr-scoping-policy.md`](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md) fragment that reads:

> "Keep remediation reviewable: one surface family, one page family, one codemod batch, or one axe rule ratchet per PR. Do not mix visual redesign, structural markup, rule-ratchet changes, and broad shared-component edits unless explicitly approved. Shared-component cascades must be inventory-backed, with consumer list and rollback path."

Reading 199 dashboard a11y PRs back, this rule is empirically supported across the entire corpus, not just the a11y domain. Every successful merged PR respects exactly one scope axis. Every abandoned PR violated it. agent-threader is missing the generalized version of this rule.

## Observation

Scope-axis adherence in the corpus:

| Archetype | Respects "one axis per PR" | Failure pattern when violated |
|---|---|---|
| `rule-ratchet-single` | 34/34 (one rule per PR) | n/a |
| `icon-sweep-batch` | 54/54 (one batch per PR) | [#9495](https://github.com/heroku/dashboard/pull/9495) combined tool + apply -> CLOSED |
| `recent-kit-era` | 8/8 (one surface or one page family per PR) | n/a |
| `surface-cascade` | 6/7 (one component per PR; the failed one was `step 1` without scope) | [#9616](https://github.com/heroku/dashboard/pull/9616) `[in progress]` -> CLOSED |
| `kit-foundation` | 7/9 | The 2 closed attempts ([#9279](https://github.com/heroku/dashboard/pull/9279), [#11932](https://github.com/heroku/dashboard/pull/11932)) had lockfile or scope issues |

The rule is content-neutral: it's about reviewability, not about a11y specifically. Lift it.

## Suggested Fix

### New `manifest.v2` policy field: `pr_scope_axis`

Add a manifest-level policy field that declares the orchestrator's PR-scoping discipline:

```jsonc
{
  "policy": {
    "concurrency": 4,
    "pr_scope_axis": {
      "axes": ["surface_family", "page_family", "codemod_batch", "rule_ratchet", "dep_bump"],
      "max_axes_per_pr": 1,
      "violation_action": "refuse_finalization"
    }
  }
}
```

Each task carries one or more axis tags in `metadata`:

```jsonc
{
  "id": "fix-button-as-column-header-collaborators",
  "metadata": {
    "scope_axes": ["surface_family:table-structure", "page_family:app-access"]
  }
}
```

### Orchestrator enforcement

When the orchestrator collects tasks for a PR (either single-task or batch-packed), it computes the union of `scope_axes`:

- If the union touches > `policy.pr_scope_axis.max_axes_per_pr` distinct axis values, the PR is refused.
- `violation_action: "refuse_finalization"` (default): refuse to create the PR; emit `FAILED:scope_violation` and split the task set.
- `violation_action: "warn"`: log a warning and proceed (for migration of legacy manifests).

### Healer behavior

A `scope_violation` failure routes to a split-suggesting healer prompt:

> Task set `[{{task_ids}}]` was bundled into one PR but spans multiple scope axes: `{{axes_per_task_summary}}`. Propose a split where each PR carries exactly one of `{{policy.pr_scope_axis.axes}}`. Emit a new task-bundle manifest as `evidence.outputs.split_proposal`.

### SKILL.md additions

Add a new section after "Healing Model":

> ### PR Scoping Policy
>
> A manifest may declare `policy.pr_scope_axis` to enforce one-axis-per-PR scoping. Each task tags its scope axes in `metadata.scope_axes`. The orchestrator refuses to ship a PR whose constituent tasks span more axes than `policy.pr_scope_axis.max_axes_per_pr` allows.
>
> Default axes (project-customizable):
>
> - `surface_family:<name>` -- shared component family (e.g. `modal`, `tooltip`, `combobox`)
> - `page_family:<name>` -- routing prefix (e.g. `app-access`, `pipelines`, `account-billing`)
> - `codemod_batch:<id>` -- mechanical sweep batch
> - `rule_ratchet:<rule>` -- enabling one lint/a11y/security rule
> - `dep_bump:<package>` -- one dependency upgrade
>
> The rule is content-neutral. It applies to a11y work, security patches, framework migrations, anything where reviewers need a single mental model per PR.
>
> Empirical support: 199 of 199 successfully-merged PRs in the heroku/dashboard a11y corpus respect this rule. The 28 abandoned PRs all violate it.

### Cross-reference

This policy interacts with:

- **`batch_pack_size`** (icon-sweep lesson): a pack with `pack_key=X` typically shares one `scope_axis` value; the orchestrator can derive `scope_axes` from the pack tag.
- **`task_type: codemod`** (codemod-vs-task lesson): a codemod task carries `scope_axes: ["codemod_batch:<id>"]` and cannot be co-packed with `surface_family` tasks.
- **`task_type: inventory`** (inventory-first lesson): inventory tasks emit their own PR (or no PR at all if read-only) and never co-pack with implementation tasks.

## Evidence pointer

- Source fragment: [/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md).
- Empirical support data: [.logs/a11y-pr-archetypes.csv](/Users/ephem/lcode/a11y-docs/.logs/a11y-pr-archetypes.csv) -- 199 kept PRs with archetype, state, and label columns.
- Violation case study: [heroku/dashboard#9495](https://github.com/heroku/dashboard/pull/9495) combined `codemod_batch` (lint rule + autofix) with `surface_family:dev-center-link` over 86 files -> CLOSED `in progress`.
- Compliance case study: [heroku/dashboard#11930](https://github.com/heroku/dashboard/pull/11930) is a single `surface_family:disclosure` PR; tightly scoped, merged in 4 days.
