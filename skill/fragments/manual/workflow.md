### Workflow

1. Define the unit of work: component, story, work package, ticket, file, or review item.
2. Create the `manifest.v2` JSON with task ids, dependencies, timeouts, verification profiles, and retry policy.
3. Write shared context and per-task prompt records.
4. Define the completion contract in each prompt record and require the worker to emit `<<<TASK_RESULT_V2>>>`.
5. Initialize the state file from the manifest.
6. Run one worker turn at a time until contract parsing, write validation, checkpointing, and verification are stable.
7. Add concurrency only after sequential execution is stable, and gate shared resources with `resource_lock`.
8. Add verification gates for build, test, lint, smoke, browser, or project-specific checks.
9. Add healing only after the base loop works; use PBH policy and bounded healer turns.
10. Resume by reading the persisted state, prompt records, response logs, and verification evidence.
