# Scope B follow-up: lessons deferred from apply/core-lessons-scope-a

Scope A (this branch) landed four purely-additive orchestrator primitives
— multi-pass runner, resource lock, toolchain prewarm, fatal-transient
short-circuit — plus the `FATAL_TRANSIENT_INFRA_SUBTYPES` constant and a
`resource_lock` field on `ManifestTaskV2`. Everything else is opt-in: no
existing caller changed behavior.

The items below are deferred because they either mutate an existing contract
(adapter behavior, state schema) or are specific to a different repo's
pipeline (3pp-grackle). Each one needs its own branch and design pass.

## 1. Claude adapter: stdin-close + argv terminator + stream-json

**Lessons**
- `lessons/claude-adapter-close-stdin-high.md`
- `lessons/claude-adapter-argv-terminator-high.md`
- `lessons/claude-adapter-mandate-stream-json-medium.md`

**Current state (`src/lib/adapters/presets.ts` CLAUDE_PRESET)**
- `promptDelivery: "stdin"` — prompt is piped to stdin.
- `defaultArgs` has `--output-format text`, no `--add-dir`, no `--`,
  no `--include-partial-messages`.
- `stdinIgnore: false`.

**What the lessons prescribe**
- Flip `promptDelivery` to `"positional-arg"` and prepend `--` immediately
  before the prompt so variadic `--add-dir` cannot eat it.
- Set `stdinIgnore: true` so the child never blocks on an unread stdin pipe.
- Default `--output-format stream-json --verbose --include-partial-messages`
  so the orchestrator gets per-event progress (enables the idle-detection
  guard below).

**Why it's Scope B, not A**
- Changes the wire contract with every existing claude worker. Users who
  wrap their own runner around the preset will see prompt delivery flip.
- `buildArgv` currently returns `{ argv, stdin: prompt }` for claude; the
  new shape returns `stdin: null` and injects the prompt as the last
  positional. Any caller manually piping `stdin` breaks.
- Stream-json output needs a JSONL event parser in the adapter layer, not
  just a flag flip. That parser does not exist yet.

**Plan**
1. Add a new preset variant (`CLAUDE_PRESET_STREAM_JSON`) side-by-side so
   existing callers opt in rather than auto-migrate.
2. Teach `buildArgv` to emit `--` unconditionally when `promptDelivery`
   is `"positional-arg"` AND any variadic flag (`--add-dir`, ...) is
   present in `defaultArgs` or `extraArgs`.
3. Add an idle-detection guard in the orchestrator runtime that consumes
   the stream-json events and warns after `HANG_WARN_SEC` (default 300) of
   silence. Ties into the existing `sigkillDelayMs` escalation.
4. Property tests covering:
   - argv terminator appears after the last `--add-dir`.
   - prompt is not consumed by any variadic flag.
   - spawn options include `stdio: ["ignore", "pipe", "pipe"]`.

## 2. Resume invocation digest (state.v2 `invocation` block)

**Lesson**: `lessons/resume-mode-flag-persistence-high.md`

**Current state**
- `state/types.ts` persists per-task state, policy, healing rounds, and
  `manifest_digest`. No record of the CLI flags / mode that produced the
  manifest.
- `reconcileState` checks content drift within a mode. It cannot detect
  "the producer was a different mode entirely" because different-mode
  runs produce different task IDs that the merge just unions in.

**What the lesson prescribes**
- Add `state.invocation = { phase, mode, flags, argv_digest }` to `StateV2`.
- `computeArgvDigest({ phase, mode, flags })` — canonical hash of sorted
  flags.
- `checkResumeInvocationMatch(prior, current)` — returns null on match,
  or an operator-actionable error string on mismatch.
- `--resume` fails loudly on mismatch. Legacy state without an invocation
  block is accepted (backward compat).

**Why it's Scope B, not A**
- Touches `StateV2`, which has on-disk format implications. Needs a
  migration/back-compat plan because existing state.json files in the wild
  lack the block.
- Requires a caller in the CLI layer (`src/cli/commands/`) to actually
  compute the digest at resume time. Pure library addition is not enough
  to realize the value.
- The digest canonicalization is the subtle part: flag ordering, boolean
  normalization, omission-vs-false equivalence. Needs a spec pass.

**Plan**
1. Add `invocation?: InvocationRecord` to `StateV2` as optional.
2. Add `computeArgvDigest` + `checkResumeInvocationMatch` as pure helpers
   under `src/lib/state/invocation.ts` with unit tests.
3. Wire into the CLI resume path in a follow-up commit so the pure
   library change stays separable.

## 3. Parser: empty vs malformed output distinction

**Lesson**: `lessons/parser-empty-vs-malformed-distinction-medium.md`

**Current state**: `ParserErrorCode` in `contracts/types.ts` has
`NO_SENTINEL`, `INVALID_JSON`, `SCHEMA_VIOLATION`, `MISSING_REQUIRED_FIELD`,
`UNSUPPORTED_VERSION`. No dedicated `NO_OUTPUT` for the case where the
worker produced nothing at all (as distinct from produced-something-wrong).

**Scope B move**: add `NO_OUTPUT` and teach the parser to sniff 401-class
auth errors and tag them `transient_infra:api_auth_blocked` so the Scope-A
fatal-transient short-circuit can catch them without a separate signal.

## 4. Red-test false-failure verification (3pp-specific)

**Lesson**: `lessons/red-test-false-failure-verification-high.md`

Not applicable to AgentThreader core. The red/green suite convention is a
3pp-grackle worker-prompt convention, not a library feature. Noted here so
it is not lost; should live in the 3pp-skill repo.

## 5. Parallel docs sweep

Lessons that only imply fragment doc edits, no code:
- `run-identity-markers-in-artifacts-low.md`
- `archive-prior-run-artifacts-medium.md`
- `worker-postprocess-canonical-output-medium.md`
- `permissive-chains-vs-resource-locks-high.md` (the authoring guidance
  table — the primitive itself is in Scope A)

These belong in a later "docs recompile" branch alongside Scope B #1/#2.
