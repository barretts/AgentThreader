# Mechanical Task Manifests Need a `batch_pack_size` Policy

**Threat Level**: MEDIUM
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 54
**Confidence**: high
**Target Section**: Architecture / Concurrency Patterns (new subsection: "Batch Packing")
**Impact**: Naive per-site task expansion produces hundreds of PRs (PR explosion); naive collapse produces unreviewable mega-PRs that get abandoned (see #9495). Humans naturally pack 8-12 mechanical edits per PR; agent-threader currently has no first-class way to express that.

**Context:** Reading 199 a11y-relevant PRs against `heroku/dashboard` surfaced one archetype (54 PRs, 51 merged) where the unit of work is a near-identical mechanical edit applied to N component files. The dashboard team consistently packed 7-12 sites per PR to keep them reviewable. A naive agent-threader run would produce one PR per site (hundreds of PRs), which is the wrong shape.

## Observation

Empirical batch sizes from the corpus:

| PR sequence | Files per PR | Sites per PR |
|---|---:|---:|
| `Malibu Accessible Icons Update 1..19` ([#9372](https://github.com/heroku/dashboard/pull/9372)..[#9402](https://github.com/heroku/dashboard/pull/9402)) | 4-10 | 4-10 |
| `Add @title or aria-hidden to a selection of icons (batch 1..14)` ([#9535](https://github.com/heroku/dashboard/pull/9535)..[#9556](https://github.com/heroku/dashboard/pull/9556)) | 8-12 | 8-12 |
| `Upgrade <MalibuIcon> (batch N)` | 3-7 | 3-7 |

Each PR is exactly one mechanical pattern (add `title=` for informational icons; add `role="presentation"` for decorative). The verify_profile is invariant: aXe browser extension + screenreader spot-check + run the integration suite (5,481 `a11yAudit()` calls).

Today, an agent-threader manifest would express each icon site as a separate task. The orchestrator would either:

a) ship each task as its own PR (explodes the PR count -- 200+ PRs for one rule), or
b) collapse all tasks into one giant PR (unreviewable; the [`pr-scoping-policy`](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md) violation that killed [#9495](https://github.com/heroku/dashboard/pull/9495) "Add lint rule for DevCenter links + autofix").

Neither matches what the humans actually did. When `metadata.pack_key` is set, the orchestrator MUST finalize one PR per pack, NOT one per task. Consequence of mishandling: either PR explosion (200+ PRs for one rule ratchet) or unreviewable mega-PRs that get abandoned (see [#9495](https://github.com/heroku/dashboard/pull/9495) below).

## Suggested Fix

### New `manifest.v2` policy field: `batch_pack_size`

Add an optional policy field at the manifest level (not the task level):

```jsonc
{
  "policy": {
    "concurrency": 4,
    "batch_pack_size": 10,
    "pack_by": "metadata.pack_key"
  },
  "tasks": [
    {
      "id": "icon-attr-app/components/ci/test-node-tab",
      "metadata": { "pack_key": "icons-malibu-update-batch-A" }
    },
    {
      "id": "icon-attr-app/components/ci/new-test-run",
      "metadata": { "pack_key": "icons-malibu-update-batch-A" }
    }
  ]
}
```

Tasks with the same `metadata.pack_key` are completed individually (each emits its own `task_result.v2` with its own `writes[]`) but the orchestrator collects all DONE tasks sharing a `pack_key` and ships them as a single PR once `batch_pack_size` is reached or all tasks for that key are DONE.

### Orchestrator behavior

After every batch checkpoint:

1. Group DONE tasks by `pack_key`.
2. For each group, if `count >= batch_pack_size` OR all tasks for that `pack_key` are now terminal, finalize a single PR with the union of writes.
3. Tasks that FAIL within a pack do not block the pack from shipping; they get re-tried on the next manifest pass and join the next pack with that `pack_key`.

This is **not** the same as `resource_lock`. Resource lock is "serialize execution"; batch pack is "co-publish results". They compose: a pack can also be serialized via `resource_lock` if its members share a workdir.

### SKILL.md additions

Under "Architecture", add a "Batch Packing" subsection:

> #### Batch Packing
>
> When many near-identical mechanical tasks share a verification profile, ship them in PR-sized batches instead of one PR per task. Set `policy.batch_pack_size` (default `null` = one PR per task) and tag each task with `metadata.pack_key`. The orchestrator finalizes a single PR per pack once the pack is full or fully terminal.
>
> Choose `batch_pack_size` by reviewability budget, not by parallelism budget. Empirical sweet spot from the heroku/dashboard a11y corpus: 8-12 sites per pack for icon attribution sweeps. Smaller for high-risk changes; larger for low-risk attribution.

### Schema delta

`schemas/manifest.v2.json` policy object:

```jsonc
{
  "policy": {
    "type": "object",
    "properties": {
      "batch_pack_size": { "type": ["integer", "null"], "minimum": 1 },
      "pack_by": { "type": "string", "default": "metadata.pack_key" }
    }
  }
}
```

## Evidence pointer

- Representative PR: [heroku/dashboard#9385](https://github.com/heroku/dashboard/pull/9385) "Malibu Accessible Icons Update 14" - 7 files, 7 icon sites, +12/-9. Body cites screenreader/aXe verification protocol.
- Counter-example: [heroku/dashboard#9495](https://github.com/heroku/dashboard/pull/9495) "Add lint rule for DevCenter links + autofix" - 86 files, CLOSED unmerged after `in progress` label sat for months. Combined the codemod tool + the apply into one PR.
- Cluster summary: [.logs/a11y-pr-archetypes-summary.md](/Users/ephem/lcode/a11y-docs/.logs/a11y-pr-archetypes-summary.md) - `icon-sweep-batch` is 54 PRs, 51 merged, all HIGH/MEDIUM band.
- a11y-kit's scoping rule: [/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md).
