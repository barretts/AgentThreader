/**
 * Pidfile/lockfile mechanism to prevent concurrent orchestrator instances
 * from corrupting shared state.
 *
 * Lessons applied:
 *  - zombie-orchestrator-state-corruption-critical
 *  - orchestrator-kill-command-medium
 */
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";

export interface LockfileResult {
  acquired: boolean;
  existingPid?: number;
  existingPidAlive?: boolean;
  lockPath: string;
}

/**
 * Attempt to acquire a lockfile. Returns whether the lock was acquired
 * and, if not, information about the competing process.
 *
 * The lockfile contains the current process PID. On acquisition failure,
 * the caller can decide whether to force (if the existing PID is dead)
 * or abort.
 */
export function acquireLock(stateDir: string): LockfileResult {
  const lockPath = path.join(stateDir, ".lock");
  mkdirSync(stateDir, { recursive: true });

  if (existsSync(lockPath)) {
    const raw = readFileSync(lockPath, "utf8").trim();
    const existingPid = Number.parseInt(raw, 10);

    if (!Number.isNaN(existingPid) && existingPid > 0) {
      const alive = isProcessAlive(existingPid);
      if (alive) {
        return {
          acquired: false,
          existingPid,
          existingPidAlive: true,
          lockPath,
        };
      }
      // Stale lock from a dead process -- safe to take over
    }
  }

  writeFileSync(lockPath, `${process.pid}\n`, "utf8");
  return { acquired: true, lockPath };
}

/**
 * Force-acquire a lockfile regardless of existing lock state.
 * Use when the user explicitly confirms they want to override.
 */
export function forceAcquireLock(stateDir: string): LockfileResult {
  const lockPath = path.join(stateDir, ".lock");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(lockPath, `${process.pid}\n`, "utf8");
  return { acquired: true, lockPath };
}

/** Release the lockfile. Safe to call even if the lock was not acquired. */
export function releaseLock(stateDir: string): void {
  const lockPath = path.join(stateDir, ".lock");
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    const storedPid = Number.parseInt(raw, 10);
    // Only delete if we own the lock
    if (storedPid === process.pid) {
      unlinkSync(lockPath);
    }
  } catch {
    // Lock file already gone or unreadable -- nothing to do
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 tests existence without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
