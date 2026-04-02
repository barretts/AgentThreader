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

### Healer Patch Safety

Healer patches follow the same validation model. The healer is forbidden from editing product source files directly, disabling verification, bypassing protected-file rules, or changing healing schedule mid-run.