// ─── Adapter Interface ───────────────────────────────────────────────────────

import type { ManifestTaskV2, TaskResultV2, ParserFailure } from "../contracts/types.js";
import type { RunPolicy } from "../state/types.js";

export interface PreparedInvocation {
  cwd: string;
  argv: string[];
  env?: Record<string, string>;
  stdin?: string | null;
  timeoutSec: number;
}

export interface ExecutionArtifact {
  logPath: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
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
  extractResult(
    artifact: ExecutionArtifact,
    ctx: RunContext,
  ): Promise<TaskResultV2 | ParserFailure>;
  healthcheck(ctx: RunContext): Promise<AdapterHealth>;
}
