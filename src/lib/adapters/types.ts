// ─── Adapter Interface ───────────────────────────────────────────────────────

import type { ManifestTaskV2, TaskResultV2, ParserFailure } from "../contracts/types.js";
import type { RunPolicy } from "../state/types.js";

export interface PreparedInvocation {
  cwd: string;
  argv: string[];
  env?: Record<string, string>;
  stdin?: string | null;
  timeoutSec: number;
  /** Whether this invocation is task-scoped (sandboxed) or project-scoped (full context). */
  scope?: "task" | "project";
}

export interface ExecutionArtifact {
  logPath: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
  /** Extracted diagnostic lines from raw output for healer visibility. */
  lastLogTail?: string;
  /** Duration in milliseconds. */
  durationMs?: number;
}

export interface AdapterHealth {
  ready: boolean;
  details: string[];
}

export interface RunContext {
  repoRoot: string;
  logsDir: string;
  sharedContextPaths: string[];
  contractHints: Map<string, string[]>;
  policy: RunPolicy;
}

export interface CliAdapter {
  id: string;
  capabilities: {
    stdinPrompt: boolean;
    argPrompt: boolean;
    pty: boolean;
    interactive: boolean;
  };
  prepare(task: ManifestTaskV2, ctx: RunContext): PreparedInvocation;
  execute(
    invocation: PreparedInvocation,
    ctx: RunContext,
  ): Promise<ExecutionArtifact>;
  /**
   * Single-prompt execution path for healer and diagnostic invocations.
   * Must NOT go through the multi-step pipeline -- the healer needs
   * project-wide context, not a task sandbox.
   *
   * Lesson: crush-pipeline-four-output-bugs-high (issue 3)
   * Lesson: healer-cwd-wrong-directory-medium
   */
  executeSingle?(
    prompt: string,
    invocation: PreparedInvocation,
    ctx: RunContext,
  ): Promise<ExecutionArtifact>;
  extractResult(
    artifact: ExecutionArtifact,
    ctx: RunContext,
  ): Promise<TaskResultV2 | ParserFailure>;
  healthcheck(ctx: RunContext): Promise<AdapterHealth>;
}
