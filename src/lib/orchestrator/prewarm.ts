/**
 * Sequential toolchain pre-warming for the worker pool.
 *
 * Tools that mutate shared user state (`nvm install`, `pyenv install`,
 * `rbenv install`, `sdk install`, `asdf install`, package caches) race
 * catastrophically under concurrent workers: two simultaneous installers
 * into the same prefix can leave a partial install that all later
 * `<manager> use <version>` calls fail on.
 *
 * Pattern: orchestrator enumerates required versions up front, installs
 * them sequentially, and worker prompts are then forbidden from invoking
 * installers. Workers may only USE pre-warmed versions.
 */

export interface PrewarmRequirement {
  /** Toolchain manager id (`nvm`, `pyenv`, `rbenv`, `asdf`, ...). */
  manager: string;
  /** Exact version string. */
  version: string;
}

export interface PrewarmOutcome {
  manager: string;
  version: string;
  status: "installed" | "already_present" | "failed";
  durationMs: number;
  error?: string;
}

export interface PrewarmResult {
  outcomes: PrewarmOutcome[];
  allSucceeded: boolean;
}

export type PrewarmInstallFn = (
  req: PrewarmRequirement,
) => Promise<{ alreadyPresent?: boolean }>;

/**
 * Collapse duplicate (manager, version) pairs so each is installed once.
 */
export function dedupeRequirements(
  reqs: readonly PrewarmRequirement[],
): PrewarmRequirement[] {
  const seen = new Set<string>();
  const out: PrewarmRequirement[] = [];
  for (const r of reqs) {
    const key = `${r.manager}@${r.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Install each unique requirement sequentially. Install failures are
 * captured per-requirement; the function does not throw — callers decide
 * whether a partial prewarm is fatal or whether to proceed and let workers
 * surface `transient_infra:<manager>_version_missing` on use.
 */
export async function prewarmToolchains(
  requirements: readonly PrewarmRequirement[],
  installFn: PrewarmInstallFn,
): Promise<PrewarmResult> {
  const unique = dedupeRequirements(requirements);
  const outcomes: PrewarmOutcome[] = [];

  for (const req of unique) {
    const started = Date.now();
    try {
      const { alreadyPresent } = await installFn(req);
      outcomes.push({
        manager: req.manager,
        version: req.version,
        status: alreadyPresent ? "already_present" : "installed",
        durationMs: Date.now() - started,
      });
    } catch (err) {
      outcomes.push({
        manager: req.manager,
        version: req.version,
        status: "failed",
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    outcomes,
    allSucceeded: outcomes.every((o) => o.status !== "failed"),
  };
}
