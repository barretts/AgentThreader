### Run Identity Markers

When this workflow produces artifacts that outlive a single run -- pull requests, review comments, repo files, generated documents, prompt records, or verification reports -- embed a stable three-tier identity pattern in the artifact body so consumers can answer "which run produced this?" with a deterministic search.

Use:

- `run_id`: logical batch identity from the manifest.
- `task_id`: task identity from the manifest.
- `attempt`: monotonically increasing attempt number for that task.

Prefer compact identity lines near the top or bottom of generated artifacts:

```text
Run: <run_id>
Task: <task_id>
Attempt: <attempt>
```

Do not use conversational memory as the only identity source. The manifest, state file, and durable artifacts must be enough to reconcile a run after interruption.
