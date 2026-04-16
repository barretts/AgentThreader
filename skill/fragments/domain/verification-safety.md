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

### Healer Patch Safety

Healer patches follow the same validation model. The healer is forbidden from editing product source files directly, disabling verification, bypassing protected-file rules, or changing healing schedule mid-run.