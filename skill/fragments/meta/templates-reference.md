### Templates

Reference implementation skeletons live in `templates/`:

| File | Contents |
| --- | --- |
| `types.ts` | TypeScript type definitions for all v2 contracts: `ManifestV2`, `TaskResultV2`, `HealDecisionV2`, `StateV2`, `CliAdapter` interface, failure classes, PBH fibonacci sequence, default policy |
| `parser.ts` | Shared parser and validator: sentinel extraction (last block wins), JSON repair (strip markdown fences, trailing commas, JS comments), task result and heal decision validation, failure signature generation |
| `orchestrator.ts` | Shared runtime utilities: `writeAtomicJson` (temp file + rename) and `stableFailureSignature` (normalizes failure fingerprints) |

These templates are starting points for downstream runner implementations. Copy them into your project and extend as needed.