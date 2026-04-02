### Workflow

1. Define the unit of work (component, story, work package, ticket, file).
2. Create the manifest (`manifest.v2` JSON).
3. Write shared context and per-task prompts.
4. Define the completion contract in the prompt (instruct the worker to emit `<<<TASK_RESULT_V2>>>`).
5. Choose the CLI adapter (`agent`, `opencode`, `claude`).
6. Build the orchestrator (use `templates/` as starting point).
7. Run sequential first, add concurrency after contracts and parsing are stable.
8. Add verification gates (build, test, lint, smoke).
9. Add healing only after the base loop works (`--heal auto`).
10. Resume with `--resume` after interruptions.