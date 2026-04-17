/**
 * Bridge adapter: implements AgentThreader's {@link CliAdapter} by delegating
 * CLI interaction (PTY session, profile-driven state machine, output parsing)
 * to the `cli-runner-learner` package.
 *
 * This is the ONLY file in AgentThreader that imports `cli-runner-learner`.
 * All CLR-specific types cross the boundary here and get translated into
 * AgentThreader contracts. That keeps AT's `CliAdapter` interface,
 * `ManifestV2`, `TaskResultV2`, parser, state, healer, and scaffold
 * layers completely isolated from CLR's evolving internals.
 *
 * Dependency model:
 *   - `cli-runner-learner` is declared as an OPTIONAL peer dependency.
 *   - Imports are LAZY (`await import("cli-runner-learner")`) so AgentThreader
 *     can be consumed without pulling node-pty into the runtime closure.
 *   - If CLR is missing, methods throw an actionable error telling the user
 *     how to install it (local link, file:, or npm once published).
 *
 * Future CLR updates (new profile fields, new output adapter variants,
 * new DriveResult fields) propagate here by bumping the peer-dep range,
 * not by editing AgentThreader core.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  CliAdapter,
  PreparedInvocation,
  ExecutionArtifact,
  RunContext,
  AdapterHealth,
} from "./types.js";
import type {
  ManifestTaskV2,
  TaskResultV2,
  ParserFailure,
} from "../contracts/types.js";
import { buildArgv, getAdapterPreset, type AdapterPreset } from "./presets.js";

// Forward-declared CLR module surface. We type-only-import from
// `cli-runner-learner` lazily via runtime dynamic import, so AT can
// typecheck without the peer dep installed. If the user has CLR
// installed, these types resolve against its published `.d.ts`.
type ClrModule = typeof import("cli-runner-learner");
type DriveResult = Awaited<ReturnType<ClrModule["drive"]>>;
type ToolProfile = Parameters<ClrModule["drive"]>[0];

// ─── Options ─────────────────────────────────────────────────────────────────

export interface CreateClrAdapterOptions {
  /**
   * AT preset to use for argv construction, forbidden-flag checks,
   * noise filters, and healthcheck fallback. Optional -- if omitted,
   * the adapter relies entirely on the CLR profile.
   */
  presetId?: "claude" | "crush" | "cursor" | string;

  /**
   * CLR tool profile ID. Defaults to `presetId`. Used to call
   * CLR's `loadProfile(id)` which reads from its bundled profiles/.
   */
  profileId?: string;

  /**
   * Explicit ToolProfile object, overrides `profileId`. Useful for
   * tests and for users bundling their own profile files.
   */
  profile?: ToolProfile;

  /**
   * Override how prompts are delivered to the tool. Defaults to the
   * preset's `promptDelivery`. `"input"` maps to CLR's interactive
   * mode (input sent after settle); `"arg"` maps to args mode
   * (appended to argv).
   */
  promptMode?: "input" | "arg";

  /**
   * Optional prompt-builder. Receives the task and RunContext, returns
   * the user-visible prompt string. Defaults to reading `prompt_ref`
   * from the shared-context paths if it looks like a file path,
   * otherwise uses it verbatim.
   */
  buildPrompt?: (task: ManifestTaskV2, ctx: RunContext) => string;

  /**
   * Settle timeout in ms. Defaults to the CLR profile's
   * `timing.idle_threshold_sec * 1000`, or 3000ms.
   */
  settleTimeoutMs?: number;

  /**
   * Override the CLR module resolver. Tests inject a mock here.
   * Production code should leave this undefined so the real
   * `cli-runner-learner` module is loaded lazily.
   */
  loadClr?: () => Promise<ClrModule>;
}

// ─── Public factory ─────────────────────────────────────────────────────────

export function createClrAdapter(options: CreateClrAdapterOptions = {}): ClrCliAdapter {
  return new ClrCliAdapter(options);
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class ClrCliAdapter implements CliAdapter {
  readonly id: string;
  readonly capabilities: CliAdapter["capabilities"];

  private readonly options: CreateClrAdapterOptions;
  private readonly preset?: AdapterPreset;
  /** Map from artifact.logPath -> stored DriveResult JSON (serialized on disk). */
  private readonly sidecarSuffix = ".cliresult.json";

  constructor(options: CreateClrAdapterOptions = {}) {
    this.options = options;
    this.preset = options.presetId ? getAdapterPreset(options.presetId) : undefined;
    this.id = options.presetId ?? options.profileId ?? "clr";

    const argPrompt =
      options.promptMode === "arg" ||
      (options.promptMode === undefined && this.preset?.promptDelivery === "positional-arg");
    this.capabilities = {
      stdinPrompt: !argPrompt && this.preset?.promptDelivery === "stdin",
      argPrompt,
      pty: true,       // CLR's Session always uses node-pty
      interactive: !argPrompt,
    };
  }

  // ─── CliAdapter.prepare ──────────────────────────────────────────────────

  prepare(task: ManifestTaskV2, ctx: RunContext): PreparedInvocation {
    // Scope cwd to a per-task sandbox (lesson: crush-cwd-scoped-to-patch-dir).
    const taskDir = path.join(ctx.repoRoot, "workspaces", task.id);
    mkdirSync(taskDir, { recursive: true });

    const prompt = this.resolvePrompt(task, ctx);

    // If a preset is available, construct argv from it; otherwise leave argv
    // to be populated from the CLR profile at execute() time.
    let argv: string[];
    let stdin: string | null = null;
    if (this.preset) {
      const built = buildArgv(this.preset, prompt, {
        cwd: taskDir,
      });
      argv = [this.preset.command, ...built.argv];
      stdin = built.stdin;
    } else {
      // Profile-only: argv[0] is a placeholder filled from profile at execute.
      argv = ["__from_profile__", prompt];
    }

    return {
      cwd: taskDir,
      argv,
      stdin,
      timeoutSec: task.timeout_sec,
      scope: "task",
    };
  }

  // ─── CliAdapter.execute ──────────────────────────────────────────────────

  async execute(
    invocation: PreparedInvocation,
    ctx: RunContext,
  ): Promise<ExecutionArtifact> {
    const clr = await this.loadClr();
    const profile = await this.resolveProfile(clr);

    // Derive the prompt back out of the invocation so we don't re-read the
    // task prompt. For arg-mode presets, the prompt is the last positional.
    // For stdin-mode presets, it's invocation.stdin.
    const prompt = this.extractPromptFromInvocation(invocation);

    const settleMs =
      this.options.settleTimeoutMs ??
      (profile.timing?.idle_threshold_sec ? profile.timing.idle_threshold_sec * 1000 : 3000);
    const maxMs = invocation.timeoutSec * 1000;

    const startedAt = new Date().toISOString();
    mkdirSync(ctx.logsDir, { recursive: true });
    const logPath = path.join(ctx.logsDir, `${Date.now()}-${this.id}.log`);

    let driveResult: DriveResult;
    try {
      driveResult = await clr.drive(profile, {
        input: prompt,
        max_session_ms: maxMs,
        settle_timeout_ms: settleMs,
        workDir: invocation.cwd,
        llmClient: null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const finishedAt = new Date().toISOString();
      writeFileSync(logPath, `clr.drive() threw: ${message}\n`, "utf8");
      return {
        logPath,
        exitCode: 1,
        startedAt,
        finishedAt,
        lastLogTail: message,
        durationMs: Date.now() - new Date(startedAt).getTime(),
      };
    }

    const finishedAt = new Date().toISOString();
    writeFileSync(logPath, driveResult.output, "utf8");
    // Stash the full DriveResult next to the log so extractResult can
    // consume it without threading state through the adapter instance.
    writeFileSync(logPath + this.sidecarSuffix, JSON.stringify(driveResult), "utf8");

    return {
      logPath,
      exitCode: driveResult.success ? 0 : 1,
      startedAt,
      finishedAt,
      lastLogTail: tailString(driveResult.output, 2000),
      durationMs: driveResult.duration_ms,
    };
  }

  // ─── CliAdapter.executeSingle (healer path) ──────────────────────────────

  async executeSingle(
    prompt: string,
    _invocation: PreparedInvocation,
    ctx: RunContext,
  ): Promise<ExecutionArtifact> {
    // Healer runs at PROJECT ROOT, not task sandbox
    // (lesson: healer-cwd-wrong-directory).
    const projectInvocation: PreparedInvocation = {
      cwd: ctx.repoRoot,
      argv: this.preset
        ? [this.preset.command, ...buildArgv(this.preset, prompt, { cwd: ctx.repoRoot }).argv]
        : ["__from_profile__", prompt],
      stdin: this.preset?.promptDelivery === "stdin" ? prompt : null,
      timeoutSec: 120,
      scope: "project",
    };
    return this.execute(projectInvocation, ctx);
  }

  // ─── CliAdapter.extractResult ────────────────────────────────────────────

  async extractResult(
    artifact: ExecutionArtifact,
    _ctx: RunContext,
  ): Promise<TaskResultV2 | ParserFailure> {
    const sidecarPath = artifact.logPath + this.sidecarSuffix;
    let driveResult: DriveResult;
    try {
      driveResult = JSON.parse(readFileSync(sidecarPath, "utf8")) as DriveResult;
    } catch (e) {
      return {
        ok: false,
        code: "NO_SENTINEL",
        message: `Failed to read DriveResult sidecar at ${sidecarPath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }

    const clr = await this.loadClr();
    const profile = await this.resolveProfile(clr);

    // Use CLR's output-adapter selection based on the profile's interaction_mode.
    // Wrap in a minimal ClrTaskDef so the adapter can populate task_id.
    const clrTask = {
      id: this.id + "-task",
      tool_id: profile.tool_id,
      input: "", // unused by output adapters
      depends_on: [],
      timeout_sec: 0,
    };
    const outputAdapter = clr.selectAdapter(profile, clrTask);
    const clrResult = await outputAdapter.extractResult(driveResult, clrTask, profile);

    if (clr.isClrParserFailure(clrResult)) {
      return {
        ok: false,
        code: clrResult.kind === "invalid_json" ? "INVALID_JSON" : "NO_SENTINEL",
        message: clrResult.error,
      };
    }

    return translateClrResult(clrResult, driveResult);
  }

  // ─── CliAdapter.healthcheck ──────────────────────────────────────────────

  async healthcheck(_ctx: RunContext): Promise<AdapterHealth> {
    try {
      const clr = await this.loadClr();
      const profile = await this.resolveProfile(clr);
      const { spawnSync } = await import("node:child_process");
      const args = this.preset?.healthcheckArgs ?? ["--version"];
      const result = spawnSync(profile.tool_command, args, {
        encoding: "utf8",
        timeout: this.preset?.healthcheckTimeoutMs ?? 10_000,
      });
      if (result.status === 0) {
        return {
          ready: true,
          details: [`${profile.tool_command} ${result.stdout.trim() || "ok"}`],
        };
      }
      return {
        ready: false,
        details: [`Exit code ${result.status}: ${result.stderr || result.stdout || "no output"}`],
      };
    } catch (e) {
      return { ready: false, details: [e instanceof Error ? e.message : String(e)] };
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async loadClr(): Promise<ClrModule> {
    try {
      if (this.options.loadClr) return await this.options.loadClr();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await import("cli-runner-learner" as any)) as ClrModule;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        [
          "cli-runner-learner is not installed or failed to load.",
          "Install it as a peer dependency:",
          "  npm install cli-runner-learner                     (once published)",
          "  npm install file:../cli-runner-learner             (local checkout)",
          "  npm link cli-runner-learner                        (dev linkage)",
          `Underlying error: ${msg}`,
        ].join("\n"),
      );
    }
  }

  private async resolveProfile(clr: ClrModule): Promise<ToolProfile> {
    if (this.options.profile) return this.options.profile;
    const id = this.options.profileId ?? this.options.presetId;
    if (!id) {
      throw new Error(
        "ClrCliAdapter: either `profile`, `profileId`, or `presetId` must be supplied.",
      );
    }
    const profile = await clr.loadProfile(id);
    if (!profile) {
      throw new Error(
        `No CLR profile found for "${id}". Run \`clr learn --tool ${id} --command <path>\` first, ` +
          "or pass an explicit `profile` in CreateClrAdapterOptions.",
      );
    }
    return profile;
  }

  private resolvePrompt(task: ManifestTaskV2, ctx: RunContext): string {
    if (this.options.buildPrompt) return this.options.buildPrompt(task, ctx);
    // If prompt_ref points to an on-disk file in sharedContextPaths, read it;
    // otherwise treat prompt_ref as the literal prompt.
    const ref = task.prompt_ref;
    if (ref && (ref.includes("/") || ref.endsWith(".md") || ref.endsWith(".txt"))) {
      const candidates = [
        ref,
        path.join(ctx.repoRoot, ref),
        ...ctx.sharedContextPaths.map((p) => path.join(p, ref)),
      ];
      for (const c of candidates) {
        try {
          return readFileSync(c, "utf8");
        } catch {
          // try next candidate
        }
      }
    }
    return ref ?? `Task: ${task.id}`;
  }

  private extractPromptFromInvocation(invocation: PreparedInvocation): string {
    if (invocation.stdin) return invocation.stdin;
    // Last positional arg is the prompt (our prepare() always appends it last
    // via buildArgv for positional-arg and flag modes).
    return invocation.argv[invocation.argv.length - 1] ?? "";
  }
}

// ─── Result translation ─────────────────────────────────────────────────────

function translateClrResult(
  clrResult: { status: string; task_id: string; output: string; summary?: string; failure_class?: string },
  driveResult: DriveResult,
): TaskResultV2 {
  const status =
    clrResult.status === "DONE"
      ? "DONE"
      : clrResult.status === "BLOCKED"
        ? "BLOCKED"
        : "FAILED";
  return {
    contract_version: "2.0",
    task_id: clrResult.task_id,
    status,
    summary: clrResult.summary ?? tailString(clrResult.output, 500),
    evidence: {
      notes: [
        `final_state=${driveResult.final_state}`,
        `duration_ms=${driveResult.duration_ms}`,
        driveResult.transcript_path ? `transcript=${driveResult.transcript_path}` : "",
      ].filter(Boolean),
    },
    failure_class: clrResult.failure_class,
  };
}

function tailString(s: string, n: number): string {
  return s.length <= n ? s : s.slice(-n);
}
