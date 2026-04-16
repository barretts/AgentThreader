/**
 * Template orchestrator wiring all AgentThreader primitives.
 *
 * This is a fully functional orchestrator that demonstrates:
 *  - Manifest loading and validation
 *  - State initialization, loading, reconciliation
 *  - Process lockfile for zombie prevention
 *  - Dependency-aware scheduling
 *  - Fibonacci batch sizing with grow/shrink
 *  - Parallel execution with bounded concurrency
 *  - Checkpoint mutex for serialized state writes
 *  - Terminal escape stripping in all parse paths
 *  - Diagnostic extraction for healer visibility
 *  - Sentinel sanitization to prevent transcript poisoning
 *  - Healing policy (convergence, escalation, abort)
 *  - Process cleanup (--kill flag)
 *  - State reset (--reset-failed flag)
 *
 * Every pattern here comes from a real production failure.
 * See boilerplate/README.md for the lesson-to-pattern mapping.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  // Contract validation
  validateManifest,
  // State
  loadState, writeState, initializeState,
  computeManifestDigest,
  // Scheduling
  buildDependencyOrder, getReadyTasks,
  isTerminalStatus, isRunComplete,
  // Batch strategy
  growBatchSize, shrinkBatchSize, computeEffectiveWindowSize,
  // Healing
  isHealableFailure, computeFailureRate, shouldHeal,
  checkConvergence, shouldEscalateTask, shouldAbortRun,
  // Concurrency
  runPool, CheckpointMutex,
  // State reconciliation
  reconcileState, resetForRetry,
  // Lockfile
  acquireLock, releaseLock,
  // Diagnostics
  extractDiagnosticLines,
  // Kill
  killOrphanedProcesses,
  // Parser
  parseTaskResultFromString, isParserFailure,
  generateFailureSignature,
  // Types
  type ManifestV2, type StateV2, type TaskState,
  type RunPolicy,
  DEFAULT_POLICY,
} from "agent-threader";
import { MyAdapter } from "./my-adapter.js";

// ── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, "true");
    }
  }
}

// ── Kill Mode ───────────────────────────────────────────────────────────────
// Lesson: orchestrator-kill-command-medium

if (flags.has("kill")) {
  console.log("Searching for orphaned processes...");
  const result = killOrphanedProcesses();
  for (const k of result.killed) {
    console.log(`  Killed PID ${k.pid} (${k.pattern}): ${k.command}`);
  }
  if (result.killed.length === 0) {
    console.log("  No orphaned processes found.");
  }
  for (const e of result.errors) {
    console.error(`  Error: ${e}`);
  }
  process.exit(0);
}

// ── Configuration ───────────────────────────────────────────────────────────

const manifestPath = flags.get("manifest") ?? "manifest.json";
const stateDir = flags.get("state-dir") ?? "state";
const statePath = path.join(stateDir, "state.json");
const logsDir = path.join(stateDir, "logs");
const concurrency = Number.parseInt(flags.get("concurrency") ?? "1", 10);

// ── Lockfile ────────────────────────────────────────────────────────────────
// Lesson: zombie-orchestrator-state-corruption-critical

const lockResult = acquireLock(stateDir);
if (!lockResult.acquired) {
  console.error(
    `Another orchestrator is running (PID ${lockResult.existingPid}). ` +
    `Kill it first with --kill or use --force.`
  );
  process.exit(1);
}
process.on("exit", () => releaseLock(stateDir));
process.on("SIGINT", () => { releaseLock(stateDir); process.exit(130); });
process.on("SIGTERM", () => { releaseLock(stateDir); process.exit(143); });

// ── Load Manifest ───────────────────────────────────────────────────────────

const manifestRaw = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestV2;
const validation = validateManifest(manifestRaw, { schemasDir: undefined });
if (!validation.valid) {
  console.error("Manifest validation failed:");
  for (const issue of validation.issues) {
    console.error(`  [${issue.severity}] ${issue.message}`);
  }
  process.exit(1);
}

const manifest = manifestRaw;

// ── Initialize or Load State ────────────────────────────────────────────────

let state: StateV2;
if (existsSync(statePath)) {
  state = loadState(statePath);
  console.log(`Loaded existing state: ${Object.keys(state.tasks).length} tasks`);
} else {
  const policy: RunPolicy = { ...DEFAULT_POLICY, concurrency };
  state = initializeState(manifest, policy);
  mkdirSync(stateDir, { recursive: true });
  writeState(statePath, state);
  console.log(`Initialized new state: ${manifest.tasks.length} tasks`);
}

// ── Reset Mode ──────────────────────────────────────────────────────────────
// Lesson: state-batch-index-not-reset-on-retry-high

if (flags.has("reset-failed")) {
  const result = resetForRetry(state);
  writeState(statePath, state);
  console.log("Reset for retry:");
  for (const r of result.repairs) {
    console.log(`  ${r}`);
  }
  releaseLock(stateDir);
  process.exit(0);
}

// ── State Reconciliation ────────────────────────────────────────────────────
// Lesson: stuck-running-state-on-crash-medium
// Lesson: state-batch-index-not-reset-on-retry-high

const pendingTasks = manifest.tasks.filter((t) => {
  const ts = state.tasks[t.id];
  return ts && (ts.status === "PENDING" || ts.status === "FAILED");
});

const reconciliation = reconcileState(state, pendingTasks.length);
if (reconciliation.repaired) {
  console.log("State reconciliation:");
  for (const r of reconciliation.repairs) {
    console.log(`  ${r}`);
  }
  writeState(statePath, state);
}

// ── Scheduling ──────────────────────────────────────────────────────────────

const depOrder = buildDependencyOrder(manifest.tasks);
if (depOrder.hasCycle) {
  console.error(`Dependency cycle detected: ${depOrder.cycleMembers.join(", ")}`);
  releaseLock(stateDir);
  process.exit(1);
}

// ── Adapter ─────────────────────────────────────────────────────────────────

const adapter = new MyAdapter();

// ── Checkpoint Mutex ────────────────────────────────────────────────────────
// Lesson: parallel-agent-execution-medium

const mutex = new CheckpointMutex();

async function checkpoint(): Promise<void> {
  await mutex.run(async () => {
    writeState(statePath, state);
  });
}

// ── Execute Single Task ─────────────────────────────────────────────────────

const ctx = {
  repoRoot: process.cwd(),
  logsDir,
  sharedContextPaths: [],
  contractHints: new Map<string, string[]>(),
  policy: state.policy,
};

async function executeTask(taskId: string): Promise<void> {
  const task = manifest.tasks.find((t) => t.id === taskId)!;
  const ts = state.tasks[taskId];
  if (!ts) return;

  ts.status = "RUNNING";
  ts.worker_attempts++;
  await checkpoint();

  console.log(`[${taskId}] Starting (attempt ${ts.worker_attempts})...`);

  try {
    const invocation = adapter.prepare(task, ctx);
    const artifact = await adapter.execute(invocation, ctx);

    // Store diagnostic tail for healer (lesson: healer-blind-to-agent-output)
    ts.last_log_tail = artifact.lastLogTail ?? null;

    const result = await adapter.extractResult(artifact, ctx);

    if (isParserFailure(result)) {
      ts.status = "FAILED";
      ts.last_failure_class = "contract_error";
      ts.last_failure_signature = generateFailureSignature("contract_error", result.message);

      ts.history.push({
        task_id: taskId,
        phase: "worker",
        attempt_number: ts.worker_attempts,
        log_path: artifact.logPath,
        exit_code: artifact.exitCode,
        failure_class: "contract_error",
        failure_signature: ts.last_failure_signature,
        duration_sec: artifact.durationMs ? artifact.durationMs / 1000 : null,
        timestamp: new Date().toISOString(),
      });

      // Check for transient errors (lesson: crush-pipeline-four-output-bugs issue 4)
      if (artifact.lastLogTail) {
        const diag = extractDiagnosticLines(artifact.lastLogTail);
        if (diag.hasTransientErrors) {
          ts.last_failure_class = "transient_infra";
          console.log(`[${taskId}] Transient error detected: ${diag.transientPatterns.join(", ")}`);
        }
      }
    } else {
      if (result.status === "DONE") {
        ts.status = "DONE";
      } else if (result.status === "BLOCKED") {
        ts.status = "BLOCKED";
      } else if (result.status === "FAILED") {
        ts.status = "FAILED";
        ts.last_failure_class = result.failure_class ?? "unknown";
      }

      ts.history.push({
        task_id: taskId,
        phase: "worker",
        attempt_number: ts.worker_attempts,
        log_path: artifact.logPath,
        exit_code: artifact.exitCode,
        failure_class: result.status === "DONE" ? null : (result.failure_class ?? null),
        failure_signature: null,
        duration_sec: artifact.durationMs ? artifact.durationMs / 1000 : null,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[${taskId}] ${ts.status} (${artifact.durationMs ?? 0}ms)`);
  } catch (e) {
    ts.status = "FAILED";
    ts.last_failure_class = "transient_infra";
    ts.last_failure_signature = generateFailureSignature(
      "transient_infra",
      e instanceof Error ? e.message : String(e),
    );
    console.error(`[${taskId}] Crashed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await checkpoint();
}

// ── Main Run Loop ───────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const effectiveConcurrency = concurrency > 0 ? concurrency : (state.policy.concurrency || 1);
  let batchSize = state.policy.current_batch_size;

  console.log(`Starting run: ${pendingTasks.length} pending tasks, concurrency=${effectiveConcurrency}`);

  while (!isRunComplete(state.tasks)) {
    const ready = getReadyTasks(manifest.tasks, state.tasks, depOrder.order);
    if (ready.length === 0) break;

    const windowSize = computeEffectiveWindowSize(batchSize, ready.length);
    const window = ready.slice(0, windowSize);

    console.log(`\nBatch: ${window.length} tasks (batch size=${batchSize})`);

    // Execute with bounded concurrency (lesson: parallel-agent-execution)
    await runPool(window, effectiveConcurrency, async (taskId) => {
      await executeTask(taskId);
    });

    // Evaluate window outcome
    const windowOutcome = {
      windowTaskIds: window,
      taskStates: state.tasks,
    };
    const failureRate = computeFailureRate(windowOutcome);

    if (failureRate.rate === 0) {
      const grown = growBatchSize(state.policy);
      batchSize = grown.nextBatchSize;
      state.policy.current_batch_size = batchSize;
      console.log(`All passed -- ${grown.reason}`);
    } else {
      // Check if healing is warranted
      const healResult = shouldHeal({
        windowOutcome,
        policy: state.policy,
        healingRounds: state.healing_rounds,
      });

      if (healResult.shouldAbort) {
        console.log(`Aborting: ${healResult.reason}`);
        state.run_status = "ABORTED";
        state.abort_reason = healResult.reason;
        break;
      }

      if (healResult.shouldShrink) {
        const shrunk = shrinkBatchSize(state.policy);
        batchSize = shrunk.nextBatchSize;
        state.policy.current_batch_size = batchSize;
        console.log(`Shrunk batch: ${shrunk.reason}`);
      }

      // Check escalation for individual tasks
      for (const taskId of window) {
        const ts = state.tasks[taskId];
        if (ts.status === "FAILED") {
          const esc = shouldEscalateTask(ts, state.policy);
          if (esc.escalate) {
            ts.status = "ESCALATED";
            console.log(`[${taskId}] Escalated: ${esc.reason}`);
          }
        }
      }

      // Check run-level abort
      const abort = shouldAbortRun(state.policy, state.healing_rounds, state.tasks);
      if (abort.abort) {
        console.log(`Run abort: ${abort.reason}`);
        state.run_status = "ABORTED";
        state.abort_reason = abort.reason;
        break;
      }
    }

    await checkpoint();
  }

  // Final status
  if (state.run_status !== "ABORTED") {
    state.run_status = "COMPLETED";
  }
  await checkpoint();

  const done = Object.values(state.tasks).filter((t) => t.status === "DONE").length;
  const failed = Object.values(state.tasks).filter((t) => t.status === "FAILED").length;
  const escalated = Object.values(state.tasks).filter((t) => t.status === "ESCALATED").length;
  const blocked = Object.values(state.tasks).filter((t) => t.status === "BLOCKED").length;

  console.log(`\nRun ${state.run_status}: ${done} done, ${failed} failed, ${escalated} escalated, ${blocked} blocked`);
}

run()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(() => {
    releaseLock(stateDir);
  });
