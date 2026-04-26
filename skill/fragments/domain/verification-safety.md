### Verification and Safety Model

### Verification Ownership

Verification always belongs to the orchestrator. It runs after successful parse and before final task success. The worker may report evidence, but does not own pass/fail classification.

### Verification Layers

| Layer | Timing | Purpose |
| --- | --- | --- |
| Post-parse validation | After parsing worker output | Contract integrity, candidate writes, path safety |
| Post-write build/test | After writes are applied | Build, test, lint, or type failures caused by the change |
| Final smoke/browser | After build and test pass | Runtime behavior, UI behavior, custom project checks |

### Allowed Write Path

1. Worker emits `writes[]` in `task_result.v2`.
2. Orchestrator validates those writes.
3. Orchestrator applies those writes.
4. Orchestrator verifies the result.

### Required Write Safeguards

- Path normalization (writes cannot escape workspace root).
- Protected-file denylist.
- Shrinkage detection: reject replacement when original > 100 bytes and replacement < 50% of original size (unless explicitly allowed).
- Optional `sha256_before` precondition validation.
- Backup before write.
- Rollback on verification failure.

### Red/Green Test Suite Classification

When a verification gate runs tests that contain both "red" suites (demonstrating a vulnerability or bug exists) and "green" suites (proving the fix works), the verifier MUST distinguish between them:

- Suite name containing `"without patch"` = red test: failures are acceptable
- Suite name containing `"with patch"` = green test: failures are mandatory pass

If exit code is non-zero but all failures are in red suites and at least one green test passed, verification SHOULD pass. If any green test fails, verification MUST fail with specific test names reported.

Worker prompts SHOULD enforce a naming convention:

```javascript
describe('TASK-ID - without patch (vulnerability exists)', () => { ... });
describe('TASK-ID - with patch (vulnerability fixed)', () => { ... });
```

This pattern is especially important for security exploit testing, where red tests are best-effort vulnerability demos that may be fragile, version-dependent, or environment-specific. Only the green tests (proof of fix) should gate verification.

### Self-Contained Output Directories

When the worker produces output in a patch or task directory, that directory MUST be independently runnable. Each output directory SHOULD include a `package.json` declaring its dependencies so that the verifier can install them before running tests.

The verification gate SHOULD auto-detect a `package.json` in the output directory and run `npm install --no-audit --no-fund` before executing tests. If `node_modules` already exists, the install step SHOULD be skipped.

### Worker Output Post-Processing

When the worker emits content that consumers parse for stable identifiers (PR markers, sigs, file headers, comment metadata), the orchestrator MUST own the canonical form of those identifiers. Treat worker output as advisory; rewrite to canonical form post-verify.

**Why:** workers drift. The same prompt applied across many runs produces visibly different formattings of "the same" identifier block. Stable parsing downstream requires deterministic canonical form. Empirical example: a single rebody prompt applied to 7 PRs produced 7 different signature-footer shapes (some `<sub>`-wrapped, some plain prose, some missing the hash entirely, some with model-invented hash values).

**Pattern:**

1. Worker emits the artifact (PR body, comment, file content) including its best-effort version of the canonical block (or omitting it entirely).
2. Orchestrator's verify gate accepts the artifact's content correctness.
3. AFTER verify, the orchestrator applies a post-processor that:
   - Strips any improvised version of the canonical block (regex-driven cleanup).
   - Re-injects the canonical version computed in-process from run identity / project constants.
   - Is idempotent: running multiple times on the same input produces the same output.
4. Orchestrator commits the post-processed artifact (e.g. `gh pr edit --body-file`).

**Required:** post-processors must be idempotent and must not change content semantics. They are formatting-only.

**Forbidden:** the worker MUST NOT be the source of truth for cross-run identifiers. Workers may provide a placeholder or omit the block entirely; the orchestrator fills it in. See "Run Identity Markers" for the canonical three-tier identity pattern (visible header + HTML-comment marker + paired-hash sig footer).

`templates/orchestrator.ts` ships a `postProcessArtifact(ref, identity, processor)` helper for the strip-then-canonicalize pattern.

### Healer Patch Safety

Healer patches follow the same validation model. The healer is forbidden from editing product source files directly, disabling verification, bypassing protected-file rules, or changing healing schedule mid-run.