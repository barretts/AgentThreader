# `task_type` Discriminator: fix | codemod | inventory

**Threat Level**: MEDIUM
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 6
**Confidence**: high
**Target Section**: Contracts / `manifest.v2` (new `task_type` field) + Verification and Safety
**Impact**: Expressing a 339-file mechanical sweep as 339 manifest tasks explodes the pool and produces no per-site review value. Expressing it as one task with a huge writes[] loses build-gate granularity. Without a discriminator, the orchestrator can't tell which shape applies.

**Context:** The dashboard has six `codemod-sweep` PRs in the a11y corpus. The successful ones (e.g. [heroku/dashboard#9316](https://github.com/heroku/dashboard/pull/9316) "always call a11yAudit after ember test helpers", 339 files) follow a specific shape: a single codemod is reviewed in one PR, then applied to N files in a second PR. The failed one ([#9495](https://github.com/heroku/dashboard/pull/9495) "Add lint rule for DevCenter links + autofix", 86 files, CLOSED) combined tool + apply and was abandoned. Today's `manifest.v2` has no concept of "this task is a single bulk-apply, not N independent edits", so naive runners either explode the manifest or produce unreviewable mega-PRs.

## Observation

[#9316](https://github.com/heroku/dashboard/pull/9316)'s body is the canonical statement:

> "I broke this PR out so that reviewing the `a11yAudit` function we are writing can be reviewed as its own pull request, rather than get lost in the noise of all the changes here."

That is: codemod work has two distinct phases the orchestrator must respect:

1. **Tool authoring**: write the codemod / lint rule / AST transform. Small PR, careful review.
2. **Bulk apply**: run the tool over N files, produce one giant mechanical diff. Trivial review per-site.

If agent-threader expresses a codemod as N independent tasks, the manifest contains 339 entries that all need identical prompts, identical verification, and identical writes-shape. The worker is bored, the parser is doing 339 round trips, and the orchestrator is fighting noise.

If it expresses the codemod as one task with a huge `writes[]` payload, the parser succeeds but loses any per-site failure granularity (one bad site fails the whole task).

The right shape is a third option agent-threader doesn't currently have: a `task_type: codemod` with bulk semantics.

## Suggested Fix

### New `manifest.v2` task field: `task_type`

Add an optional discriminator with three values:

| Value | Semantics |
|---|---|
| `"fix"` (default) | Standard per-task work; one task -> one set of writes -> one verify gate |
| `"codemod"` | Bulk apply; one task -> N sites in one bulk writes[] -> single build-gate verify |
| `"inventory"` | Read-only; the task emits a list (e.g. consumers of a shared component) that downstream tasks consume via metadata |

```jsonc
{
  "id": "codemod-always-call-a11yAudit",
  "task_type": "codemod",
  "prompt_ref": "prompts/codemod-a11y-audit-cascade.md",
  "verify_profile": "build+test",
  "metadata": {
    "codemod_source": "scripts/codemods/add-a11y-audit.js",
    "scope_glob": "tests/**/*.js",
    "expected_site_count_min": 200
  }
}
```

### Worker contract for `task_type: codemod`

The worker MUST NOT make subjective edits. It runs a deterministic transform (AST/regex/jscodeshift), emits the bulk diff as `writes[]`, and reports the site count in `evidence`. If `evidence.sites_modified < metadata.expected_site_count_min`, the worker emits `FAILED:weak_contract` because the codemod under-matched.

Worker prompt template:

> You are applying the deterministic codemod at `{{codemod_source}}` to the file set matched by `{{scope_glob}}`. Do not make subjective edits. Emit each modified file as a `writes[]` entry with `op: "replace"` and the full new content. After running the codemod, report the number of sites touched in `evidence.sites_modified`. If fewer than `{{expected_site_count_min}}` sites match, the codemod is wrong; emit `FAILED:weak_contract` with the matched-site count and stop.

### Verify profile for codemod tasks

Codemod tasks need a different verify profile from fix tasks: build + targeted test, not per-site checks.

```jsonc
{
  "verify_profile_templates": {
    "codemod-build-and-test": {
      "steps": [
        { "cmd": "pnpm build", "log": ".logs/codemod-build.log" },
        { "cmd": "pnpm test --filter affected", "log": ".logs/codemod-test.log" }
      ],
      "rollback_on_failure": true
    }
  }
}
```

### Anti-pattern: combining tool + apply in one task

PR [#9495](https://github.com/heroku/dashboard/pull/9495) authored the lint rule + ran the autofix in one PR. 86 files, +459/-310, abandoned after sitting `in progress` for months. Mirror the a11y-kit's [`pr-scoping-policy`](/Users/ephem/lcode/a11y-remediation-kit/skill/fragments/meta/pr-scoping-policy.md) at the orchestrator layer:

> A `codemod` task whose worker also authors the transform is a contract violation. Split into:
> - `task_type: "fix"` for the codemod source itself (small PR)
> - `task_type: "codemod"` with `depends_on: ["<authoring-task>"]` for the bulk apply (big PR)

The orchestrator MAY refuse to ship a single PR that contains both a new codemod script under `scripts/codemods/` AND a mechanical bulk diff. Configure via `policy.refuse_combined_codemod_apply: true` (default true).

### SKILL.md additions

Under "Architecture", add a "Task Type Discriminator" subsection:

> #### Task Type Discriminator
>
> `manifest.v2` tasks carry an optional `task_type` field:
>
> - `fix` (default): one task -> one set of writes -> verify per-task. Heals via prompt-patch.
> - `codemod`: deterministic bulk apply. Worker runs a referenced transform, emits N sites in one writes[], verify is build+test (not per-site).
> - `inventory`: read-only enumeration. Emits a list in evidence; downstream tasks gate on the list via `depends_on`.
>
> Choose `codemod` when sites share an identical mechanical transform AND per-site review adds no value. Choose `fix` (with `batch_pack_size` from the icon-sweep lesson) when sites share a transform but each merits a glance.

### Schema delta

`schemas/manifest.v2.json`:

```jsonc
{
  "properties": {
    "task_type": {
      "type": "string",
      "enum": ["fix", "codemod", "inventory"],
      "default": "fix"
    }
  }
}
```

## Evidence pointer

- Canonical codemod-done-right: [heroku/dashboard#9316](https://github.com/heroku/dashboard/pull/9316) -- 339 files, follow-up to a separate tool PR.
- Cleanup successor: [heroku/dashboard#11945](https://github.com/heroku/dashboard/pull/11945) -- 12 files of stale `a11yAudit` imports the bulk-apply missed; shows that a codemod task should be followed by a watch-window task for stragglers.
- Counter-example: [heroku/dashboard#9495](https://github.com/heroku/dashboard/pull/9495) -- combined authoring + apply, 86 files, abandoned.
- 2018 fallback for "do it manually": [heroku/dashboard#9282](https://github.com/heroku/dashboard/pull/9282) "Experiment stanley a11y audit results", 365 files, CLOSED -- the same author later did it right in #9316.
- a11y-kit codemod skill: [/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-codemod/a11y-kit-codemod.md](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-codemod/a11y-kit-codemod.md).
