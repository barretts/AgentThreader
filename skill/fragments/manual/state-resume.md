### State and Resume

State is the durable ledger for a manual run. It records manifest digest, task status, attempts, failure signatures, verification evidence, healing rounds, and the paths of prompt records and response logs.

Resume must be conservative:

- Re-read the manifest and state before starting new work.
- Recompute dependency readiness from persisted state, not from chat history.
- Treat missing prompt records, missing response logs, or missing verification evidence as resumability failures for the affected task.
- Fail loudly if the manifest mode, task set, dependencies, or verification profile changed in a way that cannot be reconciled.
- Never mark a task done from prose alone; require a valid contract and verification evidence.

`manifest_digest` should continue to reconcile content drift within the same run mode. If a manifest change invalidates prior assumptions, start a new run or perform an explicit reconciliation step before more worker turns.
