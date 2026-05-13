# Surface Cascade Pipeline: Inventory -> Design -> Migrate

**Threat Level**: MEDIUM
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 7
**Confidence**: medium
**Target Section**: Workflow / New Feature Epic (revised) + Contracts / `task_type: inventory`
**Impact**: Shared-component edits (creating a toggletip, rebuilding a sub-nav) without an inventory step either churn through review or get abandoned. Dashboard PRs that linked a consumer-enumeration doc merged cleanly; PRs that wrote `step 1` without enumeration died.

**Context:** The corpus has 7 `surface-cascade` PRs (shared-component creates or rewrites). The successful ones ([heroku/dashboard#9729](https://github.com/heroku/dashboard/pull/9729) toggletip, [#7545](https://github.com/heroku/dashboard/pull/7545) drop-downs/pop-overs) are all preceded by either a linked design document or an in-PR enumeration of downstream consumers. Where the enumeration is missing (e.g. [#9642](https://github.com/heroku/dashboard/pull/9642) "Make the sub-nav component accessible") the PR churns longer in review. agent-threader's current Workflow / New Feature Epic pipeline jumps straight from Visionary -> Ux -> Architect -> Engineer, with no inventory step. The a11y-remediation-kit has an explicit [`a11y-kit-inventory`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md) skill that gates surface work; this lesson lifts that pattern up to the generic agent-threader layer.

## Observation

[heroku/dashboard#9729](https://github.com/heroku/dashboard/pull/9729) "Create an accessible toggletip component" body:

> "Please see [this Quip doc](https://salesforce.quip.com/2P0sAqg3weLa) explaining the what, why, and how of this PR."

The Quip doc enumerates: what tooltip pattern this replaces, which pages use it, what the WAI-ARIA spec says. The PR delivers `info-toggletip.js`, `info-toggletip.scss`, `info-toggletip.hbs`, and `toggletip/boundary.js`. Two reviewers shipped it within a few days.

[heroku/dashboard#11844](https://github.com/heroku/dashboard/pull/11844) "[AppLink] Fix accessibility issues and modernize and colocate components" body cites GUS finding but doesn't enumerate consumers; the PR ended up modifying 10 files with no consumer-list audit. It merged but the [`[AppLink] Improve File Upload Accessibility and UX`](https://github.com/heroku/dashboard/pull/11840) sibling indicates the work was split over multiple PRs because the surface wasn't fully mapped first.

[heroku/dashboard#9616](https://github.com/heroku/dashboard/pull/9616) "Add correct aria roles to SubNav component" body opens with:

> "Tabs require specific ARIA roles in order to work properly. We had a few issues on the VPAT related to this, and this PR is step 1 in making the SubNav component accessible."

The author wrote "step 1" - signaling that more was needed - but the PR was CLOSED with `in progress` label, never merged. The follow-up scope wasn't enumerated; the surface lacked inventory.

The pattern: **surface-cascade PRs that skip the inventory step either churn or die**.

## Suggested Fix

### Use the new `task_type: inventory` discriminator

(see the [task-type-discriminator lesson](./task-type-discriminator-medium.md) for the discriminator definition)

```jsonc
{
  "id": "inventory-toggletip-consumers",
  "task_type": "inventory",
  "prompt_ref": "prompts/inventory-component-consumers.md",
  "verify_profile": "inventory:emit-list",
  "timeout_sec": 600,
  "metadata": {
    "target_component": "<TextWithTooltip>",
    "search_globs": ["app/templates/**/*.hbs", "app/components/**/*.hbs"]
  }
},
{
  "id": "create-info-toggletip-component",
  "depends_on": ["inventory-toggletip-consumers"],
  "verify_profile": "axe-rule-ratchet:full+keyboard",
  "timeout_sec": 2400
},
{
  "id": "migrate-toggletip-consumer-1",
  "depends_on": ["create-info-toggletip-component"],
  "resource_lock": "shared-include:app/components/info-toggletip.hbs",
  "metadata": {
    "consumer_path": "{{inventory.outputs.consumers[0]}}"
  }
}
```

The inventory task emits a list to `task_result.v2.evidence.outputs`:

```jsonc
{
  "task_id": "inventory-toggletip-consumers",
  "status": "DONE",
  "summary": "Found 14 consumers of <TextWithTooltip>",
  "evidence": {
    "outputs": {
      "consumers": [
        "app/templates/components/team-resource-card.hbs",
        "app/templates/components/app-deploy/build-status.hbs",
        ...
      ],
      "consumer_count": 14
    }
  }
}
```

Downstream migration tasks can reference these outputs through `metadata.consumer_path` interpolation (a new manifest feature) or by `depends_on` + worker prompt prefix injection.

### New Workflow pipeline: Surface Cascade

Add to SKILL.md's "Workflow" section, after "Bug Triage & Resolution":

> #### Surface Cascade
>
> Use when a single shared component (modal, tooltip, sub-nav, drop-down, form input) is being created, replaced, or accessibility-hardened.
>
> 1. **Inventory** (`task_type: inventory`): enumerate every consumer of the affected component (or every site that needs the new component). Output is a list in `task_result.v2.evidence.outputs.consumers`.
> 2. **Design / Author** (`task_type: fix`): create or modify the shared component itself in its own PR. Depends on Inventory.
> 3. **Migrate Consumer N** (`task_type: fix`): one task per inventoried consumer, all sharing `resource_lock: shared-include:<component-path>` so they serialize on the shared component file. Depends on Design/Author.
> 4. **Verify Cascade** (verify profile): run the full a11y test suite + smoke per consumer page family.
>
> The Inventory step is non-negotiable. PRs that skip it churn or get abandoned. Empirical: PRs from the heroku/dashboard corpus that linked a consumer-enumeration doc or did the enumeration in-PR all merged; PRs that wrote "step 1" without the enumeration sat in CLOSED state.

### Verify profile template

```jsonc
{
  "verify_profile_templates": {
    "inventory:emit-list": {
      "required_fields": [
        "evidence.outputs.consumers",
        "evidence.outputs.consumer_count"
      ],
      "min_consumer_count": 1,
      "rollback_on_failure": false
    }
  }
}
```

If the worker emits zero consumers, the inventory task fails with `weak_contract` - the search globs are wrong or the component doesn't exist.

## Evidence pointer

- Successful with inventory: [heroku/dashboard#9729](https://github.com/heroku/dashboard/pull/9729) (linked Quip doc), [#7545](https://github.com/heroku/dashboard/pull/7545) (in-PR enumeration of pop-over usages).
- Successful but split unnecessarily: [heroku/dashboard#11844](https://github.com/heroku/dashboard/pull/11844) + [#11840](https://github.com/heroku/dashboard/pull/11840) (AppLink scope split because surface wasn't fully mapped first).
- Failed without inventory: [heroku/dashboard#9616](https://github.com/heroku/dashboard/pull/9616) "step 1 in making the SubNav component accessible" - CLOSED.
- a11y-kit reference skill: [/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-inventory/a11y-kit-inventory.md) - the domain-specialized version of this pattern.
- a11y-kit orchestrator routing rule: "Surface distribution or likely shared owner: use `a11y-kit-inventory`" -- the kit already enforces this.
