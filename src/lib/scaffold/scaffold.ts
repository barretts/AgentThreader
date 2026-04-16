/**
 * Scaffold a new orchestrator project from the boilerplate template.
 *
 * Reads template files from the boilerplate/ directory (shipped in the
 * npm package) and writes them to the target directory, replacing
 * placeholder tokens with the user's project name.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface ScaffoldOptions {
  /** Target directory to scaffold into. */
  targetDir: string;
  /** Project name (used in package.json and imports). */
  projectName?: string;
  /** If true, overwrite existing files. Default false. */
  force?: boolean;
}

export interface ScaffoldResult {
  targetDir: string;
  projectName: string;
  filesCreated: string[];
  skipped: string[];
}

const BOILERPLATE_FILES: Record<string, string> = {
  "package.json": `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "description": "Orchestrator project built with AgentThreader",
  "type": "module",
  "scripts": {
    "start": "tsx src/orchestrator.ts",
    "kill": "tsx src/orchestrator.ts --kill",
    "reset": "tsx src/orchestrator.ts --reset-failed",
    "status": "npx agent-threader status state/state.json",
    "test": "node --test test/**/*.test.mjs"
  },
  "dependencies": {
    "agent-threader": "^2.0.8"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
`,
  "manifest.json": `{
  "manifest_version": "2.0",
  "run_id": "{{PROJECT_NAME}}-001",
  "tasks": [
    {
      "id": "task-setup",
      "prompt_ref": "prompts/task.md",
      "depends_on": [],
      "timeout_sec": 300,
      "verify_profile": "default",
      "priority": 1,
      "metadata": {
        "description": "Set up the project environment"
      }
    },
    {
      "id": "task-implement",
      "prompt_ref": "prompts/task.md",
      "depends_on": ["task-setup"],
      "timeout_sec": 600,
      "verify_profile": "default",
      "priority": 2,
      "metadata": {
        "description": "Implement the main feature"
      }
    },
    {
      "id": "task-test",
      "prompt_ref": "prompts/task.md",
      "depends_on": ["task-implement"],
      "timeout_sec": 300,
      "verify_profile": "default",
      "priority": 3,
      "metadata": {
        "description": "Write and run tests"
      }
    }
  ]
}
`,
  "verify-profiles.json": `{
  "profiles": {
    "default": {
      "steps": [
        {
          "name": "lint",
          "cmd": "npm run lint --if-present",
          "cwd": ".",
          "timeout_sec": 60
        },
        {
          "name": "test",
          "cmd": "npm test --if-present",
          "cwd": ".",
          "timeout_sec": 120
        }
      ],
      "rollback_on_failure": false
    }
  }
}
`,
  "prompts/task.md": `# Task: {{TASK_ID}}

{{DESCRIPTION}}

## Context

{{CONTEXT}}

## Execution Guidance

- Minimize repeated context restatement; focus on concrete changes.
- Prefer direct action and verification over long planning narration.
- Keep outputs concise and evidence-focused.
- If a task affects behavior, update or add tests before finalizing.

## Output Contract

When you are finished, emit your result inside these exact sentinel fences:

\`\`\`
<<<TASK_RESULT_V2>>>
{
  "contract_version": "2.0",
  "task_id": "{{TASK_ID}}",
  "status": "DONE",
  "summary": "Brief description of what you did.",
  "changed_files": ["list", "of", "changed", "files"],
  "evidence": {
    "commands": ["commands you ran"],
    "notes": ["any relevant notes"]
  }
}
<<<END_TASK_RESULT_V2>>>
\`\`\`

If you are blocked or cannot complete the task, use \`"status": "BLOCKED"\` or \`"status": "FAILED"\` with a \`"failure_class"\` field.
`,
  "prompts/healer.md": `# Healer: Diagnose and Fix Batch Failures

You are the healer agent. Your job is to analyze why tasks failed and decide what to do.

## Failed Task Summaries

{{FAILED_SUMMARIES}}

## Execution Log Tails

{{LOG_TAILS}}

## Instructions

1. Read the failure summaries and execution log tails carefully.
2. Identify the root cause of failures (not just symptoms).
3. Propose the smallest patch set likely to fix the root cause.
4. Decide whether to RETRY (with prompt/context patches), ESCALATE (human needed), or declare NOT_FIXABLE.

## Output Contract

Emit your decision inside these exact sentinel fences:

\`\`\`
<<<HEAL_DECISION_V2>>>
{
  "contract_version": "2.0",
  "scope": "batch",
  "decision": "RETRY",
  "failure_class": "prompt_gap",
  "root_cause": "Explain the root cause here.",
  "patches": [
    {
      "target": "shared_context",
      "operation": "append",
      "content": "Additional context or instructions to add."
    }
  ],
  "learned_rule": "Optional: a pattern to remember for future runs."
}
<<<END_HEAL_DECISION_V2>>>
\`\`\`
`,
  "src/my-adapter.ts": `/**
 * Example CLI adapter. Replace with your actual agent CLI integration.
 *
 * Key lessons baked in:
 *  - Task cwd is sandboxed; healer cwd is project root
 *  - Pass prompt as positional arg, not stdin
 *  - Use max verbosity to capture tool calls
 *  - executeSingle uses project root, not task sandbox
 *  - Strip ANSI/OSC before parsing; extract diagnostics for healer
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  CliAdapter, PreparedInvocation, ExecutionArtifact,
  RunContext, AdapterHealth,
  ManifestTaskV2, TaskResultV2, ParserFailure,
} from "agent-threader";
import {
  parseTaskResultFromString,
  stripTermEscapes, hasVisibleContent,
  extractDiagnosticLines,
  sanitizeSentinels,
} from "agent-threader";

export class MyAdapter implements CliAdapter {
  id = "my-agent";
  capabilities = {
    stdinPrompt: false,
    argPrompt: true,
    pty: false,
    interactive: false,
  };

  prepare(task: ManifestTaskV2, ctx: RunContext): PreparedInvocation {
    const taskDir = path.join(ctx.repoRoot, "workspaces", task.id);
    mkdirSync(taskDir, { recursive: true });

    return {
      cwd: taskDir,
      argv: ["my-agent-cli", "run", "--verbose", \`Task: \${task.id}\`],
      timeoutSec: task.timeout_sec,
      scope: "task",
    };
  }

  async execute(invocation: PreparedInvocation, ctx: RunContext): Promise<ExecutionArtifact> {
    const startedAt = new Date().toISOString();
    mkdirSync(ctx.logsDir, { recursive: true });
    const logPath = path.join(ctx.logsDir, \`\${Date.now()}.log\`);

    return new Promise((resolve) => {
      const [cmd, ...args] = invocation.argv;
      const proc = spawn(cmd, args, {
        cwd: invocation.cwd,
        env: { ...process.env, ...invocation.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        for (const line of text.split("\\n")) {
          if (hasVisibleContent(line)) {
            process.stdout.write(\`[AGENT] \${stripTermEscapes(line)}\\n\`);
          }
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timeout = setTimeout(() => proc.kill("SIGTERM"), invocation.timeoutSec * 1000);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        const finishedAt = new Date().toISOString();
        const combined = stdout + "\\n" + stderr;
        const diagnostics = extractDiagnosticLines(combined);
        const sanitizedDiagnostics = sanitizeSentinels(diagnostics.diagnosticText);

        writeFileSync(logPath, combined, "utf8");

        resolve({
          logPath,
          exitCode: code,
          startedAt,
          finishedAt,
          lastLogTail: sanitizedDiagnostics,
          durationMs: Date.now() - new Date(startedAt).getTime(),
        });
      });
    });
  }

  async executeSingle(
    prompt: string,
    _invocation: PreparedInvocation,
    ctx: RunContext,
  ): Promise<ExecutionArtifact> {
    const projectInvocation: PreparedInvocation = {
      cwd: ctx.repoRoot,
      argv: ["my-agent-cli", "run", "--verbose", prompt],
      timeoutSec: 120,
      scope: "project",
    };
    return this.execute(projectInvocation, ctx);
  }

  async extractResult(
    artifact: ExecutionArtifact,
    _ctx: RunContext,
  ): Promise<TaskResultV2 | ParserFailure> {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(artifact.logPath, "utf8");
    return parseTaskResultFromString(raw);
  }

  async healthcheck(_ctx: RunContext): Promise<AdapterHealth> {
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("my-agent-cli", ["--version"], {
        encoding: "utf8",
        timeout: 5000,
      });
      if (result.status === 0) {
        return { ready: true, details: [\`my-agent-cli \${result.stdout.trim()}\`] };
      }
      return { ready: false, details: [\`Exit code \${result.status}: \${result.stderr}\`] };
    } catch (e) {
      return { ready: false, details: [e instanceof Error ? e.message : String(e)] };
    }
  }
}
`,
  "src/orchestrator.ts": `/**
 * Template orchestrator wiring all AgentThreader primitives.
 *
 * Every pattern here comes from a real production failure.
 * Run \`agent-threader explain <code>\` for details on any error code.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  validateManifest,
  loadState, writeState, initializeState, computeManifestDigest,
  buildDependencyOrder, getReadyTasks, isTerminalStatus, isRunComplete,
  growBatchSize, shrinkBatchSize, computeEffectiveWindowSize,
  isHealableFailure, computeFailureRate, shouldHeal,
  checkConvergence, shouldEscalateTask, shouldAbortRun,
  runPool, CheckpointMutex,
  reconcileState, resetForRetry,
  acquireLock, releaseLock,
  extractDiagnosticLines,
  killOrphanedProcesses,
  parseTaskResultFromString, isParserFailure, generateFailureSignature,
  DEFAULT_POLICY,
  type ManifestV2, type StateV2, type RunPolicy,
} from "agent-threader";
import { MyAdapter } from "./my-adapter.js";

// ── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) { flags.set(key, next); i++; }
    else { flags.set(key, "true"); }
  }
}

// ── Kill Mode ───────────────────────────────────────────────────────────────

if (flags.has("kill")) {
  console.log("Searching for orphaned processes...");
  const result = killOrphanedProcesses();
  for (const k of result.killed) console.log(\`  Killed PID \${k.pid} (\${k.pattern}): \${k.command}\`);
  if (result.killed.length === 0) console.log("  No orphaned processes found.");
  for (const e of result.errors) console.error(\`  Error: \${e}\`);
  process.exit(0);
}

// ── Config ──────────────────────────────────────────────────────────────────

const manifestPath = flags.get("manifest") ?? "manifest.json";
const stateDir = flags.get("state-dir") ?? "state";
const statePath = path.join(stateDir, "state.json");
const logsDir = path.join(stateDir, "logs");
const concurrency = Number.parseInt(flags.get("concurrency") ?? "1", 10);

// ── Lockfile ────────────────────────────────────────────────────────────────

const lockResult = acquireLock(stateDir);
if (!lockResult.acquired) {
  console.error(\`Another orchestrator is running (PID \${lockResult.existingPid}). Kill it first with --kill or use --force.\`);
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
  for (const issue of validation.issues) console.error(\`  [\${issue.severity}] \${issue.message}\`);
  process.exit(1);
}
const manifest = manifestRaw;

// ── State ───────────────────────────────────────────────────────────────────

let state: StateV2;
if (existsSync(statePath)) {
  state = loadState(statePath);
  console.log(\`Loaded existing state: \${Object.keys(state.tasks).length} tasks\`);
} else {
  const policy: RunPolicy = { ...DEFAULT_POLICY, concurrency };
  state = initializeState(manifest, policy);
  mkdirSync(stateDir, { recursive: true });
  writeState(statePath, state);
  console.log(\`Initialized new state: \${manifest.tasks.length} tasks\`);
}

// ── Reset Mode ──────────────────────────────────────────────────────────────

if (flags.has("reset-failed")) {
  const result = resetForRetry(state);
  writeState(statePath, state);
  console.log("Reset for retry:");
  for (const r of result.repairs) console.log(\`  \${r}\`);
  releaseLock(stateDir);
  process.exit(0);
}

// ── Reconcile ───────────────────────────────────────────────────────────────

const pendingTasks = manifest.tasks.filter((t) => {
  const ts = state.tasks[t.id];
  return ts && (ts.status === "PENDING" || ts.status === "FAILED");
});
const reconciliation = reconcileState(state, pendingTasks.length);
if (reconciliation.repaired) {
  console.log("State reconciliation:");
  for (const r of reconciliation.repairs) console.log(\`  \${r}\`);
  writeState(statePath, state);
}

// ── Schedule ────────────────────────────────────────────────────────────────

const depOrder = buildDependencyOrder(manifest.tasks);
if (depOrder.hasCycle) {
  console.error(\`Dependency cycle detected: \${depOrder.cycleMembers.join(", ")}\`);
  releaseLock(stateDir); process.exit(1);
}

// ── Adapter + Mutex ─────────────────────────────────────────────────────────

const adapter = new MyAdapter();
const mutex = new CheckpointMutex();
const ctx = {
  repoRoot: process.cwd(),
  logsDir,
  sharedContextPaths: [] as string[],
  contractHints: new Map<string, string[]>(),
  policy: state.policy,
};

async function checkpoint(): Promise<void> {
  await mutex.run(async () => { writeState(statePath, state); });
}

// ── Execute Task ────────────────────────────────────────────────────────────

async function executeTask(taskId: string): Promise<void> {
  const task = manifest.tasks.find((t) => t.id === taskId)!;
  const ts = state.tasks[taskId];
  if (!ts) return;

  ts.status = "RUNNING";
  ts.worker_attempts++;
  await checkpoint();
  console.log(\`[\${taskId}] Starting (attempt \${ts.worker_attempts})...\`);

  try {
    const invocation = adapter.prepare(task, ctx);
    const artifact = await adapter.execute(invocation, ctx);
    ts.last_log_tail = artifact.lastLogTail ?? null;
    const result = await adapter.extractResult(artifact, ctx);

    if (isParserFailure(result)) {
      ts.status = "FAILED";
      ts.last_failure_class = "contract_error";
      ts.last_failure_signature = generateFailureSignature("contract_error", result.message);
      ts.history.push({
        task_id: taskId, phase: "worker", attempt_number: ts.worker_attempts,
        log_path: artifact.logPath, exit_code: artifact.exitCode,
        failure_class: "contract_error", failure_signature: ts.last_failure_signature,
        duration_sec: artifact.durationMs ? artifact.durationMs / 1000 : null,
        timestamp: new Date().toISOString(),
      });
      if (artifact.lastLogTail) {
        const diag = extractDiagnosticLines(artifact.lastLogTail);
        if (diag.hasTransientErrors) {
          ts.last_failure_class = "transient_infra";
          console.log(\`[\${taskId}] Transient error detected: \${diag.transientPatterns.join(", ")}\`);
        }
      }
    } else {
      ts.status = result.status === "DONE" ? "DONE" : result.status === "BLOCKED" ? "BLOCKED" : "FAILED";
      if (ts.status === "FAILED") ts.last_failure_class = result.failure_class ?? "unknown";
      ts.history.push({
        task_id: taskId, phase: "worker", attempt_number: ts.worker_attempts,
        log_path: artifact.logPath, exit_code: artifact.exitCode,
        failure_class: result.status === "DONE" ? null : (result.failure_class ?? null),
        failure_signature: null,
        duration_sec: artifact.durationMs ? artifact.durationMs / 1000 : null,
        timestamp: new Date().toISOString(),
      });
    }
    console.log(\`[\${taskId}] \${ts.status} (\${artifact.durationMs ?? 0}ms)\`);
  } catch (e) {
    ts.status = "FAILED";
    ts.last_failure_class = "transient_infra";
    ts.last_failure_signature = generateFailureSignature("transient_infra", e instanceof Error ? e.message : String(e));
    console.error(\`[\${taskId}] Crashed: \${e instanceof Error ? e.message : String(e)}\`);
  }
  await checkpoint();
}

// ── Main Loop ───────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const eff = concurrency > 0 ? concurrency : (state.policy.concurrency || 1);
  let batchSize = state.policy.current_batch_size;
  console.log(\`Starting run: \${pendingTasks.length} pending, concurrency=\${eff}\`);

  while (!isRunComplete(state.tasks)) {
    const ready = getReadyTasks(manifest.tasks, state.tasks, depOrder.order);
    if (ready.length === 0) break;
    const windowSize = computeEffectiveWindowSize(batchSize, ready.length);
    const window = ready.slice(0, windowSize);
    console.log(\`\\nBatch: \${window.length} tasks (size=\${batchSize})\`);

    await runPool(window, eff, (taskId) => executeTask(taskId));

    const outcome = { windowTaskIds: window, taskStates: state.tasks };
    const fr = computeFailureRate(outcome);

    if (fr.rate === 0) {
      const g = growBatchSize(state.policy);
      batchSize = g.nextBatchSize;
      state.policy.current_batch_size = batchSize;
    } else {
      const hr = shouldHeal({ windowOutcome: outcome, policy: state.policy, healingRounds: state.healing_rounds });
      if (hr.shouldAbort) { state.run_status = "ABORTED"; state.abort_reason = hr.reason; break; }
      if (hr.shouldShrink) { const s = shrinkBatchSize(state.policy); batchSize = s.nextBatchSize; state.policy.current_batch_size = batchSize; }
      for (const tid of window) {
        const ts = state.tasks[tid];
        if (ts.status === "FAILED") { const e = shouldEscalateTask(ts, state.policy); if (e.escalate) { ts.status = "ESCALATED"; } }
      }
      const ab = shouldAbortRun(state.policy, state.healing_rounds, state.tasks);
      if (ab.abort) { state.run_status = "ABORTED"; state.abort_reason = ab.reason; break; }
    }
    await checkpoint();
  }

  if (state.run_status !== "ABORTED") state.run_status = "COMPLETED";
  await checkpoint();

  const counts = { done: 0, failed: 0, escalated: 0, blocked: 0 };
  for (const ts of Object.values(state.tasks)) {
    if (ts.status === "DONE") counts.done++;
    else if (ts.status === "FAILED") counts.failed++;
    else if (ts.status === "ESCALATED") counts.escalated++;
    else if (ts.status === "BLOCKED") counts.blocked++;
  }
  console.log(\`\\nRun \${state.run_status}: \${counts.done} done, \${counts.failed} failed, \${counts.escalated} escalated, \${counts.blocked} blocked\`);
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); }).finally(() => releaseLock(stateDir));
`,
  "test/contracts.test.mjs": `import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("task prompt includes required sentinel fences", () => {
  const taskPrompt = readFileSync("prompts/task.md", "utf8");
  assert.match(taskPrompt, /<<<TASK_RESULT_V2>>>/);
  assert.match(taskPrompt, /<<<END_TASK_RESULT_V2>>>/);
  assert.match(taskPrompt, /\{\{TASK_ID\}\}/);
  assert.match(taskPrompt, /\{\{CONTEXT\}\}/);
});

test("healer prompt includes required sentinel fences", () => {
  const healerPrompt = readFileSync("prompts/healer.md", "utf8");
  assert.match(healerPrompt, /<<<HEAL_DECISION_V2>>>/);
  assert.match(healerPrompt, /<<<END_HEAL_DECISION_V2>>>/);
  assert.match(healerPrompt, /\{\{FAILED_SUMMARIES\}\}/);
  assert.match(healerPrompt, /\{\{LOG_TAILS\}\}/);
});

test("manifest tasks reference prompts and verify profiles", () => {
  const manifest = readJson("manifest.json");
  assert.equal(manifest.manifest_version, "2.0");
  assert.ok(Array.isArray(manifest.tasks));
  assert.ok(manifest.tasks.length > 0);

  for (const task of manifest.tasks) {
    assert.equal(typeof task.id, "string");
    assert.equal(typeof task.prompt_ref, "string");
    assert.equal(typeof task.verify_profile, "string");
    assert.match(task.prompt_ref, /^prompts\//);
  }
});

test("verify profiles define at least one step", () => {
  const verifyProfiles = readJson("verify-profiles.json");
  assert.ok(verifyProfiles.profiles);
  assert.ok(verifyProfiles.profiles.default);
  assert.ok(Array.isArray(verifyProfiles.profiles.default.steps));
  assert.ok(verifyProfiles.profiles.default.steps.length > 0);
});
`,
  "README.md": `# {{PROJECT_NAME}}

Orchestrator project built with [AgentThreader](https://github.com/barretts/AgentThreader).

## Quick Start

\`\`\`bash
npm install
npx tsx src/orchestrator.ts --manifest manifest.json
\`\`\`

## Commands

\`\`\`bash
npm start                    # Run the orchestrator
npm run kill                 # Kill orphaned processes
npm run reset                # Reset failed tasks for retry
npm run status               # Show run status
npm test                     # Validate scaffold contracts
\`\`\`

## TDD Workflow

1. Start by adding or updating tests for the behavior you want.
2. Run \`npm test\` and confirm the new check fails for the intended reason.
3. Implement the smallest change that makes the test pass.
4. Re-run \`npm test\` before running full orchestration.

## Structure

- \`manifest.json\` -- Task definitions, dependencies, timeouts
- \`verify-profiles.json\` -- Verification steps (lint, test) run after each task
- \`prompts/\` -- Prompt templates for workers and healer
- \`src/my-adapter.ts\` -- CLI adapter (customize for your agent)
- \`src/orchestrator.ts\` -- Main orchestrator loop
- \`test/contracts.test.mjs\` -- Scaffold contract checks for prompts and config
- \`state/\` -- Runtime state and logs (created on first run)

## Customization

1. Replace \`my-agent-cli\` in \`src/my-adapter.ts\` with your agent CLI
2. Edit \`manifest.json\` to define your tasks
3. Write prompts in \`prompts/\`
4. Add verify profiles for your verification steps
`,
};

/**
 * Scaffold a new orchestrator project.
 */
export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  const targetDir = path.resolve(options.targetDir);
  const projectName = options.projectName ?? path.basename(targetDir);
  const force = options.force ?? false;

  const filesCreated: string[] = [];
  const skipped: string[] = [];

  for (const [relPath, template] of Object.entries(BOILERPLATE_FILES)) {
    const fullPath = path.join(targetDir, relPath);
    const dir = path.dirname(fullPath);

    mkdirSync(dir, { recursive: true });

    if (existsSync(fullPath) && !force) {
      skipped.push(relPath);
      continue;
    }

    const content = template.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    writeFileSync(fullPath, content, "utf8");
    filesCreated.push(relPath);
  }

  return { targetDir, projectName, filesCreated, skipped };
}
