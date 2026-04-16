# Red-Test False Failure Kills Verification

**Threat Level**: HIGH
**Discovered**: First full production run, batch 1 (GHSA-rf6f-7fwh-wjgh / flatted prototype pollution)
**Impact**: Correct work product rejected, wasted healing round, batch size shrunk

## Problem

The orchestrator's verification gate ran `node --test exploit.test.mjs` and treated exit code != 0 as a complete failure. But the test file has two suites:

- **Red suite** ("without patch") -- demonstrates the vulnerability exists
- **Green suite** ("with patch") -- proves the patch works

In the GHSA-rf6f-7fwh-wjgh case, Claude's red test assumed `Flatted.parse('[{"x":"__proto__"}]')` would set `parsed.x` to `Array.prototype`, but `parsed.x` was actually `undefined`. The red test threw a `TypeError`, causing `node --test` to exit 1.

The green tests (3/3) all passed -- the patch was correct. But the verifier saw exit 1 and marked the entire task as FAILED.

## Cascade

1. Task marked `FAILED` with `smoke_error` signature despite correct patch
2. 100% batch failure rate triggered PBH healing
3. Healer invoked Claude CLI (~2 min, API cost) but failed to emit `<<<HEAL_DECISION_V2>>>` sentinel
4. Healing didn't converge; task stayed `FAILED`
5. Batch size shrunk from 1 to 1 (already at minimum)
6. Orchestrator moved on, leaving a correct patch unrewarded

## Root Cause

The verification gate treated `node --test` as atomic pass/fail. It had no concept of "the red test is a best-effort vulnerability demo; only the green tests must pass."

This is inherent to vulnerability testing -- red tests are exploitation attempts. Crafting a perfect exploit that works on every environment, every Node version, and every edge of the vulnerable version range is unreliable. The patch proof (green tests) is what actually matters.

## Resolution

Three changes:

### 1. Smarter verification (`src/verify.ts`)

`verifyTestPasses()` now runs `node --test --test-reporter spec` and parses the structured output. It uses the spec reporter's `✔` / `✖` markers to classify results by suite:

- Suite name containing `"without patch"` = red test: failures acceptable
- Suite name containing `"with patch"` = green test: failures mandatory

If exit code is non-zero but all failures are in red suites and at least one green test passed, verification passes with detail like:

```
Patch verified (438ms): green: 3 pass, red: 1 fail (acceptable)
```

If any green test fails, verification still fails with specific test names reported.

### 2. Naming convention in worker prompt (`prompts/shared-context.md`)

Added a mandatory section enforcing that workers use exact naming:

```javascript
describe('GHSA-xxxx - without patch (vulnerability exists)', () => { ... });
describe('GHSA-xxxx - with patch (vulnerability fixed)', () => { ... });
```

### 3. Healer awareness (`prompts/healer.md`)

Added documentation of this pattern to the failure taxonomy so the healer can recognize it if a variant slips through.

## Validation

Ran the updated verifier against both patches:

| Patch | Before Fix | After Fix |
|-------|-----------|-----------|
| GHSA-952p-6rrq-rcjv (micromatch, all tests pass) | PASS | PASS ("All tests passed") |
| GHSA-rf6f-7fwh-wjgh (flatted, red test fails) | FAIL (smoke_error) | PASS ("green: 3 pass, red: 1 fail (acceptable)") |

## Lesson

In any TDD red/green pipeline, the red test is a diagnostic -- it demonstrates the problem but is not a correctness gate. Only the green test (proof of fix) should gate verification. This is especially true for security exploits, where the exact exploitation vector may be fragile, version-dependent, or environment-specific.
