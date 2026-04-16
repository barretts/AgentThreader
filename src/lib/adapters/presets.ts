/**
 * Adapter presets: production-learned CLI invocation knowledge for each agent.
 *
 * Every field here was discovered through real failures documented in lessons/.
 * Users can override any value, but the defaults encode all known gotchas.
 */

export interface AdapterPreset {
  /** Human-readable adapter name. */
  id: string;
  /** The CLI binary name. */
  command: string;
  /** How to pass the prompt to the CLI. */
  promptDelivery: "stdin" | "positional-arg" | "flag";
  /** If promptDelivery is "flag", which flag. */
  promptFlag?: string;
  /** Default CLI arguments for task execution. */
  defaultArgs: string[];
  /** Arguments that are INVALID and must NOT be used. */
  forbiddenArgs: string[];
  /** Healthcheck command (typically --version). */
  healthcheckArgs: string[];
  /** Healthcheck timeout in ms. */
  healthcheckTimeoutMs: number;
  /** Whether stdin should be set to "ignore" (no pipe). */
  stdinIgnore: boolean;
  /** Whether the CLI hides tool calls from stdout. */
  toolCallsHiddenInStdout: boolean;
  /** Command to extract session transcript (if tool calls are hidden). */
  sessionShowCommand?: string[];
  /** Regex to extract session ID from stderr (after ANSI stripping). */
  sessionIdPattern?: RegExp;
  /** Flag to continue an existing session. */
  sessionContinueFlag?: string;
  /** Known non-actionable stderr patterns to filter from terminal output. */
  noisePatterns: RegExp[];
  /** Whether line buffering is needed (token-by-token streaming). */
  needsLineBuffering: boolean;
  /** Maximum turns to allow per invocation. */
  maxTurns?: number;
  /** Timeout escalation: SIGTERM first, then SIGKILL after this delay (ms). */
  sigkillDelayMs: number;
  /** Known transient error patterns that warrant retry. */
  transientErrorPatterns: RegExp[];
  /** Gotchas and notes for adapter implementors. */
  notes: string[];
}

/**
 * Claude Code CLI adapter preset.
 *
 * Lessons applied:
 *  - pty-debug-mode-for-tui-agents-medium
 */
export const CLAUDE_PRESET: AdapterPreset = {
  id: "claude",
  command: "claude",
  promptDelivery: "stdin",
  defaultArgs: [
    "--print",
    "--output-format", "text",
    "--dangerously-skip-permissions",
    "--verbose",
    "--max-turns", "50",
  ],
  forbiddenArgs: [],
  healthcheckArgs: ["--version"],
  healthcheckTimeoutMs: 10_000,
  stdinIgnore: false,
  toolCallsHiddenInStdout: false,
  needsLineBuffering: false,
  maxTurns: 50,
  sigkillDelayMs: 5_000,
  transientErrorPatterns: [
    /stream error/i,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /429/,
    /rate limit/i,
    /too many requests/i,
    /gateway timeout/i,
    /502|503|504/,
  ],
  noisePatterns: [],
  notes: [
    "Prompt goes via stdin pipe: proc.stdin.write(prompt); proc.stdin.end()",
    "--print mode outputs final text to stdout; tool calls are visible inline",
    "--dangerously-skip-permissions is the equivalent of --yolo for non-interactive use",
    "--output-format text gives clean text; use 'json' for structured output",
    "--max-turns 50 prevents runaway loops; adjust per task complexity",
    "--add-dir /tmp can be useful for temp file access",
    "PTY wrapping (/usr/bin/script -q -F /dev/null) for TUI debug output",
  ],
};

/**
 * Crush CLI adapter preset.
 *
 * Lessons applied:
 *  - crush-yolo-flag-not-on-run-high
 *  - crush-prompt-not-from-stdin-high
 *  - crush-debug-flag-gives-thinking-medium
 *  - crush-cwd-scoped-to-patch-dir-medium
 *  - crush-session-persistence-across-steps-medium
 *  - crush-stdout-missing-tool-calls-high
 *  - crush-pipeline-four-output-bugs-high
 *  - healer-cwd-wrong-directory-medium
 *  - osc-escape-sequences-bypass-ansi-filter-medium
 *  - ansi-ghost-lines-in-pty-output-low
 *  - session-transcript-sentinel-poisoning-critical
 */
export const CRUSH_PRESET: AdapterPreset = {
  id: "crush",
  command: "crush",
  promptDelivery: "positional-arg",
  defaultArgs: [
    "run",
    "--verbose",
    "--debug",
  ],
  forbiddenArgs: [
    "--yolo",  // Global flag, not valid on `run` subcommand. Causes instant 100% failure.
  ],
  healthcheckArgs: ["--version"],
  healthcheckTimeoutMs: 10_000,
  stdinIgnore: true,  // stdin must be "ignore"; crush does NOT read prompts from stdin pipe
  toolCallsHiddenInStdout: true,  // Tool calls only in session store, not stdout
  sessionShowCommand: ["crush", "session", "show"],  // + <sessionId> --json
  sessionIdPattern: /session_id=([0-9a-f-]{36})/,
  sessionContinueFlag: "--session",
  needsLineBuffering: true,  // Token-by-token streaming with OSC separators
  sigkillDelayMs: 5_000,
  transientErrorPatterns: [
    /stream error/i,
    /NO_ERROR; received from peer/i,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /connection refused/i,
    /upstream connect error/i,
  ],
  noisePatterns: [
    /Failed to walk skills path/,
    /Error generating title with small model/,
    /localhost:8000/,
    /Running in non-interactive mode/,
    /Created session for non-interactive run/,
  ],
  notes: [
    "CRITICAL: Prompt must be the LAST positional arg, NOT piped to stdin",
    "CRITICAL: --yolo is a global flag; using it on `run` causes exit 1 'Unknown flag'",
    "--debug is required alongside --verbose to see tool calls and thinking",
    "--cwd should point to task sandbox for workers, project root for healer",
    "Session ID is in stderr with ANSI codes embedded; strip escapes before regex",
    "Use --session <id> on steps 2+ to continue context across multi-step tasks",
    "After each step, run `crush session show <id> --json` for full tool call transcript",
    "Sentinel markers in session transcripts MUST be redacted before appending to output",
    "Line buffering is mandatory: each LLM token arrives as separate stdout write",
    "OSC escape sequences (\\x1b]9;4;3\\x07) from progress bars bypass CSI-only filters",
    "localhost:8000 errors are non-fatal (small model title generation fallback)",
    "Step-level retry (2 attempts, 5s backoff) for transient gateway errors",
  ],
};

/**
 * Cursor CLI adapter preset.
 *
 * Lessons applied:
 *  - pty-debug-mode-for-tui-agents-medium
 */
export const CURSOR_PRESET: AdapterPreset = {
  id: "cursor",
  command: "cursor",
  promptDelivery: "flag",
  promptFlag: "--prompt",
  defaultArgs: [
    "--print",
  ],
  forbiddenArgs: [],
  healthcheckArgs: ["--version"],
  healthcheckTimeoutMs: 10_000,
  stdinIgnore: false,
  toolCallsHiddenInStdout: false,
  needsLineBuffering: false,
  sigkillDelayMs: 5_000,
  transientErrorPatterns: [
    /stream error/i,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /429/,
    /rate limit/i,
  ],
  noisePatterns: [],
  notes: [
    "Prompt via --prompt flag or stdin pipe (both supported)",
    "--print mode for non-interactive batch use",
    "PTY wrapping for TUI debug output",
  ],
};

/** All known adapter presets indexed by id. */
export const ADAPTER_PRESETS: Record<string, AdapterPreset> = {
  claude: CLAUDE_PRESET,
  crush: CRUSH_PRESET,
  cursor: CURSOR_PRESET,
};

/**
 * Get a preset by name.
 * Returns undefined for unknown adapters (user implements their own).
 */
export function getAdapterPreset(id: string): AdapterPreset | undefined {
  return ADAPTER_PRESETS[id];
}

/** List all known preset IDs. */
export function listAdapterPresets(): string[] {
  return Object.keys(ADAPTER_PRESETS);
}

/**
 * Build the full argv for a CLI invocation from a preset.
 *
 * Handles prompt delivery mode (stdin vs positional arg vs flag),
 * applies --cwd, and appends any extra args.
 */
export function buildArgv(
  preset: AdapterPreset,
  prompt: string,
  options?: {
    cwd?: string;
    sessionId?: string;
    extraArgs?: string[];
  },
): { argv: string[]; stdin: string | null } {
  const argv = [...preset.defaultArgs];

  if (options?.cwd) {
    argv.push("--cwd", options.cwd);
  }

  if (options?.sessionId && preset.sessionContinueFlag) {
    argv.push(preset.sessionContinueFlag, options.sessionId);
  }

  if (options?.extraArgs) {
    argv.push(...options.extraArgs);
  }

  let stdin: string | null = null;

  switch (preset.promptDelivery) {
    case "positional-arg":
      argv.push(prompt);
      break;
    case "flag":
      argv.push(preset.promptFlag!, prompt);
      break;
    case "stdin":
      stdin = prompt;
      break;
  }

  return { argv, stdin };
}
