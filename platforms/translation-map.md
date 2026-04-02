# Translation Map (Codex, Cursor, Claude, Windsurf)

Use this map to port one v2 orchestrator spec to different platform surfaces without changing architecture.

## Invariant Layer (Never Change)

- `schemas/*.json`
- parser sentinel logic
- failure classes and signature generation
- PBH defaults and convergence stop rules
- state transitions and resume semantics

## Variable Layer (Platform Wrapper Only)

- invocation command and flags
- where prompt text is injected (`stdin`, argv, PTY)
- trust or permission prompt handling
- wrapper UX wording and setup notes

## Contract Sentinel Map

- Worker result start: `<<<TASK_RESULT_V2>>>`
- Worker result end: `<<<END_TASK_RESULT_V2>>>`
- Healer result start: `<<<HEAL_DECISION_V2>>>`
- Healer result end: `<<<END_HEAL_DECISION_V2>>>`

Do not rename sentinels per platform.

## Adapter Mapping

| Concern | Codex | Cursor | Claude | Windsurf |
|---|---|---|---|---|
| One-shot mode | CLI adapter | `agent --print` style adapter | `claude --print` adapter | wrapper-driven adapter |
| Interactive mode | PTY adapter | PTY adapter when needed | expect or PTY adapter | PTY adapter |
| Prompt transport | stdin/argv | stdin/argv | argv or PTY send | stdin/argv |
| Approval handling | adapter-local | adapter-local | adapter-local | adapter-local |

## Porting Checklist

1. Keep all schema files byte-identical.
2. Keep parser implementation byte-identical or behavior-identical.
3. Swap only adapter command builder and completion heuristics.
4. Keep the same run summary fields and escalation criteria.
5. Run adapter parity tests against the same fixture logs.
