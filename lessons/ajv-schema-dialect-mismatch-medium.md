# Ajv Schema Dialect Mismatch (2020-12 vs draft-07)

**Threat Level**: MEDIUM
**Discovered**: Run 2 (attempt 1)
**Impact**: Orchestrator crashes during result parsing -- task appears failed even when Claude produced correct output

## Problem

Run 2 showed Claude exiting successfully (code 0) and producing all 6 output files correctly, but the orchestrator threw:

```
GHSA-952p-6rrq-rcjv: Execution error: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"
```

The sentinel was present in the log, Claude's output was perfect, but the Ajv validation step crashed before it could parse the result.

## Root Cause

The JSON schemas in `schemas/` included:

```json
"$schema": "https://json-schema.org/draft/2020-12/schema"
```

The `ajv` npm package (v8.x) supports draft-07, draft-2019-09, and draft-2020-12 -- but draft-2020-12 requires explicitly importing `ajv/dist/2020` or adding the meta-schema. The default `new Ajv()` constructor only recognizes draft-07. When Ajv encounters the `$schema` field pointing to 2020-12, it tries to resolve it as a referenced schema and fails.

## Resolution

Removed the `$schema` field from all five JSON schema files. Ajv validates the schemas perfectly without the meta-schema declaration -- the `$schema` field is metadata for editors and tooling, not required for runtime validation.

## Prevention

When using Ajv with JSON Schema, either:
1. Omit `$schema` entirely (simplest)
2. Use `import Ajv2020 from "ajv/dist/2020"` if you need 2020-12 features like `prefixItems`
3. Pin to draft-07 with `"$schema": "http://json-schema.org/draft-07/schema#"`

None of our schemas use 2020-12-specific features, so option 1 was correct.

## Collateral Damage

The successful Claude run from attempt 2 was wasted -- all output files were written but the orchestrator couldn't record the success. The task was marked FAILED and had to be re-run from scratch, costing another ~4 minutes of Claude API time.
