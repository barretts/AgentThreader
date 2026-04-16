### Schemas

Machine-readable JSON schemas live in `schemas/`. The `$schema` meta-schema declaration is intentionally omitted -- default Ajv (draft-07) does not resolve draft-2020-12, and none of these schemas use 2020-12-specific features:

| Schema | Contract |
| --- | --- |
| `manifest.v2.json` | Task manifest: tasks with deps, timeouts, verify profiles |
| `verify_profile.v2.json` | Operator-defined verification profiles with steps and rollback flag |
| `task_result.v2.json` | Worker output: task_id, status, summary, optional writes and evidence |
| `heal_decision.v2.json` | Healer output: decision, patches, learned_rule |
| `state.v2.json` | Persistent run state: run_status, policy, per-task state, healing_rounds |

These schemas are the machine-readable authority. The orchestrator validates all contracts against them before state mutation.