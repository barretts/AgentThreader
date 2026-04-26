import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import type {
  InvocationRecord,
  ManifestTaskV2,
  ManifestV2,
  RunPolicy,
  StateV2,
} from "./types.js";

interface AtomicWriteOptions {
  filePath: string;
  value: unknown;
}

export async function writeAtomicJson(options: AtomicWriteOptions): Promise<void> {
  const dir = path.dirname(options.filePath);
  const base = path.basename(options.filePath);
  const tmpPath = path.join(dir, `.${base}.tmp`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(options.value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, options.filePath);
}

export function stableFailureSignature(failureClass: string, primarySignal: string): string {
  const cleaned = primarySignal
    .toLowerCase()
    .replace(/\b\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/g, "")
    .replace(/\/[^\s]+/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .replace(/\s+/g, "_");

  return `${failureClass.toLowerCase()}:${cleaned || "unknown"}`;
}

export function shouldEscalateRepeatedSignature(
  repeatCount: number,
  signatureRepeatLimit: number,
): boolean {
  return repeatCount >= signatureRepeatLimit;
}

// ─── Multi-Pass Execution Loop ────────────────────────────────────────────────

/**
 * Drain a manifest by repeatedly polling for ready tasks and running the
 * worker pool until the run reaches a terminal state. `runPool` only
 * handles ONE batch of currently-ready tasks; without an outer loop, only
 * chain heads execute.
 *
 * Empirical bug: a 96-task chained sweep that didn't loop ran the 22
 * chain heads in pass 1 and reported `run_status: COMPLETED` while 105
 * dependents were still PENDING. Always wrap `runPool` in this loop.
 *
 * Caller supplies the agent-threader scheduling primitives via `deps`
 * (so this template stays decoupled from a specific package version).
 */
export interface MultiPassDeps {
  buildDependencyOrder: (tasks: ManifestTaskV2[]) => { order: string[]; hasCycle: boolean; cycleMembers: string[] };
  getReadyTasks: (tasks: ManifestTaskV2[], state: Record<string, { status: string }>, order: string[]) => string[];
  isRunComplete: (state: Record<string, { status: string }>) => boolean;
  runPool: <T>(taskIds: string[], concurrency: number, fn: (taskId: string) => Promise<T>) => Promise<T[]>;
}

export interface RunManifestToCompletionResult {
  passes: number;
  remaining: string[];
}

export async function runManifestToCompletion(
  manifest: ManifestV2,
  state: StateV2,
  policy: RunPolicy & { concurrency?: number },
  workerFn: (taskId: string) => Promise<void>,
  checkpoint: () => Promise<void>,
  deps: MultiPassDeps,
  options: { maxPasses?: number } = {},
): Promise<RunManifestToCompletionResult> {
  const maxPasses = options.maxPasses ?? 50;
  const concurrency = policy.concurrency ?? 1;
  const depOrder = deps.buildDependencyOrder(manifest.tasks);
  if (depOrder.hasCycle) {
    throw new Error(`Dependency cycle: ${depOrder.cycleMembers.join(", ")}`);
  }
  let passes = 0;
  while (passes < maxPasses && !deps.isRunComplete(state.tasks)) {
    passes++;
    const ready = deps.getReadyTasks(manifest.tasks, state.tasks, depOrder.order);
    if (ready.length === 0) break;
    await deps.runPool(ready, concurrency, workerFn);
    await checkpoint();
  }
  const remaining = Object.entries(state.tasks)
    .filter(([, t]) => t.status === "PENDING" || t.status === "RUNNING")
    .map(([id]) => id);
  return { passes, remaining };
}

// ─── Per-Resource Mutex ───────────────────────────────────────────────────────

/**
 * In-process per-resource serializer. Any number of same-resource tasks
 * can be queued; they execute one at a time on the named resource. Cross-
 * resource tasks remain free to run in parallel up to the worker pool's
 * concurrency.
 *
 * Replaces `depends_on` chains used purely for shared-workdir
 * serialization. Unlike `depends_on`, this does NOT propagate FAILED /
 * BLOCKED state -- a failing predecessor for the same resource simply
 * releases the lock so the next holder can run.
 */
const __resourceMutexes = new Map<string, Promise<void>>();

export async function withResourceLock<T>(
  resourceKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = __resourceMutexes.get(resourceKey) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const next = new Promise<void>((res) => {
    release = res;
  });
  __resourceMutexes.set(resourceKey, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

// ─── Run Identity (cross-run artifact correlation) ────────────────────────────

export interface RunIdentity {
  runId: string;
  shortId: string;
  marker: string;
  visibleHeader: string;
}

export interface NewRunIdentityOptions {
  /** e.g. "3pp-grackle-babysit". Used as marker prefix and runId namespace. */
  skillName: string;
  /** Schema version embedded in the marker (e.g. "v1"). */
  schemaVersion: string;
  /** Optional pre-formatted persona/banner used as the visible header. */
  persona?: string;
  /** Override clock for deterministic tests. */
  now?: Date;
}

export function newRunIdentity(opts: NewRunIdentityOptions): RunIdentity {
  const ts = (opts.now ?? new Date())
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 19);
  const runId = `${opts.skillName}-${ts}`;
  const shortId = createHash("sha256").update(runId).digest("hex").slice(0, 8);
  const marker = `<!-- ${opts.skillName}:${opts.schemaVersion} run_id=${runId} short_id=${shortId} -->`;
  const visibleHeader = opts.persona
    ? `${opts.persona} _(AT run \`${shortId}\`)_`
    : `**${opts.skillName}** _(AT run \`${shortId}\`)_`;
  return { runId, shortId, marker, visibleHeader };
}

export interface CanonicalFooterOptions {
  /** Project-level constant identifying the skill. e.g. sha256("3pp-grackle")[0:8]. */
  skillSig: string;
  /** Skill name used in the trailing tagline. */
  skillName: string;
  /** Optional secondary identity key (e.g. "grackle-sig", "threader-sig"). Defaults to "run-sig". */
  identityKey?: string;
}

export function canonicalFooter(identity: RunIdentity, opts: CanonicalFooterOptions): string {
  const idKey = opts.identityKey ?? "run-sig";
  return [
    "---",
    `<sub>skill-sig: \`${opts.skillSig}\` &middot; ${idKey}: \`${identity.shortId}\` &middot; ${opts.skillName} canonical pipeline</sub>`,
    "",
    identity.marker,
  ].join("\n");
}

export interface ParsedRunIdentity {
  skillName: string;
  schemaVersion: string;
  runId: string;
  shortId: string;
}

const __RUN_IDENTITY_RE = /<!--\s*([\w-]+):(\w+)\s+run_id=(\S+)\s+short_id=([0-9a-f]+)\s*-->/i;

export function extractRunIdentity(body: string | null | undefined): ParsedRunIdentity | null {
  if (!body) return null;
  const m = __RUN_IDENTITY_RE.exec(body);
  if (!m) return null;
  return { skillName: m[1], schemaVersion: m[2], runId: m[3], shortId: m[4] };
}

export function bodyContainsRunIdentity(body: string | null | undefined, skillName: string): boolean {
  if (!body) return false;
  return body.includes(`<!-- ${skillName}:`);
}

// ─── Worker Output Post-Processing ────────────────────────────────────────────

/**
 * Generic post-processor for worker artifacts (PR bodies, comments, files).
 * Idempotent: running on already-canonicalized content produces the same
 * content. The orchestrator OWNS the canonical form; workers may emit
 * placeholders or improvised versions which this helper overwrites.
 */
export interface ArtifactRef<TKey = unknown> {
  kind: "github-pr" | "github-comment" | "file" | "custom";
  key: TKey;
}

export interface ArtifactPostProcessor<TKey, TIdentity> {
  fetch: (ref: ArtifactRef<TKey>) => Promise<string>;
  normalize: (current: string, identity: TIdentity) => string;
  apply: (ref: ArtifactRef<TKey>, normalized: string) => Promise<void>;
}

export interface PostProcessResult {
  changed: boolean;
  before: string;
  after: string;
}

export async function postProcessArtifact<TKey, TIdentity>(
  ref: ArtifactRef<TKey>,
  identity: TIdentity,
  pp: ArtifactPostProcessor<TKey, TIdentity>,
): Promise<PostProcessResult> {
  const before = await pp.fetch(ref);
  const after = pp.normalize(before, identity);
  if (after === before) return { changed: false, before, after };
  await pp.apply(ref, after);
  return { changed: true, before, after };
}

// ─── Toolchain Pre-Warm (shared-state safety) ────────────────────────────────

export interface ToolchainRequirement {
  manager: "nvm" | "pyenv" | "rbenv" | "sdkman" | "asdf" | string;
  /**
   * EXACT version to install. Reads from `.nvmrc` / `.node-version` /
   * `engines.node` / `.python-version` / etc. should preserve exact pins;
   * `nvm use 18.14.2` requires `18.14.2` exactly, not just major 18.
   */
  version: string;
  /** Where the requirement came from, for diagnostics. */
  source: string;
}

export interface PrewarmedToolchain {
  manager: string;
  version: string;
  alreadyPresent: boolean;
  durationSec: number;
}

export interface PrewarmFailure {
  manager: string;
  version: string;
  error: string;
}

export interface PrewarmResult {
  installed: PrewarmedToolchain[];
  failures: PrewarmFailure[];
}

/**
 * Sequentially install (or verify presence of) every distinct toolchain
 * version required by the manifest. MUST run before the worker pool
 * starts. Workers are forbidden from running installer commands
 * (`nvm install`, `pyenv install`, etc.) because parallel installs race
 * on shared user-level state.
 *
 * `installFn` is supplied by the caller so this template stays
 * environment-agnostic. A typical shell-backed implementation runs the
 * appropriate `<manager> install <version>` and returns once the version
 * is available.
 */
export async function prewarmToolchains(
  requirements: ToolchainRequirement[],
  installFn: (req: ToolchainRequirement) => Promise<PrewarmedToolchain>,
): Promise<PrewarmResult> {
  // Dedupe by (manager, version); preserve first source for diagnostics.
  const seen = new Map<string, ToolchainRequirement>();
  for (const req of requirements) {
    const key = `${req.manager}:${req.version}`;
    if (!seen.has(key)) seen.set(key, req);
  }
  const installed: PrewarmedToolchain[] = [];
  const failures: PrewarmFailure[] = [];
  for (const req of seen.values()) {
    try {
      installed.push(await installFn(req));
    } catch (e: unknown) {
      failures.push({
        manager: req.manager,
        version: req.version,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { installed, failures };
}

// ─── Archival (never delete prior-run artifacts) ──────────────────────────────

export interface ArchivePriorRunOptions {
  /** Directory containing state.json, manifest.json, identity files. */
  stateDir: string;
  /** Subdirectory for archives. Defaults to "archive". */
  archiveSubdir?: string;
  /**
   * Tag for the archive subdirectory. Typically the prior run's run_id.
   * Falls back to a timestamp if the prior identity is unrecoverable.
   */
  tag?: string;
  /** Filenames to archive. Defaults: state.json, manifest.json. */
  files?: string[];
}

/**
 * Move prior-run artifacts (state, manifest, identity) into an archive
 * subdirectory BEFORE overwriting. Mandate: never delete prior-run
 * artifacts. Atomic via `renameSync` within a mount point; callers
 * needing cross-mount support should handle copy-then-delete themselves.
 *
 * Returns the list of archived paths. If no prior files exist, returns [].
 */
export function archivePriorRunArtifacts(opts: ArchivePriorRunOptions): string[] {
  const archiveRoot = path.join(opts.stateDir, opts.archiveSubdir ?? "archive");
  const tag = opts.tag ?? `unknown-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const archiveDir = path.join(archiveRoot, tag);
  const files = opts.files ?? ["state.json", "manifest.json"];
  const archived: string[] = [];
  for (const fname of files) {
    const src = path.join(opts.stateDir, fname);
    if (!existsSync(src)) continue;
    if (archived.length === 0) mkdirSync(archiveDir, { recursive: true });
    const dst = path.join(archiveDir, fname);
    renameSync(src, dst);
    archived.push(dst);
  }
  return archived;
}

// ─── Invocation Digest (for resume mode-flag enforcement) ─────────────────────

/**
 * Canonical hash of the invocation flags + targets. Stable across
 * functionally-equivalent invocations (key order, target order). Used by
 * `--resume` to detect mode/flag mismatch with the prior run's
 * `state.invocation.argv_digest`.
 */
export function computeArgvDigest(invocation: Omit<InvocationRecord, "argv_digest" | "manifest_digest">): string {
  const sortedFlags = invocation.flags
    ? Object.keys(invocation.flags)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (invocation.flags as Record<string, unknown>)[k];
          return acc;
        }, {})
    : {};
  const canonical = JSON.stringify({
    phase: invocation.phase,
    mode: invocation.mode,
    flags: sortedFlags,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Compare the current invocation against the prior run's persisted
 * invocation. Returns null on match (resume is safe), or an
 * operator-actionable error string on mismatch.
 */
export function checkResumeInvocationMatch(
  prior: InvocationRecord | undefined,
  current: Omit<InvocationRecord, "argv_digest" | "manifest_digest">,
): string | null {
  if (!prior) return null; // legacy state without invocation block; allow.
  const currentDigest = computeArgvDigest(current);
  if (prior.argv_digest === currentDigest) return null;
  return [
    `ERROR: Cannot --resume with different invocation flags than the prior run.`,
    `  Prior run:   phase=${prior.phase} mode=${prior.mode} digest=${prior.argv_digest}`,
    `  Current:     phase=${current.phase} mode=${current.mode} digest=${currentDigest}`,
    ``,
    `To resume the prior run, repeat its mode flags or omit --resume's mode-affecting flags entirely.`,
    `To start a new run with the current flags, drop --resume (state will be archived first).`,
  ].join("\n");
}

// ─── PBH Fatal-Transient Short-Circuit ────────────────────────────────────────

export interface WindowFailure {
  task_id: string;
  failure_class: string | null;
  failure_signature: string | null;
}

export interface FatalTransientAbortReason {
  kind: "fatal_transient_infra";
  failure_class: string;
  affected_tasks: string[];
  message: string;
}

const __FATAL_TRANSIENT_MESSAGES: Record<string, string> = {
  "transient_infra:api_auth_blocked":
    "Worker model API key is blocked. The run cannot proceed until the key is unblocked. Resolve the upstream block (rotate / unblock / re-auth) and resume with --resume.",
  "transient_infra:tool_unavailable":
    "A required tool / skill is not installed in the worker environment. Install the missing dependency on the worker host and resume with --resume.",
};

/**
 * Inspect a healing window for any non-healable transient_infra subtype.
 * If found, the orchestrator MUST abort the run with this reason (no
 * heal rounds consumed). PBH's normal convergence rules are skipped.
 */
export function checkWindowFatalTransient(
  failures: WindowFailure[],
  fatalSet: ReadonlySet<string>,
): FatalTransientAbortReason | null {
  for (const f of failures) {
    if (f.failure_class && fatalSet.has(f.failure_class)) {
      const affected = failures
        .filter((x) => x.failure_class === f.failure_class)
        .map((x) => x.task_id);
      return {
        kind: "fatal_transient_infra",
        failure_class: f.failure_class,
        affected_tasks: affected,
        message: __FATAL_TRANSIENT_MESSAGES[f.failure_class] ?? `Non-healable failure: ${f.failure_class}. Resolve and --resume.`,
      };
    }
  }
  return null;
}

// ─── execFileSync helper for shell-backed installers (re-export for templates) ─

export const _internals = {
  execFileSync,
};
