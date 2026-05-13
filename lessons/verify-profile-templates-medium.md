# Parametric `verify_profile_templates`

**Threat Level**: MEDIUM
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 199
**Confidence**: high
**Target Section**: Verification and Safety / Verification Profile Templates (new subsection) + Schema
**Impact**: Every a11y manifest in the dashboard corpus would re-derive the same verify_profile (build + integration tests including 5,481 `a11yAudit()` calls + targeted aXe rule check). Ship a parametric template named `axe-rule-ratchet` (plus `build-and-test` for codemod tasks and `inventory:emit-list` for inventory tasks) so a11y manifests don't re-author it.

**Context:** Every a11y PR in the dashboard corpus is verified identically: run the integration test suite (which contains 5,481 `a11yAudit()` calls after [#9316](https://github.com/heroku/dashboard/pull/9316)) + targeted aXe rule check + optional screenreader spot-check. agent-threader's `verify_profile` is currently a per-manifest definition. For a11y work this means the same profile gets copy-pasted into every new manifest. Ship a parametric template.

## Observation

Profile shapes observed across the corpus:

| Archetype | Verify profile shape | Customizations |
|---|---|---|
| `rule-ratchet-single` | build + integration tests filtered to a11y + targeted rule | `rule_id: <name>` |
| `icon-sweep-batch` | build + integration tests | `surface_filter: "icons"` |
| `component-single-fix` | build + targeted test path + axe browser-extension spot-check | `page_family: <name>` + `rule_id?` |
| `surface-cascade` | build + integration tests + keyboard nav smoke + screenreader spot-check | `component_name: <name>` |
| `codemod-sweep` | build + integration tests + diff-shape assertion | `expected_site_count_min: N` |
| `kit-foundation` | build + integration tests + verify global hooks fire | none |

Every shape has the same skeleton:

1. Build (`pnpm build`)
2. Integration tests (`pnpm test:integration --filter <surface>`)
3. Optional smoke (manual screenreader / aXe browser extension)

The variant points are: which rule, which surface, which page family. Make those parameters of one template.

## Suggested Fix

### Verify profile template definition

Add a verify-profile template namespace to the manifest:

```jsonc
{
  "verify_profile_templates": {
    "axe-rule-ratchet": {
      "params": {
        "rule_id": { "type": "string", "required": true },
        "surface_filter": { "type": "string", "required": false, "default": "" },
        "page_family": { "type": "string", "required": false, "default": "" }
      },
      "steps": [
        {
          "id": "build",
          "cmd": "pnpm build",
          "log": ".logs/verify-build-${rule_id}.log",
          "expect_exit_code": 0
        },
        {
          "id": "test-integration",
          "cmd": "pnpm test:integration --filter ${surface_filter:-a11y}",
          "log": ".logs/verify-test-${rule_id}.log",
          "expect_exit_code": 0,
          "expect_no_match": ["axe-rule-failed: ${rule_id}"]
        },
        {
          "id": "smoke-axe-browser",
          "cmd": "pnpm smoke:axe -- --rule ${rule_id} --page ${page_family}",
          "log": ".logs/verify-smoke-${rule_id}.log",
          "optional": true,
          "expect_exit_code": 0
        }
      ],
      "rollback_on_failure": true
    }
  }
}
```

Tasks reference the template:

```jsonc
{
  "id": "ratchet-rule-autocomplete-valid",
  "verify_profile": {
    "template": "axe-rule-ratchet",
    "params": {
      "rule_id": "autocomplete-valid",
      "surface_filter": "form"
    }
  }
}
```

### Three out-of-the-box templates under `templates/verify-profiles/`

1. **`axe-rule-ratchet`** -- build + filtered integration test + optional aXe smoke (above).
2. **`build-and-test`** -- generic build + test, for codemod tasks.
3. **`inventory:emit-list`** -- assert `evidence.outputs` is a non-empty list. For `task_type: inventory`.

The orchestrator expands `${param}` references in the template steps with task-supplied params before invoking; missing required params -> `FAILED:weak_contract` at manifest validation, before any worker runs. The existing red/green test suite classification (Verification and Safety Model) applies automatically to the `test-integration` step.

### SKILL.md additions

Under "Verification and Safety", add a "Verification Profile Templates" subsection:

> #### Verification Profile Templates
>
> A manifest may define a `verify_profile_templates` block of parametric verification recipes. Tasks reference templates by name and pass param values. The orchestrator expands the template before invoking the verify gate.
>
> Out-of-the-box templates shipped with agent-threader:
>
> - **`axe-rule-ratchet`**: build + integration tests + optional aXe browser-extension smoke. Params: `rule_id` (required), `surface_filter`, `page_family`.
> - **`build-and-test`**: build + test, for codemod tasks. No domain assertions.
> - **`inventory:emit-list`**: asserts `evidence.outputs` is a non-empty list. For `task_type: inventory`.
>
> Custom templates live in the manifest under `verify_profile_templates`. They follow the same shape: `params`, `steps`, `rollback_on_failure`. Step `cmd` strings support `${param}` interpolation with `${param:-default}` fallback syntax.
>
> Designing a verify-profile template is a one-time domain-shaping investment. The dashboard a11y corpus has 199 PRs that all use the same three shapes -- one template covers 92% of them.

### Manifest schema delta

`schemas/manifest.v2.json`:

```jsonc
{
  "properties": {
    "verify_profile_templates": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "params": { "type": "object" },
          "steps": { "type": "array", "items": { "$ref": "#/$defs/verifyStep" } },
          "rollback_on_failure": { "type": "boolean", "default": true }
        }
      }
    }
  }
}
```

Task `verify_profile` becomes a union: `string` (named reference) | `{ template: string, params: object }` | `{ steps: VerifyStep[] }` (inline).

## Evidence pointer

- 5,481 `a11yAudit()` calls land via [heroku/dashboard#9316](https://github.com/heroku/dashboard/pull/9316) -- referenced in [/Users/ephem/lcode/a11y-docs/CLAUDE.md](/Users/ephem/lcode/a11y-docs/CLAUDE.md) as the canonical count.
- Rule-by-rule ratchet PRs: [#9626](https://github.com/heroku/dashboard/pull/9626)..[#9692](https://github.com/heroku/dashboard/pull/9692) (~30 PRs), all identical shape.
- a11y-kit's verify-profile-equivalent: [`a11y-kit-proof`](/Users/ephem/lcode/a11y-remediation-kit/skill/skills/a11y-kit-proof/a11y-kit-proof.md) skill emits proof evidence; the domain-specialized version of this template.
- Out-of-the-box templates would live under `templates/verify-profiles/` in the agent-threader source tree (mirrors `templates/types.ts`, `templates/parser.ts`, `templates/orchestrator.ts`).
