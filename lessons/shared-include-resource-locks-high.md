# Shared-Include Resource Locks (Generalize Prewarm-Then-Use)

**Threat Level**: HIGH
**Discovered**: heroku/dashboard a11y PR corpus analysis (199 PRs), 2026-05-12
**Evidence Tier**: 2-3 (prior-failure artifact; NOT a live agent-threader baseline run)
**Corpus N**: 57
**Confidence**: high
**Target Section**: Adapter Model / Worker Environment (extend "Pattern: pre-warm-then-use" with "Pattern: shared-include serialization")
**Impact**: Some project files are globally included by many consumers (test helpers, lint config, base stylesheets, dependency manifests). Concurrent tasks editing the same shared include race and produce merge conflicts the worker can't resolve. The dashboard's `tests/helpers/a11y-audit.js` is edited by 57 distinct rule-ratchet and kit-foundation tasks; they serialized only because humans noticed.

**Context:** agent-threader's existing `prewarm-then-use` pattern (Adapter Model / Worker Environment) handles user-level shared state for toolchains (nvm, pyenv, sdkman). The dashboard's a11y corpus reveals another shared-state hazard: globally-included **project files** that many tasks need to edit serially.

The dashboard's [`tests/helpers/a11y-audit.js`](file:///Users/bsonntag/code/dashboard/tests/helpers/a11y-audit.js) is imported by 463+ test files and aggregates the axe rule allowlist for the entire project. Every `rule-ratchet-single` PR (34 in the corpus) edits this one file. They merged sequentially because the humans naturally serialized them. Concurrent agent-threader tasks have no such natural barrier and would race.

## Observation

Shared-include hazards in the corpus:

| Shared include | Used by | Edited by archetypes | Tasks racing on it |
|---|---|---|---|
| `tests/helpers/a11y-audit.js` | 463 test files | rule-ratchet-single (34), rule-ratchet-onhold (14), kit-foundation (9) | 57 |
| `.template-lintrc.js` | all `*.hbs` linting | codemod-sweep ([#9495](https://github.com/heroku/dashboard/pull/9495), [#9676](https://github.com/heroku/dashboard/pull/9676)) | 2 |
| `.eslintrc.json` | all JS files | kit-foundation ([#11932](https://github.com/heroku/dashboard/pull/11932), [#11933](https://github.com/heroku/dashboard/pull/11933)) | 2 |
| `app/styles/app.scss` | global stylesheet | recent-kit-era contrast PRs | 3 |
| `package.json` | every install | dep-bump-a11y (5) | 5 |

Each row is a serialization point. Today, agent-threader's `prewarm-then-use` covers toolchains but not project-internal globals. If two tasks both need to add `: { enabled: true }` to `a11y-audit.js` for different rules, neither is wrong, but applying them concurrently produces a merge conflict that the worker doesn't know how to resolve.

## Suggested Fix

### Generalize the pattern: "Pattern: shared-include serialization"

Add to the Adapter Model / Worker Environment section, after the existing `prewarm-then-use` pattern:

> **Pattern: shared-include serialization.**
>
> Some project files are globally included by many consumers (test helpers, lint config, base stylesheets, dependency manifests). Concurrent tasks that edit the same shared include race and produce merge conflicts the worker can't resolve.
>
> 1. The orchestrator inspects all manifest tasks BEFORE starting the worker pool. It collects the set of `shared_include_paths` declared in each task's metadata.
> 2. For each shared-include path, the orchestrator MUST emit an implicit `resource_lock: "shared-include:<path>"` on every task that declares it. (Existing `resource_lock` semantics: see Concurrency Patterns.)
> 3. Workers MUST declare shared-include touches in their `task_result.v2.writes[]` with the path included; the orchestrator MUST validate that no task writes a shared-include path without holding the corresponding lock. Consequence of violating: concurrent writes to a globally-included file (e.g. `tests/helpers/a11y-audit.js`) produce merge conflicts the worker cannot resolve, stranding successive tasks.
> 4. A failed/blocked task MUST release the lock immediately -- same release-on-terminal semantic as `prewarm-then-use`.
>
> Common shared-include candidates: test helpers, lint configs (`.eslintrc.*`, `.template-lintrc.js`, `.stylelintrc.*`), base stylesheets (`app.scss`, `index.css`), dependency manifests (`package.json`, `Cargo.toml`, `go.mod`).

### Manifest extension

Tasks declare shared-include touches up front:

```jsonc
{
  "id": "ratchet-rule-autocomplete-valid",
  "metadata": {
    "shared_include_paths": ["tests/helpers/a11y-audit.js"],
    "rule": "autocomplete-valid"
  }
}
```

The orchestrator's pre-flight pass computes `Set<shared_include_paths>` across all tasks, emits a `resource_lock` per path for each declarer, and verifies the worker pool concurrency budget can still make forward progress (warn if every task locks the same path -- pool degenerates to serial).

### Worker contract

The worker MUST emit a write entry for any shared-include path it touches. The orchestrator validates:

```typescript
for (const write of task_result.writes) {
  if (sharedIncludes.has(write.path)) {
    assert(
      task.metadata.shared_include_paths.includes(write.path),
      `Worker wrote to shared-include ${write.path} without declaring it in metadata.shared_include_paths`
    );
  }
}
```

Undeclared shared-include touches emit `FAILED:weak_contract`.

### Default shared-include set

The adapter ships a default for common ecosystems:

```typescript
const DEFAULT_SHARED_INCLUDES: Record<string, string[]> = {
  "ember-js": [
    "tests/helpers/a11y-audit.js",
    "tests/test-helper.js",
    ".eslintrc.js", ".eslintrc.json",
    ".template-lintrc.js",
    "app/styles/app.scss"
  ],
  "node": ["package.json", ".eslintrc.*", "tsconfig.json"],
  "rust": ["Cargo.toml", ".cargo/config.toml"],
  "python": ["pyproject.toml", "setup.cfg", "requirements.txt"],
  "go": ["go.mod", "go.sum"]
};
```

Projects can override via `policy.shared_includes: ["custom/path.ts"]`.

### Empirical batch-sequence: implicit lock acquisition order

The dashboard's 34 rule-ratchet PRs landed roughly in chronological order, one per push. The implicit lock order is FIFO on task submission. The orchestrator's existing `withResourceLock` primitive already provides FIFO; the addition here is just declaring the lock automatically based on `shared_include_paths`.

## Evidence pointer

- Canonical shared-include: [tests/helpers/a11y-audit.js](file:///Users/bsonntag/code/dashboard/tests/helpers/a11y-audit.js). 41 disabled rules, edited by 34 rule-ratchet PRs (chronologically: [#9633](https://github.com/heroku/dashboard/pull/9633), [#9634](https://github.com/heroku/dashboard/pull/9634), [#9635](https://github.com/heroku/dashboard/pull/9635), [#9645](https://github.com/heroku/dashboard/pull/9645)..[#9692](https://github.com/heroku/dashboard/pull/9692)).
- v8 upgrade renames it: [heroku/dashboard#11933](https://github.com/heroku/dashboard/pull/11933) renames `tests/helpers/a11y-audit.js` to `tests/helpers/a11y-audit-rules.js`. The new include must be added to the default shared-include set when an ember-a11y-testing v8 project is detected.
- Existing `prewarm-then-use` doc: [/Users/bsonntag/.claude/skills/agent-threader/SKILL.md](/Users/bsonntag/.claude/skills/agent-threader/SKILL.md) (Adapter Model / Worker Environment section).
- Existing `withResourceLock` primitive: [/Users/bsonntag/.claude/skills/agent-threader/contributions/2026-04-25-permissive-chains-vs-resource-locks.md](/Users/bsonntag/.claude/skills/agent-threader/contributions/2026-04-25-permissive-chains-vs-resource-locks.md).
