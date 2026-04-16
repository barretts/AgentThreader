/**
 * CLI adapter for this orchestrator.
 *
 * RECOMMENDED PATH: `createClrAdapter` below delegates PTY interaction,
 * state-machine-driven prompting, and output parsing to the
 * `cli-runner-learner` package. All learned lessons (crush prompt
 * delivery, cwd scoping, yolo-flag traps, thinking indicators, sentinel
 * poisoning) ship inside the CLR profile + the AT preset. New findings
 * arrive via a CLR version bump; this file does not change.
 *
 * FALLBACK PATH: if you need bespoke behavior -- custom logging, a
 * non-CLR runtime, or a CLI that CLR doesn't yet have a profile for --
 * implement `CliAdapter` yourself. The `MyAdapter` class below shows
 * the interface; delete it or keep it as a reference.
 *
 * To install CLR (optional peer dependency):
 *   npm install cli-runner-learner
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
  createClrAdapter,
} from "agent-threader";

// ─── Recommended: delegate to cli-runner-learner ────────────────────────────
//
// Pick a preset (claude | crush | cursor) that matches your target CLI.
// Override `profileId` if you've learned a custom profile via
// `clr learn --tool <id>`. Override `buildPrompt` to pull from your own
// prompt files, task metadata, or shared-context registry.
export const adapter: CliAdapter = createClrAdapter({
  presetId: "crush",
  // profileId: "my-custom-tool",
  // buildPrompt: (task, ctx) => readFileSync(path.join(ctx.repoRoot, task.prompt_ref), "utf8"),
});

// ─── Fallback example: hand-rolled CliAdapter ───────────────────────────────
//
// Keep for reference, or delete if you're going all-in on CLR.

export class MyAdapter implements CliAdapter {
  id = "my-agent";
  capabilities = {
    stdinPrompt: false,
    argPrompt: true,
    pty: false,
    interactive: false,
  };

  prepare(task: ManifestTaskV2, ctx: RunContext): PreparedInvocation {
    // Scope cwd to the task-specific directory (lesson: crush-cwd-scoped-to-patch-dir)
    const taskDir = path.join(ctx.repoRoot, "workspaces", task.id);
    mkdirSync(taskDir, { recursive: true });

    return {
      cwd: taskDir,
      argv: ["my-agent-cli", "run", "--verbose", `Task: ${task.id}`],
      timeoutSec: task.timeout_sec,
      scope: "task",
    };
  }

  async execute(invocation: PreparedInvocation, ctx: RunContext): Promise<ExecutionArtifact> {
    const startedAt = new Date().toISOString();
    mkdirSync(ctx.logsDir, { recursive: true });
    const logPath = path.join(ctx.logsDir, `${Date.now()}.log`);

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
        // Only log lines with visible content (lesson: ansi-ghost-lines)
        for (const line of text.split("\n")) {
          if (hasVisibleContent(line)) {
            process.stdout.write(`[AGENT] ${stripTermEscapes(line)}\n`);
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
        const combined = stdout + "\n" + stderr;

        // Extract diagnostics for healer visibility (lesson: healer-blind-to-agent-output)
        const diagnostics = extractDiagnosticLines(combined);

        // Sanitize any sentinel markers in supplementary output (lesson: session-transcript-sentinel-poisoning)
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

  // Single-prompt execution for healer (lesson: crush-pipeline-four-output-bugs issue 3)
  // Uses project root, not task sandbox (lesson: healer-cwd-wrong-directory)
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
        return { ready: true, details: [`my-agent-cli ${result.stdout.trim()}`] };
      }
      return { ready: false, details: [`Exit code ${result.status}: ${result.stderr}`] };
    } catch (e) {
      return { ready: false, details: [e instanceof Error ? e.message : String(e)] };
    }
  }
}
