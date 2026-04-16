/**
 * Process cleanup utility for finding and terminating orphaned orchestrator
 * and worker processes.
 *
 * Lessons applied:
 *  - orchestrator-kill-command-medium
 *  - zombie-orchestrator-state-corruption-critical
 */
import { execSync } from "node:child_process";

export interface KillResult {
  killed: Array<{ pid: number; pattern: string; command: string }>;
  errors: string[];
}

const DEFAULT_PATTERNS = [
  "agent-threader",
  "crush run",
  "claude --print",
  "cursor --print",
];

/**
 * Find and kill all processes matching the given patterns.
 *
 * Skips the current process PID to avoid self-termination.
 * Sends SIGTERM by default. Returns a summary of killed processes.
 */
export function killOrphanedProcesses(
  patterns: string[] = DEFAULT_PATTERNS,
  signal: NodeJS.Signals = "SIGTERM",
): KillResult {
  const killed: KillResult["killed"] = [];
  const errors: string[] = [];
  const myPid = process.pid;

  for (const pattern of patterns) {
    try {
      // Use pgrep for cross-platform process search
      const raw = execSync(`pgrep -f "${pattern}" -a 2>/dev/null || true`, {
        encoding: "utf8",
        timeout: 5000,
      });

      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const spaceIdx = trimmed.indexOf(" ");
        if (spaceIdx === -1) continue;

        const pid = Number.parseInt(trimmed.slice(0, spaceIdx), 10);
        const command = trimmed.slice(spaceIdx + 1);

        if (Number.isNaN(pid) || pid === myPid) continue;

        try {
          process.kill(pid, signal);
          killed.push({ pid, pattern, command });
        } catch (e) {
          errors.push(`Failed to kill PID ${pid} (${pattern}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      errors.push(`Failed to search for pattern "${pattern}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { killed, errors };
}
